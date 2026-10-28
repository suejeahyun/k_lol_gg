import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as http from "../src/platform/http/index";
import * as policy from "../src/modules/community-sites/domain/module-access";
import * as configuration from "../src/modules/community-sites/domain/site-configuration";

function load(path: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Script(code, { filename: path }).runInNewContext({ exports, require(id: string) {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`); return dependencies[id];
  }, Request, Response, Headers, URL });
  return exports;
}

function harness(brand = "community") {
  const communityId = "00000000-0000-4000-8000-000000000001";
  let current = configuration.createDefaultCommunitySiteConfig();
  let rowCommunityId = communityId;
  let reads = 0;
  let failed = false;
  const brandDependency = { SERVICE_BRAND: { id: brand, communityId } };
  const reader = load("src/modules/community-sites/infrastructure/runtime-site-configuration.ts", {
    "server-only": {}, "drizzle-orm": { eq: () => "synthetic-singleton-query" },
    "@/lib/service-brand": brandDependency,
    "@/platform/db/schema/community-sites": { communitySiteRuntimeConfiguration: { id: 1 } },
    "../domain/site-configuration": configuration,
    "@/platform/db/client": { getDatabase: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      reads++;
      if (failed) throw new Error("synthetic-private-connection-string");
      return [{ communityId: rowCommunityId, ownerUserAccountId: "synthetic-owner", publicationState: "ACTIVE", revision: 1, configurationJson: current }];
    } }) }) }) }) },
  });
  const boundary = load("src/modules/community-sites/infrastructure/module-access.ts", {
    "server-only": {}, "@/lib/service-brand": brandDependency, "@/platform/http": http,
    "../domain/module-access": policy, "./runtime-site-configuration": reader,
  });
  return {
    gate: boundary.requireCommunityModuleForRequest as (request: Request) => Promise<Response | null>,
    setConfig(value: configuration.CommunitySiteConfig) { current = value; },
    fail() { failed = true; }, swapDatabase() { rowCommunityId = "00000000-0000-4000-8000-000000000002"; },
    reads: () => reads,
  };
}

test("real HTTP boundary immediately observes disable/re-enable and preserves cancel/history", async () => {
  const h = harness();
  const request = () => new Request("https://community.example/api/recruits", { method: "POST" });
  assert.equal(await h.gate(request()), null);
  h.setConfig(configuration.setCommunitySiteModule(configuration.createDefaultCommunitySiteConfig(), "recruiting", false));
  const denied = await h.gate(request());
  assert.equal(denied?.status, 403);
  assert.equal((await denied!.json()).code, "COMMUNITY_MODULE_DISABLED");
  assert.equal(await h.gate(new Request("https://community.example/api/recruits")), null);
  assert.equal(await h.gate(new Request("https://community.example/api/applications/season", { method: "DELETE" })), null);
  assert.equal(h.reads(), 2, "history and cancellation do not depend on settings availability");
  h.setConfig(configuration.createDefaultCommunitySiteConfig());
  assert.equal(await h.gate(request()), null);
  assert.equal(h.reads(), 3);
});

test("configuration failures and wrong community DB deny new work without leaking private diagnostics", async () => {
  for (const failure of ["missing", "wrong-community"] as const) {
    const h = harness();
    if (failure === "missing") h.fail(); else h.swapDatabase();
    const response = await h.gate(new Request("https://community.example/api/admin/images", { method: "POST" }));
    assert.equal(response?.status, 503);
    const body = await response!.text();
    assert.match(body, /COMMUNITY_SITE_CONFIGURATION_UNAVAILABLE/);
    assert.doesNotMatch(body, /private-connection|string|00000000/);
    assert.equal(await h.gate(new Request("https://community.example/api/admin/matches/existing/publish", { method: "POST" })), null);
  }
});

test("existing KLOL, NEXUS and HUB requests never query managed-child settings", async () => {
  for (const brand of ["klol", "nexus", "hub"]) {
    const h = harness(brand);
    h.fail();
    assert.equal(await h.gate(new Request("https://existing.example/api/admin/images", { method: "POST" })), null);
    assert.equal(h.reads(), 0);
  }
});
