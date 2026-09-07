import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { SignJWT } from "jose";

import {
  ADMIN_SECURITY_PAGE_CASE,
  PROTECTED_ADMIN_PAGE_CASES,
} from "./auth-http-admin-page-routes.mjs";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(value) {
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function totp(secret, nowMs = Date.now()) {
  const step = Math.floor(nowMs / 30_000);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const keyBits = [...secret].map((character) => ALPHABET.indexOf(character).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(keyBits.match(/.{8}/g)?.map((bits) => Number.parseInt(bits, 2)) ?? []);
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function fixtureSessionToken(secret, seed, ttlSeconds) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    role: seed.role,
    purpose: seed.purpose,
    accountStatus: seed.accountStatus,
    mustChangePassword: seed.mustChangePassword,
    authVersion: seed.authVersion,
    adminTotpVerified: seed.adminTotpVerified,
    source: "fixture",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "local" })
    .setSubject(seed.userId)
    .setJti(randomUUID())
    .setIssuer("k-lol-gg-v2")
    .setAudience("k-lol-gg-v2-web")
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(new TextEncoder().encode(secret));
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Unable to allocate port."));
      const { port } = address;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntilReady(origin, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status === 200) return;
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Next.js did not become ready within 30 seconds.");
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function createFixtureRunnerProof(origin) {
  const proofRoot = path.resolve(process.cwd(), ".tmp", "auth-http");
  await mkdir(proofRoot, { recursive: true });
  const proofDirectory = await mkdtemp(path.join(proofRoot, "verify-"));
  const proofPath = path.join(proofDirectory, "fixture-proof.json");
  const runnerToken = randomBytes(32).toString("base64url");
  const createdAtMs = Date.now();
  await writeFile(proofPath, JSON.stringify({
    createdAtMs,
    expiresAtMs: createdAtMs + 5 * 60_000,
    origin,
    runnerPid: process.pid,
    runnerToken,
  }), { encoding: "utf8", mode: 0o600 });

  return {
    environment: {
      V2_TEST_AUTH_PROOF_PATH: proofPath,
      V2_TEST_AUTH_RUNNER_PID: String(process.pid),
      V2_TEST_AUTH_RUNNER_TOKEN: runnerToken,
    },
    async dispose() {
      await unlink(proofPath).catch(() => undefined);
      await rmdir(proofDirectory).catch(() => undefined);
    },
  };
}

async function spawnNextWithProof(args, environment, proof) {
  try {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: process.cwd(),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const startFailure = new Promise((_, reject) => child.once("error", reject));
    return { child, startFailure };
  } catch (error) {
    await proof.dispose();
    throw error;
  }
}

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const password = `${randomBytes(24).toString("base64url")}!Aa1`;
const sessionSecret = randomBytes(48).toString("base64url");
const totpSecret = encodeBase32(randomBytes(20));
const fixtures = JSON.stringify([
  {
    id: "http-admin",
    loginId: "http_admin",
    password,
    role: "ADMIN",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: true,
    adminTotpSecret: totpSecret,
  },
  {
    id: "http-admin-setup",
    loginId: "http_admin_setup",
    password,
    role: "ADMIN",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: false,
  },
  {
    id: "http-super-admin",
    loginId: "http_super_admin",
    password,
    role: "SUPER_ADMIN",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: true,
    adminTotpSecret: totpSecret,
  },
  {
    id: "http-account",
    loginId: "http_account",
    password,
    role: "USER",
    status: "APPROVED",
    authVersion: 1,
    adminTotpEnabled: false,
  },
]);
const protectedWorkspacePaths = PROTECTED_ADMIN_PAGE_CASES.map(({ requestPath }) => requestPath);
const superAdminWorkspaceRoutes = new Set(["/admin/logs", "/admin/site-settings"]);
const enrollmentPath = ADMIN_SECURITY_PAGE_CASE.requestPath;

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const developmentProof = await createFixtureRunnerProof(origin);
const developmentServer = await spawnNextWithProof(
  ["dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    ...process.env,
    DATABASE_URL: "",
    SESSION_SIGNING_KEYS: "",
    TOTP_ENCRYPTION_KEYS: "",
    V2_AUTH_RATE_LIMIT_PEPPER: "",
    V2_PUBLIC_ORIGIN: origin,
    V2_TEST_AUTH_ENABLED: "true",
    ...developmentProof.environment,
    V2_TEST_AUTH_SECRET: sessionSecret,
    V2_TEST_AUTH_FIXTURES_JSON: fixtures,
  },
  developmentProof,
);
const child = developmentServer.child;

let serverLog = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLog = `${serverLog}${chunk}`.slice(-8_000);
  });
}

