/** Synthetic local Next server only: node --import tsx scripts/hub/verify-community-sites-http.mjs */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard.ts";
import { createDefaultCommunitySiteConfig } from "../../src/modules/community-sites/domain/site-configuration.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = resolve(root, "docs/qa-evidence/community-site-studio-2026-10-29/http.json");
const checks = [];
let step = "guarded local preview initialization";
let pool;
let publicFixture;
let successful = false;
let finalRevision;
let finalStatus;

function check(condition, description) {
  checks.push({ check: description, passed: Boolean(condition) });
  assert.ok(condition, description);
}
function status(response, expected, description) {
  checks.push({ check: description, status: response.status, expectedStatus: expected, passed: response.status === expected });
  assert.ok(response.status === expected, description);
}
function cookieFrom(response, name) {
  const cookie = response.headers.getSetCookie().find((item) => item.startsWith(`${name}=`));
  assert.ok(cookie, "Expected purpose-bound session cookie");
  check(/;\s*HttpOnly/iu.test(cookie) && /;\s*SameSite=(strict|lax)/iu.test(cookie), "account cookie is HttpOnly and same-site");
  return cookie.split(";")[0];
}

try {
  const state = JSON.parse(await readFile(resolve(root, ".private/hub-preview-state.json"), "utf8"));
  assert.equal(state.localOnly, true);
  assert.equal(state.active, true);
  assert.match(state.database, /^klol_v2_test_hub_preview_[a-f0-9]{16}$/u);
  const base = new URL(state.origin);
  assert.equal(base.protocol, "http:"); assert.equal(base.hostname, "127.0.0.1");
  assert.ok(base.port && !base.username && !base.password && base.pathname === "/" && !base.search && !base.hash);
  assert.ok(typeof state.accountToken === "string" && typeof state.adminToken === "string" && typeof state.userId === "string");
  const local = JSON.parse(await readFile(resolve(root, ".private/nexus-local-database.json"), "utf8"));
  const target = new URL(local.connectionString);
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "55439");
  assert.equal(target.pathname, "/nexus_gg_local");
  target.pathname = `/${state.database}`;
  assertSafeTestDatabase({ connectionString: target.toString(), nodeEnv: "test", testMode: "true" });
  pool = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 5000 });
  const identity = await pool.query("select current_database() as name");
  assert.equal(identity.rows[0].name, state.database);
  const run = randomBytes(6).toString("hex");
  const adminCookie = `gg_hub_session=${state.adminToken}`;
  const outsiderCookie = `gg_hub_account_session=${state.accountToken}`;
  const commonHeaders = { Origin: base.origin, "Sec-Fetch-Site": "same-origin" };
  async function request(path, options = {}) {
    assert.ok(path.startsWith("/") && !path.startsWith("//"));
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin, "Only the owned loopback server may be contacted");
    return fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  }
  function mutationHeaders(cookie, revision, key = randomUUID()) {
    return { ...commonHeaders, Cookie: cookie, "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": key };
  }
  async function mutate(path, cookie, revision, body, headers = {}, method = "PATCH") {
    return request(path, { method, headers: { ...mutationHeaders(cookie, revision), ...headers }, body: JSON.stringify(body) });
  }

  step = "server identity and disabled provider boundary";
  const home = await request("/"); status(home, 200, "actual Next hub home responds");
  check((await home.text()).includes('data-service="hub"'), "server renders the standalone hub identity");
  status(await request("/api/community-sites"), 401, "site applications require a user session");
  status(await request("/api/admin/community-sites", { headers: { Cookie: outsiderCookie } }), 401, "ordinary account cookie cannot authorize review API");
  const adminList = await request("/api/admin/community-sites", { headers: { Cookie: adminCookie } });
  status(adminList, 200, "synthetic administrator can read review queue");
  const reviewQueue = await adminList.json();
  check(reviewQueue.provisioningReady === false, "local provisioning remains disabled before approval tests");

  step = "real hub signup and ordinary login";
  const loginId = `studio-http-${run}`;
  const password = `Synthetic-Studio-${randomBytes(18).toString("hex")}!9`;
  const signupHeaders = { ...commonHeaders, "Content-Type": "application/json", "Idempotency-Key": `studio-signup-${randomUUID()}` };
  const signupBody = JSON.stringify({ loginId, password, termsAccepted: true, privacyAccepted: true });
  const signup = await request("/api/auth/signup", { method: "POST", headers: signupHeaders, body: signupBody });
  status(signup, 201, "a new hub member signs up without a Riot player identity");
  const signedUp = (await signup.json()).account;
  check(signedUp.role === "USER" && signedUp.status === "APPROVED" && signedUp.player === null, "signup creates an approved USER without copied player data");
  const signupReplay = await request("/api/auth/signup", { method: "POST", headers: signupHeaders, body: signupBody });
  status(signupReplay, 201, "signup retry returns the original account");
  check((await signupReplay.json()).account.id === signedUp.id, "signup retry does not create a second account");
  const accountRow = (await pool.query("select role,status from auth.user_accounts where id=$1", [signedUp.id])).rows[0];
  check(accountRow.role === "USER" && accountRow.status === "APPROVED", "ordinary member status is durable in the synthetic database");
  const login = await request("/api/auth/login", { method: "POST", headers: { ...commonHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ loginId, password }) });
  status(login, 200, "new member logs in through the real account endpoint");
  const ownerCookie = cookieFrom(login, "gg_hub_account_session");
  check((await login.json()).account.id === signedUp.id, "login resolves the newly registered account");

  step = "site submission, strict payload and idempotency";
  const configuration = { ...createDefaultCommunitySiteConfig("lounge"), name: `HTTP 비공개 신청 ${run}`, slug: `http-${run}`, description: `HTTP 신청 전용 설명 ${run}` };
  const createBody = { action: "submit", configuration };
  const createHeaders = mutationHeaders(ownerCookie, 0, `studio-site-${randomUUID()}`);
  const created = await request("/api/community-sites", { method: "POST", headers: createHeaders, body: JSON.stringify(createBody) });
  status(created, 201, "approved USER submits a real site application");
  let site = (await created.json()).site;
  check(site.ownerUserAccountId === signedUp.id && site.status === "SUBMITTED" && site.latestJob === null && site.origin === null, "submission is owned and is not a provisioned site");
  check(created.headers.get("etag") === `"${site.revision}"`, "creation response exposes the site revision ETag");
  const replay = await request("/api/community-sites", { method: "POST", headers: createHeaders, body: JSON.stringify(createBody) });
  status(replay, 201, "same site request replays successfully");
  check(replay.headers.get("idempotency-replayed") === "true" && (await replay.json()).site.id === site.id, "site replay keeps its identity and produces no duplicate");
  status(await request("/api/community-sites", { method: "POST", headers: createHeaders, body: JSON.stringify({ ...createBody, configuration: { ...configuration, name: "서로 다른 요청" } }) }), 409, "same idempotency key rejects changed content");
  status(await mutate("/api/community-sites", ownerCookie, 0, { action: "submit", configuration: { ...configuration, modules: { ...configuration.modules, unknownFeature: true } } }, {}, "POST"), 400, "unknown module configuration is rejected");
  status(await mutate("/api/community-sites", ownerCookie, 0, { ...createBody, ownerUserAccountId: state.userId }, {}, "POST"), 400, "request cannot inject a different owner");

  step = "owner isolation and request guards";
  const ownList = await request("/api/community-sites", { headers: { Cookie: ownerCookie } });
  status(ownList, 200, "owner reads applications");
  check((await ownList.json()).sites.every((item) => item.ownerUserAccountId === signedUp.id), "owner collection excludes other users' sites");
  const detailPath = `/api/community-sites/${site.id}`;
  status(await request(detailPath, { headers: { Cookie: outsiderCookie } }), 404, "another account cannot read an owned application");
  status(await mutate(detailPath, outsiderCookie, site.revision, { action: "cancel" }), 404, "another account cannot modify an owned application");
  status(await request(`/api/admin/community-sites/${site.id}`, { headers: { Cookie: ownerCookie } }), 401, "ordinary USER cannot use administrator review route");
  status(await mutate(detailPath, ownerCookie, site.revision, { action: "update", configuration }, { Origin: "https://foreign.example", "Sec-Fetch-Site": "cross-site" }), 403, "foreign origin cannot update an application");
  const noOrigin = mutationHeaders(ownerCookie, site.revision); delete noOrigin.Origin;
  status(await request(detailPath, { method: "PATCH", headers: noOrigin, body: JSON.stringify({ action: "update", configuration }) }), 403, "missing origin cannot update an application");
  const noRevision = mutationHeaders(ownerCookie, site.revision); delete noRevision["If-Match"];
  status(await request(detailPath, { method: "PATCH", headers: noRevision, body: JSON.stringify({ action: "update", configuration }) }), 428, "site updates require an explicit revision");
  status(await mutate(detailPath, ownerCookie, 0, { action: "update", configuration }), 412, "stale revision cannot replace current settings");
  status(await request(`${detailPath}?force=true`, { headers: { Cookie: ownerCookie } }), 400, "unsupported query cannot bypass site policy");

  step = "admin review, resubmission, rejection and cancellation";
  const adminPath = `/api/admin/community-sites/${site.id}`;
  const readReview = await request(adminPath, { headers: { Cookie: adminCookie } });
  status(readReview, 200, "administrator can inspect the submitted application");
  check((await readReview.json()).provisioningReady === false, "detail also reports provisioning setup unavailable");
  const approval = await mutate(adminPath, adminCookie, site.revision, { action: "approve", reason: "합성 HTTP 검증" });
  status(approval, 503, "approval cannot queue external work when provisioning is disabled");
  check((await approval.json()).code === "COMMUNITY_SITE_PROVISIONING_NOT_READY", "readiness failure has an actionable safe problem code");
  check(Number((await pool.query("select count(*) as count from community_sites.provisioning_jobs where site_id=$1", [site.id])).rows[0].count) === 0, "disabled approval creates no provisioning job");
  const changes = await mutate(adminPath, adminCookie, site.revision, { action: "request_changes", reason: "소개와 활동 시간 보완 요청" });
  status(changes, 200, "administrator can request changes without provider access"); site = (await changes.json()).site;
  check(site.status === "CHANGES_REQUESTED", "review feedback is stored as changes requested");
  const updated = await mutate(detailPath, ownerCookie, site.revision, { action: "update", configuration: { ...site.configuration, description: "합성 보완 소개와 활동 시간" } });
  status(updated, 200, "owner saves requested configuration changes"); site = (await updated.json()).site;
  for (const [action, expected] of [["submit", "SUBMITTED"], ["cancel", "CANCELLED"], ["submit", "SUBMITTED"]]) {
    const response = await mutate(detailPath, ownerCookie, site.revision, { action });
    status(response, 200, `owner ${action} reaches ${expected}`); site = (await response.json()).site;
    check(site.status === expected, `durable state is ${expected}`);
  }
  const rejected = await mutate(adminPath, adminCookie, site.revision, { action: "reject", reason: "합성 검증용 반려 사유" });
  status(rejected, 200, "administrator rejects with an explicit reason"); site = (await rejected.json()).site;
  check(site.status === "REJECTED" && Boolean(site.reviewReason), "rejection remains visible to the owner");
  const resubmit = await mutate(detailPath, ownerCookie, site.revision, { action: "submit" });
  status(resubmit, 200, "rejected application can be resubmitted by its owner"); site = (await resubmit.json()).site;
  check(site.status === "SUBMITTED" && site.reviewReason === null, "new submission clears stale review feedback");

  step = "public directory uses only published active data";
  const fixtureId = randomUUID();
  const published = { ...createDefaultCommunitySiteConfig(), name: `HTTP 공개 게시 ${run}`, slug: `http-public-${run}`, description: `HTTP 공개 설명 ${run}` };
  const draft = { ...published, name: `HTTP 숨김 초안 ${run}`, description: `HTTP 숨김 설명 ${run}` };
  const fixtureOrigin = `https://studio-qa-${run}.example`;
  await pool.query("insert into community_sites.sites (id,owner_user_account_id,slug,configuration_json,published_configuration_json,status,revision,origin) values ($1,$2,$3,$4::jsonb,$5::jsonb,'ACTIVE',1,$6)",
    [fixtureId, signedUp.id, published.slug, JSON.stringify(draft), JSON.stringify(published), fixtureOrigin]);
  publicFixture = { id: fixtureId, owner: signedUp.id, origin: fixtureOrigin };
  for (const path of ["/", "/community-network"]) {
    const response = await request(path); status(response, 200, `public directory ${path} renders`);
    const html = await response.text();
    check(html.includes(published.name) && html.includes(published.description) && html.includes(fixtureOrigin), `${path} shows active published fields`);
    check(!html.includes(draft.name) && !html.includes(draft.description) && !html.includes(configuration.name) && !html.includes(site.reviewReason ?? "sentinel-not-a-real-reason"), `${path} conceals drafts and unapproved application data`);
    check(!html.includes(signedUp.id) && !html.includes("resourceJson") && !html.includes("ownerUserAccountId"), `${path} does not expose ownership or provider metadata`);
  }
  const privateDetail = await request(`/api/community-sites/${fixtureId}`, { headers: { Cookie: ownerCookie } });
  status(privateDetail, 200, "owner can see draft and published configuration separately");
  const privateDto = (await privateDetail.json()).site;
  check(privateDto.configuration.name === draft.name && privateDto.publishedConfiguration.name === published.name, "owner detail keeps private draft distinct from its published view");

  step = "session revocation and no external side effects";
  const cancelled = await mutate(detailPath, ownerCookie, site.revision, { action: "cancel" });
  status(cancelled, 200, "synthetic application finishes cancelled without provisioning"); site = (await cancelled.json()).site;
  finalRevision = site.revision; finalStatus = site.status;
  const logout = await request("/api/auth/logout", { method: "POST", headers: { ...commonHeaders, Cookie: ownerCookie } });
  status(logout, 204, "new user's logout revokes the account session");
  status(await request("/api/community-sites", { method: "POST", headers: createHeaders, body: JSON.stringify(createBody) }), 401, "revoked session cannot replay an earlier successful application");
  check(Number((await pool.query("select count(*) as count from community_sites.provisioning_jobs where site_id=$1", [site.id])).rows[0].count) === 0, "all HTTP checks leave external provisioning unqueued");
  successful = true;
} catch {
  console.error(`Community-site HTTP QA failed at: ${step}. Sensitive responses are not printed.`);
  process.exitCode = 1;
} finally {
  if (pool && publicFixture) {
    try {
      await pool.query("delete from community_sites.sites where id=$1 and owner_user_account_id=$2 and origin=$3", [publicFixture.id, publicFixture.owner, publicFixture.origin]);
    } catch { successful = false; process.exitCode = 1; checks.push({ check: "owned synthetic public fixture cleanup", passed: false }); }
  }
  if (pool) await pool.end();
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify({ checkedAt: new Date().toISOString(), localOnly: true, syntheticDataOnly: true,
    productionAccess: false, externalProviderCalls: false, publicDirectoryFixtureOnly: true,
    passed: successful, checks, ...(successful ? { finalRevision, finalStatus } : { failedStep: step }),
  }, null, 2));
  if (successful) console.log(`Community-site HTTP QA passed: ${checks.length} checks. Evidence: docs/qa-evidence/community-site-studio-2026-10-29/http.json`);
}
