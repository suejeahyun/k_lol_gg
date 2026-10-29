import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Script } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createDefaultCommunitySiteConfig } from "../src/modules/community-sites/domain/site-configuration";
import type { CommunitySiteProvisioningProvider, CommunitySiteProvisioningStepInput } from "../src/modules/community-sites/infrastructure/provisioning-worker";

const siteId = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const environment = {
  NODE_ENV: "test" as const,
  NEXT_PUBLIC_SERVICE_ID: "hub", HUB_PROVISIONING_ENABLED: "true", NEXT_PUBLIC_SITE_URL: "https://hub.example",
  HUB_VERCEL_TOKEN: "synthetic-vercel-token", HUB_VERCEL_TEAM_ID: "team_fixture", HUB_NEON_API_KEY: "synthetic-neon-token",
  HUB_NEON_ORG_ID: "org-fixture", HUB_PROVISIONING_MASTER_KEY: Buffer.alloc(32, 7).toString("base64url"),
  HUB_ENGINE_GITHUB_REPO_ID: "12345", HUB_ENGINE_GIT_REF: "a".repeat(40),
};
const projectName = `ggc-fixture-${siteId.replaceAll("-", "")}`;
const origin = `https://${projectName}.vercel.app`;
const derive = (purpose: string) => crypto.createHmac("sha256", Buffer.from(environment.HUB_PROVISIONING_MASTER_KEY, "base64url"))
  .update(`gg-community:v1\0${siteId}\0${purpose}`).digest("base64url");
const neonProject = { id: "small-hill-12345", name: `GG-${siteId}-${derive("neon-ownership").slice(0, 22)}`, org_id: "org-fixture" };
const vercelProject = { id: "prj_fixture", name: projectName, accountId: "team_fixture" };
const connection = "postgresql://gg_owner:synthetic-password@ep-fixture.ap-southeast-1.aws.neon.tech/gg_community?sslmode=require&channel_binding=require";
const resources = { projectName, neonProjectId: neonProject.id, vercelProjectId: vercelProject.id, engineRef: environment.HUB_ENGINE_GIT_REF, vercelDeploymentId: "dpl_fixture" };