try {
  await Promise.race([
    waitUntilReady(origin, child),
    developmentServer.startFailure,
  ]);

  for (const workspacePath of [...protectedWorkspacePaths, enrollmentPath]) {
    const response = await fetch(`${origin}${workspacePath}`, { redirect: "manual" });
    assert.equal(response.status, 307, `${workspacePath} must require authentication`);
    assert.match(response.headers.get("location") ?? "", /^\/admin\/login\?next=/);
  }

  const accountToken = await fixtureSessionToken(sessionSecret, {
    userId: "http-account",
    role: "USER",
    purpose: "ACCOUNT",
    accountStatus: "APPROVED",
    mustChangePassword: false,
    authVersion: 1,
    adminTotpVerified: false,
  }, 7 * 24 * 60 * 60);
  const accountCookie = `klol_v2_account_session=${accountToken}`;
  for (const workspacePath of [...protectedWorkspacePaths, enrollmentPath]) {
    const response = await fetch(`${origin}${workspacePath}`, {
      headers: { cookie: accountCookie },
      redirect: "manual",
    });
    assert.equal(response.status, 307, `${workspacePath} must reject an ACCOUNT-purpose cookie`);
    assert.match(response.headers.get("location") ?? "", /^\/admin\/login\?next=/);
  }
  const accountTokenInAdminCookie = `klol_v2_session=${accountToken}`;
  for (const workspacePath of [...protectedWorkspacePaths, enrollmentPath]) {
    const response = await fetch(`${origin}${workspacePath}`, {
      headers: { cookie: accountTokenInAdminCookie },
      redirect: "manual",
    });
    assert.equal(response.status, 307, `${workspacePath} must reject an ACCOUNT-purpose token in the ADMIN cookie`);
    assert.match(response.headers.get("location") ?? "", /^\/admin\/login\?next=/);
  }

  const setupLogin = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin_setup", password }),
  });
  assert.equal(setupLogin.status, 200);
  assert.equal((await setupLogin.clone().json()).requiresTwoFactorSetup, true);
  const setupCookie = (setupLogin.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.match(setupCookie, /^klol_v2_session=/);
  for (const workspacePath of protectedWorkspacePaths) {
    const response = await fetch(`${origin}${workspacePath}`, {
      headers: { cookie: setupCookie },
      redirect: "manual",
    });
    assert.equal(response.status, 307, `${workspacePath} must require TOTP enrollment`);
    const location = new URL(response.headers.get("location") ?? "", origin);
    assert.equal(location.pathname, enrollmentPath);
    assert.equal(location.searchParams.get("setup"), "required");
  }
  const enrollment = await fetch(`${origin}${enrollmentPath}`, {
    headers: { cookie: setupCookie },
    redirect: "manual",
  });
  assert.equal(enrollment.status, 200, "unverified ADMIN must be able to enroll TOTP");

  const deepAnonymousPage = await fetch(`${origin}/admin/players?status=pending`, {
    headers: { "x-klol-admin-request-path": "//attacker.invalid" },
    redirect: "manual",
  });
  assert.equal(deepAnonymousPage.status, 307);
  const deepLoginLocation = new URL(deepAnonymousPage.headers.get("location") ?? "", origin);
  assert.equal(deepLoginLocation.pathname, "/admin/login");
  assert.equal(deepLoginLocation.searchParams.get("next"), "/admin/players?status=pending");

  const anonymousApi = await fetch(`${origin}/api/admin/session`);
  assert.equal(anonymousApi.status, 401);

  const safeRedirectPage = await fetch(`${origin}/admin/login?next=%2F%5Cevil.example`);
  assert.equal(safeRedirectPage.status, 200);
  assert.match(await safeRedirectPage.text(), /data-safe-next-path="\/admin"/);

  const crossOrigin = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
    body: JSON.stringify({ loginId: "http_admin", password }),
  });
  assert.equal(crossOrigin.status, 403);

  const oversized = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: "x".repeat(2_049),
  });
  assert.equal(oversized.status, 413);

  for (let count = 0; count < 8; count += 1) {
    const rejected = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ loginId: "brute_target", password: "not-the-password" }),
    });
    assert.equal(rejected.status, 401);
  }
  const limited = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "brute_target", password: "not-the-password" }),
  });
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get("retry-after") ?? "", /^\d+$/);

  const challenge = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin", password }),
  });
  assert.equal(challenge.status, 401);
  assert.equal((await challenge.json()).requiresTwoFactor, true);

  const acceptedTotpCode = totp(totpSecret);
  const login = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: acceptedTotpCode }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^klol_v2_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /Max-Age=1800/i);
  assert.doesNotMatch(cookie, /; Secure/i);
  const cookiePair = cookie.split(";", 1)[0];

  for (const { canonicalRoute, requestPath } of PROTECTED_ADMIN_PAGE_CASES) {
    const protectedPage = await fetch(`${origin}${requestPath}`, {
      headers: { cookie: cookiePair },
      redirect: "manual",
    });
    if (superAdminWorkspaceRoutes.has(canonicalRoute)) {
      assert.equal(protectedPage.status, 307, `${requestPath} must reject ADMIN`);
      assert.equal(protectedPage.headers.get("location"), "/forbidden");
      continue;
    }
    assert.equal(protectedPage.status, 200, `${requestPath} must open for ADMIN`);
    assert.match(protectedPage.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(protectedPage.headers.get("x-frame-options"), "DENY");
  }
  const superAdminToken = await fixtureSessionToken(sessionSecret, {
    userId: "http-super-admin",
    role: "SUPER_ADMIN",
    purpose: "ADMIN",
    accountStatus: "APPROVED",
    mustChangePassword: false,
    authVersion: 1,
    adminTotpVerified: true,
  }, 30 * 60);
  for (const { canonicalRoute, requestPath } of PROTECTED_ADMIN_PAGE_CASES) {
    if (!superAdminWorkspaceRoutes.has(canonicalRoute)) continue;
    const protectedPage = await fetch(`${origin}${requestPath}`, {
      headers: { cookie: `klol_v2_session=${superAdminToken}` },
      redirect: "manual",
    });
    assert.equal(protectedPage.status, 200, `${requestPath} must open for SUPER_ADMIN`);
  }
  const verifiedEnrollment = await fetch(`${origin}${enrollmentPath}`, {
    headers: { cookie: cookiePair },
    redirect: "manual",
  });
  assert.equal(verifiedEnrollment.status, 200, "verified ADMIN must be able to inspect TOTP status");

  const session = await fetch(`${origin}/api/admin/session`, { headers: { cookie: cookiePair } });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.deepEqual(sessionBody.user, { id: "http-admin", role: "ADMIN", source: "fixture" });

  const replay = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: acceptedTotpCode }),
  });
  assert.equal(replay.status, 403);

  const fixtureAdminTokenInAccountCookie = `klol_v2_account_session=${cookiePair.split("=")[1]}`;
  const fixturePurposeConfusion = await fetch(`${origin}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: fixtureAdminTokenInAccountCookie, origin },
  });
  assert.equal(fixturePurposeConfusion.status, 204);
  assert.match(fixturePurposeConfusion.headers.get("set-cookie") ?? "", /^klol_v2_account_session=.*Max-Age=0/is);
  assert.equal((await fetch(`${origin}/api/admin/session`, {
    headers: { cookie: cookiePair },
  })).status, 200, "fixture ACCOUNT logout must not revoke a substituted ADMIN token");

  const crossOriginLogout = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: cookiePair, origin: "https://attacker.invalid" },
  });
  assert.equal(crossOriginLogout.status, 403);
  assert.equal(crossOriginLogout.headers.get("set-cookie"), null);

  const logout = await fetch(`${origin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: cookiePair, origin },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/i);

  const fixtureReplay = await fetch(`${origin}/api/admin/session`, {
    headers: { cookie: cookiePair },
  });
  assert.equal(fixtureReplay.status, 401);

} catch (error) {
  const sanitizedLog = serverLog
    .replaceAll(password, "[synthetic-password]")
    .replaceAll(sessionSecret, "[synthetic-session-secret]")
    .replaceAll(totpSecret, "[synthetic-totp-secret]");
  console.error(sanitizedLog);
  throw error;
} finally {
  await stopServer(child);
  await developmentProof.dispose();
}

