/** Run once against the owned synthetic .private/hub-preview.ts process. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const statePath = resolve(root, ".private/hub-preview-state.json");
const evidencePath = resolve(root, "docs/qa-evidence/gg-hub-2026-10-29/http.json");
const state = JSON.parse(await readFile(statePath, "utf8"));
assert.equal(state.localOnly, true, "Only the synthetic local preview may be tested.");
assert.equal(state.active, true, "The owned local preview must be running.");
assert.match(state.database, /^klol_v2_test_hub_preview_[a-f0-9]{16}$/u);
const origin = new URL(state.origin);
assert.equal(origin.protocol, "http:");
assert.equal(origin.hostname, "127.0.0.1");
assert.ok(origin.port && !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash);
assert.equal(state.ownerLoginId, "hub-preview-owner");
assert.equal(typeof state.ownerPassword, "string");
assert.ok(!state.httpPasswordChangedAt, "Start a fresh preview to repeat the forced-password test.");

const checks = [];
const headers = { Origin: origin.origin, "Sec-Fetch-Site": "same-origin" };
let step = "initialization";
let adminCookie;
let accountCookie;
let finalRevision;
let finalSiteCount;
let finalRoomCount;

async function request(path, options = {}) {
  assert.ok(path.startsWith("/") && !path.startsWith("//"));
  return fetch(new URL(path, origin), { ...options, redirect: "manual", signal: AbortSignal.timeout(30_000) });
}

function cookieFrom(response, name) {
  const cookies = response.headers.getSetCookie();
  const matching = cookies.find((value) => value.startsWith(`${name}=`));
  assert.ok(matching, `Expected ${name} cookie.`);
  assert.ok(/;\s*HttpOnly/i.test(matching));
  assert.ok(/;\s*SameSite=(?:strict|lax)/i.test(matching));
  return matching.split(";")[0];
}

function status(response, expected, description) {
  checks.push({ check: description, status: response.status, expectedStatus: expected, passed: response.status === expected });
  assert.equal(response.status, expected, description);
}

async function login(path, password) {
  return request(path, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ loginId: state.ownerLoginId, password }) });
}

async function writeEvidence(passed) {
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify({
    checkedAt: new Date().toISOString(), localOnly: true, syntheticDataOnly: true, productionAccess: false,
    passed, checks, ...(passed ? { finalRevision, finalSiteCount, finalRoomCount } : { failedStep: step }),
  }, null, 2));
}

try {
  step = "standalone hub identity";
  const home = await request("/");
  status(home, 200, "standalone hub home");
  assert.ok((await home.text()).includes('data-service="hub"'), "The running application must be a hub build.");
  const noAuth = await request("/api/admin/community-network");
  status(noAuth, 401, "registry requires administrator authentication");

  step = "forced-password account login";
  const initialLogin = await login("/api/auth/login", state.ownerPassword);
  status(initialLogin, 200, "initial owner can use ordinary login");
  accountCookie = cookieFrom(initialLogin, "gg_hub_account_session");
  const initialAccount = (await initialLogin.json()).account;
  assert.equal(initialAccount.mustChangePassword, true);
  assert.equal(initialAccount.role, "SUPER_ADMIN");
  assert.ok(Number.isSafeInteger(initialAccount.revision));
  const forbiddenAdmin = await login("/api/admin/login", state.ownerPassword);
  status(forbiddenAdmin, 403, "temporary password cannot obtain an administrator session");
  const accountOnly = await request("/api/admin/community-network", { headers: { Cookie: accountCookie } });
  status(accountOnly, 401, "ordinary account session cannot authorize the management API");

  step = "password change and revocation";
  const password = `Preview-changed-${randomBytes(24).toString("base64url")}!1a`;
  const passwordKey = `hub-http-password-${randomUUID()}`;
  const passwordBody = JSON.stringify({ currentPassword: state.ownerPassword, newPassword: password });
  const passwordHeaders = { ...headers, Cookie: accountCookie, "Content-Type": "application/json", "If-Match": `"${initialAccount.revision}"`, "Idempotency-Key": passwordKey };
  const changed = await request("/api/auth/password", { method: "PATCH", headers: passwordHeaders, body: passwordBody });
  status(changed, 200, "password changes through the real revision and idempotency guarded API");
  state.ownerPassword = password;
  state.httpPasswordChangedAt = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  const clearedNames = changed.headers.getSetCookie().map((value) => value.split("=")[0]);
  assert.ok(clearedNames.includes("gg_hub_account_session") && clearedNames.includes("gg_hub_session"));
  const oldSession = await request("/api/auth/me", { headers: { Cookie: accountCookie } });
  status(oldSession, 200, "old account session status remains safe to query");
  assert.equal((await oldSession.json()).user, null);
  const oldReplay = await request("/api/auth/password", { method: "PATCH", headers: passwordHeaders, body: passwordBody });
  status(oldReplay, 401, "revoked session cannot replay a password change");

  step = "new administrator session";
  const administrator = await login("/api/admin/login", password);
  status(administrator, 200, "changed password can obtain an administrator session");
  adminCookie = cookieFrom(administrator, "gg_hub_session");
  const mismatchedCookie = await request("/api/admin/community-network", { headers: { Cookie: adminCookie.replace(/^gg_hub_session=/u, "nexus_session=") } });
  status(mismatchedCookie, 401, "child-site cookie name cannot authorize hub management");
  const beforeResponse = await request("/api/admin/community-network", { headers: { Cookie: adminCookie } });
  status(beforeResponse, 200, "administrator reads isolated site and room registry");
  const before = (await beforeResponse.json()).snapshot;
  assert.equal(before.rooms.length, 12);
  assert.equal(before.connectionStatus, "UNVERIFIED");
  assert.equal(before.routingStatus, "NOT_APPLIED");
  const privateSite = before.communities.find((site) => site.state === "DRAFT");
  assert.ok(privateSite);

  step = "dynamic site and thirteenth room";
  const siteId = randomUUID();
  const additionalSite = { id: siteId, slug: "preview-gamma", name: "합성 감마 커뮤니티", origin: "https://gamma.example", description: "HTTP 검증에서 추가한 독립 합성 사이트입니다.", state: "LISTED" };
  const additionalRoom = { id: randomUUID(), communityId: siteId, displayName: "합성 감마 13번째 방", purpose: "EVENT", dataGroupKey: "preview-gamma", active: true };
  const payload = { communities: [...before.communities, additionalSite], rooms: [...before.rooms, additionalRoom] };
  const registryBody = JSON.stringify(payload);
  const registryKey = `hub-http-registry-${randomUUID()}`;
  const registryHeaders = { ...headers, Cookie: adminCookie, "Content-Type": "application/json", "If-Match": `"${before.revision}"`, "Idempotency-Key": registryKey };
  const write = await request("/api/admin/community-network", { method: "PUT", headers: registryHeaders, body: registryBody });
  status(write, 200, "new independent site and thirteenth room save without source changes");
  const after = (await write.json()).snapshot;
  assert.equal(after.rooms.length, 13);
  assert.equal(after.communities.length, before.communities.length + 1);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.connectionStatus, "UNVERIFIED");
  assert.equal(after.routingStatus, "NOT_APPLIED");
  const replay = await request("/api/admin/community-network", { method: "PUT", headers: registryHeaders, body: registryBody });
  status(replay, 200, "same registry command replays without duplicating the new room");
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
  assert.equal((await replay.json()).snapshot.revision, after.revision);
  const stale = await request("/api/admin/community-network", { method: "PUT", headers: { ...registryHeaders, "Idempotency-Key": `hub-http-stale-${randomUUID()}` }, body: registryBody });
  status(stale, 412, "stale registry version is rejected");
  const mismatch = await request("/api/admin/community-network", { method: "PUT", headers: registryHeaders, body: JSON.stringify({ ...payload, rooms: payload.rooms.map((room) => room.id === additionalRoom.id ? { ...room, displayName: "다른 합성 요청" } : room) }) });
  status(mismatch, 409, "same idempotency key cannot accept a different registry command");
  const csrf = await request("/api/admin/community-network", { method: "PUT", headers: { ...registryHeaders, Origin: "https://foreign.example", "Sec-Fetch-Site": "cross-site", "If-Match": `"${after.revision}"`, "Idempotency-Key": `hub-http-csrf-${randomUUID()}` }, body: registryBody });
  status(csrf, 403, "foreign origin cannot mutate the registry");
  const reloaded = await request("/api/admin/community-network", { headers: { Cookie: adminCookie } });
  status(reloaded, 200, "registry reload preserves the committed dynamic configuration");
  const persisted = (await reloaded.json()).snapshot;
  assert.equal(persisted.rooms.length, 13); assert.equal(persisted.revision, after.revision);
  finalRevision = persisted.revision; finalSiteCount = persisted.communities.length; finalRoomCount = persisted.rooms.length;

  step = "public DTO and child routes";
  for (const path of ["/", "/community-network"]) {
    const publicPage = await request(path);
    status(publicPage, 200, `${path} renders newly listed sites`);
    const html = await publicPage.text();
    assert.ok(html.includes(additionalSite.name));
    assert.ok(!html.includes(privateSite.name), "Draft site must remain private.");
    assert.ok(!html.includes(additionalRoom.displayName), "Public directory must not expose room metadata.");
  }
  for (const path of ["/players", "/competitions", "/api/admin/site-settings", "/api/admin/users", "/api/auth/signup", "/api/cron/security-maintenance"]) {
    status(await request(path, { headers: { Cookie: adminCookie } }), 404, `hub excludes child-only route ${path}`);
  }

  step = "logout and session revocation";
  const administratorLogout = await request("/api/admin/logout", { method: "POST", headers: { ...headers, Cookie: adminCookie } });
  status(administratorLogout, 200, "administrator logout succeeds");
  status(await request("/api/admin/community-network", { headers: { Cookie: adminCookie } }), 401, "logged-out administrator token is rejected");
  adminCookie = undefined;
  const accountRelogin = await login("/api/auth/login", password);
  status(accountRelogin, 200, "changed owner password remains usable for ordinary login");
  accountCookie = cookieFrom(accountRelogin, "gg_hub_account_session");
  assert.equal((await accountRelogin.json()).account.mustChangePassword, false);
  const accountLogout = await request("/api/auth/logout", { method: "POST", headers: { ...headers, Cookie: accountCookie } });
  status(accountLogout, 204, "ordinary account logout succeeds");
  const loggedOutAccount = await request("/api/auth/me", { headers: { Cookie: accountCookie } });
  assert.equal((await loggedOutAccount.json()).user, null);
  checks.push({ check: "logged-out account token returns no account", status: loggedOutAccount.status, passed: true });
  accountCookie = undefined;
  await writeEvidence(true);
  console.log(JSON.stringify({ passed: checks.length, evidence: "docs/qa-evidence/gg-hub-2026-10-29/http.json", syntheticDataOnly: true, finalSiteCount, finalRoomCount }));
} catch (error) {
  await writeEvidence(false);
  // Never print raw response bodies, credentials, or cookie values on failure.
  console.error(JSON.stringify({ passed: false, failedStep: step, completedChecks: checks.length, failureType: error?.name ?? "Error" }));
  process.exitCode = 1;
} finally {
  if (adminCookie) await request("/api/admin/logout", { method: "POST", headers: { ...headers, Cookie: adminCookie } }).catch(() => undefined);
  if (accountCookie) await request("/api/auth/logout", { method: "POST", headers: { ...headers, Cookie: accountCookie } }).catch(() => undefined);
}