class ProvisioningError extends Error { constructor(readonly code: string) { super(code); } }
type Call = { url: URL; method: string; body: unknown; options: RequestInit };
type FixturePool = { on(event: string, listener: (client: unknown) => void): void; end(): Promise<void>; connectFixture(): void };
function input(checkpoint: string, kind: CommunitySiteProvisioningStepInput["job"]["kind"] = "PROVISION"): CommunitySiteProvisioningStepInput {
  const configuration = { ...createDefaultCommunitySiteConfig(), slug: "fixture" };
  return {
    site: { id: siteId, ownerUserAccountId: ownerId, configuration, publishedConfiguration: configuration, status: "PROVISIONING", revision: 7,
      reviewReason: null, origin: kind === "PROVISION" ? null : origin, createdAt: "2026-01-01", updatedAt: "2026-01-01", latestJob: null },
    job: { id: jobId, siteId, kind, configuration, siteRevision: 4, checkpoint, attemptCount: 1 }, resources,
  };
}
function harness() {
  const calls: Call[] = [];
  const dbCalls: { action: string; setup: unknown }[] = [];
  const timeouts: number[] = [];
  const metadataBackoffs: number[] = [];
  const timers = new Map<object, () => void>();
  let storedHash: Buffer | null = null;
  let poolCloses = 0;
  let connectionsCancelled = 0;
  let publicationState = "AWAITING_OWNER";
  let blobConnected = true;
  let blobSensitive = true;
  let initialize: ((pool: FixturePool) => Promise<unknown>) | undefined;
  let override: ((call: Call) => Response | Promise<Response> | undefined) | undefined;
  const markers = [
    { key: "HUB_MANAGED_COMMUNITY_ID", value: siteId, target: ["production"] },
    { key: "HUB_MANAGED_OWNERSHIP", value: derive("vercel-ownership"), target: ["production"] },
  ];
  const blobStore = { id: "store_fixture", name: `GG-${siteId}-${derive("blob-ownership").slice(0, 22)}`, ownerId: environment.HUB_VERCEL_TEAM_ID, type: "blob", access: "private" };
  const blobToken = () => ({ id: "env_blob", key: "BLOB_READ_WRITE_TOKEN", type: blobSensitive ? "sensitive" : "encrypted", target: ["production"], contentHint: { type: "blob-read-write-token", storeId: blobStore.id } });
  const database = {
    insert: () => ({ values: (value: { secretHash: Buffer }) => ({ onConflictDoNothing: async () => { storedHash ??= value.secretHash; } }) }),
    select: () => ({ from: () => ({ where: async () => [{ secretHash: storedHash, revokedAt: null }] }) }),
  };
  const request = async (url: URL | string, options: RequestInit = {}) => {
    const call: Call = { url: new URL(url), method: options.method ?? "GET", body: options.body ? JSON.parse(String(options.body)) : null, options };
    calls.push(call);
    assert.equal(options.redirect, "error");
    if (call.url.hostname === "api.vercel.com") {
      assert.equal(call.url.searchParams.get("teamId"), environment.HUB_VERCEL_TEAM_ID);
      assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${environment.HUB_VERCEL_TOKEN}`);
    } else if (call.url.hostname === "console.neon.tech") {
      assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${environment.HUB_NEON_API_KEY}`);
    } else assert.equal(new Headers(options.headers).has("authorization"), false, "provider tokens must never reach a child site");
    const custom = override?.(call);
    if (custom) return await custom;
    const p = call.url.pathname;
    if (p === "/api/v2/projects") return Response.json(call.method === "POST" ? { project: neonProject } : { projects: [neonProject] });
    if (p === `/api/v2/projects/${neonProject.id}`) return Response.json({ project: neonProject });
    if (p.endsWith("/connection_uri")) return Response.json({ uri: connection });
    if (p === "/v1/storage/stores") return Response.json({ stores: [blobStore] });
    if (p === "/v1/storage/stores/blob") return Response.json({ store: blobStore });
    if (p === `/v1/storage/stores/${blobStore.id}`) return Response.json({ store: { ...blobStore, projectsMetadata: blobConnected ? [{ projectId: vercelProject.id, environments: ["production"] }] : [] } });
    if (p === `/v1/storage/stores/${blobStore.id}/connections`) { blobConnected = true; return new Response(null, { status: 204 }); }
    if (p === `/v9/projects/${vercelProject.id}/env/env_blob` && call.method === "PATCH") { blobSensitive = true; return Response.json(blobToken()); }
    if (p.endsWith("/env")) return Response.json(call.method === "POST" ? { created: call.body, failed: [] } : { envs: [...markers, ...(blobConnected ? [blobToken()] : [])] });
    if (p === `/v9/projects/${vercelProject.id}/domains/${new URL(origin).hostname}` || p === `/v10/projects/${vercelProject.id}/domains`) {
      return Response.json({ name: new URL(origin).hostname, projectId: vercelProject.id, verified: true, gitBranch: null, redirect: null });
    }
    if (p === `/v4/aliases/${new URL(origin).hostname}`) return Response.json({ alias: new URL(origin).hostname, projectId: vercelProject.id, deploymentId: resources.vercelDeploymentId });
    if (p.startsWith("/v9/projects/") || p === "/v11/projects") return Response.json(vercelProject);
    if (p === "/v7/deployments") return Response.json({ deployments: [], pagination: { next: null } });
    if (p === "/v13/deployments") return Response.json({ id: "dpl_created" });
    if (p === "/v13/deployments/dpl_fixture") return Response.json({ id: "dpl_fixture", projectId: vercelProject.id, readyState: "READY", alias: [new URL(origin).hostname],
      meta: { ggHubJobId: jobId, ggHubCommunityId: siteId, ggHubEngineRef: resources.engineRef } });
    if (p === "/api/community-runtime") return Response.json({ communityId: siteId, revision: 4, publicationState });
    throw new Error(`Unexpected fixture request: ${call.method} ${p}`);
  };
  const code = ts.transpileModule(readFileSync(new URL("../src/modules/community-sites/infrastructure/vercel-neon-provisioning-provider.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = {
    "node:crypto": crypto, "node:path": path, "drizzle-orm": { eq: () => "fixture-query" },
    "@/platform/db/schema": { communitySsoClients: { siteId: "site-id" } },
    "./provisioning-worker": { CommunitySiteProvisioningError: ProvisioningError },
    "@/platform/db/database": { createPgPool: (uri: string, options: { max: number }) => {
      assert.equal(uri, connection); assert.equal(options.max, 1);
      let connected: ((client: unknown) => void) | undefined;
      return { on(_event: string, listener: (client: unknown) => void) { connected = listener; }, async end() { poolCloses++; },
        connectFixture() { connected?.({ async end() { connectionsCancelled++; } }); } };
    } },
    "./managed-site-database": {
      initializeManagedSiteDatabase: async (pool: FixturePool, setup: unknown) => { pool.connectFixture(); dbCalls.push({ action: "initialize", setup }); return initialize?.(pool); },
      publishManagedSiteConfiguration: async (pool: FixturePool, setup: unknown) => { pool.connectFixture(); dbCalls.push({ action: "publish", setup }); },
      activateManagedSiteDatabase: async (pool: FixturePool, setup: { observeOnly?: boolean }) => {
        pool.connectFixture(); dbCalls.push({ action: "activate", setup });
        if (!setup.observeOnly) publicationState = "ACTIVE";
        return { communityId: siteId, revision: 4, publicationState };
      },
    },
  };
  new Script(code).runInNewContext({ exports, require(id: string) { assert.ok(Object.hasOwn(dependencies, id), id); return dependencies[id]; },
    Buffer, URL, Response, process: { cwd: () => process.cwd() },
    AbortSignal: { timeout(ms: number) { timeouts.push(ms); return AbortSignal.timeout(ms); } },
    setTimeout(callback: () => void, ms: number) {
      const key = {};
      if (ms === 85_000) timers.set(key, callback);
      else { assert.ok([200, 500, 1_000].includes(ms)); metadataBackoffs.push(ms); void Promise.resolve().then(callback); }
      return key;
    },
    clearTimeout(key: object) { timers.delete(key); },
  });
  const factory = exports.createVercelNeonProvisioningProvider as (db: unknown, env: NodeJS.ProcessEnv, request: unknown) => CommunitySiteProvisioningProvider;
  return { provider: factory(database, environment, request), calls, dbCalls, timeouts, metadataBackoffs, markers, blobStore,
    freshBlob() { blobConnected = false; blobSensitive = false; },
    alreadyActive() { publicationState = "ACTIVE"; },
    override(value: typeof override) { override = value; }, hangBootstrap() { initialize = async () => new Promise(() => undefined); },
    async expireDatabase() { for (let i = 0; i < 30 && !timers.size; i++) await Promise.resolve(); assert.equal(timers.size, 1); for (const callback of timers.values()) callback(); },
    poolCloses: () => poolCloses, connectionsCancelled: () => connectionsCancelled,
    readEnvironment: exports.readProvisioningEnvironment as (value: NodeJS.ProcessEnv) => unknown,
  };
}

test("environment errors are sanitized and noncanonical master keys are refused", () => {
  const h = harness();
  for (const changes of [{ NEXT_PUBLIC_SITE_URL: "broken secret input" }, { NEXT_PUBLIC_SERVICE_ID: "community" },
    { HUB_ENGINE_GIT_REF: "main" }, { HUB_PROVISIONING_MASTER_KEY: `${environment.HUB_PROVISIONING_MASTER_KEY.slice(0, -1)}d` }]) {
    assert.throws(() => h.readEnvironment({ ...environment, ...changes }), /^Error: PROVIDER_UNAVAILABLE$/);
  }
});

test("new Neon creation and lost-response retry use the same signed ownership name", async () => {
  const h = harness();
  h.override((call) => call.url.pathname === "/api/v2/projects" && call.method === "GET" ? Response.json({ projects: [] }) : undefined);
  const first = await h.provider.step(input("QUEUED"));
  const posted = h.calls.find((call) => call.method === "POST")!.body as { project: typeof neonProject };
  assert.equal(posted.project.name, neonProject.name); assert.ok(posted.project.name.length < 256);
  assert.equal(first.resources.neonProjectId, neonProject.id);
  h.override(undefined); h.calls.length = 0;
  const retry = await h.provider.step(input("QUEUED"));
  assert.equal(retry.resources.neonProjectId, first.resources.neonProjectId);
  assert.equal(h.calls.some((call) => call.method !== "GET"), false);
  assert.doesNotMatch(JSON.stringify(retry), /synthetic-password|synthetic-.*-token|postgresql/);
});

test("duplicate, incomplete and foreign Neon results never trigger resource creation", async () => {
  for (const result of [{ projects: [neonProject, neonProject] }, { projects: [], unavailable: ["provider-unavailable-project"] },
    { projects: [{ ...neonProject, org_id: "org-foreign" }] }]) {
    const h = harness(); h.override(() => Response.json(result));
    await assert.rejects(h.provider.step(input("QUEUED")), /RESOURCE_CONFLICT/);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, "GET");
  }
});