const productionPort = await availablePort();
const productionOrigin = `http://127.0.0.1:${productionPort}`;
const productionProof = await createFixtureRunnerProof(productionOrigin);
const productionServer = await spawnNextWithProof(
  ["start", "--hostname", "127.0.0.1", "--port", String(productionPort)],
  {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "",
      SESSION_SIGNING_KEYS: "",
      TOTP_ENCRYPTION_KEYS: "",
      V2_AUTH_RATE_LIMIT_PEPPER: "",
      V2_PUBLIC_ORIGIN: productionOrigin,
      V2_TEST_AUTH_ENABLED: "true",
      ...productionProof.environment,
      V2_TEST_AUTH_SECRET: sessionSecret,
      V2_TEST_AUTH_FIXTURES_JSON: fixtures,
  },
  productionProof,
);
const productionChild = productionServer.child;

let productionLog = "";
for (const stream of [productionChild.stdout, productionChild.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    productionLog = `${productionLog}${chunk}`.slice(-8_000);
  });
}

try {
  await Promise.race([
    waitUntilReady(productionOrigin, productionChild),
    productionServer.startFailure,
  ]);
  const response = await fetch(`${productionOrigin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: productionOrigin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: totp(totpSecret) }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);

  const unavailableLogout = await fetch(`${productionOrigin}/api/admin/logout`, {
    method: "POST",
    headers: { cookie: "klol_v2_session=retryable-opaque-token", origin: productionOrigin },
  });
  assert.equal(unavailableLogout.status, 503);
  assert.equal(unavailableLogout.headers.get("set-cookie"), null);

  const home = await fetch(productionOrigin);
  const csp = home.headers.get("content-security-policy") ?? "";
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /upgrade-insecure-requests/);

  console.log("Auth HTTP verification passed: guards, limits, password+TOTP, cookie, roles, headers, logout, production fixture lockout.");
} catch (error) {
  const sanitizedLog = productionLog
    .replaceAll(password, "[synthetic-password]")
    .replaceAll(sessionSecret, "[synthetic-session-secret]")
    .replaceAll(totpSecret, "[synthetic-totp-secret]");
  console.error(sanitizedLog);
  throw error;
} finally {
  await stopServer(productionChild);
  await productionProof.dispose();
}
