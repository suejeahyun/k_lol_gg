import { createHash, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { Pool, PoolClient } from "pg";
import { createPgPool, type V2Database } from "@/platform/db/database";
import { communitySsoClients } from "@/platform/db/schema";
import { CommunitySiteProvisioningError, type CommunitySiteProvisioningProvider, type CommunitySiteProvisioningStepInput } from "./provisioning-worker";
import { activateManagedSiteDatabase, initializeManagedSiteDatabase, publishManagedSiteConfiguration } from "./managed-site-database";

type ProviderEnvironment = Readonly<{
  vercelToken: string; teamId: string; neonToken: string; orgId: string; region: string;
  masterKey: Buffer; hubOrigin: string; repoId: string; engineRef: string;
}>;
type Json = Record<string, unknown>;
const API_TIMEOUT_MS = 8_000;
const DATABASE_TIMEOUT_MS = 85_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function identifier(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return value;
}
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return value as Json;
}
function text(value: unknown) {
  if (typeof value !== "string" || !value.length) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return value;
}
function rows(value: unknown): Json[] {
  if (!Array.isArray(value)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return value.map(object);
}
export function managedSiteProjectName(siteId: string, slug: string) {
  if (!UUID.test(siteId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return `ggc-${slug.slice(0, 20).replace(/-$/u, "")}-${siteId.replaceAll("-", "")}`;
}
export function readProvisioningEnvironment(environment: NodeJS.ProcessEnv = process.env): ProviderEnvironment {
  const key = environment.HUB_PROVISIONING_MASTER_KEY ?? "";
  const hubOrigin = environment.NEXT_PUBLIC_SITE_URL ?? "";
  if (environment.NEXT_PUBLIC_SERVICE_ID !== "hub" || environment.HUB_PROVISIONING_ENABLED !== "true"
    || !environment.HUB_VERCEL_TOKEN || !/^team_[A-Za-z0-9]+$/u.test(environment.HUB_VERCEL_TEAM_ID ?? "")
    || !environment.HUB_NEON_API_KEY || !/^org-[a-z0-9-]+$/u.test(environment.HUB_NEON_ORG_ID ?? "")
    || !/^[A-Za-z0-9_-]{43}$/u.test(key) || Buffer.from(key, "base64url").length !== 32 || Buffer.from(key, "base64url").toString("base64url") !== key
    || !/^[0-9]+$/u.test(environment.HUB_ENGINE_GITHUB_REPO_ID ?? "") || !/^[a-f0-9]{40}$/u.test(environment.HUB_ENGINE_GIT_REF ?? "")) {
    throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE");
  }
  let url: URL;
  try { url = new URL(hubOrigin); } catch { throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE"); }
  if (url.protocol !== "https:" || url.origin !== hubOrigin || url.username || url.password
    || !/^(?:aws|azure)-[a-z0-9-]+$/u.test(environment.HUB_NEON_REGION || "aws-ap-southeast-1")) throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE");
  return { vercelToken: environment.HUB_VERCEL_TOKEN, teamId: environment.HUB_VERCEL_TEAM_ID!, neonToken: environment.HUB_NEON_API_KEY,
    orgId: environment.HUB_NEON_ORG_ID!, region: environment.HUB_NEON_REGION || "aws-ap-southeast-1", masterKey: Buffer.from(key, "base64url"),
    hubOrigin, repoId: environment.HUB_ENGINE_GITHUB_REPO_ID!, engineRef: environment.HUB_ENGINE_GIT_REF! };
}

class VercelNeonProvisioningProvider implements CommunitySiteProvisioningProvider {
  constructor(private database: V2Database, private environment: ProviderEnvironment, private request: typeof fetch) {}
  private derive(siteId: string, purpose: string) { return createHmac("sha256", this.environment.masterKey).update(`gg-community:v1\0${siteId}\0${purpose}`).digest("base64url"); }
  private async api(provider: "vercel" | "neon", path: string, method = "GET", body?: unknown, allowMissing = false): Promise<Json | null> {
    const base = provider === "vercel" ? "https://api.vercel.com" : "https://console.neon.tech/api/v2";
    const url = new URL(base + path);
    if (provider === "vercel") url.searchParams.set("teamId", this.environment.teamId);
    let response: Response;
    try {
      response = await this.request(url, { method, headers: { Authorization: `Bearer ${provider === "vercel" ? this.environment.vercelToken : this.environment.neonToken}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(API_TIMEOUT_MS), redirect: "error", cache: "no-store" });
    } catch { throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE"); }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new CommunitySiteProvisioningError(response.status === 401 || response.status === 403 ? "PROVIDER_AUTH_FAILED" : response.status === 409 ? "RESOURCE_CONFLICT" : response.status === 429 || response.status === 402 ? "PROVIDER_LIMIT" : "PROVIDER_UNAVAILABLE");
    if (response.status === 204) return {};
    try { return object(await response.json()); } catch { throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT"); }
  }
  private neonProjectName(siteId: string) { return `GG-${siteId}-${this.derive(siteId, "neon-ownership").slice(0, 22)}`; }
  private async childConnection(siteId: string, resources: Readonly<Record<string, string>>) {
    const projectId = identifier(resources.neonProjectId, /^[a-z0-9-]+$/u);
    const details = object((await this.api("neon", `/projects/${projectId}`))?.project);
    if (details.id !== projectId || details.name !== this.neonProjectName(siteId) || details.org_id !== this.environment.orgId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    const result = await this.api("neon", `/projects/${projectId}/connection_uri?database_name=gg_community&role_name=gg_owner&pooled=false`);
    const uri = text(result?.uri);
    let parsed: URL;
    try { parsed = new URL(uri); } catch { throw new CommunitySiteProvisioningError("DATABASE_IDENTITY_MISMATCH"); }
    if (!parsed.hostname.endsWith(".neon.tech") || parsed.pathname !== "/gg_community" || parsed.username !== "gg_owner" || !parsed.password || parsed.hash
      || (parsed.port && parsed.port !== "5432") || !["postgres:", "postgresql:"].includes(parsed.protocol)
      || !["require", "verify-full"].includes(parsed.searchParams.get("sslmode") ?? "")
      || [...parsed.searchParams.keys()].some((key) => !["sslmode", "channel_binding"].includes(key) || parsed.searchParams.getAll(key).length !== 1)) throw new CommunitySiteProvisioningError("DATABASE_IDENTITY_MISMATCH");
    return uri;
  }
  private async withChildDatabase<T>(connection: string, work: (pool: Pool) => Promise<T>): Promise<T> {
    const pool = createPgPool(connection, { max: 1, connectionTimeoutMillis: 4_000, statement_timeout: 8_000, query_timeout: 9_000 });
    const clients = new Set<PoolClient>();
    pool.on("connect", (client) => clients.add(client));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([work(pool), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Ending the pinned connection cancels running SQL and rolls back its transaction.
          for (const client of clients) void client.end().catch(() => undefined);
          reject(new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE"));
        }, DATABASE_TIMEOUT_MS);
      })]);
    } finally { if (timer) clearTimeout(timer); await pool.end(); }
  }
  private async verifyVercelProject(siteId: string, projectName: string, projectId: string) {
    identifier(projectId, /^prj_[A-Za-z0-9]+$/u);
    const project = await this.api("vercel", `/v9/projects/${projectId}`);
    if (project?.id !== projectId || project.name !== projectName || project.accountId !== this.environment.teamId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    await this.verifyVercelMarker(siteId, projectId);
  }
  private async verifyVercelMarker(siteId: string, projectId: string) {
    const settings = await this.api("vercel", `/v9/projects/${projectId}/env`);
    const entries = rows(settings?.envs);
    for (const [key, value] of Object.entries({ HUB_MANAGED_COMMUNITY_ID: siteId, HUB_MANAGED_OWNERSHIP: this.derive(siteId, "vercel-ownership") })) {
      const markers = entries.filter((entry) => entry.key === key);
      if (markers.length !== 1 || markers[0].value !== value || !Array.isArray(markers[0].target) || !markers[0].target.includes("production")) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    }
  }
  private async ensureProductionDomain(projectId: string, name: string) {
    // Generated project aliases may be truncated or changed after a collision. Claim the exact
    // production origin before putting it into the child environment or central SSO registry.
    let domain = await this.api("vercel", `/v9/projects/${projectId}/domains/${name}`, "GET", undefined, true);
    if (!domain) domain = await this.api("vercel", `/v10/projects/${projectId}/domains`, "POST", { name });
    if (domain?.name !== name || domain.projectId !== projectId || domain.verified !== true
      || domain.redirect || domain.gitBranch || domain.customEnvironmentId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
  }
  private async ensurePrivateBlob(siteId: string, projectId: string, existingStoreId?: string) {
    const name = `GG-${siteId}-${this.derive(siteId, "blob-ownership").slice(0, 22)}`;
    const listing = await this.api("vercel", "/v1/storage/stores");
    const matches = rows(listing?.stores).filter((entry) => entry.name === name);
    if (matches.length > 1 || object(listing?.pagination ?? {}).next) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    let store = matches[0];
    if (existingStoreId && (!store || store.id !== existingStoreId)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    if (!store) {
      // Supplying projectId here would connect all environments automatically, including preview.
      store = object((await this.api("vercel", "/v1/storage/stores/blob", "POST", { name, region: "sin1", access: "private" }))?.store);
    }
    const storeId = identifier(store.id, /^store_[A-Za-z0-9]+$/u);
    const readOwnedStore = async () => {
      const value = object((await this.api("vercel", `/v1/storage/stores/${storeId}`))?.store);
      if (value.id !== storeId || value.name !== name || value.ownerId !== this.environment.teamId || value.type !== "blob" || value.access !== "private"
        || (value.projectId && value.projectId !== projectId)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      const connections = rows(value.projectsMetadata);
      if (connections.some((entry) => entry.projectId !== projectId || !Array.isArray(entry.environments)
        || entry.environments.length !== 1 || entry.environments[0] !== "production")) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      if (connections.length > 1) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      return connections;
    };
    let connections = await readOwnedStore();
    if (!connections.length) {
      await this.api("vercel", `/v1/storage/stores/${storeId}/connections`, "POST", { envVarEnvironments: ["production"], projectId, type: "integration" });
      connections = await readOwnedStore();
    }
    if (connections.length !== 1) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
    const readTokenMetadata = async () => {
      const settings = await this.api("vercel", `/v9/projects/${projectId}/env`);
      const tokens = rows(settings?.envs).filter((entry) => entry.key === "BLOB_READ_WRITE_TOKEN");
      if (tokens.length !== 1 || !Array.isArray(tokens[0].target) || tokens[0].target.length !== 1 || tokens[0].target[0] !== "production") throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      const hint = object(tokens[0].contentHint);
      if (hint.type !== "blob-read-write-token" || hint.storeId !== storeId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      return tokens[0];
    };
    let token = await readTokenMetadata();
    if (token.type !== "sensitive") {
      if (token.type !== "encrypted") throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      const tokenId = identifier(token.id, /^[A-Za-z0-9_]+$/u);
      // The provider never reads, copies or persists this store's actual read-write token.
      await this.api("vercel", `/v9/projects/${projectId}/env/${tokenId}`, "PATCH", { type: "sensitive" });
      token = await readTokenMetadata();
    }
    if (token.type !== "sensitive") throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
    return storeId;
  }
  async step(input: CommunitySiteProvisioningStepInput) {
    const { site, job } = input;
    const resources = { ...input.resources };
    const configuration = job.configuration;
    if (job.siteId !== site.id || !UUID.test(job.id) || !Number.isSafeInteger(job.siteRevision) || job.siteRevision < 1) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
    // No credential enrolment exists yet. An enabled flag must never imply a working Riot integration.
    if (configuration.modules.riotIntegration) throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE");
    const projectName = managedSiteProjectName(site.id, configuration.slug);
    const origin = `https://${projectName}.vercel.app`;
    for (const [key, pattern] of Object.entries({ neonProjectId: /^[a-z0-9-]+$/u, vercelProjectId: /^prj_[A-Za-z0-9]+$/u, vercelDeploymentId: /^dpl_[A-Za-z0-9]+$/u, blobStoreId: /^store_[A-Za-z0-9]+$/u, engineRef: /^[a-f0-9]{40}$/u })) {
      if (resources[key] !== undefined) identifier(resources[key], pattern);
    }
    if ((resources.projectName && resources.projectName !== projectName) || (site.origin && site.origin !== origin)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
    const ssoSecret = this.derive(site.id, "hub-client");
    const advance = (checkpoint: string, extra: Record<string, string> = {}) => ({ checkpoint, resources: { ...resources, ...extra } });
    if (job.kind === "ACTIVATE_SITE") {
      if (!site.origin || !resources.neonProjectId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      const result = await this.withChildDatabase(await this.childConnection(site.id, resources), (pool) => activateManagedSiteDatabase(pool, {
        siteId: site.id, ownerHubUserId: site.ownerUserAccountId, observeOnly: input.activationMode === "OBSERVE_ONLY",
      }));
      if (result.communityId !== site.id || result.revision !== job.siteRevision) throw new CommunitySiteProvisioningError("VERIFICATION_FAILED");
      if (result.publicationState === "AWAITING_OWNER" && input.activationMode === "OBSERVE_ONLY") throw new CommunitySiteProvisioningError("ACTIVATION_NOT_APPLIED");
      if (result.publicationState !== "ACTIVE") throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
      // The committed child state is the completion evidence. A later HTTP timeout cannot undo activation.
      return { ...advance("VERIFIED"), completed: true, origin: site.origin };
    }
    if (job.kind === "PUBLISH_CONFIGURATION") {
      if (!site.origin || !resources.neonProjectId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      await this.withChildDatabase(await this.childConnection(site.id, resources), (pool) => publishManagedSiteConfiguration(pool, { siteId: site.id, configuration, revision: job.siteRevision }));
      await this.verify(site.origin, site.id, job.siteRevision, "ACTIVE");
      return { ...advance("VERIFIED"), completed: true, origin: site.origin };
    }
    if (job.checkpoint === "QUEUED") {
      const name = this.neonProjectName(site.id);
      const list = await this.api("neon", `/projects?org_id=${encodeURIComponent(this.environment.orgId)}&search=${encodeURIComponent(name)}&limit=100`);
      const projects = rows(list?.projects);
      const matches = projects.filter((project) => project.name === name);
      // An incomplete search must never be treated as evidence that creation is safe.
      if (matches.length > 1 || projects.length >= 100 || (Array.isArray(list?.unavailable) && list.unavailable.length > 0)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      let project = matches[0];
      if (!project) {
        const created = await this.api("neon", "/projects", "POST", { project: { name, org_id: this.environment.orgId, region_id: this.environment.region, pg_version: 18,
          branch: { name: "production", database_name: "gg_community", role_name: "gg_owner" } } });
        project = object(created?.project);
      }
      if (project.name !== name || project.org_id !== this.environment.orgId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      return advance("DATABASE_CREATED", { neonProjectId: identifier(project.id, /^[a-z0-9-]+$/u), projectName, engineRef: this.environment.engineRef });
    }
    if (job.checkpoint === "DATABASE_CREATED") {
      try { await this.withChildDatabase(await this.childConnection(site.id, resources), (pool) => initializeManagedSiteDatabase(pool, { siteId: site.id, hubOrigin: this.environment.hubOrigin, ownerHubUserId: site.ownerUserAccountId, configuration, revision: job.siteRevision }, resolve(process.cwd(), "drizzle"))); }
      catch (error) { if (error instanceof Error && /IDENTITY|NOT_EMPTY/u.test(error.message)) throw new CommunitySiteProvisioningError("DATABASE_IDENTITY_MISMATCH"); throw error; }
      return advance("DATABASE_READY");
    }
    if (job.checkpoint === "DATABASE_READY") {
      let project = await this.api("vercel", `/v9/projects/${projectName}`, "GET", undefined, true);
      if (!project) project = await this.api("vercel", "/v11/projects", "POST", { name: projectName, framework: "nextjs", environmentVariables: [
        { key: "HUB_MANAGED_COMMUNITY_ID", value: site.id, type: "plain", target: ["production"] },
        { key: "HUB_MANAGED_OWNERSHIP", value: this.derive(site.id, "vercel-ownership"), type: "plain", target: ["production"] },
      ] });
      if (project?.name !== projectName || project.accountId !== this.environment.teamId) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      const projectId = identifier(project.id, /^prj_[A-Za-z0-9]+$/u);
      await this.verifyVercelMarker(site.id, projectId);
      return advance("PROJECT_CREATED", { vercelProjectId: projectId });
    }
    if (job.checkpoint === "PROJECT_CREATED") {
      const [, connection] = await Promise.all([
        this.verifyVercelProject(site.id, projectName, resources.vercelProjectId),
        this.childConnection(site.id, resources),
      ]);
      await this.ensureProductionDomain(resources.vercelProjectId, new URL(origin).hostname);
      const blobStoreId = await this.ensurePrivateBlob(site.id, resources.vercelProjectId, resources.blobStoreId);
      const signing = this.derive(site.id, "session");
      const totp = this.derive(site.id, "totp");
      const values: Record<string, string> = {
        NEXT_PUBLIC_SERVICE_ID: "community", NEXT_PUBLIC_COMMUNITY_ID: site.id, NEXT_PUBLIC_COMMUNITY_NAME: configuration.name,
        NEXT_PUBLIC_COMMUNITY_SHORT_NAME: configuration.name.slice(0, 24), NEXT_PUBLIC_SITE_URL: origin, V2_PUBLIC_ORIGIN: origin,
        COMMUNITY_DATABASE_URL: connection, COMMUNITY_HUB_ORIGIN: this.environment.hubOrigin, COMMUNITY_HUB_CLIENT_SECRET: ssoSecret,
        SESSION_SIGNING_KEYS: JSON.stringify({ current: "v1", keys: { v1: signing } }), TOTP_ENCRYPTION_KEYS: JSON.stringify({ current: 1, keys: { "1": totp } }),
        V2_AUTH_RATE_LIMIT_PEPPER: this.derive(site.id, "auth-rate-limit"), V2_PUBLIC_DATA_SOURCE: "postgres", V2_TEST_AUTH_ENABLED: "false",
        CRON_SECRET: this.derive(site.id, "cron"), V2_CRON_ENABLED: "true", V2_RIOT_INTEGRATION_ENABLED: "false", V2_OPENAI_COMPLETION_ENABLED: "false", KAKAO_SITE_NOTICE_ENABLED: "false", USAGE_ANALYTICS_ENABLED: "false",
      };
      const environmentResult = await this.api("vercel", `/v10/projects/${resources.vercelProjectId}/env?upsert=true`, "POST", Object.entries(values).map(([key, value]) => ({ key, value, type: key.includes("SECRET") || key.includes("KEYS") || key.includes("PEPPER") || key.endsWith("DATABASE_URL") ? "sensitive" : "plain", target: ["production"] })));
      // Vercel can return HTTP 201 with individual failed writes in a bulk request.
      if (rows(environmentResult?.failed).length) throw new CommunitySiteProvisioningError("PROVIDER_UNAVAILABLE");
      const createdKeys = new Set(rows(environmentResult?.created).map((entry) => entry.key));
      if (Object.keys(values).some((key) => !createdKeys.has(key))) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
      const secretHash = createHash("sha256").update(`gg-hub:sso-client:v1\0${ssoSecret}`).digest();
      await this.database.insert(communitySsoClients).values({ siteId: site.id, secretHash }).onConflictDoNothing();
      const client = (await this.database.select().from(communitySsoClients).where(eq(communitySsoClients.siteId, site.id)))[0];
      if (!client || client.revokedAt || !Buffer.from(client.secretHash).equals(secretHash)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      return advance("ENVIRONMENT_CONFIGURED", { blobStoreId });
    }
    if (job.checkpoint === "ENVIRONMENT_CONFIGURED") {
      await this.verifyVercelProject(site.id, projectName, resources.vercelProjectId);
      identifier(resources.engineRef, /^[a-f0-9]{40}$/u);
      const list = await this.api("vercel", `/v7/deployments?projectId=${resources.vercelProjectId}&limit=100`);
      const matches = rows(list?.deployments).filter((deployment) => object(deployment.meta ?? {}).ggHubJobId === job.id && !["ERROR", "CANCELED"].includes(String(deployment.readyState ?? deployment.state)));
      if (matches.length > 1 || object(list?.pagination ?? {}).next) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      let deployment = matches[0];
      if (deployment && (deployment.projectId !== resources.vercelProjectId || object(deployment.meta).ggHubCommunityId !== site.id || object(deployment.meta).ggHubEngineRef !== resources.engineRef)) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      if (!deployment) deployment = (await this.api("vercel", "/v13/deployments", "POST", { name: projectName, project: resources.vercelProjectId, target: "production",
        gitSource: { type: "github", repoId: this.environment.repoId, ref: resources.engineRef, sha: resources.engineRef },
        projectSettings: { framework: "nextjs", buildCommand: "npm run build", installCommand: "npm ci" },
        meta: { ggHubJobId: job.id, ggHubCommunityId: site.id, ggHubEngineRef: resources.engineRef },
      }))!;
      return advance("DEPLOYMENT_CREATED", { vercelDeploymentId: identifier(deployment.id ?? deployment.uid, /^dpl_[A-Za-z0-9]+$/u) });
    }
    if (job.checkpoint === "DEPLOYMENT_CREATED") {
      identifier(resources.vercelProjectId, /^prj_[A-Za-z0-9]+$/u);
      identifier(resources.vercelDeploymentId, /^dpl_[A-Za-z0-9]+$/u);
      identifier(resources.engineRef, /^[a-f0-9]{40}$/u);
      const deployment = await this.api("vercel", `/v13/deployments/${resources.vercelDeploymentId}`);
      const meta = object(deployment?.meta ?? {});
      if (deployment?.projectId !== resources.vercelProjectId || meta.ggHubCommunityId !== site.id || meta.ggHubJobId !== job.id || meta.ggHubEngineRef !== resources.engineRef) throw new CommunitySiteProvisioningError("RESOURCE_CONFLICT");
      if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") throw new CommunitySiteProvisioningError("PROVISIONING_FAILED");
      if (deployment.readyState !== "READY") return { ...advance("DEPLOYMENT_CREATED"), pending: true };
      // deployment.alias is a creation-time snapshot and does not include domains added later.
      // The live alias target proves that the expected origin serves this exact deployment.
      const alias = await this.api("vercel", `/v4/aliases/${new URL(origin).hostname}`);
      if (alias?.alias !== new URL(origin).hostname || alias.projectId !== resources.vercelProjectId
        || alias.deploymentId !== resources.vercelDeploymentId || alias.redirect || alias.deletedAt) throw new CommunitySiteProvisioningError("VERIFICATION_FAILED");
      return advance("DEPLOYMENT_READY");
    }
    if (job.checkpoint === "DEPLOYMENT_READY" || job.checkpoint === "VERIFIED") {
      await this.verify(origin, site.id, job.siteRevision, "AWAITING_OWNER");
      return { ...advance("VERIFIED"), completed: true, origin };
    }
    throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  }
  private async verify(origin: string, siteId: string, revision: number, publicationState: "AWAITING_OWNER" | "ACTIVE") {
    let response: Response;
    try { response = await this.request(`${origin}/api/community-runtime`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(API_TIMEOUT_MS) }); }
    catch { throw new CommunitySiteProvisioningError("VERIFICATION_FAILED"); }
    if (!response.ok) throw new CommunitySiteProvisioningError("VERIFICATION_FAILED");
    let data: Json;
    try { data = object(await response.json()); } catch { throw new CommunitySiteProvisioningError("VERIFICATION_FAILED"); }
    if (data.communityId !== siteId || data.revision !== revision || data.publicationState !== publicationState) throw new CommunitySiteProvisioningError("VERIFICATION_FAILED");
  }
}

export function createVercelNeonProvisioningProvider(database: V2Database, environment: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): CommunitySiteProvisioningProvider {
  return new VercelNeonProvisioningProvider(database, readProvisioningEnvironment(environment), request);
}