test("database writes reject foreign project ownership and unsafe connection URIs", async () => {
  for (const wrong of ["foreign", connection.replace("gg_owner:", "other_owner:"), connection.replace("sslmode=require", "sslmode=disable"),
    connection.replace(".neon.tech", ".evil.example"), `${connection}&options=-csearch_path%3Dother`, `${connection}&sslmode=disable`]) {
    const h = harness(); h.override((call) => wrong === "foreign" && call.url.pathname === `/api/v2/projects/${neonProject.id}`
      ? Response.json({ project: { ...neonProject, name: "unrelated-project" } })
      : call.url.pathname.endsWith("/connection_uri") ? Response.json({ uri: wrong }) : undefined);
    await assert.rejects(h.provider.step(input("DATABASE_CREATED")), /RESOURCE_CONFLICT|DATABASE_IDENTITY_MISMATCH/);
    assert.equal(h.dbCalls.length, 0);
  }
});

test("resource path injection, cross-site origins and unavailable Riot flags fail before any I/O", async () => {
  for (const transform of [
    (i: CommunitySiteProvisioningStepInput) => ({ ...i, resources: { ...i.resources, vercelProjectId: "prj_fixture/../foreign" } }),
    (i: CommunitySiteProvisioningStepInput) => ({ ...i, site: { ...i.site, origin: "https://foreign.example" } }),
    (i: CommunitySiteProvisioningStepInput) => ({ ...i, job: { ...i.job, configuration: { ...i.job.configuration, modules: { ...i.job.configuration.modules, riotIntegration: true } } } }),
  ]) {
    const h = harness(); await assert.rejects(h.provider.step(transform(input("PROJECT_CREATED"))), /INVALID_PROVIDER_RESULT|RESOURCE_CONFLICT|PROVIDER_UNAVAILABLE/);
    assert.equal(h.calls.length, 0); assert.equal(h.dbCalls.length, 0);
  }
});

