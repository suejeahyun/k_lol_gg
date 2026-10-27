import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { Pool } from "pg";
import { bootstrapEmptyNexusDatabase } from "./empty-database";

await access(".next/BUILD_ID");
const configured = new URL(process.env.NEXUS_DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)) throw new Error("NEXUS auth verification requires a loopback PostgreSQL cluster.");
const databaseName = `nexus_test_auth_${randomBytes(8).toString("hex")}`;
const adminUrl = new URL(configured); adminUrl.pathname = "/postgres";
const testUrl = new URL(configured); testUrl.pathname = `/${databaseName}`;
const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
let created = false;
let pool: Pool | undefined;
let app: ChildProcess | undefined;
try {
  await admin.query(`create database "${databaseName}"`);
  created = true;
  pool = new Pool({ connectionString: testUrl.toString(), max: 1 });
  await bootstrapEmptyNexusDatabase(pool, databaseName);
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address(); assert.ok(address && typeof address !== "string");
  const port = address.port; await new Promise<void>((done) => listener.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const randomSecret = () => randomBytes(32).toString("base64url");
  const temporaryPassword = `Synthetic-${randomSecret()}1a`;
  const changedPassword = `Changed-${randomSecret()}2b`;
  const environment = {
    ...process.env,
    NODE_ENV: "production" as const,
    NEXT_PUBLIC_SERVICE_ID: "nexus",
    NEXT_PUBLIC_SITE_URL: origin,
    V2_PUBLIC_ORIGIN: origin,
    V2_PUBLIC_DATA_SOURCE: "postgres",
    DATABASE_URL: "",
    NEXUS_DATABASE_URL: testUrl.toString(),
    NEXUS_DATABASE_NAME: databaseName,
    NEXUS_BOOTSTRAP_CONFIRM: "CREATE_EMPTY_NEXUS",
    NEXUS_ADMIN_LOGIN_ID: "nexus_synthetic_admin",
    NEXUS_ADMIN_PASSWORD: temporaryPassword,
    SESSION_SIGNING_KEYS: JSON.stringify({ current: "qa", keys: { qa: randomSecret() } }),
    TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { 1: randomSecret() } }),
    V2_AUTH_RATE_LIMIT_PEPPER: randomSecret(),
    V2_TEST_AUTH_ENABLED: "false",
    V2_RIOT_INTEGRATION_ENABLED: "false",
    V2_OPENAI_COMPLETION_ENABLED: "false",
    KAKAO_SITE_NOTICE_ENABLED: "false",
    USAGE_ANALYTICS_ENABLED: "false",
  };
  const createAdmin = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/nexus/create-admin.ts"], { windowsHide: true, encoding: "utf8", env: environment });
  assert.equal(createAdmin().status, 0, "fresh administrator setup must succeed");
  assert.equal(createAdmin().status, 1, "second setup must refuse to change the administrator");
  const [initial] = (await pool.query("select id, role, must_change_password from auth.user_accounts")).rows;
  assert.equal(initial.role, "SUPER_ADMIN"); assert.equal(initial.must_change_password, true);
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { windowsHide: true, stdio: "ignore", env: { ...environment, NEXUS_ADMIN_PASSWORD: "" } });
  let healthy = false;
  for (let i = 0; i < 120; i += 1) {
    try { healthy = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok; } catch { /* bounded startup */ }
    if (healthy) break;
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.ok(healthy, "NEXUS production server must become healthy");
  assert.match(await fetch(`${origin}/admin/login`).then((response) => response.text()), /NEXUS.GG/u);
  const login = (path: string, password: string) => fetch(`${origin}${path}`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ loginId: environment.NEXUS_ADMIN_LOGIN_ID, password }) });
  assert.equal((await login("/api/admin/login", temporaryPassword)).status, 403, "temporary password cannot elevate");
  const accountLogin = await login("/api/auth/login", temporaryPassword);
  assert.equal(accountLogin.status, 200, "initial administrator can use regular login to change password without a player record");
  const accountCookie = accountLogin.headers.get("set-cookie")!.split(";", 1)[0];
  assert.ok(accountCookie.startsWith("nexus_account_session="));
  const passwordChange = await fetch(`${origin}/api/auth/password`, {
    method: "PATCH",
    headers: { origin, cookie: accountCookie, "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: changedPassword }),
  });
  assert.equal(passwordChange.status, 200, "first password change must work");
  const adminLogin = await login("/api/admin/login", changedPassword);
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie")!.split(";", 1)[0];
  assert.ok(adminCookie.startsWith("nexus_session="));
  assert.equal((await fetch(`${origin}/api/admin/site-settings`, { headers: { cookie: adminCookie } })).status, 200);
  const denied = await fetch(`${origin}/api/admin/site-settings`, { headers: { cookie: adminCookie.replace("nexus_session=", "klol_v2_session=") } });
  assert.equal(denied.status, 401, "legacy service cookie names cannot authenticate NEXUS");
  assert.equal((await pool.query("select count(*)::int as count from registry.players")).rows[0].count, 0);
  console.log(JSON.stringify({ passed: 10, checks: ["fresh-admin-created", "duplicate-admin-refused", "temporary-admin-elevation-refused", "account-login-without-player", "first-password-change", "admin-login", "nexus-session-cookie", "admin-settings-access", "legacy-cookie-refused", "no-player-record-created"] }, null, 2));
} finally {
  if (app && app.exitCode === null) { const stopped = once(app, "exit"); app.kill(); await stopped; }
  await pool?.end();
  if (created) await admin.query(`drop database "${databaseName}"`);
  await admin.end();
}
