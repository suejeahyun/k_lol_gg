import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

const registered = { id: "11111111-1111-4111-8111-111111111111", slug: "registered", name: "기존 커뮤니티", origin: "https://registered.example.com", description: "공개 소개", connectionStatus: "CONNECTED", routingStatus: "ACTIVE" };
const managed = { id: "22222222-2222-4222-8222-222222222222", slug: "managed", name: "새 커뮤니티", origin: "https://managed.example.com", description: "새 공개 소개", ownerUserId: "private-owner", providerResources: { secret: "must-not-expose" } };
function harness(service = "hub") {
  let network: { state: string; data?: typeof registered[] } = { state: "ready", data: [registered] };
  let managedRows = [managed], managedFailure = false, managedEnabled = true, networkFailure = false, reads = 0;
  const remoteCalls: string[] = [];
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "@/lib/service-brand": { SERVICE_BRAND: { id: service } },
    "@/modules/community-sites/infrastructure/runtime": { getRuntimeCommunitySitesRepository: () => { reads++; if (!managedEnabled) return null; return { getPublicSites: async () => { if (managedFailure) throw new Error("private database hostname"); return managedRows; } }; }, isCommunitySitesEnabled: () => managedEnabled },
    "./runtime": { loadRuntimeCommunityNetwork: async (load: (repository: unknown) => Promise<unknown>) => { reads++; if (networkFailure) throw new Error("private database hostname"); if (network.state !== "ready") return network; return { state: "ready", data: await load({ getPublicDirectory: async () => network.data }) }; } },
    "./public-community-introduction-client": { fetchPublicCommunityIntroduction: async (origin: string) => { remoteCalls.push(origin); return { state: "ready", data: { safePublicDto: true } }; } },
  };
  type Public = { id: string; slug: string; name: string; origin: string; description: string };
  const output: { listHubCommunities?: () => Promise<{ communities: Public[]; unavailable: boolean }>; findHubCommunity?: (id: string) => Promise<Public | null>; loadHubCommunityIntroduction?: (origin: string) => Promise<{ state: string }> } = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/modules/community-network/infrastructure/hub-community-directory.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Script(code).runInNewContext({ exports: output, require: (key: string) => { assert.ok(Object.hasOwn(dependencies, key), key); return dependencies[key]; } });
  return { list: () => output.listHubCommunities!(), find: (id: string) => output.findHubCommunity!(id), load: (origin: string) => output.loadHubCommunityIntroduction!(origin), remoteCalls, reads: () => reads,
    setNetwork(value: typeof network) { network = value; }, setManaged(value: typeof managedRows) { managedRows = value; }, failManaged() { managedFailure = true; }, failNetwork() { networkFailure = true; }, disableManaged() { managedEnabled = false; } };
}

test("directory combines visible records, deduplicates origin and projects only five public fields without N+1 reads", async () => {
  const app = harness(); app.setManaged([managed, { ...managed, id: "33333333-3333-4333-8333-333333333333", origin: registered.origin }]);
  const result = await app.list(); assert.equal(result.unavailable, false); assert.equal(result.communities.length, 2);
  assert.equal(result.communities[0].id, registered.id); assert.equal(result.communities[1].id, managed.id);
  for (const item of result.communities) assert.deepEqual(Object.keys(item).sort(), ["description", "id", "name", "origin", "slug"]);
  assert.equal(app.reads(), 2); assert.deepEqual(app.remoteCalls, []);
});

test("valid UUID detail resolves visible sites only and never uses slug or arbitrary origin as identity", async () => {
  const app = harness(); assert.equal((await app.find(registered.id))?.origin, registered.origin); assert.equal((await app.find(managed.id))?.origin, managed.origin);
  assert.equal(await app.find("33333333-3333-4333-8333-333333333333"), null);
  const before = app.reads();
  for (const value of [registered.slug, registered.origin, "../../admin", "not-a-uuid"]) assert.equal(await app.find(value), null);
  assert.equal(app.reads(), before); assert.deepEqual(app.remoteCalls, []);
});

test("partial availability retains visible results but distinguishes a missing record from a database outage", async () => {
  const app = harness(); app.failManaged();
  assert.equal((await app.list()).unavailable, true); assert.equal((await app.find(registered.id))?.id, registered.id);
  await assert.rejects(app.find(managed.id), /HUB_DIRECTORY_UNAVAILABLE/);
  const inverse = harness(); inverse.failNetwork(); assert.equal((await inverse.find(managed.id))?.id, managed.id);
  assert.equal((await inverse.list()).unavailable, true);
  const disabled = harness(); disabled.setNetwork({ state: "disabled" }); disabled.disableManaged();
  const result = await disabled.list(); assert.equal(result.unavailable, false); assert.equal(result.communities.length, 0);
});

test("remote fetches require currently visible exact origin and revoked listings are never fetched from stale links", async () => {
  const app = harness(); assert.equal((await app.load(registered.origin)).state, "ready"); assert.deepEqual(app.remoteCalls, [registered.origin]);
  for (const value of ["https://arbitrary.example.com", `${registered.origin}/api/private`, `${registered.origin}.attacker.com`, "http://169.254.169.254"]) assert.equal((await app.load(value)).state, "unpublished");
  app.setNetwork({ state: "ready", data: [] }); assert.equal((await app.load(registered.origin)).state, "unpublished"); assert.deepEqual(app.remoteCalls, [registered.origin]);
  app.failNetwork(); assert.equal((await app.load(registered.origin)).state, "unavailable"); assert.deepEqual(app.remoteCalls, [registered.origin]);
});

test("child and legacy deployments do not query or fetch HUB directory data", async () => {
  for (const service of ["community", "klol", "nexus"]) {
    const app = harness(service); assert.equal((await app.list()).communities.length, 0); assert.equal(await app.find(registered.id), null); assert.equal((await app.load(registered.origin)).state, "unpublished"); assert.equal(app.reads(), 0); assert.deepEqual(app.remoteCalls, []);
  }
});
