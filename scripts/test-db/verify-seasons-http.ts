import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { eq, sql } from "drizzle-orm";

import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { PostgresAuthRepository } from "../../src/modules/auth/infrastructure/postgres-auth-repository";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { parseSessionSigningKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { auditEvents, players, seasons, userAccounts } from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

type Role = "USER" | "ADMIN" | "SUPER_ADMIN";
type AccountStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
type SyntheticAccount = Readonly<{ id: string; role: Role; loginId: string }>;

async function availablePort(): Promise<number> {
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
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

async function waitUntilReady(origin: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(`${origin}/api/seasons`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // Listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Next.js did not become ready within 45 seconds.");
}

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function expectNoStore(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
}

async function expectProblem(response: Response, status: number, code?: string) {
  const responseText = await response.text();
  assert.equal(response.status, status, responseText);
  assert.match(response.headers.get("content-type") ?? "", /^application\/problem\+json/i);
  expectNoStore(response);
  const body = JSON.parse(responseText) as { code?: string };
  if (code) assert.equal(body.code, code);
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
  current: "season-http-v1",
  keys: { "season-http-v1": sessionKey.toString("base64url") },
});
const totpKeysJson = JSON.stringify({
  current: 1,
  keys: { 1: totpKey.toString("base64url") },
});
const sessionCodec = new JoseSessionCodec(parseSessionSigningKeyring(sessionKeysJson));
const { database, pool } = createDatabaseHandle(connectionString, { max: 8 });
const authRepository = new PostgresAuthRepository(database);
const syntheticSecrets = [
  sessionKey.toString("base64url"),
  totpKey.toString("base64url"),
  rateLimitPepper,
];

async function seedAccount(label: string, role: Role = "USER"): Promise<SyntheticAccount> {
  const id = randomUUID();
  const loginId = `season_http_${label}_${randomBytes(4).toString("hex")}`;
  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash: "$argon2id$v=19$synthetic-season-http-only",
    role,
    status: "APPROVED",
  });
  return { id, role, loginId };
}

async function seedPlayer(account: SyntheticAccount, label: string) {
  const nickname = `Http${label}${randomBytes(2).toString("hex")}`;
  const memberName = `비공개 합성 회원명 ${label}`;
  const id = randomUUID();
  await database.insert(players).values({
    id,
    userAccountId: account.id,
    memberName,
    memberNameNormalized: memberName.toLocaleLowerCase("ko-KR"),
    nickname,
    nicknameNormalized: nickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S03",
    tagLineNormalized: "s03",
  });
  return { id, nickname, memberName };
}

async function issueSession(
  account: SyntheticAccount,
  adminTotpVerified = account.role !== "USER",
  accountStatus: AccountStatus = "APPROVED",
) {
  const nowMs = Date.now();
  const issuedAt = new Date(Math.floor(nowMs / 1_000) * 1_000);
  const expiresAt = new Date(issuedAt.getTime() + 30 * 60 * 1_000);
  const sessionId = randomUUID();
  const purpose = account.role === "USER" ? "ACCOUNT" : "ADMIN";
  const token = await sessionCodec.encode(
    {
      userId: account.id,
      role: account.role,
      purpose,
      accountStatus,
      mustChangePassword: false,
      authVersion: 0,
      adminTotpVerified,
      source: "database",
    },
    { nowMs, sessionId, ttlSeconds: 30 * 60 },
  );
  assert.equal(
    await authRepository.createSession({
      id: sessionId,
      tokenHash: hashSessionToken(token),
      userAccountId: account.id,
      authVersion: 0,
      role: account.role,
      purpose,
      totpVerifiedAt: adminTotpVerified ? issuedAt : null,
      issuedAt,
      expiresAt,
    }),
    true,
  );
  return `${purpose === "ACCOUNT" ? "klol_v2_account_session" : "klol_v2_session"}=${token}`;
}