test("a matching public site UUID alone cannot authorize Vercel environment overwrite", async () => {
  const h = harness(); h.markers[1].value = "foreign-ownership-proof";
  await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /RESOURCE_CONFLICT/);
  assert.equal(h.calls.some((call) => call.method !== "GET"), false);
});

test("child environment secrets are protected and provider credentials never enter child configuration", async () => {
  const h = harness(); const result = await h.provider.step(input("PROJECT_CREATED"));
  assert.equal(result.checkpoint, "ENVIRONMENT_CONFIGURED");
  assert.equal(result.resources.blobStoreId, h.blobStore.id);
  const posted = h.calls.find((call) => call.method === "POST")!.body as { key: string; value: string; type: string; target: string[] }[];
  assert.ok(posted.every((entry) => entry.target.length === 1 && entry.target[0] === "production"), "preview branches must not receive the production database or secrets");
  for (const key of ["COMMUNITY_DATABASE_URL", "COMMUNITY_HUB_CLIENT_SECRET", "SESSION_SIGNING_KEYS", "TOTP_ENCRYPTION_KEYS", "V2_AUTH_RATE_LIMIT_PEPPER", "CRON_SECRET"]) {
    assert.equal(posted.find((entry) => entry.key === key)?.type, "sensitive");
  }
  assert.equal(posted.find((entry) => entry.key === "NEXT_PUBLIC_COMMUNITY_ID")?.value, siteId);
  assert.equal(posted.find((entry) => entry.key === "V2_RIOT_INTEGRATION_ENABLED")?.value, "false");
  assert.equal(posted.find((entry) => entry.key === "V2_CRON_ENABLED")?.value, "true");
  assert.doesNotMatch(JSON.stringify(posted), /synthetic-vercel-token|synthetic-neon-token/);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-password|hub-client|postgresql/);
  assert.ok(h.timeouts.every((ms) => ms === 8_000));
});

