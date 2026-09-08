import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { and, count, eq } from "drizzle-orm";

import { RECOVERY_RESPONSE_MINIMUM_MS } from "../../src/modules/accounts/application/recovery-response-timing";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { encryptTotpSecret } from "../../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import {
  accountMutationReceipts,
  adminTotpCredentials,
  auditEvents,
  authSessions,
  loginRateLimitBuckets,
  passwordResetRequests,
  playerAccountClaims,
  players,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ACCOUNT_COOKIE_NAME = "klol_v2_account_session";
const ADMIN_COOKIE_NAME = "klol_v2_session";

type SyntheticAccount = Readonly<{
  id: string;
  loginId: string;
  password: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  playerId: string;
  totpSecret?: string;
}>;

type RunningServer = Readonly<{
  child: ReturnType<typeof spawn>;
  origin: string;
  readLog: () => string;
}>;

function encodeBase32(value: Buffer): string {
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
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

async function waitUntilReady(server: RunningServer): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Next.js exited before readiness (${server.child.exitCode}).`);
    }
    try {
      const response = await fetch(`${server.origin}/login`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // Listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Next.js did not become ready within 45 seconds.");
}

async function startServer(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<RunningServer> {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        V2_PUBLIC_ORIGIN: origin,
        NEXT_PUBLIC_SITE_URL: origin,
        V2_PUBLIC_DATA_SOURCE: "postgres",
        V2_TEST_AUTH_ENABLED: "false",
        V2_TEST_AUTH_SECRET: "",
        V2_TEST_AUTH_FIXTURES_JSON: "",
        ...environment,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  let serverLog = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      serverLog = `${serverLog}${chunk}`.slice(-24_000);
    });
  }
  const server = { child, origin, readLog: () => serverLog };
  await waitUntilReady(server);
  return server;
}

async function stopServer(server: RunningServer | undefined): Promise<void> {
  if (!server || server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.child.exitCode === null) server.child.kill("SIGKILL");
}

function idempotencyKey(label: string): string {
  return `${label}-${randomUUID()}`;
}

function responseCookies(response: Response): readonly string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  if (values.length > 0) return values;
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function extractCookie(response: Response, name: string): string {
  for (const value of responseCookies(response)) {
    const match = new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`).exec(value);
    if (match) return `${name}=${match[1]}`;
  }
  throw new Error(`${name} was not set.`);
}

function combinedCookie(...cookies: readonly string[]): string {
  return cookies.filter(Boolean).join("; ");
}

function problemCode(payload: unknown): string | undefined {
  return payload && typeof payload === "object"
    ? (payload as { code?: string }).code
    : undefined;
}

function recursivelyRejectSensitiveFields(value: unknown, admin = false): void {
  const forbidden = new Set([
    "passwordhash",
    "totp",
    "internalreason",
    "sessiontoken",
    "tokenhash",
    ...(admin ? [] : ["membername", "playerclaimreview", "temporarypassword"]),
  ]);
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      const normalized = key.replaceAll(/[^a-z]/gi, "").toLocaleLowerCase("en-US");
      assert.equal(forbidden.has(normalized), false, `HTTP DTO leaked ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function signupPayload(label: string, riotId?: string) {
  const suffix = randomBytes(4).toString("hex");
  return {
    loginId: `account_http_${label}_${suffix}`,
    password: `살랑바람${randomBytes(8).toString("hex")}2026`,
    memberName: `HTTP 비공개 회원 ${label} ${suffix}`,
    riotId: riotId ?? `Http${label}${suffix}#S01`,
    termsAccepted: true,
    privacyAccepted: true,
  };
}

function reason(label: string) {
  return {
    publicReason: `${label} 상태 안내`,
    internalReason: `S01 실제 HTTP 계약: ${label}`,
  };
}

async function assertAnonymousMe(response: Response, message?: string) {
  assert.equal(response.status, 200, message);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), { user: null });
}

async function assertAuthenticatedMe(response: Response, expectedAccountId: string, message?: string) {
  assert.equal(response.status, 200, message);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.json() as {
    user?: { id?: unknown };
    account?: { id?: unknown };
  };
  assert.equal(body.user?.id, expectedAccountId, message);
  assert.equal(body.account?.id, expectedAccountId, message);
  recursivelyRejectSensitiveFields(body);
}

async function assertPublicPlayerVisibility(input: {
  origin: string;
  playerId: string;
  riotId: string;
  visible: boolean;
  message: string;
}) {
  const response = await fetch(`${input.origin}/players/${input.playerId}`, { redirect: "manual" });
  assert.ok(response.status < 500, `${input.message}: public profile returned ${response.status}`);
  const body = await response.text();
  assert.equal(body.includes(input.riotId), input.visible, input.message);
}

function confirmedReason(label: string, confirmLoginId: string) {
  return { ...reason(label), confirmLoginId };
}

const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
assertSafeTestDatabase({
  connectionString,
  nodeEnv: process.env.NODE_ENV,
  testMode: process.env.V2_DB_TEST_MODE,
});

const { database, pool } = createDatabaseHandle(connectionString, { max: 10 });
const sessionKey = randomBytes(32);
const totpKey = randomBytes(32);
const rateLimitPepper = randomBytes(32).toString("base64url");
const sessionKeysJson = JSON.stringify({
  current: "account-http-v1",
  keys: { "account-http-v1": sessionKey.toString("base64url") },
});
const totpKeysJson = JSON.stringify({
  current: 1,
  keys: { 1: totpKey.toString("base64url") },
});
const totpKeyring = parseTotpEncryptionKeyring(totpKeysJson);
const syntheticSecrets = [
  sessionKey.toString("base64url"),
  totpKey.toString("base64url"),
  rateLimitPepper,
];

