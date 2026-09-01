import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";

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
]);
const protectedWorkspacePaths = [
  "/admin",
  "/admin/players",
  "/admin/seasons",
  "/admin/matches",
  "/admin/balance",
  "/admin/progress/event",
  "/admin/kakao",
  "/admin/champions",
  "/admin/riot",
  "/admin/discipline",
];

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    V2_PUBLIC_ORIGIN: origin,
    V2_TEST_AUTH_ENABLED: "true",
    V2_TEST_AUTH_SECRET: sessionSecret,
    V2_TEST_AUTH_FIXTURES_JSON: fixtures,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let serverLog = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverLog = `${serverLog}${chunk}`.slice(-8_000);
  });
}

try {
  await waitUntilReady(origin, child);

  const anonymousPage = await fetch(`${origin}/admin`, { redirect: "manual" });
  assert.equal(anonymousPage.status, 307);
  assert.match(anonymousPage.headers.get("location") ?? "", /^\/admin\/login\?next=/);

  for (const workspacePath of protectedWorkspacePaths.slice(1)) {
    const response = await fetch(`${origin}${workspacePath}`, { redirect: "manual" });
    assert.equal(response.status, 307, `${workspacePath} must require authentication`);
  }

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

  const login = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: totp(totpSecret) }),
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

  for (const workspacePath of protectedWorkspacePaths) {
    const protectedPage = await fetch(`${origin}${workspacePath}`, {
      headers: { cookie: cookiePair },
      redirect: "manual",
    });
    assert.equal(protectedPage.status, 200, `${workspacePath} must open for ADMIN`);
    assert.match(protectedPage.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.equal(protectedPage.headers.get("x-frame-options"), "DENY");
  }

  const session = await fetch(`${origin}/api/admin/session`, { headers: { cookie: cookiePair } });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.deepEqual(sessionBody.user, { id: "http-admin", role: "ADMIN", source: "fixture" });

  const replay = await fetch(`${origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: totp(totpSecret) }),
  });
  assert.equal(replay.status, 403);

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

} catch (error) {
  const sanitizedLog = serverLog
    .replaceAll(password, "[synthetic-password]")
    .replaceAll(sessionSecret, "[synthetic-session-secret]")
    .replaceAll(totpSecret, "[synthetic-totp-secret]");
  console.error(sanitizedLog);
  throw error;
} finally {
  await stopServer(child);
}

const productionPort = await availablePort();
const productionOrigin = `http://127.0.0.1:${productionPort}`;
const productionChild = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(productionPort)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      V2_PUBLIC_ORIGIN: productionOrigin,
      V2_SESSION_SECRET: sessionSecret,
      V2_TEST_AUTH_ENABLED: "true",
      V2_TEST_AUTH_SECRET: sessionSecret,
      V2_TEST_AUTH_FIXTURES_JSON: fixtures,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

let productionLog = "";
for (const stream of [productionChild.stdout, productionChild.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    productionLog = `${productionLog}${chunk}`.slice(-8_000);
  });
}

try {
  await waitUntilReady(productionOrigin, productionChild);
  const response = await fetch(`${productionOrigin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: productionOrigin },
    body: JSON.stringify({ loginId: "http_admin", password, totpCode: totp(totpSecret) }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);

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
}