test("private Blob creation connects production only and protects its token without reading it", async () => {
  const h = harness(); h.freshBlob();
  h.override((call) => call.url.pathname === "/v1/storage/stores" ? Response.json({ stores: [] }) : undefined);
  const result = await h.provider.step(input("PROJECT_CREATED"));
  assert.equal(result.resources.blobStoreId, h.blobStore.id);
  const create = h.calls.find((call) => call.url.pathname === "/v1/storage/stores/blob")!.body as Record<string, unknown>;
  assert.equal(create.access, "private"); assert.equal(create.projectId, undefined, "projectId auto-connects every environment");
  const connect = h.calls.find((call) => call.url.pathname.endsWith("/connections"))!.body as { projectId: string; envVarEnvironments: string[] };
  assert.equal(connect.projectId, vercelProject.id); assert.deepEqual(connect.envVarEnvironments, ["production"]);
  const protect = h.calls.find((call) => call.method === "PATCH")!;
  assert.deepEqual(protect.body, { type: "sensitive" });
  assert.equal(h.calls.some((call) => call.url.pathname.startsWith("/v1/projects/") && call.url.pathname.includes("/env/")), false, "never request decrypted credentials");
});

test("successful Blob writes tolerate delayed confirmed metadata with bounded GETs and no duplicate mutations", async () => {
  const h = harness(); h.freshBlob();
  let connectionReadbacks = 0; let protectionReadbacks = 0;
  h.override((call) => {
    if (call.url.pathname === "/v1/storage/stores") return Response.json({ stores: [] });
    if (call.url.pathname === `/v1/storage/stores/${h.blobStore.id}` && h.calls.some((entry) => entry.url.pathname.endsWith("/connections"))) {
      connectionReadbacks += 1;
      if (connectionReadbacks < 4) return Response.json({ store: { ...h.blobStore, projectsMetadata: [] } });
    }
    if (call.url.pathname === `/v9/projects/${vercelProject.id}/env` && call.method === "GET" && h.calls.some((entry) => entry.method === "PATCH")) {
      protectionReadbacks += 1;
      if (protectionReadbacks < 4) return Response.json({ envs: [...h.markers, { id: "env_blob", key: "BLOB_READ_WRITE_TOKEN", type: "encrypted", target: ["production"], contentHint: { type: "blob-read-write-token", storeId: h.blobStore.id } }] });
    }
    return undefined;
  });
  const result = await h.provider.step(input("PROJECT_CREATED"));
  assert.equal(result.checkpoint, "ENVIRONMENT_CONFIGURED");
  assert.equal(connectionReadbacks, 4); assert.equal(protectionReadbacks, 4);
  assert.deepEqual(h.metadataBackoffs, [200, 500, 1_000, 200, 500, 1_000]);
  assert.equal(h.calls.filter((call) => call.url.pathname === "/v1/storage/stores/blob" && call.method === "POST").length, 1);
  assert.equal(h.calls.filter((call) => call.url.pathname.endsWith("/connections") && call.method === "POST").length, 1);
  assert.equal(h.calls.filter((call) => call.method === "PATCH").length, 1);
});

