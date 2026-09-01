import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { and, count, eq } from "drizzle-orm";

import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { encryptTotpSecret } from "../../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import {
  adminTotpCredentials,
  auditEvents,
  authSessions,
  playerMutationReceipts,
  players,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type SyntheticAdministrator = Readonly<{
  id: string;
  loginId: string;
  password: string;
  totpSecret: string;
  role: "ADMIN" | "SUPER_ADMIN";
}>;

function encodeBase32(value: Buffer): string {
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a loopback port.")));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitUntilReady(origin: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      if ((await fetch(origin)).status === 200) return;
    } catch {
      // Listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Next.js did not become ready within 45 seconds.");
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
assertSafeTestDatabase({
  connectionString,
  nodeEnv: process.env.NODE_ENV,
  testMode: process.env.V2_DB_TEST_MODE,
});

const sessionKey = randomBytes(32);
const totpKey = randomBytes(32);
const rateLimitPepper = randomBytes(32).toString("base64url");
const sessionKeysJson = JSON.stringify({
  current: "test-v1",
  keys: { "test-v1": sessionKey.toString("base64url") },
});
const totpKeysJson = JSON.stringify({
  current: 1,
  keys: { 1: totpKey.toString("base64url") },
});
const sessionKeyring = {
  currentKeyId: "test-v1",
  keys: new Map([["test-v1", new Uint8Array(sessionKey)]]),
};
const totpKeyring = parseTotpEncryptionKeyring(totpKeysJson);
const { database, pool } = createDatabaseHandle(connectionString, { max: 5 });
const syntheticSecrets = [sessionKey.toString("base64url"), totpKey.toString("base64url"), rateLimitPepper];

async function seedAdministrator(role: "ADMIN" | "SUPER_ADMIN"): Promise<SyntheticAdministrator> {
  const id = randomUUID();
  const loginId = `player_http_${role.toLocaleLowerCase()}_${randomBytes(4).toString("hex")}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const totpSecret = encodeBase32(randomBytes(20));
  syntheticSecrets.push(password, totpSecret);
  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash: await hashPassword(password),
    role,
    status: "APPROVED",
  });
  await database.insert(adminTotpCredentials).values({
    userAccountId: id,
    ...encryptTotpSecret(id, totpSecret, totpKeyring),
    enabledAt: new Date(),
  });
  return { id, loginId, password, totpSecret, role };
}

const admin = await seedAdministrator("ADMIN");
const superAdmin = await seedAdministrator("SUPER_ADMIN");
const plainUser = {
  id: randomUUID(),
  loginId: `player_http_user_${randomBytes(4).toString("hex")}`,
};
await database.insert(userAccounts).values({
  ...plainUser,
  loginIdNormalized: plainUser.loginId,
  passwordHash: "$argon2id$v=19$synthetic-http-user",
  role: "USER",
  status: "APPROVED",
});

const seededPlayer = {
  id: randomUUID(),
  legacyId: 1_234_567_890,
  memberName: `비공개 HTTP 회원 ${randomBytes(3).toString("hex")}`,
  memberNameNormalized: "",
  nickname: `Seeded${randomBytes(3).toString("hex")}`,
  nicknameNormalized: "",
  tagLine: "S02",
  tagLineNormalized: "s02",
};
seededPlayer.memberNameNormalized = seededPlayer.memberName.normalize("NFKC").toLocaleLowerCase("ko-KR");
seededPlayer.nicknameNormalized = seededPlayer.nickname.toLocaleLowerCase("ko-KR");
await database.insert(players).values(seededPlayer);

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: connectionString,
    SESSION_SIGNING_KEYS: sessionKeysJson,
    TOTP_ENCRYPTION_KEYS: totpKeysJson,
    V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
    V2_PUBLIC_DATA_SOURCE: "postgres",
    V2_PUBLIC_ORIGIN: origin,
    NEXT_PUBLIC_SITE_URL: origin,
    V2_TEST_AUTH_ENABLED: "false",
    V2_TEST_AUTH_SECRET: "",
    V2_TEST_AUTH_FIXTURES_JSON: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverLog = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLog = `${serverLog}${chunk}`.slice(-16_000);
  });
}

async function login(account: SyntheticAdministrator) {
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      loginId: account.loginId,
      password: account.password,
      totpCode: generateTotpCode(account.totpSecret, Math.floor(Date.now() / 30_000)),
    }),
  });
  assert.equal(response.status, 200, `${account.role} login failed`);
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
}

async function issueUserCookie() {
  const nowMs = Math.floor(Date.now() / 1_000) * 1_000;
  const issuedAt = new Date(nowMs);
  const expiresAt = new Date(nowMs + 30 * 60 * 1_000);
  const sessionId = randomUUID();
  const codec = new JoseSessionCodec(sessionKeyring);
  const token = await codec.encode(
    {
      userId: plainUser.id,
      role: "USER",
      authVersion: 0,
      adminTotpVerified: false,
      source: "database",
    },
    { nowMs, sessionId, ttlSeconds: 30 * 60 },
  );
  await database.insert(authSessions).values({
    id: sessionId,
    tokenHash: hashSessionToken(token),
    userAccountId: plainUser.id,
    authVersion: 0,
    role: "USER",
    kind: "USER",
    issuedAt,
    expiresAt,
  });
  return `klol_v2_session=${token}`;
}

function playerPayload(label: string, legacyId: number | null) {
  return {
    memberName: `비공개 생성 회원 ${label}`,
    nickname: `Created${label}`,
    tagLine: "HTTP",
    legacyId,
    peakTier: "DIAMOND II",
    currentTier: "PLATINUM IV",
  };
}

try {
  await waitUntilReady(origin, child);
  const adminCookie = await login(admin);
  const superCookie = await login(superAdmin);
  const userCookie = await issueUserCookie();

  assert.equal((await fetch(`${origin}/api/admin/players`)).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/players`, { headers: { cookie: userCookie } })).status, 403);

  const adminList = await fetch(`${origin}/api/admin/players?q=${encodeURIComponent(seededPlayer.memberName)}`, { headers: { cookie: adminCookie } });
  assert.equal(adminList.status, 200);
  const adminListBody = await adminList.json() as { items: Array<{ id: string; memberName: string }> };
  assert.deepEqual(adminListBody.items.map(({ id, memberName }) => ({ id, memberName })), [{ id: seededPlayer.id, memberName: seededPlayer.memberName }]);
  assert.equal((await fetch(`${origin}/api/admin/players`, { headers: { cookie: superCookie } })).status, 200);

  const publicMemberSearch = await fetch(`${origin}/players?q=${encodeURIComponent(seededPlayer.memberName)}`);
  assert.equal(publicMemberSearch.status, 200);
  assert.match(await publicMemberSearch.text(), />0명</);

  const legacy = await fetch(`${origin}/app/players/${seededPlayer.legacyId}`, { redirect: "manual" });
  assert.equal(legacy.status, 308);
  const legacyLocation = legacy.headers.get("location");
  assert.ok(legacyLocation);
  assert.equal(new URL(legacyLocation, origin).origin, origin);
  assert.equal(new URL(legacyLocation, origin).pathname, `/players/${seededPlayer.id}`);
  assert.equal((await fetch(`${origin}/app/players/2147483647`, { redirect: "manual" })).status, 404);
  assert.equal((await fetch(`${origin}/app/players/not-a-number`, { redirect: "manual" })).status, 404);

  const adminPage = await fetch(`${origin}/admin/players`, { headers: { cookie: adminCookie } });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), new RegExp(seededPlayer.memberName));
  assert.equal((await fetch(`${origin}/admin/players/new`, { headers: { cookie: adminCookie } })).status, 200);
  const emptyPage = await fetch(`${origin}/admin/players?q=definitely-no-synthetic-player`, { headers: { cookie: adminCookie } });
  assert.equal(emptyPage.status, 200);
  assert.match(await emptyPage.text(), /일치하는 플레이어가 없습니다/);
  assert.equal((await fetch(`${origin}/admin/players`, { headers: { cookie: userCookie }, redirect: "manual" })).status, 307);

  const strictPayload = playerPayload(randomBytes(3).toString("hex"), 1_111_222_333);
  const missingKey = await fetch(`${origin}/api/admin/players`, {
    method: "POST",
    headers: { cookie: adminCookie, origin, "content-type": "application/json" },
    body: JSON.stringify(strictPayload),
  });
  assert.equal(missingKey.status, 400);
  assert.equal((await missingKey.json()).code, "IDEMPOTENCY_KEY_REQUIRED");

  const unknownField = await fetch(`${origin}/api/admin/players`, {
    method: "POST",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": `unknown-${randomUUID()}` },
    body: JSON.stringify({ ...strictPayload, isActive: true }),
  });
  assert.equal(unknownField.status, 400);
  assert.equal((await unknownField.json()).code, "INVALID_PLAYER_INPUT");

  const createKey = `create-${randomUUID()}`;
  const createdResponse = await fetch(`${origin}/api/admin/players`, {
    method: "POST",
    headers: { cookie: adminCookie, origin, "content-type": "application/json; charset=utf-8", "idempotency-key": createKey },
    body: JSON.stringify(strictPayload),
  });
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get("etag"), '"0"');
  const createdBody = await createdResponse.json() as { player: { id: string; revision: number; memberName: string } };
  assert.equal(createdBody.player.memberName, strictPayload.memberName);
  const createdId = createdBody.player.id;

  const replay = await fetch(`${origin}/api/admin/players`, {
    method: "POST",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": createKey },
    body: JSON.stringify(strictPayload),
  });
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await replay.json(), createdBody);

  const detail = await fetch(`${origin}/api/admin/players/${createdId}`, { headers: { cookie: adminCookie } });
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get("etag"), '"0"');
  assert.equal((await detail.json()).player.memberName, strictPayload.memberName);
  assert.equal((await fetch(`${origin}/api/admin/players/${randomUUID()}`, { headers: { cookie: adminCookie } })).status, 404);

  const missingIfMatch = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "PATCH",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": `missing-match-${randomUUID()}` },
    body: JSON.stringify(strictPayload),
  });
  assert.equal(missingIfMatch.status, 428);

  const conflictingPayload = { ...strictPayload, nickname: seededPlayer.nickname, tagLine: seededPlayer.tagLine };
  const duplicate = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "PATCH",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": `duplicate-${randomUUID()}`, "if-match": '"0"' },
    body: JSON.stringify(conflictingPayload),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "PLAYER_RIOT_ID_CONFLICT");

  const updatePayload = { ...strictPayload, nickname: `${strictPayload.nickname}Updated`, currentTier: "EMERALD III" };
  const updated = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "PATCH",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": `update-${randomUUID()}`, "if-match": '"0"' },
    body: JSON.stringify(updatePayload),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.headers.get("etag"), '"1"');

  const stale = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "PATCH",
    headers: { cookie: adminCookie, origin, "content-type": "application/json", "idempotency-key": `stale-${randomUUID()}`, "if-match": '"0"' },
    body: JSON.stringify(updatePayload),
  });
  assert.equal(stale.status, 412);
  assert.equal(stale.headers.get("etag"), '"1"');

  const deactivateKey = `deactivate-${randomUUID()}`;
  const deactivated = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "DELETE",
    headers: { cookie: superCookie, origin, "idempotency-key": deactivateKey, "if-match": '"1"' },
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.headers.get("etag"), '"2"');
  assert.equal((await deactivated.json()).player.status, "INACTIVE");
  const deactivateReplay = await fetch(`${origin}/api/admin/players/${createdId}`, {
    method: "DELETE",
    headers: { cookie: superCookie, origin, "idempotency-key": deactivateKey, "if-match": '"1"' },
  });
  assert.equal(deactivateReplay.status, 200);
  assert.equal(deactivateReplay.headers.get("idempotency-replayed"), "true");

  assert.equal(
    (await fetch(`${origin}/app/players/${strictPayload.legacyId}`, { redirect: "manual" })).status,
    404,
  );
  const reactivatePath = `${origin}/api/admin/players/${createdId}/reactivate`;
  const reactivateWithoutRevision = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin,
      "idempotency-key": `reactivate-no-match-${randomUUID()}`,
    },
  });
  assert.equal(reactivateWithoutRevision.status, 428);
  const userReactivate = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: userCookie,
      origin,
      "idempotency-key": `reactivate-user-${randomUUID()}`,
      "if-match": '"2"',
    },
  });
  assert.equal(userReactivate.status, 403);
  const crossOriginReactivate = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "https://untrusted.invalid",
      "idempotency-key": `reactivate-origin-${randomUUID()}`,
      "if-match": '"2"',
    },
  });
  assert.equal(crossOriginReactivate.status, 403);
  const preReactivationStale = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin,
      "idempotency-key": `reactivate-stale-before-${randomUUID()}`,
      "if-match": '"1"',
    },
  });
  assert.equal(preReactivationStale.status, 412);
  assert.equal(preReactivationStale.headers.get("etag"), '"2"');

  const reactivateKey = `reactivate-${randomUUID()}`;
  const reactivated = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin,
      "idempotency-key": reactivateKey,
      "if-match": '"2"',
    },
  });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.headers.get("etag"), '"3"');
  const reactivatedBody = await reactivated.json() as { player: { status: string; revision: number } };
  assert.equal(reactivatedBody.player.status, "ACTIVE");
  assert.equal(reactivatedBody.player.revision, 3);
  const reactivateReplay = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin,
      "idempotency-key": reactivateKey,
      "if-match": '"2"',
    },
  });
  assert.equal(reactivateReplay.status, 200);
  assert.equal(reactivateReplay.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await reactivateReplay.json(), reactivatedBody);
  const staleReactivation = await fetch(reactivatePath, {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin,
      "idempotency-key": `reactivate-stale-after-${randomUUID()}`,
      "if-match": '"2"',
    },
  });
  assert.equal(staleReactivation.status, 412);
  assert.equal(staleReactivation.headers.get("etag"), '"3"');

  const restoredLegacy = await fetch(`${origin}/app/players/${strictPayload.legacyId}`, {
    redirect: "manual",
  });
  assert.equal(restoredLegacy.status, 308);
  assert.equal(
    new URL(restoredLegacy.headers.get("location") ?? "", origin).pathname,
    `/players/${createdId}`,
  );
  const restoredPublicSearch = await fetch(
    `${origin}/players?q=${encodeURIComponent(updatePayload.nickname)}`,
  );
  assert.equal(restoredPublicSearch.status, 200);
  assert.match(await restoredPublicSearch.text(), new RegExp(updatePayload.nickname));

  const detailPage = await fetch(`${origin}/admin/players/${createdId}`, { headers: { cookie: adminCookie } });
  assert.equal(detailPage.status, 200);
  const detailPageHtml = await detailPage.text();
  assert.match(detailPageHtml, new RegExp(strictPayload.memberName));
  assert.match(detailPageHtml, /복구 가능한 비활성화/);
  for (const [pathSuffix, expectedQuery] of [["edit", "mode=edit"], ["balance", "tab=balance"], ["riot", "tab=riot"]] as const) {
    const response = await fetch(`${origin}/admin/players/${createdId}/${pathSuffix}`, { headers: { cookie: adminCookie }, redirect: "manual" });
    assert.equal(response.status, 308);
    assert.match(response.headers.get("location") ?? "", new RegExp(expectedQuery));
  }
  const missingPage = await fetch(`${origin}/admin/players/${randomUUID()}`, { headers: { cookie: adminCookie } });
  assert.ok(missingPage.status === 404 || missingPage.status === 200);
  assert.match(await missingPage.text(), /플레이어를 찾을 수 없습니다/);

  const auditRows = await database
    .select({ value: count() })
    .from(auditEvents)
    .where(eq(auditEvents.targetId, createdId));
  assert.equal(auditRows[0]?.value, 4);
  const receiptRows = await database
    .select({ responseJson: playerMutationReceipts.responseJson })
    .from(playerMutationReceipts)
    .where(and(
      eq(playerMutationReceipts.actorUserAccountId, admin.id),
      eq(playerMutationReceipts.scope, "players:create"),
    ));
  assert.equal(receiptRows.length, 1);
  assert.equal(JSON.stringify(receiptRows[0]).includes(createKey), false);

  process.stdout.write("[db-player-http] ADMIN/SUPER UI, strict CRUD/reactivation, legacy restoration, privacy, revision, audit, and replay passed\n");
} catch (error) {
  let sanitizedLog = serverLog;
  for (const secret of syntheticSecrets) sanitizedLog = sanitizedLog.replaceAll(secret, "[synthetic-secret]");
  process.stderr.write(`${sanitizedLog}\n`);
  throw error;
} finally {
  await stopServer(child);
  await pool.end();
}
