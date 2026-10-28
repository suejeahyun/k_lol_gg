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
const routePath = path.join(root, "src/app/api/admin/community-network/route.ts");
const runtimePath = path.join(root, "src/modules/community-network/infrastructure/runtime.ts");
const authPath = path.join(root, "src/modules/auth/infrastructure/server-authorization.ts");
const session = { userId: "10000000-0000-4000-8000-000000000001", sessionId: "20000000-0000-4000-8000-000000000001", role: "SUPER_ADMIN", authVersion: 2 };
const empty = { revision: 0, communities: [], rooms: [], connectionStatus: "UNVERIFIED", routingStatus: "NOT_APPLIED" };

function harness(options = {}) {
  const calls = [];
  const cache = new Map();
  const repository = {
    async getSnapshot() { calls.push(["getSnapshot"]); return empty; },
    async updateSnapshot(input) {
      calls.push(["updateSnapshot", input]);
      if (options.errorCode) throw new (load(path.join(root, "src/modules/community-network/domain/community-network.ts")).CommunityNetworkError)(options.errorCode);
      return { status: 200, body: { snapshot: { ...empty, ...input.snapshot, revision: 1 } }, revision: 1, replayed: options.replayed ?? false };
    },
  };
  function load(filename) {
    if (filename === runtimePath) return {
      isCommunityNetworkEnabled: () => options.enabled !== false,
      getRuntimeCommunityNetworkRepository() { calls.push(["repository"]); return options.unavailable ? null : repository; },
    };
    if (filename === authPath) return { async authorizeApiRole(role) {
      calls.push(["authorize", role]);
      return options.role === null ? { allowed: false, reason: "UNAUTHENTICATED" }
        : options.role && options.role !== "SUPER_ADMIN" ? { allowed: false, reason: "FORBIDDEN" } : { allowed: true, session };
    } };
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiledModule = { exports: {} };
    cache.set(filename, compiledModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = (specifier) => {
      if (specifier.startsWith("node:")) return nodeRequire(specifier);
      const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      const dependency = [`${base}.ts`, path.join(base, "index.ts")].find(existsSync);
      assert.ok(dependency, `Unexpected dependency ${specifier}`);
      return load(dependency);
    };
    vm.runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require, Request, Response, Headers, URL, TextDecoder, TextEncoder, Uint8Array, Buffer, process: { env: { PUBLIC_ORIGIN: "https://hub.example" } } }, { filename });
    return compiledModule.exports;
  }
  return { route: load(routePath), calls };
}

function request({ method = "PUT", headers = {}, body = { communities: [], rooms: [] }, query = "" } = {}) {
  const values = new Headers({ "Content-Type": "application/json", Origin: "https://hub.example", "If-Match": '"0"', "Idempotency-Key": "community-request-0001", ...headers });
  for (const [key, value] of Object.entries(headers)) if (value === null) values.delete(key);
  return new Request(`https://hub.example/api/admin/community-network${query}`, { method, headers: values, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}

test("disabled registry GET and PUT return 503 before touching authorization or database", async () => {
  const { route, calls } = harness({ enabled: false });
  for (const method of ["GET", "PUT"]) assert.equal((await route[method](request({ method }))).status, 503);
  assert.deepEqual(calls, []);
});

test("both endpoints require SUPER_ADMIN and conceal storage from unauthorized callers", async () => {
  for (const role of [null, "USER", "ADMIN"]) {
    const { route, calls } = harness({ role });
    for (const method of ["GET", "PUT"]) assert.equal((await route[method](request({ method }))).status, role === null ? 401 : 403);
    assert.deepEqual(calls, [["authorize", "SUPER_ADMIN"], ["authorize", "SUPER_ADMIN"]]);
  }
});

test("GET returns no-store snapshot and revision ETag; unsupported query and unavailable store fail", async () => {
  const { route } = harness();
  const response = await route.GET(request({ method: "GET" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"0"');
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { snapshot: empty });
  assert.equal((await route.GET(request({ method: "GET", query: "?all=true" }))).status, 400);
  assert.equal((await harness({ unavailable: true }).route.GET(request({ method: "GET" }))).status, 503);
});

test("PUT enforces real origin, JSON size, media type, revision and idempotency guards", async () => {
  for (const [changes, status] of [
    [{ headers: { Origin: "https://other.example" } }, 403],
    [{ headers: { Origin: null } }, 403],
    [{ headers: { "If-Match": null } }, 428],
    [{ headers: { "If-Match": "*" } }, 400],
    [{ headers: { "Idempotency-Key": null } }, 400],
    [{ headers: { "Idempotency-Key": "short" } }, 400],
    [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ body: "{" }, 400],
    [{ body: `{"padding":"${"x".repeat(524_288)}"}` }, 413],
    [{ query: "?force=true" }, 400],
  ]) {
    const { route, calls } = harness();
    assert.equal((await route.PUT(request(changes))).status, status, JSON.stringify(changes).slice(0, 100));
    assert.equal(calls.some(([name]) => name === "repository"), false);
  }
});

test("PUT rejects extra routing fields and forwards immutable session identity and concurrency metadata", async () => {
  const { route, calls } = harness({ replayed: true });
  assert.equal((await route.PUT(request({ body: { communities: [], rooms: [], shortcutId: "not-a-real-id" } }))).status, 400);
  const response = await route.PUT(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), '"1"');
  assert.equal(response.headers.get("idempotency-replayed"), "true");
  const command = calls.find(([name]) => name === "updateSnapshot")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(command.actor)), { userAccountId: session.userId, sessionId: session.sessionId, role: "SUPER_ADMIN", authVersion: 2 });
  assert.equal(command.metadata.expectedRevision, 0);
  assert.match(command.metadata.requestHashHex, /^[a-f0-9]{64}$/);
  assert.deepEqual(await response.json(), { snapshot: { ...empty, revision: 1 } });
});

test("concurrency, expired authorization, replay conflicts and validation failures use safe public errors", async () => {
  for (const [errorCode, status] of [["SESSION_STALE", 401], ["STALE_COMMUNITY_NETWORK_REVISION", 412], ["IDEMPOTENCY_MISMATCH", 409], ["COMMUNITY_NETWORK_UNIQUE_CONFLICT", 409], ["COMMUNITY_NETWORK_REMOVAL_FORBIDDEN", 400], ["COMMUNITY_NETWORK_ROOM_MOVE_FORBIDDEN", 400], ["PRIVATE_DATABASE_FAILURE", 503]]) {
    const response = await harness({ errorCode }).route.PUT(request());
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.status, status);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_DATABASE_FAILURE|stack|SELECT|shortcutId/);
  }
});