test("unconfirmed Blob connection or token protection stops before environment publication with a retryable error", async () => {
  for (const missing of ["connection", "protection"]) {
    const h = harness(); h.freshBlob(); let readbacks = 0;
    h.override((call) => {
      if (missing === "connection" && call.url.pathname === `/v1/storage/stores/${h.blobStore.id}` && h.calls.some((entry) => entry.url.pathname.endsWith("/connections"))) {
        readbacks += 1; return Response.json({ store: { ...h.blobStore, projectsMetadata: [] } });
      }
      if (missing === "protection" && call.url.pathname === `/v9/projects/${vercelProject.id}/env` && call.method === "GET" && h.calls.some((entry) => entry.method === "PATCH")) {
        readbacks += 1; return Response.json({ envs: [...h.markers, { id: "env_blob", key: "BLOB_READ_WRITE_TOKEN", type: "encrypted", target: ["production"], contentHint: { type: "blob-read-write-token", storeId: h.blobStore.id } }] });
      }
      return undefined;
    });
    await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /^Error: PROVIDER_UNAVAILABLE$/);
    assert.equal(readbacks, 4); assert.deepEqual(h.metadataBackoffs, [200, 500, 1_000]);
    assert.equal(h.calls.filter((call) => call.url.pathname.endsWith("/connections") && call.method === "POST").length, 1);
    assert.equal(h.calls.filter((call) => call.method === "PATCH").length, missing === "protection" ? 1 : 0);
    assert.equal(h.calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/env")), false);
    assert.equal(h.calls.some((call) => call.url.pathname.includes("deployments")), false);
  }
});

test("Blob ownership changes observed during readback fail immediately without using the retry budget", async () => {
  for (const phase of ["connection", "protection"]) {
    const h = harness(); h.freshBlob();
    h.override((call) => {
      if (phase === "connection" && call.url.pathname === `/v1/storage/stores/${h.blobStore.id}` && h.calls.some((entry) => entry.url.pathname.endsWith("/connections"))) {
        return Response.json({ store: { ...h.blobStore, ownerId: "team_foreign", projectsMetadata: [] } });
      }
      if (phase === "protection" && call.url.pathname === `/v9/projects/${vercelProject.id}/env` && call.method === "GET" && h.calls.some((entry) => entry.method === "PATCH")) {
        return Response.json({ envs: [...h.markers, { id: "env_blob", key: "BLOB_READ_WRITE_TOKEN", type: "encrypted", target: ["production"], contentHint: { type: "blob-read-write-token", storeId: "store_foreign" } }] });
      }
      return undefined;
    });
    await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /^Error: RESOURCE_CONFLICT$/);
    assert.deepEqual(h.metadataBackoffs, []);
    assert.equal(h.calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/env")), false);
  }
});

test("exact production domain is registered before environment publication and reused on retry", async () => {
  const h = harness();
  h.override((call) => call.method === "GET" && call.url.pathname.includes("/domains/") ? new Response(null, { status: 404 }) : undefined);
  await h.provider.step(input("PROJECT_CREATED"));
  const registration = h.calls.findIndex((call) => call.method === "POST" && call.url.pathname.endsWith("/domains"));
  const environmentWrite = h.calls.findIndex((call) => call.method === "POST" && call.url.pathname.endsWith("/env"));
  assert.ok(registration >= 0 && registration < environmentWrite);
  assert.deepEqual(h.calls[registration].body, { name: new URL(origin).hostname }, "no force, transfer or preview assignment is permitted");
  h.override(undefined); h.calls.length = 0;
  await h.provider.step(input("PROJECT_CREATED"));
  assert.equal(h.calls.some((call) => call.method !== "GET" && call.url.pathname.includes("/domains")), false);
});

