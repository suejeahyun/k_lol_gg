import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeRequire = createRequire(import.meta.url);
const runtimePath = path.join(root, "src/modules/community-sites/infrastructure/runtime.ts");
const authPath = path.join(root, "src/modules/auth/infrastructure/server-authorization.ts");
const siteId = "10000000-0000-4000-8000-000000000001";
const session = { userId: "20000000-0000-4000-8000-000000000001", sessionId: "30000000-0000-4000-8000-000000000001", role: "USER", authVersion: 2 };

function harness(options = {}) {
  const calls = [];
  const cache = new Map();
  function maybeError() {
    if (options.errorCode) throw new (load(path.join(root, "src/modules/community-sites/domain/community-site.ts")).CommunitySiteError)(options.errorCode);
  }
  const repository = {
    async listSites(actor, scope) { calls.push(["listSites", actor, scope]); maybeError(); return []; },
    async getSite(actor, id, scope) { calls.push(["getSite", actor, id, scope]); maybeError(); return { id, revision: 3, status: "SUBMITTED" }; },
    async createSite(input) { calls.push(["createSite", input]); maybeError(); return { status: 201, body: { site: { id: siteId, revision: 1, status: "SUBMITTED", configuration: input.command.configuration } }, revision: 1, replayed: options.replayed ?? false }; },
    async updateSite(input) { calls.push(["updateSite", input]); maybeError(); return { status: 200, body: { site: { id: input.id, revision: 4, status: "SUBMITTED" } }, revision: 4, replayed: false }; },
    async reviewSite(input) { calls.push(["reviewSite", input]); maybeError(); return { status: 200, body: { site: { id: input.id, revision: 4, status: "APPROVED" } }, revision: 4, replayed: false }; },
  };
  function load(filename) {
    if (filename === runtimePath) return {
      isCommunitySitesEnabled: () => options.enabled !== false,
      isCommunitySiteProvisioningReady: () => options.provisioningReady !== false,
      getRuntimeCommunitySitesRepository() { calls.push(["repository"]); return options.unavailable ? null : repository; },
    };
    if (filename === authPath) return { async authorizeApiRole(role) {
      calls.push(["authorize", role]);
      return options.denied ? { allowed: false, reason: options.denied } : { allowed: true, session: { ...session, role: role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER" } };
    } };
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiledModule = { exports: {} }; cache.set(filename, compiledModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = (specifier) => {
      if (specifier.startsWith("node:")) return nodeRequire(specifier);
      const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      const dependency = [`${base}.ts`, path.join(base, "index.ts")].find(existsSync);
      assert.ok(dependency, `Unexpected dependency ${specifier}`); return load(dependency);
    };
    vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require, Request, Response, Headers, URL, TextDecoder, TextEncoder, Uint8Array, Buffer,
      process: { env: { PUBLIC_ORIGIN: "https://hub.example" } } }, { filename });
    return compiledModule.exports;
  }
  const configuration = load(path.join(root, "src/modules/community-sites/domain/site-configuration.ts")).createDefaultCommunitySiteConfig();
  const routes = Object.fromEntries(["ownerList", "ownerDetail", "adminList", "adminDetail"].map((name) => {
    const filename = `src/app/api/${name.startsWith("admin") ? "admin/" : ""}community-sites/${name.endsWith("Detail") ? "[id]/" : ""}route.ts`;
    return [name, load(path.join(root, filename))];
  }));
  return { routes, calls, configuration };
}
function request({ method = "POST", admin = false, detail = false, headers = {}, body = {}, query = "" } = {}) {
  const values = new Headers({ "Content-Type": "application/json", Origin: "https://hub.example", "If-Match": '"0"', "Idempotency-Key": "community-site-request-0001", ...headers });
  for (const [key, value] of Object.entries(headers)) if (value === null) values.delete(key);
  return new Request(`https://hub.example/api/${admin ? "admin/" : ""}community-sites${detail ? `/${siteId}` : ""}${query}`,
    { method, headers: values, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}
const context = { params: Promise.resolve({ id: siteId }) };

test("feature guard and role guards run before storage for all owner/admin entrypoints", async () => {
  for (const name of ["ownerList", "ownerDetail", "adminList", "adminDetail"]) {
    const disabled = harness({ enabled: false });
    assert.equal((await disabled.routes[name].GET(request({ method: "GET" }), context)).status, 503);
    assert.deepEqual(disabled.calls, []);
    for (const [denied, status] of [["UNAUTHENTICATED", 401], ["FORBIDDEN", 403]]) {
      const checked = harness({ denied });
      assert.equal((await checked.routes[name].GET(request({ method: "GET" }), context)).status, status);
      assert.deepEqual(checked.calls, [["authorize", name.startsWith("admin") ? "SUPER_ADMIN" : "USER"]]);
    }
  }
});
test("reads forward verified identity and scope, return no-store and use a per-site revision", async () => {
  const { routes, calls } = harness();
  assert.deepEqual(await (await routes.ownerList.GET(request({ method: "GET" }))).json(), { sites: [] });
  const detail = await routes.ownerDetail.GET(request({ method: "GET", detail: true }), context);
  assert.equal(detail.headers.get("etag"), '"3"'); assert.match(detail.headers.get("cache-control"), /no-store/);
  assert.equal(calls.find(([name]) => name === "getSite")[3], "owner");
  await routes.adminDetail.GET(request({ method: "GET", detail: true, admin: true }), context);
  assert.equal(calls.filter(([name]) => name === "getSite")[1][3], "admin");
  assert.equal((await routes.ownerList.GET(request({ method: "GET", query: "?owner=someone-else" }))).status, 400);
  assert.equal((await routes.ownerDetail.GET(request({ method: "GET", detail: true }), { params: Promise.resolve({ id: "not-a-uuid" }) })).status, 400);
});
test("site creation enforces origin, JSON limits, precondition and idempotency before opening storage", async () => {
  for (const [changes, status] of [
    [{ headers: { Origin: "https://other.example" } }, 403], [{ headers: { Origin: null } }, 403],
    [{ headers: { "If-Match": null } }, 428], [{ headers: { "If-Match": "*" } }, 400],
    [{ headers: { "Idempotency-Key": null } }, 400], [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ body: "{" }, 400], [{ body: `{"padding":"${"x".repeat(65536)}"}` }, 413], [{ query: "?force=true" }, 400],
  ]) {
    const { routes, calls, configuration } = harness();
    const response = await routes.ownerList.POST(request({ body: { action: "submit", configuration }, ...changes }));
    assert.equal(response.status, status); assert.equal(calls.some(([name]) => name === "repository"), false);
  }
});
test("create, owner update and review have disjoint strict bodies and stable response contracts", async () => {
  const { routes, calls, configuration } = harness({ replayed: true });
  const created = await routes.ownerList.POST(request({ body: { action: "submit", configuration } }));
  assert.equal(created.status, 201); assert.equal(created.headers.get("etag"), '"1"'); assert.equal(created.headers.get("idempotency-replayed"), "true");
  const input = calls.find(([name]) => name === "createSite")[1];
  assert.equal(input.actor.userAccountId, session.userId); assert.equal(input.metadata.expectedRevision, 0);
  assert.match(input.metadata.requestHashHex, /^[a-f0-9]{64}$/u);
  assert.equal((await routes.ownerList.POST(request({ body: { action: "submit", configuration, status: "ACTIVE" } }))).status, 400);
  assert.equal((await routes.ownerDetail.PATCH(request({ method: "PATCH", detail: true, body: { action: "approve", reason: "" } }), context)).status, 400);
  assert.equal((await routes.adminDetail.PATCH(request({ method: "PATCH", detail: true, admin: true, body: { action: "update", configuration } }), context)).status, 400);
  const reviewed = await routes.adminDetail.PATCH(request({ method: "PATCH", detail: true, admin: true, body: { action: "approve", reason: "" } }), context);
  assert.equal(reviewed.status, 200); assert.equal((await reviewed.json()).site.status, "APPROVED");
  assert.equal(calls.find(([name]) => name === "reviewSite")[1].actor.role, "SUPER_ADMIN");
});
test("safe errors cover scope isolation, concurrent updates and unknown storage failures", async () => {
  for (const [errorCode, status] of [["SESSION_STALE", 401], ["COMMUNITY_SITE_NOT_FOUND", 404], ["STALE_COMMUNITY_SITE_REVISION", 412],
    ["IDEMPOTENCY_MISMATCH", 409], ["COMMUNITY_SITE_UNIQUE_CONFLICT", 409], ["COMMUNITY_SITE_STATE_CONFLICT", 409], ["COMMUNITY_SITE_JOB_IN_PROGRESS", 409], ["PRIVATE_DATABASE_FAILURE", 503]]) {
    const { routes, configuration } = harness({ errorCode });
    const response = await routes.ownerList.POST(request({ body: { action: "submit", configuration } }));
    assert.equal(response.status, status); assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_DATABASE_FAILURE|stack|SELECT|connectionString/u);
  }
});
test("unconfigured provisioning is visible to reviewers and cannot approve work while review feedback stays available", async () => {
  const { routes, calls } = harness({ provisioningReady: false });
  const list = await routes.adminList.GET(request({ method: "GET", admin: true }));
  assert.deepEqual(await list.json(), { sites: [], provisioningReady: false });
  const approval = await routes.adminDetail.PATCH(request({ method: "PATCH", detail: true, admin: true, body: { action: "approve", reason: "" } }), context);
  assert.equal(approval.status, 503); assert.equal((await approval.json()).code, "COMMUNITY_SITE_PROVISIONING_NOT_READY");
  assert.equal(calls.some(([name]) => name === "reviewSite"), false);
  const feedback = await routes.adminDetail.PATCH(request({ method: "PATCH", detail: true, admin: true, body: { action: "request_changes", reason: "소개 보완" } }), context);
  assert.equal(feedback.status, 200);
});