const admin = await seedAccount("admin", "ADMIN");
const superAdmin = await seedAccount("super", "SUPER_ADMIN");
const applicant = await seedAccount("applicant");
const otherUser = await seedAccount("other");
const noPlayerUser = await seedAccount("no-player");
const rateUpsertUser = await seedAccount("rate-upsert");
const statusAccounts = {
  pending: await seedAccount("pending"),
  rejected: await seedAccount("rejected"),
  suspended: await seedAccount("suspended"),
};
const applicantPlayer = await seedPlayer(applicant, "Applicant");
const otherPlayer = await seedPlayer(otherUser, "Other");
await seedPlayer(rateUpsertUser, "RateUpsert");
const rateCancelUsers = await Promise.all(
  Array.from({ length: 13 }, async (_, index) => {
    const account = await seedAccount(`rate-cancel-${index}`);
    await seedPlayer(account, `RateCancel${index}`);
    return account;
  }),
);

for (const [key, status] of [
  ["pending", "PENDING"],
  ["rejected", "REJECTED"],
  ["suspended", "SUSPENDED"],
] as const satisfies readonly (readonly [keyof typeof statusAccounts, AccountStatus])[]) {
  await database.update(userAccounts).set({ status }).where(eq(userAccounts.id, statusAccounts[key].id));
}
const cookies = {
  admin: await issueSession(admin),
  superAdmin: await issueSession(superAdmin),
  applicant: await issueSession(applicant, false),
  otherUser: await issueSession(otherUser, false),
  noPlayerUser: await issueSession(noPlayerUser, false),
  rateUpsertUser: await issueSession(rateUpsertUser, false),
  rateCancelUsers: await Promise.all(rateCancelUsers.map((account) => issueSession(account, false))),
  pending: await issueSession(statusAccounts.pending, false, "PENDING"),
  rejected: await issueSession(statusAccounts.rejected, false, "REJECTED"),
  suspended: await issueSession(statusAccounts.suspended, false, "SUSPENDED"),
};

const activeRows = await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, "ACTIVE"));
assert.equal(activeRows.length, 0, "HTTP verifier requires no active season after the DB contract suite.");

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
    VERCEL: "1",
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

function mutationHeaders(
  cookie: string,
  key: string,
  revision: number,
  requestOrigin = origin,
  clientIp = "203.0.113.10",
) {
  return {
    "content-type": "application/json",
    cookie,
    origin: requestOrigin,
    "idempotency-key": key,
    "if-match": `\"${revision}\"`,
    "x-vercel-forwarded-for": clientIp,
  };
}

let rateLimitTableRenamed = false;