test("foreign, unverified, redirect and preview domains stop publication without takeover", async () => {
  for (const extra of [{ projectId: "prj_foreign" }, { name: "foreign.vercel.app" }, { verified: false },
    { redirect: "foreign.example" }, { gitBranch: "preview" }, { customEnvironmentId: "env_preview" }]) {
    const h = harness();
    h.override((call) => call.url.pathname.includes("/domains/") ? Response.json({ name: new URL(origin).hostname, projectId: vercelProject.id, verified: true, ...extra }) : undefined);
    await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /RESOURCE_CONFLICT/);
    assert.equal(h.calls.some((call) => call.method !== "GET"), false);
  }
  const conflict = harness();
  conflict.override((call) => call.url.pathname.includes("/domains/") ? new Response(null, { status: 404 })
    : call.url.pathname.endsWith("/domains") ? new Response(null, { status: 409 }) : undefined);
  await assert.rejects(conflict.provider.step(input("PROJECT_CREATED")), /RESOURCE_CONFLICT/);
  assert.equal(conflict.calls.some((call) => ["PATCH", "DELETE"].includes(call.method)), false);
  assert.equal(conflict.calls.some((call) => call.method === "POST" && call.url.pathname.endsWith("/env")), false);
});

test("ready deployment requires the current exact domain target rather than a stale alias snapshot", async () => {
  const valid = harness();
  valid.override((call) => call.url.pathname === "/v13/deployments/dpl_fixture" ? Response.json({ id: "dpl_fixture", projectId: vercelProject.id, readyState: "READY", alias: ["truncated-default.vercel.app"],
    meta: { ggHubJobId: jobId, ggHubCommunityId: siteId, ggHubEngineRef: resources.engineRef } }) : undefined);
  assert.equal((await valid.provider.step(input("DEPLOYMENT_CREATED"))).checkpoint, "DEPLOYMENT_READY");
  for (const extra of [{ deploymentId: "dpl_foreign" }, { projectId: "prj_foreign" }, { alias: "foreign.vercel.app" }, { redirect: "foreign.example" }, { deletedAt: 123 }]) {
    const h = harness();
    h.override((call) => call.url.pathname.startsWith("/v4/aliases/") ? Response.json({ alias: new URL(origin).hostname, projectId: vercelProject.id, deploymentId: resources.vercelDeploymentId, ...extra }) : undefined);
    await assert.rejects(h.provider.step(input("DEPLOYMENT_CREATED")), /VERIFICATION_FAILED/);
  }
});

test("public, foreign or broadly connected Blob stores are never adopted", async () => {
  for (const extra of [{ access: "public" }, { ownerId: "team_other" }, { projectId: "prj_other" },
    { projectsMetadata: [{ projectId: vercelProject.id, environments: ["production", "preview"] }] }]) {
    const h = harness(); h.override((call) => call.url.pathname === `/v1/storage/stores/${h.blobStore.id}`
      ? Response.json({ store: { ...h.blobStore, projectsMetadata: [{ projectId: vercelProject.id, environments: ["production"] }], ...extra } }) : undefined);
    await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /RESOURCE_CONFLICT/);
    assert.equal(h.calls.some((call) => call.method !== "GET"), false);
  }
});

test("HTTP-success bulk environment failures never advance to deployment", async () => {
  for (const response of [{ created: [], failed: [{ error: { code: "LIMIT", message: "private-provider-detail" } }] }, { created: [], failed: [] }]) {
    const h = harness(); h.override((call) => call.method === "POST" && call.url.pathname.endsWith("/env") ? Response.json(response, { status: 201 }) : undefined);
    await assert.rejects(h.provider.step(input("PROJECT_CREATED")), /PROVIDER_UNAVAILABLE|INVALID_PROVIDER_RESULT/);
    assert.equal(h.calls.some((call) => call.url.pathname.includes("deployments")), false);
  }
});

