import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";

import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { hashSessionToken } from "../../src/modules/auth/infrastructure/session-token-hash";
import { encryptTotpSecret } from "../../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpCode } from "../../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { authSessions, userAccounts, adminTotpCredentials } from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type SyntheticAdmin = Readonly<{
  id: string;
  loginId: string;
  password: string;
  totpSecret: string;
}>;

function encodeBase32(value: Buffer): string {
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

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

async function waitUntilReady(origin: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    }
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

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
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
const totpKeyring = parseTotpEncryptionKeyring(totpKeysJson);
const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
const syntheticSecrets: string[] = [
  sessionKey.toString("base64url"),
  totpKey.toString("base64url"),
  rateLimitPepper,
];

async function seedAdmin(label: string): Promise<SyntheticAdmin> {
  const id = randomUUID();
  const loginId = `db_http_${label}_${randomBytes(4).toString("hex")}`;
  const password = `${randomBytes(24).toString("base64url")}!Aa1`;
  const totpSecret = encodeBase32(randomBytes(20));
  syntheticSecrets.push(password, totpSecret);

  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash: await hashPassword(password),
    role: "ADMIN",
    status: "APPROVED",
  });
  await database.insert(adminTotpCredentials).values({
    userAccountId: id,
    ...encryptTotpSecret(id, totpSecret, totpKeyring),
    enabledAt: new Date(),
  });
  return { id, loginId, password, totpSecret };
}

const admins = {
  version: await seedAdmin("version"),
  role: await seedAdmin("role"),
  status: await seedAdmin("status"),
  logout: await seedAdmin("logout"),
};

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
    serverLog = `${serverLog}${chunk}`.slice(-12_000);
  });
}

async function login(admin: SyntheticAdmin): Promise<{ cookiePair: string; sessionId: string; token: string }> {
  const step = Math.floor(Date.now() / 30_000);
  const response = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      loginId: admin.loginId,
      password: admin.password,
      totpCode: generateTotpCode(admin.totpSecret, step),
    }),
  });
  assert.equal(response.status, 200, `database login failed for ${admin.loginId}`);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^klol_v2_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  const cookiePair = cookie.split(";", 1)[0];
  const token = cookiePair.slice(cookiePair.indexOf("=") + 1);
  const { payload } = await jwtVerify(token, sessionKey, {
    algorithms: ["HS256"],
    issuer: "k-lol-gg-v2",
    audience: "k-lol-gg-v2-web",
  });
  assert.match(payload.jti ?? "", /^[0-9a-f-]{36}$/i);
  return { cookiePair, sessionId: payload.jti!, token };
}

async function expectSessionStatus(cookiePair: string, status: number): Promise<void> {
  const response = await fetch(`${origin}/api/admin/session`, {
    headers: { cookie: cookiePair },
  });
  assert.equal(response.status, status);
}

try {
  await waitUntilReady(origin, child);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const allowedAttempt = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ loginId: "durable_rate_target", password: "not-the-password" }),
    });
    assert.equal(allowedAttempt.status, 401);
  }
  const blockedAttempt = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "durable_rate_target", password: "not-the-password" }),
  });
  assert.equal(blockedAttempt.status, 429);
  assert.match(blockedAttempt.headers.get("retry-after") ?? "", /^\d+$/);

  const versionSession = await login(admins.version);
  await expectSessionStatus(versionSession.cookiePair, 200);
  const persistedRows = await database
    .select({ tokenHash: authSessions.tokenHash, revokedAt: authSessions.revokedAt })
    .from(authSessions)
    .where(eq(authSessions.id, versionSession.sessionId));
  assert.equal(persistedRows.length, 1);
  assert.deepEqual(persistedRows[0]?.tokenHash, hashSessionToken(versionSession.token));
  assert.equal(persistedRows[0]?.revokedAt, null);

  const [header, payload, signature] = versionSession.token.split(".");
  const tamperedToken = `${header}.${payload}.${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
  await expectSessionStatus(`klol_v2_session=${tamperedToken}`, 401);

  await database
    .update(userAccounts)
    .set({ authVersion: 1 })
    .where(eq(userAccounts.id, admins.version.id));
  await expectSessionStatus(versionSession.cookiePair, 401);

  const roleSession = await login(admins.role);
  await database
    .update(userAccounts)
    .set({ role: "SUPER_ADMIN" })
    .where(eq(userAccounts.id, admins.role.id));
  await expectSessionStatus(roleSession.cookiePair, 401);

  const statusSession = await login(admins.status);
  await database
    .update(userAccounts)
    .set({ status: "SUSPENDED" })
    .where(eq(userAccounts.id, admins.status.id));
  await expectSessionStatus(statusSession.cookiePair, 401);

  const logoutSession = await login(admins.logout);
  const logout = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: logoutSession.cookiePair, origin },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  const revokedRows = await database
    .select({ revokedAt: authSessions.revokedAt })
    .from(authSessions)
    .where(eq(authSessions.id, logoutSession.sessionId));
  assert.ok(revokedRows[0]?.revokedAt instanceof Date);
  await expectSessionStatus(logoutSession.cookiePair, 401);

  process.stdout.write("[db-auth-http] durable login, token hash, mutation invalidation, and logout revocation passed\n");
} catch (error) {
  let sanitizedLog = serverLog;
  for (const secret of syntheticSecrets) sanitizedLog = sanitizedLog.replaceAll(secret, "[synthetic-secret]");
  process.stderr.write(`${sanitizedLog}\n`);
  throw error;
} finally {
  await stopServer(child);
  await pool.end();
}
