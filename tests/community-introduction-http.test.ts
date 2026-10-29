import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as http from "../src/platform/http";
import * as domain from "../src/modules/operations/domain/community-introduction";
import * as actor from "../src/modules/auth/domain/transaction-session";
import { OperationsError } from "../src/modules/operations/infrastructure/postgres-operations-repository";

function load(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Script(code, { filename: path }).runInNewContext({ exports, Response, Request, URL, Error,
    process: { env: { V2_PUBLIC_ORIGIN: "https://community.example" } },
    require(id: string) { assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id]; },
  });
  return exports;
}

function harness(brand = "nexus") {
  let profile = domain.createDefaultCommunityIntroduction();
  let authorized = true; let reason = "FORBIDDEN"; let unavailable = false;
  let revision = 0; let updatedAt: string | null = null; let failure: string | null = null;
  let writes = 0; let factories = 0; let replayed = false;
  const operations = load("src/modules/operations/infrastructure/operations-http.ts", {
    "node:crypto": crypto, "@/modules/auth/domain/transaction-session": actor,
    "@/modules/auth/application/mutation-request-guard": { hasSameOrigin: http.hasSameOrigin },
    "@/modules/auth/infrastructure/server-authorization": { authorizeApiRole: async (role: string) => {
      assert.equal(role, "ADMIN"); return authorized ? { allowed: true, session: { userId: "synthetic-admin", sessionId: "synthetic-session", authVersion: 0, role: "ADMIN", accountStatus: "APPROVED" } } : { allowed: false, reason };
    } },
    "@/platform/http": http, "./postgres-operations-repository": { OperationsError },
  });
  const dependencies = {
    "@/lib/service-brand": { SERVICE_BRAND: { id: brand }, getServiceOrigin: () => new URL("https://community.example") },
    "@/modules/operations/domain/community-introduction": domain,
    "@/modules/operations/infrastructure/operations-http": operations,
    "@/platform/http": http,
    "@/modules/operations/infrastructure/runtime-operations": { getRuntimeOperationsRepository: () => {
      factories++;
      return unavailable ? null : {
        getCommunityIntroduction: async () => ({ revision, updatedAt, profile }),
        updateCommunityIntroduction: async (input: { profile: domain.CommunityIntroduction }) => {
          if (failure) throw new OperationsError(failure);
          writes++; profile = input.profile; revision++; updatedAt = "2026-10-29T03:00:00.000Z";
          return { status: 200, revision, replayed, body: { introduction: { revision, updatedAt, profile } } };
        },
      };
    } },
  };
  const admin = load("src/app/api/admin/community-introduction/route.ts", dependencies);
  const publicApi = load("src/app/api/community-introduction/route.ts", dependencies);
  return {
    get: admin.GET as (request: Request) => Promise<Response>, put: admin.PUT as (request: Request) => Promise<Response>,
    publicGet: publicApi.GET as (request: Request) => Promise<Response>,
    setAuthorization(value: boolean, nextReason = "FORBIDDEN") { authorized = value; reason = nextReason; },
    setFailure(value: string) { failure = value; }, setUnavailable() { unavailable = true; }, setReplay() { replayed = true; },
    get writes() { return writes; }, get factories() { return factories; },
  };
}

const publicProfile = () => ({ ...domain.createDefaultCommunityIntroduction(), published: true, summary: "합성 소개", introduction: "소개 본문" });
function putRequest(body: unknown = publicProfile(), changes: Record<string, string | null> = {}, suffix = "") {
  const headers = new Headers({ "Content-Type": "application/json", Origin: "https://community.example", "If-Match": '"0"', "Idempotency-Key": "introduction-request-0001" });
  for (const [key, value] of Object.entries(changes)) { if (value === null) headers.delete(key); else headers.set(key, value); }
  return new Request(`https://community.example/api/admin/community-introduction${suffix}`, { method: "PUT", body: JSON.stringify(body), headers });
}

test("introduction admin HTTP denies unapproved access before touching repository", async () => {
  const h = harness();
  h.setAuthorization(false);
  assert.equal((await h.get(new Request("https://community.example/api/admin/community-introduction"))).status, 403);
  assert.equal((await h.put(putRequest())).status, 403);
  h.setAuthorization(false, "UNAUTHENTICATED");
  assert.equal((await h.put(putRequest())).status, 401);
  assert.equal(h.factories, 0);
});

test("introduction admin HTTP enforces origin, request size, exact body, idempotency and If-Match", async () => {
  const h = harness();
  for (const request of [putRequest(publicProfile(), { Origin: "https://foreign.example" }), putRequest(publicProfile(), { Origin: null }),
    putRequest(publicProfile(), { "Idempotency-Key": null }), putRequest(publicProfile(), { "If-Match": null }),
    putRequest(publicProfile(), { "If-Match": "0" }), putRequest({ ...publicProfile(), ownerUserAccountId: "private" }),
    putRequest({ ...publicProfile(), introduction: "x".repeat(40_000) }), putRequest(publicProfile(), {}, "?actor=someone")]) {
    const response = await h.put(request); assert.ok(response.status >= 400 && response.status < 500);
  }
  assert.equal(h.writes, 0); assert.equal(h.factories, 0);
  const good = await h.put(putRequest());
  assert.equal(good.status, 200); assert.equal(good.headers.get("etag"), '"1"');
  assert.match(good.headers.get("cache-control")!, /no-store/u);
  assert.equal((await good.json()).introduction.profile.summary, "합성 소개");
});

test("repository conflicts and stale sessions map to 412, 409 and 401, while replay marks the response", async () => {
  const h = harness();
  for (const [code, status] of [["STALE_COMMUNITY_INTRODUCTION_REVISION", 412], ["IDEMPOTENCY_MISMATCH", 409], ["SESSION_STALE", 401]] as const) {
    h.setFailure(code); assert.equal((await h.put(putRequest())).status, status);
  }
  const replay = harness(); replay.setReplay();
  assert.equal((await replay.put(putRequest())).headers.get("idempotency-replayed"), "true");
});

test("public introduction HTTP withdraws private drafts and uses configured origin despite spoofed Host", async () => {
  for (const brand of ["klol", "nexus", "community"]) {
    const h = harness(brand);
    const request = () => new Request("https://attacker.example/api/community-introduction", { headers: { Host: "attacker.example", "X-Forwarded-Host": "attacker.example" } });
    assert.equal((await h.publicGet(request())).status, 404);
    await h.put(putRequest());
    const published = await h.publicGet(request()); const dto = await published.json();
    assert.equal(published.status, 200); assert.equal(dto.origin, "https://community.example");
    assert.deepEqual(Object.keys(dto).sort(), ["origin", "profile", "updatedAt", "version"]);
    assert.doesNotMatch(JSON.stringify(dto), /published|revision|synthetic-admin|sessionId|updatedBy/);
    await h.put(putRequest({ ...publicProfile(), published: false }));
    assert.equal((await h.publicGet(request())).status, 404);
  }
});

test("HUB has no local introduction endpoint and repository outages fail closed", async () => {
  const h = harness("hub");
  assert.equal((await h.get(new Request("https://community.example/api/admin/community-introduction"))).status, 404);
  assert.equal((await h.put(putRequest())).status, 404);
  assert.equal((await h.publicGet(new Request("https://community.example/api/community-introduction"))).status, 404);
  assert.equal(h.factories, 0);
  const offline = harness(); offline.setUnavailable();
  assert.equal((await offline.publicGet(new Request("https://community.example/api/community-introduction"))).status, 503);
});