test("failed deployment retry creates a replacement pinned to the original approved commit", async () => {
  const h = harness(); h.override((call) => call.url.pathname === "/v7/deployments" ? Response.json({ deployments: [
    { uid: "dpl_failed", readyState: "ERROR", meta: { ggHubJobId: jobId } },
  ] }) : undefined);
  const result = await h.provider.step(input("ENVIRONMENT_CONFIGURED"));
  assert.equal(result.resources.vercelDeploymentId, "dpl_created");
  const posted = h.calls.find((call) => call.method === "POST")!.body as { gitSource: { sha: string; ref: string } };
  assert.equal(posted.gitSource.sha, resources.engineRef); assert.equal(posted.gitSource.ref, resources.engineRef);
});

test("retry never adopts another site's deployment even when job metadata collides", async () => {
  const h = harness(); h.override((call) => call.url.pathname === "/v7/deployments" ? Response.json({ deployments: [
    { uid: "dpl_foreign", projectId: vercelProject.id, readyState: "READY", meta: { ggHubJobId: jobId, ggHubCommunityId: ownerId, ggHubEngineRef: resources.engineRef } },
  ] }) : undefined);
  await assert.rejects(h.provider.step(input("ENVIRONMENT_CONFIGURED")), /RESOURCE_CONFLICT/);
  assert.equal(h.calls.some((call) => call.method !== "GET"), false);
});

test("bootstrap deadline closes the pinned connection before ending its pool", async () => {
  const h = harness(); h.hangBootstrap();
  const pending = assert.rejects(h.provider.step(input("DATABASE_CREATED")), /PROVIDER_UNAVAILABLE/);
  await h.expireDatabase(); await pending;
  assert.equal(h.connectionsCancelled(), 1); assert.equal(h.poolCloses(), 1);
});

test("activation completes from committed child state without a post-write HTTP failure window", async () => {
  const h = harness(); const result = await h.provider.step(input("QUEUED", "ACTIVATE_SITE"));
  assert.equal(result.completed, true); assert.equal(result.origin, origin);
  assert.equal(h.dbCalls.length, 1); assert.equal(h.dbCalls[0].action, "activate");
  assert.equal(JSON.stringify(h.dbCalls[0].setup), JSON.stringify({ siteId, ownerHubUserId: ownerId, observeOnly: false }));
  assert.equal(h.calls.some((call) => call.url.pathname === "/api/community-runtime"), false);
  assert.equal(h.poolCloses(), 1);
});

test("observe-only activation reconciles prior commits but never grants new public access", async () => {
  const active = harness(); active.alreadyActive();
  const observed = { ...input("QUEUED", "ACTIVATE_SITE"), activationMode: "OBSERVE_ONLY" as const };
  assert.equal((await active.provider.step(observed)).completed, true);
  assert.equal((active.dbCalls[0].setup as { observeOnly: boolean }).observeOnly, true);
  const awaiting = harness();
  await assert.rejects(awaiting.provider.step(observed), /ACTIVATION_NOT_APPLIED/);
  assert.equal((awaiting.dbCalls[0].setup as { observeOnly: boolean }).observeOnly, true);
});

test("health verification rejects wrong revision, identity or publication state", async () => {
  for (const extra of [{ revision: 5 }, { communityId: ownerId }, { publicationState: "ACTIVE" }]) {
    const h = harness(); h.override(() => Response.json({ communityId: siteId, revision: 4, publicationState: "AWAITING_OWNER", ...extra }));
    await assert.rejects(h.provider.step(input("DEPLOYMENT_READY")), /VERIFICATION_FAILED/);
  }
});

test("transport failures are classified without exposing raw provider URLs or secrets", async () => {
  const h = harness(); h.override(() => { throw new Error(`raw-provider-private-detail ${connection}`); });
  await assert.rejects(h.provider.step(input("QUEUED")), /^Error: PROVIDER_UNAVAILABLE$/);
});