async function seedAccount(
  label: string,
  role: SyntheticAccount["role"],
  withTotp = false,
): Promise<SyntheticAccount> {
  const id = randomUUID();
  const playerId = randomUUID();
  const suffix = randomBytes(4).toString("hex");
  const loginId = `account_http_${label}_${suffix}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const nickname = `Account${label}${suffix}`;
  const totpSecret = withTotp ? encodeBase32(randomBytes(20)) : undefined;
  syntheticSecrets.push(password);
  if (totpSecret) syntheticSecrets.push(totpSecret);

  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId.toLocaleLowerCase("ko-KR"),
    passwordHash: await hashPassword(password),
    role,
    status: "APPROVED",
    passwordChangedAt: new Date(),
  });
  await database.insert(players).values({
    id: playerId,
    userAccountId: id,
    memberName: `HTTP 관리자 회원 ${label}`,
    memberNameNormalized: `http 관리자 회원 ${label}`,
    nickname,
    nicknameNormalized: nickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S01",
    tagLineNormalized: "s01",
  });
  if (totpSecret) {
    await database.insert(adminTotpCredentials).values({
      userAccountId: id,
      ...encryptTotpSecret(id, totpSecret, totpKeyring),
      enabledAt: new Date(),
    });
  }
  return { id, loginId, password, role, playerId, totpSecret };
}

async function loginAccount(origin: string, loginId: string, password: string): Promise<{
  response: Response;
  body: Record<string, unknown>;
  cookie: string;
}> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId, password }),
  });
  const body = await response.clone().json() as Record<string, unknown>;
  return { response, body, cookie: extractCookie(response, ACCOUNT_COOKIE_NAME) };
}

async function loginAdmin(
  origin: string,
  account: SyntheticAccount,
  totpStepOffset = 0,
): Promise<string> {
  assert.ok(account.totpSecret);
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      loginId: account.loginId,
      password: account.password,
      totpCode: generateTotpCode(
        account.totpSecret,
        Math.floor(Date.now() / 30_000) + totpStepOffset,
      ),
    }),
  });
  assert.equal(response.status, 200, `${account.role} HTTP login failed`);
  return extractCookie(response, ADMIN_COOKIE_NAME);
}

async function signup(origin: string, payload: ReturnType<typeof signupPayload>, key: string) {
  return fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      origin,
    },
    body: JSON.stringify(payload),
  });
}

async function adminMutation(input: {
  origin: string;
  cookie: string;
  path: string;
  method?: "PATCH" | "DELETE";
  revision?: number;
  key?: string;
  body: object;
}) {
  return fetch(`${input.origin}${input.path}`, {
    method: input.method ?? "PATCH",
    headers: {
      cookie: input.cookie,
      origin: input.origin,
      "content-type": "application/json",
      "idempotency-key": input.key ?? idempotencyKey("account-admin"),
      ...(input.revision === undefined ? {} : { "if-match": `"${input.revision}"` }),
    },
    body: JSON.stringify(input.body),
  });
}

async function waitForDatabaseLockWaiters(minimum: number, label: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waiters: number }>(
      `select count(*)::int as waiters
         from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and wait_event_type = 'Lock'`,
    );
    if ((result.rows[0]?.waiters ?? 0) >= minimum) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`${label}: expected at least ${minimum} PostgreSQL lock waiters`);
}

const superAdmin = await seedAccount("super", "SUPER_ADMIN", true);
const admin = await seedAccount("admin", "ADMIN", true);
const adminVictim = await seedAccount("admin_victim", "ADMIN", true);

let mainServer: RunningServer | undefined;
let unavailableServer: RunningServer | undefined;

try {
  mainServer = await startServer({
    DATABASE_URL: connectionString,
    SESSION_SIGNING_KEYS: sessionKeysJson,
    TOTP_ENCRYPTION_KEYS: totpKeysJson,
    V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
  });
  const { origin } = mainServer;

  const anonymousMe = await fetch(`${origin}/api/auth/me`);
  await assertAnonymousMe(anonymousMe);
  assert.equal((await fetch(`${origin}/api/admin/users`)).status, 401);

  for (const route of ["login", "signup", "reset-requests"]) {
    const queryRejected = await fetch(`${origin}/api/auth/${route}?unexpected=1`, {
      method: "POST",
    });
    assert.equal(queryRejected.status, 400, `${route} must reject unexpected query`);
  }
  const crossOriginLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
    body: JSON.stringify({ loginId: "nobody", password: "not-a-password" }),
  });
  assert.equal(crossOriginLogin.status, 403);
  const extraLoginField = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "nobody", password: "not-a-password", role: "ADMIN" }),
  });
  assert.equal(extraLoginField.status, 400);
  const duplicateUserLoginKey = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: '{"loginId":"nobody","login\\u0049d":"other","password":"not-a-password"}',
  });
  assert.equal(duplicateUserLoginKey.status, 400);
  const duplicateAdminLoginKey = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: '{"loginId":"nobody","loginId":"other","password":"not-a-password"}',
  });
  assert.equal(duplicateAdminLoginKey.status, 400);
  const visibleSignupBase = signupPayload("visible-identifiers");
  for (const unsafeSignup of [
    { ...visibleSignupBase, riotId: "Existing\u200b#KR1" },
    { ...visibleSignupBase, memberName: "홍\ufeff길동" },
    { ...visibleSignupBase, riotId: "Existing#K\u2060R1" },
    { ...visibleSignupBase, riotId: "Existing\ufe0f#KR1" },
    { ...visibleSignupBase, memberName: `홍${String.fromCharCode(0xd800)}길동` },
    { ...visibleSignupBase, riotId: `Existing${String.fromCharCode(0xdc00)}#KR1` },
  ]) {
    const rejectedInvisible = await signup(
      origin,
      unsafeSignup,
      idempotencyKey("signup-invisible-identity"),
    );
    assert.equal(rejectedInvisible.status, 400);
  }

  const signupInput = signupPayload("new");
  const signupKey = idempotencyKey("signup-new");
  const signedUp = await signup(origin, signupInput, signupKey);
  assert.equal(signedUp.status, 201);
  assert.equal(signedUp.headers.get("etag"), '"0"');
  assert.equal(signedUp.headers.get("cache-control"), "no-store, max-age=0");
  const signedUpBody = await signedUp.json() as {
    account: { id: string; status: string; revision: number; player: { id: string } | null };
  };
  recursivelyRejectSensitiveFields(signedUpBody);
  assert.equal(signedUpBody.account.status, "PENDING");
  const signedUpId = signedUpBody.account.id;
  assert.ok(signedUpBody.account.player);
  const expiredResetRequestId = randomUUID();
  await database.insert(passwordResetRequests).values({
    id: expiredResetRequestId,
    userAccountId: signedUpId,
    loginIdHash: randomBytes(32),
    status: "PENDING",
    requestedAt: new Date(Date.now() - 120_000),
    expiresAt: new Date(Date.now() - 60_000),
  });
  await assertPublicPlayerVisibility({
    origin,
    playerId: signedUpBody.account.player!.id,
    riotId: signupInput.riotId,
    visible: false,
    message: "a PENDING signup player must not appear in the public registry",
  });

  const replayedSignup = await signup(origin, signupInput, signupKey);
  assert.equal(replayedSignup.status, 201);
  assert.equal(replayedSignup.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await replayedSignup.json(), signedUpBody);
  const reusedSignupPassword = await signup(
    origin,
    { ...signupInput, password: `${signupInput.password}9` },
    signupKey,
  );
  assert.equal(reusedSignupPassword.status, 409);
  assert.equal(problemCode(await reusedSignupPassword.json()), "IDEMPOTENCY_KEY_REUSED");
  await database.delete(loginRateLimitBuckets);
  const reusedSignupKey = await signup(
    origin,
    { ...signupInput, memberName: `${signupInput.memberName} 변경` },
    signupKey,
  );
  assert.equal(reusedSignupKey.status, 409);
  assert.equal(problemCode(await reusedSignupKey.json()), "IDEMPOTENCY_KEY_REUSED");

  const signupReceipt = (
    await database
      .select({
        principalKeyHash: accountMutationReceipts.principalKeyHash,
        requestHash: accountMutationReceipts.requestHash,
      })
      .from(accountMutationReceipts)
      .where(eq(accountMutationReceipts.scope, "account:signup"))
      .limit(1)
  )[0];
  assert.ok(signupReceipt);
  const oldPrincipalVerifier = createHash("sha256")
    .update(`signup:${signupInput.loginId.normalize("NFKC").toLocaleLowerCase("ko-KR")}`)
    .digest();
  const oldFingerprint = createHash("sha256")
    .update(JSON.stringify({
      action: "signup",
      loginId: signupInput.loginId.normalize("NFKC").toLocaleLowerCase("ko-KR"),
      memberName: signupInput.memberName.normalize("NFKC").toLocaleLowerCase("ko-KR"),
      riotId: signupInput.riotId.normalize("NFKC").toLocaleLowerCase("ko-KR"),
      password: signupInput.password,
    }))
    .digest("base64url");
  const oldRequestVerifier = createHash("sha256").update(oldFingerprint).digest();
  assert.equal(Buffer.from(signupReceipt!.principalKeyHash).equals(oldPrincipalVerifier), false);
  assert.equal(Buffer.from(signupReceipt!.requestHash).equals(oldRequestVerifier), false);

  await database.delete(loginRateLimitBuckets);
  const duplicateLogin = await signup(origin, signupInput, idempotencyKey("signup-duplicate-login"));
  assert.equal(duplicateLogin.status, 409);
  assert.equal(problemCode(await duplicateLogin.json()), "LOGIN_ID_EXISTS");
  const duplicateRiotPayload = signupPayload("duplicate-riot", signupInput.riotId);
  const duplicateRiot = await signup(
    origin,
    duplicateRiotPayload,
    idempotencyKey("signup-duplicate-riot"),
  );
  assert.equal(duplicateRiot.status, 409);
  assert.equal(problemCode(await duplicateRiot.json()), "RIOT_ID_ALREADY_LINKED");

  const pendingLogin = await loginAccount(origin, signupInput.loginId, signupInput.password);
  assert.equal(pendingLogin.response.status, 200);
  assert.equal((pendingLogin.body.account as { status: string }).status, "PENDING");
  recursivelyRejectSensitiveFields(pendingLogin.body);
  assert.equal(responseCookies(pendingLogin.response).some((value) => value.startsWith(`${ADMIN_COOKIE_NAME}=`)), false);
  const pendingMe = await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: pendingLogin.cookie },
  });
  await assertAuthenticatedMe(pendingMe, signedUpId);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: pendingLogin.cookie },
  })).status, 401);

  for (const pathSuffix of ["me", "me/player"]) {
    assert.equal((await fetch(`${origin}/api/auth/${pathSuffix}?unexpected=1`, {
      headers: { cookie: pendingLogin.cookie },
    })).status, 400);
  }
  assert.equal((await fetch(`${origin}/api/auth/logout?unexpected=1`, {
    method: "POST",
    headers: { cookie: pendingLogin.cookie, origin },
  })).status, 400);
  assert.equal((await fetch(`${origin}/api/auth/password?unexpected=1`, {
    method: "PATCH",
    headers: { cookie: pendingLogin.cookie },
  })).status, 400);
  const nonemptyLogout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: pendingLogin.cookie, origin },
    body: "{}",
  });
  assert.equal(nonemptyLogout.status, 400);

  const superAccountLogin = await loginAccount(origin, superAdmin.loginId, superAdmin.password);
  assert.equal(superAccountLogin.response.status, 200);
  const malformedAdminLogin = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      loginId: [superAdmin.loginId],
      password: [superAdmin.password],
      totpCode: [generateTotpCode(superAdmin.totpSecret!, Math.floor(Date.now() / 30_000))],
    }),
  });
  assert.equal(malformedAdminLogin.status, 400);
  const superAdminCookie = await loginAdmin(origin, superAdmin);
  const adminCookie = await loginAdmin(origin, admin);
  const expiredResetProjection = await fetch(`${origin}/api/admin/users/${signedUpId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(expiredResetProjection.status, 200);
  assert.equal(((await expiredResetProjection.json()) as {
    account: { resetRequestPending: boolean };
  }).account.resetRequestPending, false);
  await database.delete(passwordResetRequests).where(eq(passwordResetRequests.id, expiredResetRequestId));
  const bothSuperCookies = combinedCookie(superAccountLogin.cookie, superAdminCookie);
  await assertAnonymousMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: superAdminCookie },
  }));
  await assertAuthenticatedMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: bothSuperCookies },
  }), superAdmin.id);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: superAccountLogin.cookie },
  })).status, 401);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: bothSuperCookies },
  })).status, 200);

  const victimAccountLogin = await loginAccount(origin, adminVictim.loginId, adminVictim.password);
  const victimAdminCookie = await loginAdmin(origin, adminVictim);
  const adminTokenInAccountCookie = `${ACCOUNT_COOKIE_NAME}=${victimAdminCookie.split("=")[1]}`;
  const accountPurposeConfusion = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: adminTokenInAccountCookie, origin },
  });
  assert.equal(accountPurposeConfusion.status, 204);
  assert.match(responseCookies(accountPurposeConfusion).join("\n"), new RegExp(`${ACCOUNT_COOKIE_NAME}=.*Max-Age=0`, "is"));
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: victimAdminCookie },
  })).status, 200, "ACCOUNT logout must not revoke an ADMIN token placed in the wrong cookie");

  const accountTokenInAdminCookie = `${ADMIN_COOKIE_NAME}=${victimAccountLogin.cookie.split("=")[1]}`;
  const adminPurposeConfusion = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: accountTokenInAdminCookie, origin },
  });
  assert.equal(adminPurposeConfusion.status, 200);
  assert.match(responseCookies(adminPurposeConfusion).join("\n"), new RegExp(`${ADMIN_COOKIE_NAME}=.*Max-Age=0`, "is"));
  await assertAuthenticatedMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: victimAccountLogin.cookie },
  }), adminVictim.id, "ADMIN logout must not revoke an ACCOUNT token placed in the wrong cookie");

  const accountOnlyLogout = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: {
      cookie: combinedCookie(victimAccountLogin.cookie, victimAdminCookie),
      origin,
    },
  });
  assert.equal(accountOnlyLogout.status, 204);
  const accountLogoutCookies = responseCookies(accountOnlyLogout).join("\n");
  assert.match(accountLogoutCookies, new RegExp(`${ACCOUNT_COOKIE_NAME}=.*Max-Age=0`, "is"));
  assert.equal(accountLogoutCookies.includes(`${ADMIN_COOKIE_NAME}=`), false);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: victimAdminCookie },
  })).status, 200, "ACCOUNT logout must preserve ADMIN elevation");
  const victimAccountRelogin = await loginAccount(origin, adminVictim.loginId, adminVictim.password);
  const adminOnlyLogout = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: {
      cookie: combinedCookie(victimAccountRelogin.cookie, victimAdminCookie),
      origin,
    },
  });
  assert.equal(adminOnlyLogout.status, 200);
  const adminLogoutCookies = responseCookies(adminOnlyLogout).join("\n");
  assert.match(adminLogoutCookies, new RegExp(`${ADMIN_COOKIE_NAME}=.*Max-Age=0`, "is"));
  assert.equal(adminLogoutCookies.includes(`${ACCOUNT_COOKIE_NAME}=`), false);
  await assertAuthenticatedMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: victimAccountRelogin.cookie },
  }), adminVictim.id, "ADMIN logout must preserve the ACCOUNT session");

  const adminQueryControl = await fetch(`${origin}/api/admin/users?q=bad%E2%80%8Equery`, {
    headers: { cookie: superAdminCookie },
  });
  assert.equal(adminQueryControl.status, 400);
  assert.equal((await fetch(`${origin}/api/admin/users?q=a&q=b`, {
    headers: { cookie: superAdminCookie },
  })).status, 400);
  const emptyList = await fetch(`${origin}/api/admin/users?q=no-such-account-http-value`, {
    headers: { cookie: superAdminCookie },
  });
  assert.equal(emptyList.status, 200);
  assert.equal(((await emptyList.json()) as { items: unknown[] }).items.length, 0);
  assert.equal((await fetch(`${origin}/api/admin/users/${randomUUID()}`, {
    headers: { cookie: superAdminCookie },
  })).status, 404);
  for (const invalidPlayerId of ["not-a-uuid", "2147483648", "9999999999", "-1", "%E2%80%8E"]) {
    const malformedAdapter = await fetch(
      `${origin}/api/admin/players/${invalidPlayerId}/password-reset`,
      { method: "POST", headers: { cookie: superAdminCookie } },
    );
    assert.equal([400, 404].includes(malformedAdapter.status), true);
  }

  const detail = await fetch(`${origin}/api/admin/users/${signedUpId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get("etag"), '"0"');
  recursivelyRejectSensitiveFields(await detail.clone().json(), true);
  const adminVictimForAdmin = await fetch(`${origin}/api/admin/users/${adminVictim.id}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(adminVictimForAdmin.status, 200);
  assert.equal(((await adminVictimForAdmin.json()) as { account: { adminTotpConfigured: boolean } }).account.adminTotpConfigured, false);
  const adminVictimForSuper = await fetch(`${origin}/api/admin/users/${adminVictim.id}`, {
    headers: { cookie: superAdminCookie },
  });
  assert.equal(adminVictimForSuper.status, 200);
  assert.equal(((await adminVictimForSuper.json()) as { account: { adminTotpConfigured: boolean } }).account.adminTotpConfigured, true);
  assert.equal((await fetch(`${origin}/api/admin/users/${signedUpId}?unexpected=1`, {
    headers: { cookie: adminCookie },
  })).status, 400);
  assert.equal((await fetch(`${origin}/api/admin/users/${signedUpId}/details`, {
    headers: { cookie: adminCookie },
  })).status, 200);

  const approvalBody = {
    ...reason("승인"),
    expectedClaimId: null,
    claimOwnershipReviewed: false,
  };
  const invalidLinkedApproval = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/approve`,
    revision: 0,
    body: {
      ...reason("잘못된 연결 승인"),
      expectedClaimId: randomUUID(),
      claimOwnershipReviewed: true,
    },
  });
  assert.equal(invalidLinkedApproval.status, 409);
  assert.equal((await database.select().from(userAccounts).where(eq(userAccounts.id, signedUpId)))[0]?.status, "PENDING");
  assert.equal((await database.select().from(players).where(
    eq(players.id, signedUpBody.account.player!.id),
  ))[0]?.status, "INACTIVE");
  await assertPublicPlayerVisibility({
    origin,
    playerId: signedUpBody.account.player!.id,
    riotId: signupInput.riotId,
    visible: false,
    message: "a failed approval must not publish the linked player",
  });
  const missingRevision = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/approve`,
    body: approvalBody,
  });
  assert.equal(missingRevision.status, 428);
  const approved = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/approve`,
    revision: 0,
    body: approvalBody,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.headers.get("etag"), '"1"');
  recursivelyRejectSensitiveFields(await approved.clone().json(), true);
  await assertPublicPlayerVisibility({
    origin,
    playerId: signedUpBody.account.player!.id,
    riotId: signupInput.riotId,
    visible: true,
    message: "approval must atomically publish the linked player",
  });
  await assertAnonymousMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: pendingLogin.cookie },
  }), "status mutation must revoke the pre-approval session");
  const staleApproval = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/suspend`,
    revision: 0,
    body: confirmedReason("제한", signupInput.loginId),
  });
  assert.equal(staleApproval.status, 412);
  assert.equal(staleApproval.headers.get("etag"), '"1"');

  const approvedAccountLogin = await loginAccount(origin, signupInput.loginId, signupInput.password);
  assert.equal(approvedAccountLogin.response.status, 200);
  const adminCannotChangeRole = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/role`,
    revision: 1,
    body: { role: "ADMIN", internalReason: "ADMIN은 역할 변경 불가", confirmLoginId: signupInput.loginId },
  });
  assert.equal(adminCannotChangeRole.status, 403);
  const cannotAssignSuper = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${signedUpId}/role`,
    revision: 1,
    body: { role: "SUPER_ADMIN", internalReason: "웹 SUPER 부여 금지", confirmLoginId: signupInput.loginId },
  });
  assert.equal(cannotAssignSuper.status, 400);
  const promoted = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${signedUpId}/role`,
    revision: 1,
    body: { role: "ADMIN", internalReason: "S01 권한 계약 검증용 승격", confirmLoginId: signupInput.loginId },
  });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.headers.get("etag"), '"2"');
  await assertAnonymousMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: approvedAccountLogin.cookie },
  }), "role mutation must revoke account sessions");

  const resetKey = idempotencyKey("password-reset");
  const ordinaryAdminCannotHashReset = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${signedUpId}/password-reset`,
    revision: 2,
    body: { internalReason: "일반 ADMIN 고비용 reset 금지", confirmLoginId: signupInput.loginId },
  });
  assert.equal(ordinaryAdminCannotHashReset.status, 403);
  const passwordReset = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${signedUpId}/password-reset`,
    revision: 2,
    key: resetKey,
    body: { internalReason: "사용자 요청에 따른 일회성 복구", confirmLoginId: signupInput.loginId },
  });
  assert.equal(passwordReset.status, 200);
  assert.equal(passwordReset.headers.get("cache-control"), "no-store, max-age=0");
  const passwordResetBody = await passwordReset.json() as {
    temporaryPassword: string;
    account: { revision: number; mustChangePassword: boolean };
  };
  assert.match(passwordResetBody.temporaryPassword, /^K9-[A-Za-z0-9_-]{24}$/);
  syntheticSecrets.push(passwordResetBody.temporaryPassword);
  assert.equal(passwordResetBody.account.mustChangePassword, true);
  const resetReplay = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${signedUpId}/password-reset`,
    revision: 2,
    key: resetKey,
    body: { internalReason: "사용자 요청에 따른 일회성 복구", confirmLoginId: signupInput.loginId },
  });
  assert.equal(resetReplay.status, 409);
  assert.equal(problemCode(await resetReplay.json()), "ONE_TIME_SECRET_ALREADY_ISSUED");

  const temporaryLogin = await loginAccount(
    origin,
    signupInput.loginId,
    passwordResetBody.temporaryPassword,
  );
  assert.equal(temporaryLogin.response.status, 200);
  assert.equal((temporaryLogin.body.account as { mustChangePassword: boolean }).mustChangePassword, true);
  const newPassword = `새비밀번호${randomBytes(8).toString("hex")}2026`;
  syntheticSecrets.push(newPassword);
  await database.delete(loginRateLimitBuckets);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invalidCurrent = await fetch(`${origin}/api/auth/password`, {
      method: "PATCH",
      headers: {
        cookie: temporaryLogin.cookie,
        origin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey(`password-rate-invalid-${attempt}`),
        "if-match": '"3"',
      },
      body: JSON.stringify({
        currentPassword: `wrong-current-password-${attempt}`,
        newPassword: `SafeRatePassword${attempt}2026`,
      }),
    });
    assert.equal(invalidCurrent.status, 400);
    assert.equal(problemCode(await invalidCurrent.json()), "CURRENT_PASSWORD_INVALID");
  }
  const passwordLimited = await fetch(`${origin}/api/auth/password`, {
    method: "PATCH",
    headers: {
      cookie: temporaryLogin.cookie,
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("password-rate-blocked"),
      "if-match": '"3"',
    },
    body: JSON.stringify({
      currentPassword: passwordResetBody.temporaryPassword,
      newPassword,
    }),
  });
  assert.equal(passwordLimited.status, 429);
  assert.match(passwordLimited.headers.get("retry-after") ?? "", /^\d+$/);
  // This disposable HTTP-contract database does not need historical throttling rows
  // after the 429 assertion. Deleting them avoids collapsing distinct windows onto
  // the same unique (scope, key, window_started_at) tuple during the reset.
  await database.delete(loginRateLimitBuckets);
  const selfChangeResetRequestId = randomUUID();
  const selfChangeRequestedAt = new Date(Date.now() - 1_000);
  await database.insert(passwordResetRequests).values({
    id: selfChangeResetRequestId,
    userAccountId: signedUpId,
    loginIdHash: randomBytes(32),
    status: "PENDING",
    requestedAt: selfChangeRequestedAt,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  });
  let passwordChanged: Response;
  let queuedSelfRecovery: Response;
  const selfPasswordBlocker = await pool.connect();
  try {
    await selfPasswordBlocker.query("begin");
    await selfPasswordBlocker.query(
      "select id from auth.user_accounts where id = $1 for update",
      [signedUpId],
    );
    const passwordChangedPromise = fetch(`${origin}/api/auth/password`, {
      method: "PATCH",
      headers: {
        cookie: combinedCookie(temporaryLogin.cookie, superAdminCookie),
        origin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("own-password-change"),
        "if-match": '"3"',
      },
      body: JSON.stringify({
        currentPassword: passwordResetBody.temporaryPassword,
        newPassword,
      }),
    });
    await waitForDatabaseLockWaiters(1, "self password change queue");
    const queuedSelfRecoveryPromise = fetch(`${origin}/api/auth/reset-requests`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("queued-self-password-recovery"),
      },
      body: JSON.stringify({ loginId: signupInput.loginId }),
    });
    await waitForDatabaseLockWaiters(2, "self password change and recovery queue");
    await selfPasswordBlocker.query("commit");
    [passwordChanged, queuedSelfRecovery] = await Promise.all([
      passwordChangedPromise,
      queuedSelfRecoveryPromise,
    ]);
  } finally {
    await selfPasswordBlocker.query("rollback").catch(() => undefined);
    selfPasswordBlocker.release();
  }
  assert.equal(passwordChanged.status, 200);
  assert.equal(queuedSelfRecovery.status, 202);
  assert.equal(passwordChanged.headers.get("etag"), '"4"');
  const clearedCookies = responseCookies(passwordChanged).join("\n");
  assert.match(clearedCookies, new RegExp(`${ACCOUNT_COOKIE_NAME}=.*Max-Age=0`, "is"));
  assert.match(clearedCookies, new RegExp(`${ADMIN_COOKIE_NAME}=.*Max-Age=0`, "is"));
  const selfChangeResetRequest = (
    await database.select().from(passwordResetRequests).where(
      eq(passwordResetRequests.id, selfChangeResetRequestId),
    )
  )[0];
  assert.equal(selfChangeResetRequest?.status, "CANCELLED");
  assert.equal(selfChangeResetRequest?.resolvedByUserAccountId, signedUpId);
  assert.ok(selfChangeResetRequest?.resolvedAt);
  assert.ok(selfChangeResetRequest!.resolvedAt!.getTime() >= selfChangeRequestedAt.getTime());
  assert.equal((await database.select({ value: count() }).from(auditEvents).where(and(
    eq(auditEvents.targetId, signedUpId),
    eq(auditEvents.action, "PASSWORD_RESET_REQUESTS_CANCELLED_ON_PASSWORD_CHANGE"),
  )))[0]?.value, 1);
  const selfChangeAdminProjection = await fetch(`${origin}/api/admin/users/${signedUpId}`, {
    headers: { cookie: superAdminCookie },
  });
  assert.equal(selfChangeAdminProjection.status, 200);
  assert.equal(((await selfChangeAdminProjection.json()) as {
    account: { resetRequestPending: boolean };
  }).account.resetRequestPending, false);
  assert.equal((await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, signedUpId),
    eq(passwordResetRequests.status, "PENDING"),
  ))).length, 0, "queued recovery must not recreate a request after self password change");
  await database.delete(loginRateLimitBuckets);
  const postSelfChangeRecovery = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("post-self-password-recovery"),
    },
    body: JSON.stringify({ loginId: signupInput.loginId }),
  });
  assert.equal(postSelfChangeRecovery.status, 202);
  assert.equal((await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, signedUpId),
    eq(passwordResetRequests.status, "PENDING"),
  ))).length, 1, "recovery requested after password change completion must remain available");
  await database.delete(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, signedUpId),
    eq(passwordResetRequests.status, "PENDING"),
  ));
  await assertAnonymousMe(await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: temporaryLogin.cookie },
  }));
  const changedLogin = await loginAccount(origin, signupInput.loginId, newPassword);
  assert.equal(changedLogin.response.status, 200);
  assert.equal((changedLogin.body.account as { mustChangePassword: boolean }).mustChangePassword, false);

  const statusPayload = signupPayload("status-flow");
  await database.delete(loginRateLimitBuckets);
  const statusSignup = await signup(origin, statusPayload, idempotencyKey("status-signup"));
  assert.equal(statusSignup.status, 201);
  const statusSignupBody = (await statusSignup.json()) as {
    account: { id: string; player: { id: string } | null };
  };
  const statusAccountId = statusSignupBody.account.id;
  assert.ok(statusSignupBody.account.player);
  const renamedStatusLoginId = `${statusPayload.loginId}_renamed`;
  await database.update(userAccounts).set({
    loginId: renamedStatusLoginId,
    loginIdNormalized: renamedStatusLoginId.normalize("NFKC").toLocaleLowerCase("ko-KR"),
  }).where(eq(userAccounts.id, statusAccountId));
  const renamedConfirmationRejected = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/reject`,
    revision: 0,
    body: confirmedReason("이전 로그인 아이디 확인 거부", statusPayload.loginId),
  });
  assert.equal(renamedConfirmationRejected.status, 409);
  const rejected = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/reject`,
    revision: 0,
    body: confirmedReason("거절", renamedStatusLoginId),
  });
  assert.equal(rejected.status, 200);
  const resetPending = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/reset-pending`,
    revision: 1,
    body: confirmedReason("재검토", renamedStatusLoginId),
  });
  assert.equal(resetPending.status, 200);
  const statusApproved = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/approve`,
    revision: 2,
    body: approvalBody,
  });
  assert.equal(statusApproved.status, 200);
  const suspended = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/suspend`,
    revision: 3,
    body: confirmedReason("이용 제한", renamedStatusLoginId),
  });
  assert.equal(suspended.status, 200);
  const unchangedSuspend = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/suspend`,
    revision: 4,
    body: confirmedReason("중복 제한", renamedStatusLoginId),
  });
  assert.equal(unchangedSuspend.status, 409);
  const approvedToPending = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/reset-pending`,
    revision: 4,
    body: confirmedReason("승인 계정 재검토", renamedStatusLoginId),
  });
  assert.equal(approvedToPending.status, 200);
  await assertPublicPlayerVisibility({
    origin,
    playerId: statusSignupBody.account.player!.id,
    riotId: statusPayload.riotId,
    visible: false,
    message: "reset-to-pending must remove the linked player from public output",
  });
  const pendingToApproved = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${statusAccountId}/approve`,
    revision: 5,
    body: approvalBody,
  });
  assert.equal(pendingToApproved.status, 200);
  await assertPublicPlayerVisibility({
    origin,
    playerId: statusSignupBody.account.player!.id,
    riotId: statusPayload.riotId,
    visible: true,
    message: "reapproval must restore the linked player to public output",
  });
  await database.delete(loginRateLimitBuckets);
  let queuedAdminReset: Response;
  let queuedAdminRecovery: Response;
  const adminResetBlocker = await pool.connect();
  try {
    await adminResetBlocker.query("begin");
    await adminResetBlocker.query(
      "select id from auth.user_accounts where id = $1 for update",
      [statusAccountId],
    );
    const queuedAdminResetPromise = adminMutation({
      origin,
      cookie: superAdminCookie,
      path: `/api/admin/users/${statusAccountId}/password-reset`,
      revision: 6,
      body: {
        internalReason: "관리자 초기화와 복구 요청 잠금 순서 검증",
        confirmLoginId: renamedStatusLoginId,
      },
    });
    await waitForDatabaseLockWaiters(1, "admin password reset queue");
    const queuedAdminRecoveryPromise = fetch(`${origin}/api/auth/reset-requests`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("queued-admin-reset-recovery"),
      },
      body: JSON.stringify({ loginId: renamedStatusLoginId }),
    });
    await waitForDatabaseLockWaiters(2, "admin password reset and recovery queue");
    await adminResetBlocker.query("commit");
    [queuedAdminReset, queuedAdminRecovery] = await Promise.all([
      queuedAdminResetPromise,
      queuedAdminRecoveryPromise,
    ]);
  } finally {
    await adminResetBlocker.query("rollback").catch(() => undefined);
    adminResetBlocker.release();
  }
  assert.equal(queuedAdminReset.status, 200);
  assert.equal(queuedAdminRecovery.status, 202);
  const queuedAdminResetBody = await queuedAdminReset.json() as { temporaryPassword: string };
  assert.match(queuedAdminResetBody.temporaryPassword, /^K9-[A-Za-z0-9_-]{24}$/);
  syntheticSecrets.push(queuedAdminResetBody.temporaryPassword);
  assert.equal((await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, statusAccountId),
    eq(passwordResetRequests.status, "PENDING"),
  ))).length, 0, "queued recovery must not recreate a request after an admin reset");
  await database.delete(loginRateLimitBuckets);
  const postAdminResetRecovery = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("post-admin-reset-recovery"),
    },
    body: JSON.stringify({ loginId: renamedStatusLoginId }),
  });
  assert.equal(postAdminResetRecovery.status, 202);
  assert.equal((await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, statusAccountId),
    eq(passwordResetRequests.status, "PENDING"),
  ))).length, 1, "recovery requested after admin reset completion must remain available");
  await database.delete(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, statusAccountId),
    eq(passwordResetRequests.status, "PENDING"),
  ));

  const claimNickname = `ExistingHttp${randomBytes(4).toString("hex")}`;
  const claimPlayerId = randomUUID();
  const claimDeactivatedAt = new Date();
  await database.insert(players).values({
    id: claimPlayerId,
    memberName: "기존 HTTP 비공개 회원명",
    memberNameNormalized: "기존 http 비공개 회원명",
    nickname: claimNickname,
    nicknameNormalized: claimNickname.toLocaleLowerCase("ko-KR"),
    tagLine: "CLAIM",
    tagLineNormalized: "claim",
    status: "INACTIVE",
    deactivatedAt: claimDeactivatedAt,
    accountLifecycleDeactivatedAt: claimDeactivatedAt,
  });
  await database.delete(loginRateLimitBuckets);
  const claimPayload = signupPayload("claim", `${claimNickname}#CLAIM`);
  const claimSignup = await signup(origin, claimPayload, idempotencyKey("claim-signup"));
  assert.equal(claimSignup.status, 201);
  const claimAccountId = ((await claimSignup.json()) as { account: { id: string } }).account.id;
  const claimRow = (
    await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, claimAccountId),
    )
  )[0];
  assert.ok(claimRow);
  const claimDetail = await fetch(`${origin}/api/admin/users/${claimAccountId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(claimDetail.status, 200);
  const claimDetailBody = await claimDetail.json() as {
    account: {
      playerClaimReview: {
        requestedMemberName: string;
        ownershipVerified: boolean;
        targetPlayer: { memberName: string; userAccountId: string | null };
      };
    };
  };
  assert.equal(claimDetailBody.account.playerClaimReview.requestedMemberName, claimPayload.memberName);
  assert.equal(claimDetailBody.account.playerClaimReview.targetPlayer.memberName, "기존 HTTP 비공개 회원명");
  assert.equal(claimDetailBody.account.playerClaimReview.targetPlayer.userAccountId, null);
  assert.equal(claimDetailBody.account.playerClaimReview.ownershipVerified, false);
  const claimReviewPage = await fetch(`${origin}/admin/users/${claimAccountId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(claimReviewPage.status, 200);
  assert.match(await claimReviewPage.text(), /Riot 소유권은 확인되지 않았습니다/);
  const claimRejected = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${claimAccountId}/reject`,
    revision: 0,
    body: confirmedReason("기존 플레이어 claim 연결 거절", claimPayload.loginId),
  });
  assert.equal(claimRejected.status, 200);
  const rejectedClaimLogin = await loginAccount(origin, claimPayload.loginId, claimPayload.password);
  assert.equal(rejectedClaimLogin.response.status, 200);
  const rejectedClaimMe = await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: rejectedClaimLogin.cookie },
  });
  assert.equal(rejectedClaimMe.status, 200);
  assert.equal(((await rejectedClaimMe.json()) as {
    user: { playerClaim: { status: string } | null };
  }).user.playerClaim?.status, "REJECTED");
  const rejectedClaimPage = await fetch(`${origin}/account?tab=player`, {
    headers: { cookie: rejectedClaimLogin.cookie },
  });
  assert.equal(rejectedClaimPage.status, 200);
  assert.match(await rejectedClaimPage.text(), /연결 검토가 종료되었습니다/);
  const claimReopened = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${claimAccountId}/reset-pending`,
    revision: 1,
    body: confirmedReason("기존 플레이어 claim 재검토", claimPayload.loginId),
  });
  assert.equal(claimReopened.status, 200);
  const blindClaimApproval = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${claimAccountId}/approve`,
    revision: 2,
    body: {
      ...reason("claim 승인"),
      expectedClaimId: claimRow.id,
      claimOwnershipReviewed: false,
    },
  });
  assert.equal(blindClaimApproval.status, 409);
  const claimApproval = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${claimAccountId}/approve`,
    revision: 2,
    body: {
      ...reason("claim 승인"),
      expectedClaimId: claimRow.id,
      claimOwnershipReviewed: true,
    },
  });
  assert.equal(claimApproval.status, 200);
  const claimedPlayer = (
    await database.select().from(players).where(eq(players.id, claimPlayerId))
  )[0];
  assert.equal(claimedPlayer?.userAccountId, claimAccountId);
  assert.equal(claimedPlayer?.status, "ACTIVE");
  assert.equal(claimedPlayer?.deactivatedAt, null);
  assert.equal(claimedPlayer?.accountLifecycleDeactivatedAt, null);

  const deleteClaimPlayerId = randomUUID();
  const deleteClaimNickname = `DeleteClaimHttp${randomBytes(4).toString("hex")}`;
  const deleteClaimRiotId = `${deleteClaimNickname}#S01`;
  await database.insert(players).values({
    id: deleteClaimPlayerId,
    memberName: "삭제 claim HTTP 대상 회원",
    memberNameNormalized: "삭제 claim http 대상 회원",
    nickname: deleteClaimNickname,
    nicknameNormalized: deleteClaimNickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S01",
    tagLineNormalized: "s01",
  });
  await database.delete(loginRateLimitBuckets);
  const deleteClaimOwnerPayload = signupPayload("delete-claim-owner", deleteClaimRiotId);
  const deleteClaimOwnerSignup = await signup(
    origin,
    deleteClaimOwnerPayload,
    idempotencyKey("delete-claim-owner-signup"),
  );
  assert.equal(deleteClaimOwnerSignup.status, 201);
  const deleteClaimOwnerId = ((await deleteClaimOwnerSignup.json()) as {
    account: { id: string };
  }).account.id;
  const deleteClaimOwnerClaim = (await database.select().from(playerAccountClaims).where(
    eq(playerAccountClaims.userAccountId, deleteClaimOwnerId),
  ))[0];
  assert.ok(deleteClaimOwnerClaim);
  const deleteClaimCompetitorPayload = signupPayload("delete-claim-competitor", deleteClaimRiotId);
  const [deleteClaimOwnerResponse, racingClaimCompetitorResponse] = await Promise.all([
    adminMutation({
      origin,
      cookie: superAdminCookie,
      path: `/api/admin/users/${deleteClaimOwnerId}`,
      method: "DELETE",
      revision: 0,
      body: {
        internalReason: "삭제 계정 claim 예약 해제 HTTP 경합",
        confirmLoginId: deleteClaimOwnerPayload.loginId,
      },
    }),
    signup(
      origin,
      deleteClaimCompetitorPayload,
      idempotencyKey("delete-claim-competitor-race"),
    ),
  ]);
  assert.equal(deleteClaimOwnerResponse.status, 200);
  assert.ok(
    racingClaimCompetitorResponse.status === 201 || racingClaimCompetitorResponse.status === 409,
  );
  assert.equal((await database.select().from(playerAccountClaims).where(
    eq(playerAccountClaims.id, deleteClaimOwnerClaim!.id),
  ))[0]?.status, "REJECTED");
  let finalClaimCompetitorResponse = racingClaimCompetitorResponse;
  if (racingClaimCompetitorResponse.status === 409) {
    assert.equal(problemCode(await racingClaimCompetitorResponse.json()), "PLAYER_CLAIM_PENDING");
    await database.delete(loginRateLimitBuckets);
    finalClaimCompetitorResponse = await signup(
      origin,
      deleteClaimCompetitorPayload,
      idempotencyKey("delete-claim-competitor-retry"),
    );
  }
  assert.equal(finalClaimCompetitorResponse.status, 201);
  const restoredDeletedClaimOwner = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${deleteClaimOwnerId}/restore`,
    revision: 1,
    body: {
      internalReason: "경쟁 claim 선점 시 복구 전체 롤백",
      confirmLoginId: deleteClaimOwnerPayload.loginId,
    },
  });
  assert.equal(restoredDeletedClaimOwner.status, 409);
  assert.equal(problemCode(await restoredDeletedClaimOwner.json()), "PLAYER_CLAIM_TAKEN");
  assert.equal((await database.select().from(playerAccountClaims).where(
    eq(playerAccountClaims.id, deleteClaimOwnerClaim!.id),
  ))[0]?.status, "REJECTED");
  const stillDeletedClaimOwner = (await database.select().from(userAccounts).where(
    eq(userAccounts.id, deleteClaimOwnerId),
  ))[0];
  assert.ok(stillDeletedClaimOwner?.deletedAt);
  assert.equal(stillDeletedClaimOwner?.revision, 1);

  const recoverablePlayerId = randomUUID();
  const recoverableNickname = `RecoverableHttp${randomBytes(4).toString("hex")}`;
  const recoverableRiotId = `${recoverableNickname}#S01`;
  await database.insert(players).values({
    id: recoverablePlayerId,
    memberName: "복구 가능한 HTTP claim 회원",
    memberNameNormalized: "복구 가능한 http claim 회원",
    nickname: recoverableNickname,
    nicknameNormalized: recoverableNickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S01",
    tagLineNormalized: "s01",
  });
  await database.delete(loginRateLimitBuckets);
  const recoverablePayload = signupPayload("recoverable-delete-claim", recoverableRiotId);
  const recoverableSignupResponse = await signup(
    origin,
    recoverablePayload,
    idempotencyKey("recoverable-delete-claim-signup"),
  );
  assert.equal(recoverableSignupResponse.status, 201);
  const recoverableAccountId = ((await recoverableSignupResponse.json()) as {
    account: { id: string };
  }).account.id;
  const recoverableClaim = (await database.select().from(playerAccountClaims).where(
    eq(playerAccountClaims.userAccountId, recoverableAccountId),
  ))[0];
  assert.ok(recoverableClaim);
  await database.delete(loginRateLimitBuckets);
  const recoverableResetRequest = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("recoverable-delete-reset-request"),
    },
    body: JSON.stringify({ loginId: recoverablePayload.loginId }),
  });
  assert.equal(recoverableResetRequest.status, 202);
  const pendingRecoverableReset = (await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, recoverableAccountId),
    eq(passwordResetRequests.status, "PENDING"),
  )))[0];
  assert.ok(pendingRecoverableReset);
  const recoverableDeleteResponse = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${recoverableAccountId}`,
    method: "DELETE",
    revision: 0,
    body: {
      internalReason: "claim과 복구 요청을 함께 종료하는 HTTP 삭제",
      confirmLoginId: recoverablePayload.loginId,
    },
  });
  assert.equal(recoverableDeleteResponse.status, 200);
  const cancelledRecoverableReset = (await database.select().from(passwordResetRequests).where(
    eq(passwordResetRequests.id, pendingRecoverableReset!.id),
  ))[0];
  assert.equal(cancelledRecoverableReset?.status, "CANCELLED");
  assert.ok(cancelledRecoverableReset?.resolvedAt);
  assert.equal(cancelledRecoverableReset?.resolvedByUserAccountId, superAdmin.id);
  const recoverableRestoreResponse = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${recoverableAccountId}/restore`,
    revision: 1,
    body: {
      internalReason: "경쟁 claim 없음 재검사 후 HTTP 복구",
      confirmLoginId: recoverablePayload.loginId,
    },
  });
  assert.equal(recoverableRestoreResponse.status, 200);
  assert.equal((await database.select().from(playerAccountClaims).where(
    eq(playerAccountClaims.id, recoverableClaim!.id),
  ))[0]?.status, "PENDING");
  assert.equal((await database.select().from(passwordResetRequests).where(
    eq(passwordResetRequests.id, pendingRecoverableReset!.id),
  ))[0]?.status, "CANCELLED");
  const recoverableApprovalResponse = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${recoverableAccountId}/approve`,
    revision: 2,
    body: {
      ...reason("복구 claim 수동 검토 승인"),
      expectedClaimId: recoverableClaim!.id,
      claimOwnershipReviewed: true,
    },
  });
  assert.equal(recoverableApprovalResponse.status, 200);
  assert.equal((await database.select().from(players).where(
    eq(players.id, recoverablePlayerId),
  ))[0]?.userAccountId, recoverableAccountId);

  assert.equal((await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${recoverableAccountId}`,
    method: "DELETE",
    revision: 3,
    body: {
      internalReason: "linked player 계정 재삭제 HTTP 검증",
      confirmLoginId: recoverablePayload.loginId,
    },
  })).status, 200);
  assert.equal((await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${recoverableAccountId}/restore`,
    revision: 4,
    body: {
      internalReason: "linked player 보존 복구 HTTP 검증",
      confirmLoginId: recoverablePayload.loginId,
    },
  })).status, 200);
  assert.equal((await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${recoverableAccountId}/approve`,
    revision: 5,
    body: {
      ...reason("linked player 복구 재승인"),
      expectedClaimId: null,
      claimOwnershipReviewed: false,
    },
  })).status, 200);
  assert.equal((await database.select().from(players).where(
    eq(players.id, recoverablePlayerId),
  ))[0]?.status, "ACTIVE");

  const resetDeleteRaceTarget = await seedAccount("reset_delete_race", "USER");
  await database.delete(loginRateLimitBuckets);
  const resetDeleteRecoveryRequest = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("reset-delete-race-request"),
    },
    body: JSON.stringify({ loginId: resetDeleteRaceTarget.loginId }),
  });
  assert.equal(resetDeleteRecoveryRequest.status, 202);
  const resetDeletePendingRow = (await database.select().from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, resetDeleteRaceTarget.id),
    eq(passwordResetRequests.status, "PENDING"),
  )))[0];
  assert.ok(resetDeletePendingRow);
  const [passwordReviewRace, accountDeleteRace] = await Promise.all([
    adminMutation({
      origin,
      cookie: superAdminCookie,
      path: `/api/admin/users/${resetDeleteRaceTarget.id}/password-reset`,
      revision: 0,
      body: {
        internalReason: "복구 요청 검토와 삭제 HTTP 경합",
        confirmLoginId: resetDeleteRaceTarget.loginId,
      },
    }),
    adminMutation({
      origin,
      cookie: superAdminCookie,
      path: `/api/admin/users/${resetDeleteRaceTarget.id}`,
      method: "DELETE",
      revision: 0,
      body: {
        internalReason: "복구 요청 검토와 삭제 HTTP 경합",
        confirmLoginId: resetDeleteRaceTarget.loginId,
      },
    }),
  ]);
  assert.equal(
    [passwordReviewRace, accountDeleteRace].filter((response) => response.status === 200).length,
    1,
  );
  assert.ok([200, 409, 412].includes(passwordReviewRace.status));
  assert.ok([200, 409, 412].includes(accountDeleteRace.status));
  if (passwordReviewRace.status === 200) {
    const passwordReviewBody = await passwordReviewRace.json() as { temporaryPassword: string };
    syntheticSecrets.push(passwordReviewBody.temporaryPassword);
  }
  const resetDeleteTerminalRow = (await database.select().from(passwordResetRequests).where(
    eq(passwordResetRequests.id, resetDeletePendingRow!.id),
  ))[0];
  assert.ok(
    resetDeleteTerminalRow?.status === "RESOLVED" ||
    resetDeleteTerminalRow?.status === "CANCELLED",
  );
  assert.ok(resetDeleteTerminalRow?.resolvedAt);
  assert.equal(resetDeleteTerminalRow?.resolvedByUserAccountId, superAdmin.id);

  const independentInactivePlayerId = randomUUID();
  const independentInactiveNickname = `IndependentHttp${randomBytes(4).toString("hex")}`;
  const independentInactiveRiotId = `${independentInactiveNickname}#S01`;
  await database.insert(players).values({
    id: independentInactivePlayerId,
    memberName: "운영상 독립 비활성 HTTP 회원",
    memberNameNormalized: "운영상 독립 비활성 http 회원",
    nickname: independentInactiveNickname,
    nicknameNormalized: independentInactiveNickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S01",
    tagLineNormalized: "s01",
    status: "INACTIVE",
    deactivatedAt: new Date(),
    accountLifecycleDeactivatedAt: null,
  });
  await database.delete(loginRateLimitBuckets);
  const independentInactivePayload = signupPayload(
    "independent-inactive",
    independentInactiveRiotId,
  );
  const independentInactiveSignup = await signup(
    origin,
    independentInactivePayload,
    idempotencyKey("independent-inactive-signup"),
  );
  assert.equal(independentInactiveSignup.status, 201);
  const independentInactiveAccountId = (
    (await independentInactiveSignup.json()) as { account: { id: string } }
  ).account.id;
  const independentInactiveClaim = (
    await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, independentInactiveAccountId),
    )
  )[0];
  assert.ok(independentInactiveClaim);
  const independentInactiveApprovalBody = {
    ...reason("독립 비활성 claim 검토"),
    expectedClaimId: independentInactiveClaim!.id,
    claimOwnershipReviewed: true,
  };
  const independentInactiveApproval = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${independentInactiveAccountId}/approve`,
    revision: 0,
    body: independentInactiveApprovalBody,
  });
  assert.equal(independentInactiveApproval.status, 409);
  assert.equal(problemCode(await independentInactiveApproval.json()), "ACTIVE_PLAYER_REQUIRED");
  assert.equal((await database.select().from(players).where(
    eq(players.id, independentInactivePlayerId),
  ))[0]?.userAccountId, null);
  await assertPublicPlayerVisibility({
    origin,
    playerId: independentInactivePlayerId,
    riotId: independentInactiveRiotId,
    visible: false,
    message: "a claim must not bypass an independent player deactivation",
  });

  const [racingClaimApproval, racingPlayerReactivation] = await Promise.all([
    adminMutation({
      origin,
      cookie: adminCookie,
      path: `/api/admin/users/${independentInactiveAccountId}/approve`,
      revision: 0,
      body: independentInactiveApprovalBody,
    }),
    fetch(`${origin}/api/admin/players/${independentInactivePlayerId}/reactivate`, {
      method: "POST",
      headers: {
        cookie: adminCookie,
        origin,
        "idempotency-key": idempotencyKey("independent-player-reactivate"),
        "if-match": '"0"',
      },
    }),
  ]);
  assert.equal(racingPlayerReactivation.status, 200);
  assert.ok(
    racingClaimApproval.status === 200 || racingClaimApproval.status === 409,
    `claim/reactivate race returned ${racingClaimApproval.status}`,
  );
  if (racingClaimApproval.status === 409) {
    assert.equal(problemCode(await racingClaimApproval.json()), "ACTIVE_PLAYER_REQUIRED");
    const approvalAfterExplicitReactivation = await adminMutation({
      origin,
      cookie: adminCookie,
      path: `/api/admin/users/${independentInactiveAccountId}/approve`,
      revision: 0,
      body: independentInactiveApprovalBody,
    });
    assert.equal(approvalAfterExplicitReactivation.status, 200);
  }
  assert.equal((await database.select().from(players).where(
    eq(players.id, independentInactivePlayerId),
  ))[0]?.userAccountId, independentInactiveAccountId);
  await assertPublicPlayerVisibility({
    origin,
    playerId: independentInactivePlayerId,
    riotId: independentInactiveRiotId,
    visible: true,
    message: "explicit S02 reactivation followed by approval must publish the claimed player",
  });

  const adminCannotMutateAdmin = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${adminVictim.id}/suspend`,
    revision: 0,
    body: confirmedReason("관리자 대상 제한 시도", adminVictim.loginId),
  });
  assert.equal(adminCannotMutateAdmin.status, 403);
  // This synthetic account logged in earlier in this fast verifier. The next
  // accepted TOTP window proves replay protection without waiting for a wall
  // clock boundary or misclassifying a replay as an account-flow failure.
  const adminVictimCookie = await loginAdmin(origin, adminVictim, 1);
  const adminCannotResetTotp = await adminMutation({
    origin,
    cookie: adminCookie,
    path: `/api/admin/users/${adminVictim.id}/2fa-reset`,
    revision: 0,
    body: { internalReason: "ADMIN의 타 관리자 2FA 초기화 금지", confirmLoginId: adminVictim.loginId },
  });
  assert.equal(adminCannotResetTotp.status, 403);
  const wrongTotpConfirmation = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${adminVictim.id}/2fa-reset`,
    revision: 0,
    body: { internalReason: "대상 확인 불일치 검증", confirmLoginId: `${adminVictim.loginId}_wrong` },
  });
  assert.equal(wrongTotpConfirmation.status, 409);
  const resetVictimTotp = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${adminVictim.id}/2fa-reset`,
    revision: 0,
    body: { internalReason: "분실 신고에 따른 관리자 2FA 초기화", confirmLoginId: adminVictim.loginId },
  });
  assert.equal(resetVictimTotp.status, 200);
  assert.equal(resetVictimTotp.headers.get("etag"), '"1"');
  assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
    eq(adminTotpCredentials.userAccountId, adminVictim.id),
  ))[0]?.value, 0);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: adminVictimCookie },
  })).status, 401, "2FA reset must revoke the target ADMIN session");
  const reenrollmentLogin = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ loginId: adminVictim.loginId, password: adminVictim.password }),
  });
  assert.equal(reenrollmentLogin.status, 200);
  assert.equal(((await reenrollmentLogin.clone().json()) as { requiresTwoFactorSetup: boolean }).requiresTwoFactorSetup, true);
  const reenrollmentCookie = extractCookie(reenrollmentLogin, ADMIN_COOKIE_NAME);
  assert.equal((await fetch(`${origin}/api/admin/users`, {
    headers: { cookie: reenrollmentCookie },
  })).status, 403);
  assert.equal((await fetch(`${origin}/admin/security`, {
    headers: { cookie: reenrollmentCookie },
    redirect: "manual",
  })).status, 200);
  const reenrollmentSetup = await fetch(`${origin}/api/admin/security/totp/setup`, {
    method: "POST",
    headers: { cookie: reenrollmentCookie, origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(reenrollmentSetup.status, 201);
  const reenrollmentSetupBody = await reenrollmentSetup.json() as { manualSecret: string };
  syntheticSecrets.push(reenrollmentSetupBody.manualSecret);
  assert.equal((await database.select().from(userAccounts).where(
    eq(userAccounts.id, adminVictim.id),
  ))[0]?.revision, 2);
  const reenrollmentEnableStep = Math.floor(Date.now() / 30_000);
  const reenrollmentEnable = await fetch(`${origin}/api/admin/security/totp/enable`, {
    method: "POST",
    headers: { cookie: reenrollmentCookie, origin, "content-type": "application/json" },
    body: JSON.stringify({
      code: generateTotpCode(reenrollmentSetupBody.manualSecret, reenrollmentEnableStep),
    }),
  });
  assert.equal(reenrollmentEnable.status, 200);
  assert.equal((await database.select().from(userAccounts).where(
    eq(userAccounts.id, adminVictim.id),
  ))[0]?.revision, 3);
  const staleTotpReset = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${adminVictim.id}/2fa-reset`,
    revision: 1,
    body: { internalReason: "self 2FA 변경 후 stale revision 검증", confirmLoginId: adminVictim.loginId },
  });
  assert.equal(staleTotpReset.status, 412);
  assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
    eq(adminTotpCredentials.userAccountId, adminVictim.id),
  ))[0]?.value, 1, "stale SUPER reset must not delete the newly enabled factor");
  const deletedAdmin = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${adminVictim.id}`,
    method: "DELETE",
    revision: 3,
    body: { internalReason: "관리자 계정 삭제 보안 초기화 검증", confirmLoginId: adminVictim.loginId },
  });
  assert.equal(deletedAdmin.status, 200);
  const deletedAdminRow = (
    await database.select().from(userAccounts).where(eq(userAccounts.id, adminVictim.id))
  )[0];
  assert.equal(deletedAdminRow?.mustChangePassword, true);
  assert.ok(deletedAdminRow?.deletedAt);
  assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
    eq(adminTotpCredentials.userAccountId, adminVictim.id),
  ))[0]?.value, 0);
  const restoredAdmin = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${adminVictim.id}/restore`,
    revision: 4,
    body: { internalReason: "삭제 계정 복구 검증", confirmLoginId: adminVictim.loginId },
  });
  assert.equal(restoredAdmin.status, 200);
  const selfDelete = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${superAdmin.id}`,
    method: "DELETE",
    revision: 0,
    body: { internalReason: "자기 자신 삭제 금지 검증", confirmLoginId: superAdmin.loginId },
  });
  assert.equal(selfDelete.status, 403);
  const selfDemote = await adminMutation({
    origin,
    cookie: superAdminCookie,
    path: `/api/admin/users/${superAdmin.id}/role`,
    revision: 0,
    body: { role: "USER", internalReason: "자기 자신 강등 금지 검증", confirmLoginId: superAdmin.loginId },
  });
  assert.equal(selfDemote.status, 403);

  for (const suffix of [
    "approve",
    "reject",
    "suspend",
    "reset-pending",
    "role",
    "password-reset",
    "2fa-reset",
    "restore",
  ]) {
    const response = await fetch(
      `${origin}/api/admin/users/${statusAccountId}/${suffix}?unexpected=1`,
      { method: "PATCH", headers: { cookie: superAdminCookie } },
    );
    assert.equal(response.status, 400, `${suffix} must reject unexpected query`);
  }
  assert.equal((await fetch(`${origin}/api/admin/users/${statusAccountId}?unexpected=1`, {
    method: "DELETE",
    headers: { cookie: superAdminCookie },
  })).status, 400);

  const knownRecoveryPayload = { loginId: signupInput.loginId };
  const knownRecoveryStartedAt = performance.now();
  const knownRecovery = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("known-recovery"),
    },
    body: JSON.stringify(knownRecoveryPayload),
  });
  const knownRecoveryDuration = performance.now() - knownRecoveryStartedAt;
  const missingRecoveryStartedAt = performance.now();
  const missingRecovery = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("missing-recovery"),
    },
    body: JSON.stringify({ loginId: `missing_${randomBytes(8).toString("hex")}` }),
  });
  const missingRecoveryDuration = performance.now() - missingRecoveryStartedAt;
  assert.equal(knownRecovery.status, 202);
  assert.equal(missingRecovery.status, 202);
  assert.ok(knownRecoveryDuration >= RECOVERY_RESPONSE_MINIMUM_MS - 5);
  assert.ok(missingRecoveryDuration >= RECOVERY_RESPONSE_MINIMUM_MS - 5);
  assert.deepEqual(await knownRecovery.json(), await missingRecovery.json());
  assert.equal((await database.select({ value: count() }).from(passwordResetRequests).where(and(
    eq(passwordResetRequests.userAccountId, signedUpId),
    eq(passwordResetRequests.status, "PENDING"),
  )))[0]?.value, 1, "recovery enumeration test must leave exactly one active request");

  const legacyRecoveryBody = {
    userId: signupInput.loginId,
    name: "호환 복구 회원",
    nickname: signupInput.riotId.split("#")[0],
    tag: signupInput.riotId.split("#")[1],
  };
  const legacyRecovery = await fetch(`${origin}/api/auth/password/forgot`, {
    method: "PATCH",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("legacy-recovery"),
    },
    body: JSON.stringify(legacyRecoveryBody),
  });
  assert.equal(legacyRecovery.status, 202);
  assert.deepEqual(await legacyRecovery.json(), await fetch(`${origin}/api/auth/password/forgot`, {
    method: "PATCH",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("legacy-missing-recovery"),
    },
    body: JSON.stringify({ ...legacyRecoveryBody, userId: `missing_${randomBytes(8).toString("hex")}` }),
  }).then((response) => {
    assert.equal(response.status, 202);
    return response.json();
  }));
  assert.equal((await fetch(`${origin}/api/auth/password/forgot?unexpected=1`, {
    method: "PATCH",
  })).status, 400);
  assert.equal((await fetch(`${origin}/api/auth/password/forgot`, {
    method: "PATCH",
    headers: { origin: "https://attacker.invalid", "content-type": "application/json" },
    body: JSON.stringify(legacyRecoveryBody),
  })).status, 403);

  await database.delete(loginRateLimitBuckets);
  const recoveryRateSubject = `missing_rate_${randomBytes(6).toString("hex")}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${origin}/api/auth/reset-requests`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey(`recovery-rate-${attempt}`),
      },
      body: JSON.stringify({ loginId: recoveryRateSubject }),
    });
    assert.equal(response.status, 202);
  }
  const recoveryLimited = await fetch(`${origin}/api/auth/reset-requests`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey("recovery-rate-blocked"),
    },
    body: JSON.stringify({ loginId: recoveryRateSubject }),
  });
  assert.equal(recoveryLimited.status, 429);
  assert.match(recoveryLimited.headers.get("retry-after") ?? "", /^\d+$/);

  await database.delete(loginRateLimitBuckets);
  const signupRatePayload = signupPayload("rate-limit");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await signup(
      origin,
      signupRatePayload,
      idempotencyKey(`signup-rate-${attempt}`),
    );
    assert.equal(response.status, attempt === 0 ? 201 : 409);
  }
  const signupLimited = await signup(
    origin,
    signupRatePayload,
    idempotencyKey("signup-rate-blocked"),
  );
  assert.equal(signupLimited.status, 429);
  assert.match(signupLimited.headers.get("retry-after") ?? "", /^\d+$/);

  await database.delete(loginRateLimitBuckets);
  const loginRateSubject = `missing_login_${randomBytes(6).toString("hex")}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ loginId: loginRateSubject, password: "not-the-password" }),
    });
    assert.equal(response.status, 401);
  }
  const loginLimited = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ loginId: loginRateSubject, password: "not-the-password" }),
  });
  assert.equal(loginLimited.status, 429);
  assert.match(loginLimited.headers.get("retry-after") ?? "", /^\d+$/);

  const accountUserPage = await fetch(`${origin}/account`, {
    headers: { cookie: changedLogin.cookie },
  });
  assert.equal(accountUserPage.status, 200);
  const adminUsersPage = await fetch(`${origin}/admin/users`, {
    headers: { cookie: superAdminCookie },
  });
  assert.equal(adminUsersPage.status, 200);
  assert.match(await adminUsersPage.text(), /가입 승인, 역할, 복구 요청과 소프트 삭제/);
  const adminDetailPage = await fetch(`${origin}/admin/users/${claimAccountId}`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(adminDetailPage.status, 200);
  assert.match(await adminDetailPage.text(), new RegExp(claimPayload.loginId));

  const persistedSecret = await pool.query(
    `select 1
       from audit.events
      where position($1 in coalesce(before_json::text, '')) > 0
         or position($1 in coalesce(after_json::text, '')) > 0
         or position($1 in coalesce(metadata_json::text, '')) > 0
      union all
     select 1
       from auth.account_mutation_receipts
      where position($1 in response_json::text) > 0`,
    [passwordResetBody.temporaryPassword],
  );
  assert.equal(persistedSecret.rowCount, 0);
  assert.ok((await database.select({ value: count() }).from(auditEvents))[0]!.value > 0);
  assert.ok((await database.select({ value: count() }).from(accountMutationReceipts))[0]!.value > 0);
  assert.ok((await database.select({ value: count() }).from(authSessions).where(
    and(eq(authSessions.userAccountId, signedUpId), eq(authSessions.purpose, "ACCOUNT")),
  ))[0]!.value > 0);

  await stopServer(mainServer);
  mainServer = undefined;
  unavailableServer = await startServer({
    DATABASE_URL: "",
    SESSION_SIGNING_KEYS: sessionKeysJson,
    TOTP_ENCRYPTION_KEYS: totpKeysJson,
    V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
    V2_PUBLIC_DATA_SOURCE: "",
  });
  for (const [route, body, needsKey] of [
    ["login", { loginId: "unavailable_user", password: "not-the-password" }, false],
    ["signup", signupPayload("unavailable"), true],
    ["reset-requests", { loginId: "unavailable_user" }, true],
  ] as const) {
    const response: Response = await fetch(`${unavailableServer.origin}/api/auth/${route}`, {
      method: "POST",
      headers: {
        origin: unavailableServer.origin,
        "content-type": "application/json",
        ...(needsKey ? { "idempotency-key": idempotencyKey(`unavailable-${route}`) } : {}),
      },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 503, `${route} must fail closed when storage is unavailable`);
    assert.equal(
      problemCode(await response.json()),
      route === "signup" ? "SITE_SETTINGS_UNAVAILABLE" : "ACCOUNT_STORAGE_UNAVAILABLE",
    );
  }

  const unavailableAccountLogout = await fetch(`${unavailableServer.origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: superAccountLogin.cookie, origin: unavailableServer.origin },
  });
  assert.equal(unavailableAccountLogout.status, 503);
  assert.equal(
    responseCookies(unavailableAccountLogout).some((value) => value.startsWith(`${ACCOUNT_COOKIE_NAME}=`)),
    false,
    "fail-closed ACCOUNT logout must not clear a cookie whose DB session was not revoked",
  );
  const unavailableAdminLogout = await fetch(`${unavailableServer.origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: superAdminCookie, origin: unavailableServer.origin },
  });
  assert.equal(unavailableAdminLogout.status, 503);
  assert.equal(
    responseCookies(unavailableAdminLogout).some((value) => value.startsWith(`${ADMIN_COOKIE_NAME}=`)),
    false,
    "fail-closed ADMIN logout must not clear a cookie whose DB session was not revoked",
  );

  await stopServer(unavailableServer);
  unavailableServer = undefined;
  mainServer = await startServer({
    DATABASE_URL: connectionString,
    SESSION_SIGNING_KEYS: sessionKeysJson,
    TOTP_ENCRYPTION_KEYS: totpKeysJson,
    V2_AUTH_RATE_LIMIT_PEPPER: rateLimitPepper,
  });
  await assertAuthenticatedMe(await fetch(`${mainServer.origin}/api/auth/me`, {
    headers: { cookie: superAccountLogin.cookie },
  }), superAdmin.id, "ACCOUNT session must remain valid after unavailable logout");
  assert.equal((await fetch(`${mainServer.origin}/api/admin/users`, {
    headers: { cookie: superAdminCookie },
  })).status, 200, "ADMIN session must remain valid after unavailable logout");
  const recoveredAccountLogout = await fetch(`${mainServer.origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: superAccountLogin.cookie, origin: mainServer.origin },
  });
  assert.equal(recoveredAccountLogout.status, 204);
  assert.match(responseCookies(recoveredAccountLogout).join("\n"), new RegExp(`${ACCOUNT_COOKIE_NAME}=.*Max-Age=0`, "is"));
  const recoveredAdminLogout = await fetch(`${mainServer.origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: superAdminCookie, origin: mainServer.origin },
  });
  assert.equal(recoveredAdminLogout.status, 200);
  assert.match(responseCookies(recoveredAdminLogout).join("\n"), new RegExp(`${ADMIN_COOKIE_NAME}=.*Max-Age=0`, "is"));

  process.stdout.write(
    "[db-account-http] public/account/admin users, purpose cookies, claims, recovery, concurrency headers, replay, rate limits, privacy, and 503 fail-closed passed\n",
  );
} catch (error) {
  let sanitized = [mainServer?.readLog(), unavailableServer?.readLog()].filter(Boolean).join("\n");
  for (const secret of syntheticSecrets) sanitized = sanitized.replaceAll(secret, "[synthetic-secret]");
  process.stderr.write(`${sanitized}\n`);
  throw error;
} finally {
  await stopServer(mainServer);
  await stopServer(unavailableServer);
  await pool.end();
}
