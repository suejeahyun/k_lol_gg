import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { JoseSessionCodec } from "../../src/modules/auth/infrastructure/jose-session-codec";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { PostgresAuthRepository } from "../../src/modules/auth/infrastructure/postgres-auth-repository";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { parseSessionSigningKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import {
  adminTotpCredentials,
  auditEvents,
  authSessions,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

type SyntheticAccount = Readonly<{
  id: string;
  loginId: string;
  password: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
}>;

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a loopback port.")));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitUntilReady(origin: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status === 200) return;
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

function cookiePair(response: Response): string {
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^klol_v2_session=/);
  return cookie.split(";", 1)[0];
}

function problemCode(payload: unknown): string | undefined {
  return payload && typeof payload === "object"
    ? (payload as { code?: string }).code
    : undefined;
}

const connectionString = process.env.TEST_DATABASE_URL;
assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
assertSafeTestDatabase({
  connectionString,
  nodeEnv: process.env.NODE_ENV,
  testMode: process.env.V2_DB_TEST_MODE,
});

const { database, pool } = createDatabaseHandle(connectionString, { max: 6 });
const repository = new PostgresAuthRepository(database);
const sessionKey = randomBytes(32);
const totpKey = randomBytes(32);
const rateLimitPepper = randomBytes(32).toString("base64url");
const sessionKeysJson = JSON.stringify({
  current: "totp-http-v1",
  keys: { "totp-http-v1": sessionKey.toString("base64url") },
});
const totpKeysJson = JSON.stringify({
  current: 1,
  keys: { 1: totpKey.toString("base64url") },
});
const syntheticSecrets = [
  sessionKey.toString("base64url"),
  totpKey.toString("base64url"),
  rateLimitPepper,
];

async function seedAccount(label: string, role: SyntheticAccount["role"]): Promise<SyntheticAccount> {
  const id = randomUUID();
  const loginId = `totp_http_${label}_${randomBytes(4).toString("hex")}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  syntheticSecrets.push(password);
  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash: await hashPassword(password),
    role,
    status: "APPROVED",
  });
  return { id, loginId, password, role };
}

const admin = await seedAccount("admin", "ADMIN");
const limitedAdmin = await seedAccount("limited-admin", "ADMIN");
const superAdmin = await seedAccount("super", "SUPER_ADMIN");
const user = await seedAccount("user", "USER");
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

async function login(account: SyntheticAccount, code?: string) {
  return fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      loginId: account.loginId,
      password: account.password,
      ...(code ? { totpCode: code } : {}),
    }),
  });
}

async function status(cookie?: string) {
  return fetch(`${origin}/api/admin/security/totp`, {
    headers: cookie ? { cookie } : undefined,
  });
}

async function setup(cookie: string, method: "POST" | "DELETE" = "POST", body: object = {}) {
  return fetch(`${origin}/api/admin/security/totp/setup`, {
    method,
    headers: { cookie, "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

try {
  await waitUntilReady(origin, child);

  const anonymous = await status();
  assert.equal(anonymous.status, 401);
  assert.equal(problemCode(await anonymous.json()), "ADMIN_SESSION_REQUIRED");
  assert.match(anonymous.headers.get("content-type") ?? "", /^application\/problem\+json/);
  assert.equal(anonymous.headers.get("cache-control"), "no-store, max-age=0");

  const initialLogin = await login(admin);
  assert.equal(initialLogin.status, 200);
  assert.equal((await initialLogin.clone().json()).requiresTwoFactorSetup, true);
  const enrollmentCookie = cookiePair(initialLogin);
  const initialStatus = await status(enrollmentCookie);
  assert.equal(initialStatus.status, 200);
  assert.deepEqual(await initialStatus.json(), { status: "NOT_CONFIGURED" });

  const crossOrigin = await fetch(`${origin}/api/admin/security/totp/setup`, {
    method: "POST",
    headers: {
      cookie: enrollmentCookie,
      "content-type": "application/json",
      origin: "https://attacker.invalid",
    },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(problemCode(await crossOrigin.json()), "SAME_ORIGIN_REQUIRED");

  const unsupportedType = await fetch(`${origin}/api/admin/security/totp/setup`, {
    method: "POST",
    headers: { cookie: enrollmentCookie, "content-type": "text/plain", origin },
    body: "{}",
  });
  assert.equal(unsupportedType.status, 415);
  assert.equal(problemCode(await unsupportedType.json()), "UNSUPPORTED_MEDIA_TYPE");

  const oversized = await fetch(`${origin}/api/admin/security/totp/setup`, {
    method: "POST",
    headers: { cookie: enrollmentCookie, "content-type": "application/json", origin },
    body: "x".repeat(513),
  });
  assert.equal(oversized.status, 413);
  assert.equal(problemCode(await oversized.json()), "BODY_TOO_LARGE");

  const created = await setup(enrollmentCookie);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store, max-age=0");
  const createdPayload = await created.json() as {
    manualSecret: string;
    provisioningUri: string;
    status: string;
  };
  assert.match(createdPayload.manualSecret, /^[A-Z2-7]{32}$/);
  assert.match(createdPayload.provisioningUri, /^otpauth:\/\/totp\//);
  assert.equal(createdPayload.status, "SETUP_PENDING");
  syntheticSecrets.push(createdPayload.manualSecret, createdPayload.provisioningUri);

  const credentialRows = await database
    .select({
      ciphertext: adminTotpCredentials.secretCiphertext,
      enabledAt: adminTotpCredentials.enabledAt,
    })
    .from(adminTotpCredentials)
    .where(eq(adminTotpCredentials.userAccountId, admin.id));
  assert.equal(credentialRows[0]?.enabledAt, null);
  assert.notDeepEqual(credentialRows[0]?.ciphertext, Buffer.from(createdPayload.manualSecret));

  const pendingStatus = await status(enrollmentCookie);
  const pendingPayload = await pendingStatus.json() as Record<string, unknown>;
  assert.deepEqual(pendingPayload, { status: "SETUP_PENDING" });
  assert.equal("manualSecret" in pendingPayload, false);
  assert.equal("provisioningUri" in pendingPayload, false);

  const repeatedSetup = await setup(enrollmentCookie);
  assert.equal(repeatedSetup.status, 409);
  const repeatedPayload = await repeatedSetup.json() as Record<string, unknown>;
  assert.equal(repeatedPayload.code, "TOTP_SETUP_PENDING");
  assert.equal("manualSecret" in repeatedPayload, false);

  const enableStep = Math.floor(Date.now() / 30_000) - 1;
  const enableCode = generateTotpCode(createdPayload.manualSecret, enableStep);
  const concurrentEnable = await Promise.all([
    fetch(`${origin}/api/admin/security/totp/enable`, {
      method: "POST",
      headers: { cookie: enrollmentCookie, "content-type": "application/json", origin },
      body: JSON.stringify({ code: enableCode }),
    }),
    fetch(`${origin}/api/admin/security/totp/enable`, {
      method: "POST",
      headers: { cookie: enrollmentCookie, "content-type": "application/json", origin },
      body: JSON.stringify({ code: enableCode }),
    }),
  ]);
  const enableSuccesses = concurrentEnable.filter((response) => response.status === 200);
  assert.equal(enableSuccesses.length, 1);
  assert.ok(concurrentEnable.every((response) => [200, 401, 409].includes(response.status)));
  assert.match(enableSuccesses[0]!.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.equal((await enableSuccesses[0]!.json()).reauthenticationRequired, true);

  assert.equal((await status(enrollmentCookie)).status, 401);
  const enabledAccount = await repository.findAccountById(admin.id);
  assert.equal(enabledAccount?.authVersion, 1);
  const enabledAudits = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, admin.id), eq(auditEvents.action, "ADMIN_TOTP_ENABLED")));
  assert.equal(enabledAudits.length, 1);
  const revokedEnrollmentSessions = await database
    .select({ revokedAt: authSessions.revokedAt })
    .from(authSessions)
    .where(eq(authSessions.userAccountId, admin.id));
  assert.equal(revokedEnrollmentSessions.every((row) => row.revokedAt instanceof Date), true);

  const challenge = await login(admin);
  assert.equal(challenge.status, 401);
  assert.equal((await challenge.json()).requiresTwoFactor, true);
  const loginStep = Math.floor(Date.now() / 30_000);
  const verifiedLogin = await login(admin, generateTotpCode(createdPayload.manualSecret, loginStep));
  assert.equal(verifiedLogin.status, 200);
  const verifiedCookie = cookiePair(verifiedLogin);
  const enabledStatus = await status(verifiedCookie);
  assert.equal(enabledStatus.status, 200);
  assert.deepEqual(await enabledStatus.json(), { status: "ENABLED" });

  const disableStep = Math.max(Math.floor(Date.now() / 30_000), loginStep + 1);
  const disabled = await fetch(`${origin}/api/admin/security/totp/disable`, {
    method: "POST",
    headers: { cookie: verifiedCookie, "content-type": "application/json", origin },
    body: JSON.stringify({
      code: generateTotpCode(createdPayload.manualSecret, disableStep),
    }),
  });
  assert.equal(disabled.status, 200);
  assert.match(disabled.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.equal((await status(verifiedCookie)).status, 401);
  assert.equal(await repository.getTotpCredential(admin.id), null);
  assert.equal((await repository.findAccountById(admin.id))?.authVersion, 2);
  const disabledAudits = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, admin.id), eq(auditEvents.action, "ADMIN_TOTP_DISABLED")));
  assert.equal(disabledAudits.length, 1);

  const postDisableLogin = await login(admin);
  assert.equal(postDisableLogin.status, 200);
  assert.equal((await postDisableLogin.json()).requiresTwoFactorSetup, true);

  const limitedEnrollment = await login(limitedAdmin);
  assert.equal(limitedEnrollment.status, 200);
  const limitedEnrollmentCookie = cookiePair(limitedEnrollment);
  const limitedSetup = await setup(limitedEnrollmentCookie);
  assert.equal(limitedSetup.status, 201);
  const limitedSetupPayload = await limitedSetup.json() as {
    manualSecret: string;
    provisioningUri: string;
  };
  syntheticSecrets.push(
    limitedSetupPayload.manualSecret,
    limitedSetupPayload.provisioningUri,
  );

  const limitedEnableStep = Math.floor(Date.now() / 30_000) - 1;
  const limitedEnabled = await fetch(`${origin}/api/admin/security/totp/enable`, {
    method: "POST",
    headers: {
      cookie: limitedEnrollmentCookie,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      code: generateTotpCode(limitedSetupPayload.manualSecret, limitedEnableStep),
    }),
  });
  assert.equal(limitedEnabled.status, 200);

  const limitedLoginStep = Math.max(
    Math.floor(Date.now() / 30_000),
    limitedEnableStep + 1,
  );
  const limitedVerifiedLogin = await login(
    limitedAdmin,
    generateTotpCode(limitedSetupPayload.manualSecret, limitedLoginStep),
  );
  assert.equal(limitedVerifiedLogin.status, 200);
  const limitedVerifiedCookie = cookiePair(limitedVerifiedLogin);

  const currentLimitedStep = Math.floor(Date.now() / 30_000);
  const acceptedCodes = new Set(
    [-3, -2, -1, 0, 1, 2, 3].map((offset) =>
      generateTotpCode(limitedSetupPayload.manualSecret, currentLimitedStep + offset),
    ),
  );
  let incorrectCode = "000000";
  while (acceptedCodes.has(incorrectCode)) {
    incorrectCode = String(Number(incorrectCode) + 1).padStart(6, "0");
  }

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const rejected = await fetch(`${origin}/api/admin/security/totp/disable`, {
      method: "POST",
      headers: {
        cookie: limitedVerifiedCookie,
        "content-type": "application/json",
        origin,
      },
      body: JSON.stringify({ code: incorrectCode }),
    });
    assert.equal(rejected.status, 403, `TOTP attempt ${attempt} should be evaluated.`);
    assert.equal(problemCode(await rejected.json()), "TOTP_CODE_INVALID");
  }

  const rateLimited = await fetch(`${origin}/api/admin/security/totp/disable`, {
    method: "POST",
    headers: {
      cookie: limitedVerifiedCookie,
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ code: incorrectCode }),
  });
  assert.equal(rateLimited.status, 429);
  assert.equal(problemCode(await rateLimited.json()), "TOTP_ATTEMPTS_LIMITED");
  assert.match(rateLimited.headers.get("retry-after") ?? "", /^[1-9][0-9]*$/);
  assert.equal((await status(limitedVerifiedCookie)).status, 200);
  assert.ok(await repository.getTotpCredential(limitedAdmin.id));
  assert.equal((await repository.findAccountById(limitedAdmin.id))?.authVersion, 1);
  const limitedDisableAudits = await database
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.targetId, limitedAdmin.id),
      eq(auditEvents.action, "ADMIN_TOTP_DISABLED"),
    ));
  assert.equal(limitedDisableAudits.length, 0);

  const superLogin = await login(superAdmin);
  assert.equal(superLogin.status, 200);
  const superCookie = cookiePair(superLogin);
  const forbiddenTarget = await setup(superCookie, "POST", { targetUserAccountId: admin.id });
  assert.equal(forbiddenTarget.status, 400);
  assert.equal(problemCode(await forbiddenTarget.json()), "TOTP_REQUEST_INVALID");
  const superSetup = await setup(superCookie);
  assert.equal(superSetup.status, 201);
  const superSetupPayload = await superSetup.json() as { manualSecret: string; provisioningUri: string };
  syntheticSecrets.push(superSetupPayload.manualSecret, superSetupPayload.provisioningUri);
  const superCancelled = await setup(superCookie, "DELETE");
  assert.equal(superCancelled.status, 200);
  assert.deepEqual(await superCancelled.json(), { status: "NOT_CONFIGURED", cancelled: true });

  const sessionId = randomUUID();
  const codec = new JoseSessionCodec(parseSessionSigningKeyring(sessionKeysJson));
  const issuedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
  const userToken = await codec.encode({
    userId: user.id,
    role: "USER",
    authVersion: 0,
    adminTotpVerified: false,
    source: "database",
  }, { nowMs: issuedAt.getTime(), sessionId, ttlSeconds: 30 * 60 });
  assert.equal(await repository.createSession({
    id: sessionId,
    tokenHash: hashSessionToken(userToken),
    userAccountId: user.id,
    authVersion: 0,
    role: "USER",
    totpVerifiedAt: null,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 30 * 60_000),
  }), true);
  const userStatus = await status(`klol_v2_session=${userToken}`);
  assert.equal(userStatus.status, 403);
  assert.equal(problemCode(await userStatus.json()), "ADMIN_ROLE_REQUIRED");

  process.stdout.write("[db-totp-http] status, one-time setup, concurrent enable, self-disable, durable TOTP rate limit, stale-cookie, and role matrix passed\n");
} catch (error) {
  let sanitized = serverLog;
  for (const secret of syntheticSecrets) sanitized = sanitized.replaceAll(secret, "[synthetic-secret]");
  process.stderr.write(`${sanitized}\n`);
  throw error;
} finally {
  await stopServer(child);
  await pool.end();
}