try {
  await waitUntilReady(origin, child);

  const publicBefore = await fetch(`${origin}/api/applications/season`);
  assert.equal(publicBefore.status, 200);
  expectNoStore(publicBefore);
  assert.equal(((await publicBefore.json()) as { currentSeason: unknown }).currentSeason, null);

  for (const path of [
    "/api/seasons?unexpected=1",
    "/api/seasons/current?unexpected=1&unexpected=2",
    "/api/applications/available?q=%01unsafe",
    "/api/applications/season?unexpected=1",
  ]) {
    await expectProblem(await fetch(`${origin}${path}`), 400, "INVALID_INPUT");
  }

  await expectProblem(await fetch(`${origin}/api/admin/seasons`), 401, "UNAUTHENTICATED");
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, { headers: { cookie: cookies.applicant } }),
    401,
    "UNAUTHENTICATED",
  );
  assert.equal(
    (await fetch(`${origin}/api/admin/seasons`, { headers: { cookie: cookies.admin } })).status,
    200,
  );
  assert.equal(
    (await fetch(`${origin}/api/admin/seasons`, { headers: { cookie: cookies.superAdmin } })).status,
    200,
  );
  for (const query of [
    "pageSize=20",
    "page=1e2",
    "page=01",
    "q=%01unsafe",
    "q=unsafe%E2%80%AEname",
    "q=unsafe%E2%80%8Fname",
    "status=APPLIED&status=RESERVE",
  ]) {
    await expectProblem(
      await fetch(`${origin}/api/admin/seasons?${query}`, { headers: { cookie: cookies.admin } }),
      400,
      "INVALID_INPUT",
    );
  }

  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, "season-cross-origin", 0, "https://attacker.invalid"),
      body: JSON.stringify({ name: "차단 대상" }),
    }),
    403,
    "ORIGIN_FORBIDDEN",
  );
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, {
      method: "POST",
      headers: { cookie: cookies.admin, origin, "idempotency-key": "season-media", "if-match": "\"0\"" },
      body: "not-json",
    }),
    415,
  );
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.admin, origin, "if-match": "\"0\"" },
      body: JSON.stringify({ name: "멱등성 키 없음" }),
    }),
    400,
  );
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies.admin, origin, "idempotency-key": "season-no-revision" },
      body: JSON.stringify({ name: "revision 없음" }),
    }),
    428,
  );
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons?unexpected=1`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, `season-query-${randomUUID()}`, 0),
      body: JSON.stringify({ name: "쿼리 차단" }),
    }),
    400,
    "INVALID_INPUT",
  );

  for (const [label, body] of [
    ["unknown", { name: "미허용 키", unexpected: true }],
    ["control", { name: "제어\u0001문자" }],
    ["bidi", { name: "표시\u202e스푸핑" }],
    ["bidi-mark", { name: "표시\u200f스푸핑" }],
    ["timezone", { name: "무오프셋", startsAt: "2026-09-01T10:30" }],
  ] as const) {
    await expectProblem(
      await fetch(`${origin}/api/admin/seasons`, {
        method: "POST",
        headers: mutationHeaders(cookies.admin, `season-strict-${label}-${randomUUID()}`, 0),
        body: JSON.stringify(body),
      }),
      400,
      "INVALID_INPUT",
    );
  }

  const seasonBody = {
    name: "S03 HTTP 검증 시즌",
    applicationsOpenAt: "2026-01-01T00:00:00+09:00",
    applicationsCloseAt: "2027-01-01T00:00:00+09:00",
    startsAt: "2026-09-01T10:30:00+09:00",
    endsAt: "2027-01-02T00:00:00+09:00",
  };
  const createKey = `season-create-${randomUUID()}`;
  const created = await fetch(`${origin}/api/admin/seasons`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, createKey, 0),
    body: JSON.stringify(seasonBody),
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("etag"), '"0"');
  expectNoStore(created);
  const createdBody = (await created.json()) as {
    season: { id: string; startsAt: string | null; applicationsOpenAt: string | null };
  };
  const seasonId = createdBody.season.id;
  assert.equal(createdBody.season.startsAt, "2026-09-01T01:30:00.000Z");
  assert.equal(createdBody.season.applicationsOpenAt, "2025-12-31T15:00:00.000Z");

  const replayed = await fetch(`${origin}/api/admin/seasons`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, createKey, 0),
    body: JSON.stringify(seasonBody),
  });
  assert.equal(replayed.status, 201);
  assert.equal(replayed.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await replayed.json(), createdBody);
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, createKey, 0),
      body: JSON.stringify({ name: "동일 키 다른 본문" }),
    }),
    409,
    "IDEMPOTENCY_MISMATCH",
  );

  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${seasonId}/activate`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, `activate-body-${randomUUID()}`, 0),
      body: JSON.stringify({ unexpected: true }),
    }),
    400,
    "INVALID_INPUT",
  );

  const activated = await fetch(`${origin}/api/admin/seasons/${seasonId}/activate`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, `activate-${randomUUID()}`, 0),
    body: "{}",
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.headers.get("etag"), '"1"');

  const beforeIncompletePatchRows = await database
    .select({
      applicationsOpenAt: seasons.applicationsOpenAt,
      applicationsCloseAt: seasons.applicationsCloseAt,
      startsAt: seasons.startsAt,
      endsAt: seasons.endsAt,
      revision: seasons.revision,
    })
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  const beforeIncompletePatchAudits = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.targetId, seasonId));
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${seasonId}`, {
      method: "PATCH",
      headers: mutationHeaders(cookies.admin, `incomplete-season-${randomUUID()}`, 1),
      body: JSON.stringify({ name: "날짜가 빠진 위험한 부분 편집" }),
    }),
    400,
    "INVALID_INPUT",
  );
  const afterIncompletePatchRows = await database
    .select({
      applicationsOpenAt: seasons.applicationsOpenAt,
      applicationsCloseAt: seasons.applicationsCloseAt,
      startsAt: seasons.startsAt,
      endsAt: seasons.endsAt,
      revision: seasons.revision,
    })
    .from(seasons)
    .where(eq(seasons.id, seasonId));
  const afterIncompletePatchAudits = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.targetId, seasonId));
  assert.deepEqual(afterIncompletePatchRows, beforeIncompletePatchRows);
  assert.equal(afterIncompletePatchAudits.length, beforeIncompletePatchAudits.length);

  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${seasonId}`, {
      method: "PATCH",
      headers: mutationHeaders(cookies.admin, `stale-season-${randomUUID()}`, 0),
      body: JSON.stringify(seasonBody),
    }),
    412,
    "PRECONDITION_FAILED",
  );
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${randomUUID()}`, {
      method: "PATCH",
      headers: mutationHeaders(cookies.admin, `missing-season-${randomUUID()}`, 0),
      body: JSON.stringify(seasonBody),
    }),
    404,
    "NOT_FOUND",
  );

  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${seasonId}/clone`, {
      method: "POST",
      headers: mutationHeaders(cookies.superAdmin, `clone-body-${randomUUID()}`, 1),
      body: JSON.stringify({ name: "잘못된 복제", unexpected: true }),
    }),
    400,
    "INVALID_INPUT",
  );

  const cloned = await fetch(`${origin}/api/admin/seasons/${seasonId}/clone`, {
    method: "POST",
    headers: mutationHeaders(cookies.superAdmin, `clone-${randomUUID()}`, 1),
    body: JSON.stringify({ name: "S03 HTTP 복제 시즌" }),
  });
  assert.equal(cloned.status, 201);
  const cloneBody = (await cloned.json()) as { season: { id: string } };
  const cloneId = cloneBody.season.id;
  await expectProblem(
    await fetch(`${origin}/api/admin/seasons/${cloneId}/activate`, {
      method: "POST",
      headers: mutationHeaders(cookies.superAdmin, `activate-conflict-${randomUUID()}`, 0),
      body: "{}",
    }),
    409,
    "ACTIVE_SEASON_EXISTS",
  );

  for (const cookie of [cookies.pending, cookies.rejected, cookies.suspended]) {
    await expectProblem(
      await fetch(`${origin}/api/applications/season`, {
        method: "POST",
        headers: mutationHeaders(cookie, `status-fail-${randomUUID()}`, 0),
        body: JSON.stringify({ mainPosition: "MID", subPositions: [] }),
      }),
      403,
      "FORBIDDEN",
    );
  }
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, `application-admin-cookie-${randomUUID()}`, 0),
      body: JSON.stringify({ mainPosition: "MID", subPositions: [] }),
    }),
    401,
    "UNAUTHENTICATED",
  );
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, `application-csrf-${randomUUID()}`, 0, "https://attacker.invalid"),
      body: JSON.stringify({ mainPosition: "MID", subPositions: [] }),
    }),
    403,
    "ORIGIN_FORBIDDEN",
  );
  const noPlayerAvailable = await fetch(`${origin}/api/applications/available`, {
    headers: { cookie: cookies.noPlayerUser },
  });
  assert.equal(noPlayerAvailable.status, 200);
  assert.equal(((await noPlayerAvailable.json()) as { canApply: boolean }).canApply, false);
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.noPlayerUser, `application-no-player-${randomUUID()}`, 0),
      body: JSON.stringify({ mainPosition: "MID", subPositions: [] }),
    }),
    409,
    "PLAYER_REQUIRED",
  );
  const eligibleAvailable = await fetch(`${origin}/api/applications/available`, {
    headers: { cookie: cookies.otherUser },
  });
  assert.equal(eligibleAvailable.status, 200);
  assert.equal(((await eligibleAvailable.json()) as { canApply: boolean }).canApply, true);

  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, `application-body-${randomUUID()}`, 0),
      body: JSON.stringify({ mainPosition: "MID", subPositions: [], unexpected: true }),
    }),
    400,
    "INVALID_INPUT",
  );

  const applicationBody = { mainPosition: "MID", subPositions: ["SUP"] };
  const applicationKey = `application-create-${randomUUID()}`;
  const applied = await fetch(`${origin}/api/applications/season`, {
    method: "POST",
    headers: mutationHeaders(cookies.applicant, applicationKey, 0),
    body: JSON.stringify(applicationBody),
  });
  assert.equal(applied.status, 201);
  assert.equal(applied.headers.get("etag"), '"0"');
  const appliedBody = (await applied.json()) as {
    application: { id: string; revision: number };
    revision: number;
  };
  const applicationId = appliedBody.application.id;

  const applicationReplay = await fetch(`${origin}/api/applications/season`, {
    method: "POST",
    headers: mutationHeaders(cookies.applicant, applicationKey, 0),
    body: JSON.stringify(applicationBody),
  });
  assert.equal(applicationReplay.status, 201);
  assert.equal(applicationReplay.headers.get("idempotency-replayed"), "true");
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, applicationKey, 0),
      body: JSON.stringify({ mainPosition: "TOP", subPositions: [] }),
    }),
    409,
    "IDEMPOTENCY_MISMATCH",
  );
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, `application-stale-${randomUUID()}`, 1),
      body: JSON.stringify(applicationBody),
    }),
    412,
    "PRECONDITION_FAILED",
  );

  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(cookies.applicant, `application-target-${randomUUID()}`, 0),
      body: JSON.stringify({ applicationId }),
    }),
    400,
    "INVALID_INPUT",
  );
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(cookies.otherUser, `application-other-${randomUUID()}`, 0),
      body: "{}",
    }),
    404,
    "NOT_FOUND",
  );

  const cancelled = await fetch(`${origin}/api/applications/season`, {
    method: "DELETE",
    headers: mutationHeaders(cookies.applicant, `application-cancel-${randomUUID()}`, 0),
    body: "{}",
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.headers.get("etag"), '"1"');
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(cookies.applicant, `application-cancelled-again-${randomUUID()}`, 1),
      body: "{}",
    }),
    409,
    "INVALID_TRANSITION",
  );
  const resubmitted = await fetch(`${origin}/api/applications/season`, {
    method: "POST",
    headers: mutationHeaders(cookies.applicant, `application-resubmit-${randomUUID()}`, 1),
    body: JSON.stringify({ mainPosition: "ADC", subPositions: ["SUP"] }),
  });
  assert.equal(resubmitted.status, 200);
  assert.equal(resubmitted.headers.get("etag"), '"2"');

  await expectProblem(
    await fetch(`${origin}/api/admin/season-applications/${applicationId}/review`, {
      method: "POST",
      headers: mutationHeaders(cookies.admin, `application-review-body-${randomUUID()}`, 2),
      body: JSON.stringify({ status: "RESERVE", reviewNote: "검토", unexpected: true }),
    }),
    400,
    "INVALID_INPUT",
  );

  const reviewed = await fetch(`${origin}/api/admin/season-applications/${applicationId}/review`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, `application-review-${randomUUID()}`, 2),
    body: JSON.stringify({ status: "RESERVE", reviewNote: "비공개 검토 메모" }),
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.headers.get("etag"), '"3"');
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, `application-reviewed-${randomUUID()}`, 3),
      body: JSON.stringify(applicationBody),
    }),
    409,
    "APPLICATION_REVIEWED",
  );
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(cookies.applicant, `application-reserve-cancel-${randomUUID()}`, 3),
      body: "{}",
    }),
    409,
    "INVALID_TRANSITION",
  );

  const rejectedReview = await fetch(`${origin}/api/admin/season-applications/${applicationId}/review`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, `application-reject-${randomUUID()}`, 3),
    body: JSON.stringify({ status: "REJECTED", reviewNote: "최종 거절" }),
  });
  assert.equal(rejectedReview.status, 200);
  assert.equal(rejectedReview.headers.get("etag"), '"4"');
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.applicant, `application-rejected-reapply-${randomUUID()}`, 4),
      body: JSON.stringify(applicationBody),
    }),
    409,
    "APPLICATION_REVIEWED",
  );
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(cookies.applicant, `application-rejected-cancel-${randomUUID()}`, 4),
      body: "{}",
    }),
    409,
    "INVALID_TRANSITION",
  );

  const publicSeedApplication = await fetch(`${origin}/api/applications/season`, {
    method: "POST",
    headers: mutationHeaders(cookies.otherUser, `application-public-seed-${randomUUID()}`, 0),
    body: JSON.stringify({ mainPosition: "TOP", subPositions: [] }),
  });
  assert.equal(publicSeedApplication.status, 201);

  const publicHubResponse = await fetch(`${origin}/api/applications/season`, {
    headers: { cookie: cookies.applicant },
  });
  assert.equal(publicHubResponse.status, 200);
  expectNoStore(publicHubResponse);
  const publicHubText = await publicHubResponse.text();
  assert.match(publicHubText, new RegExp(otherPlayer.nickname));
  for (const forbidden of [
    "memberName",
    "loginId",
    "discord",
    "reviewNote",
    applicantPlayer.memberName,
    otherPlayer.memberName,
  ]) {
    assert.equal(publicHubText.toLocaleLowerCase("en-US").includes(forbidden.toLocaleLowerCase("en-US")), false);
  }
  const available = await fetch(`${origin}/api/applications/available`, {
    headers: { cookie: cookies.applicant },
  });
  assert.equal(available.status, 200);
  assert.equal(((await available.json()) as { canApply: boolean }).canApply, false);

  const adminApplications = await fetch(
    `${origin}/api/admin/season-applications?status=REJECTED&page=1&limit=20`,
    { headers: { cookie: cookies.admin } },
  );
  assert.equal(adminApplications.status, 200);
  const adminApplicationsText = await adminApplications.text();
  assert.match(adminApplicationsText, /비공개 합성 회원명 Applicant/);
  assert.match(adminApplicationsText, /최종 거절/);

  for (let index = 0; index < 12; index += 1) {
    const expectedRevision = index === 0 ? 0 : index - 1;
    const response = await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(
        cookies.rateUpsertUser,
        `rate-upsert-${index}-${randomUUID()}`,
        expectedRevision,
        origin,
        "203.0.113.20",
      ),
      body: JSON.stringify({ mainPosition: index % 2 === 0 ? "MID" : "TOP", subPositions: [] }),
    });
    assert.equal(response.status, index === 0 ? 201 : 200, await response.text());
  }
  const upsertRateLimited = await fetch(`${origin}/api/applications/season`, {
    method: "POST",
    headers: mutationHeaders(
      cookies.rateUpsertUser,
      `rate-upsert-blocked-${randomUUID()}`,
      11,
      origin,
      "203.0.113.20",
    ),
    body: JSON.stringify({ mainPosition: "SUP", subPositions: [] }),
  });
  await expectProblem(upsertRateLimited, 429, "RATE_LIMITED");
  assert.match(upsertRateLimited.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);

  for (let index = 0; index < rateCancelUsers.length; index += 1) {
    const appliedForCancellation = await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(
        cookies.rateCancelUsers[index]!,
        `rate-cancel-apply-${index}-${randomUUID()}`,
        0,
        origin,
        `198.51.100.${index + 20}`,
      ),
      body: JSON.stringify({ mainPosition: "JGL", subPositions: [] }),
    });
    assert.equal(appliedForCancellation.status, 201, await appliedForCancellation.text());
  }
  for (let index = 0; index < 12; index += 1) {
    const cancelledAtBoundary = await fetch(`${origin}/api/applications/season`, {
      method: "DELETE",
      headers: mutationHeaders(
        cookies.rateCancelUsers[index]!,
        `rate-cancel-${index}-${randomUUID()}`,
        0,
        origin,
        "198.51.100.200",
      ),
      body: "{}",
    });
    assert.equal(cancelledAtBoundary.status, 200, await cancelledAtBoundary.text());
  }
  const cancelRateLimited = await fetch(`${origin}/api/applications/season`, {
    method: "DELETE",
    headers: mutationHeaders(
      cookies.rateCancelUsers[12]!,
      `rate-cancel-blocked-${randomUUID()}`,
      0,
      origin,
      "198.51.100.200",
    ),
    body: "{}",
  });
  await expectProblem(cancelRateLimited, 429, "RATE_LIMITED");
  assert.match(cancelRateLimited.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);

  await database.execute(
    sql`alter table "auth"."login_rate_limit_buckets" rename to "login_rate_limit_buckets_s03_unavailable"`,
  );
  rateLimitTableRenamed = true;
  await expectProblem(
    await fetch(`${origin}/api/applications/season`, {
      method: "POST",
      headers: mutationHeaders(cookies.otherUser, `rate-store-unavailable-${randomUUID()}`, 0, origin, "192.0.2.50"),
      body: JSON.stringify({ mainPosition: "TOP", subPositions: [] }),
    }),
    503,
    "RATE_LIMIT_UNAVAILABLE",
  );
  await database.execute(
    sql`alter table "auth"."login_rate_limit_buckets_s03_unavailable" rename to "login_rate_limit_buckets"`,
  );
  rateLimitTableRenamed = false;

  const legacy = await fetch(`${origin}/participation?type=season&source=kakao&secret=drop`, {
    redirect: "manual",
  });
  assert.equal(legacy.status, 308);
  const legacyLocation = new URL(legacy.headers.get("location") ?? origin);
  assert.equal(`${legacyLocation.pathname}${legacyLocation.search}`, "/applications?type=season&source=kakao");
  const legacyHead = await fetch(`${origin}/participation/season?source=bookmark`, {
    method: "HEAD",
    redirect: "manual",
  });
  assert.equal(legacyHead.status, 308);
  const legacyHeadLocation = new URL(legacyHead.headers.get("location") ?? origin);
  assert.equal(`${legacyHeadLocation.pathname}${legacyHeadLocation.search}`, "/applications?type=season&source=bookmark");
  assert.equal(
    (await fetch(`${origin}/participation/season`, { method: "POST", redirect: "manual" })).status,
    405,
  );

  assert.equal((await fetch(`${origin}/applications`)).status, 200);
  assert.equal(
    (await fetch(`${origin}/admin/seasons`, { headers: { cookie: cookies.admin }, redirect: "manual" })).status,
    200,
  );

  const retiredClone = await fetch(`${origin}/api/admin/seasons/${cloneId}`, {
    method: "DELETE",
    headers: mutationHeaders(cookies.superAdmin, `retire-${randomUUID()}`, 0),
    body: "{}",
  });
  assert.equal(retiredClone.status, 200);
  const ended = await fetch(`${origin}/api/admin/seasons/${seasonId}/end`, {
    method: "POST",
    headers: mutationHeaders(cookies.admin, `end-${randomUUID()}`, 1),
    body: "{}",
  });
  assert.equal(ended.status, 200);
  assert.equal(ended.headers.get("etag"), '"2"');

  process.stdout.write(
    "[db-season-http] role matrix, strict JSON/query/timezone, rate limits, idempotency, revisions, ownership, privacy, lifecycle and legacy redirects passed\n",
  );
} catch (error) {
  let sanitizedLog = serverLog;
  for (const secret of syntheticSecrets) sanitizedLog = sanitizedLog.replaceAll(secret, "[synthetic-secret]");
  process.stderr.write(`${sanitizedLog}\n`);
  throw error;
} finally {
  await stopServer(child);
  if (rateLimitTableRenamed) {
    await database.execute(
      sql`alter table "auth"."login_rate_limit_buckets_s03_unavailable" rename to "login_rate_limit_buckets"`,
    );
  }
  await pool.end();
}
