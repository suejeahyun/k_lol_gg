import { randomUUID } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";
import { userAccounts } from "@/platform/db/schema/auth";
import { auditEvents } from "@/platform/db/schema/audit";
import { communitySiteProvisioningJobs, communitySites } from "@/platform/db/schema/community-sites";
import type { CommunitySite, CommunitySiteJobKind } from "../domain/community-site";
import { validateCommunitySiteConfig, type CommunitySiteConfig } from "../domain/site-configuration";

export const COMMUNITY_SITE_PROVISIONING_CHECKPOINTS = ["QUEUED", "DATABASE_CREATED", "DATABASE_READY", "PROJECT_CREATED", "ENVIRONMENT_CONFIGURED", "DEPLOYMENT_CREATED", "DEPLOYMENT_READY", "VERIFIED"] as const;
export const COMMUNITY_SITE_PROVISIONING_ERROR_CODES = ["PROVIDER_UNAVAILABLE", "PROVIDER_LIMIT", "PROVIDER_AUTH_FAILED", "PROVISIONING_FAILED", "VERIFICATION_FAILED", "INVALID_PROVIDER_RESULT", "OWNER_UNAVAILABLE", "SITE_STATE_CHANGED", "DATABASE_IDENTITY_MISMATCH", "RESOURCE_CONFLICT", "ACTIVATION_NOT_APPLIED"] as const;
export type CommunitySiteProvisioningErrorCode = typeof COMMUNITY_SITE_PROVISIONING_ERROR_CODES[number];
export class CommunitySiteProvisioningError extends Error {
  constructor(readonly code: CommunitySiteProvisioningErrorCode) { super(code); }
}
export type CommunitySiteProvisioningStepInput = Readonly<{
  site: CommunitySite;
  job: Readonly<{ id: string; siteId: string; kind: CommunitySiteJobKind; configuration: CommunitySiteConfig; siteRevision: number; checkpoint: string; attemptCount: number }>;
  resources: Readonly<Record<string, string>>;
  /** Observe a previously accepted activation without authorizing any new child publication write. */
  activationMode?: "APPLY" | "OBSERVE_ONLY";
}>;
export type CommunitySiteProvisioningStepResult = Readonly<{
  checkpoint: string; resources: Readonly<Record<string, string>>; pending?: boolean; origin?: string; completed?: boolean;
}>;
export interface CommunitySiteProvisioningProvider {
  step(input: CommunitySiteProvisioningStepInput): Promise<CommunitySiteProvisioningStepResult>;
}
export type CommunitySiteProvisioningRunResult = Readonly<{
  kind: "idle" | "pending" | "progress" | "completed" | "failed" | "lost_lease";
  jobId?: string; errorCode?: CommunitySiteProvisioningErrorCode;
}>;
type JobRow = typeof communitySiteProvisioningJobs.$inferSelect;
type SiteRow = typeof communitySites.$inferSelect;
// Exceeds the cron's 180-second execution limit, so another worker cannot claim live provider work.
const LEASE_SECONDS = 240;
const POLL_DELAY_MS = 15_000;

/** Public provider state contains identifiers only. Credentials stay in provider-owned secret storage. */
export function validateProvisioningStepResult(previous: string, value: CommunitySiteProvisioningStepResult): CommunitySiteProvisioningStepResult {
  const before = (COMMUNITY_SITE_PROVISIONING_CHECKPOINTS as readonly string[]).indexOf(previous);
  const after = (COMMUNITY_SITE_PROVISIONING_CHECKPOINTS as readonly string[]).indexOf(value?.checkpoint);
  if (before < 0 || after < before || !value.resources || typeof value.resources !== "object" || Array.isArray(value.resources)
    || Object.keys(value.resources).length > 30 || (value.pending !== undefined && typeof value.pending !== "boolean")
    || (value.completed !== undefined && typeof value.completed !== "boolean") || (after === before && !value.pending && !value.completed)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  for (const [key, resource] of Object.entries(value.resources)) {
    if (!/^[a-z][a-zA-Z0-9]{0,63}$/u.test(key) || /token|password|secret|credential|connection|databaseUrl|privateKey/iu.test(key)
      || typeof resource !== "string" || resource.length < 1 || resource.length > 500 || /[\u0000-\u001f\u007f]/u.test(resource)
      || /^(?:postgres(?:ql)?:|Bearer\s)/iu.test(resource)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  }
  if (value.origin !== undefined) {
    let parsed: URL;
    try { parsed = new URL(value.origin); } catch { throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT"); }
    if (value.origin.length > 300 || parsed.protocol !== "https:" || parsed.origin !== value.origin || parsed.username || parsed.password) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  }
  if (value.completed && (value.checkpoint !== "VERIFIED" || !value.origin || value.pending)) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
  return value;
}
function siteDto(row: SiteRow): CommunitySite {
  return { id: row.id, ownerUserAccountId: row.ownerUserAccountId, configuration: validateCommunitySiteConfig(row.configurationJson),
    publishedConfiguration: row.publishedConfigurationJson ? validateCommunitySiteConfig(row.publishedConfigurationJson) : null,
    status: row.status, revision: row.revision, reviewReason: row.reviewReason, origin: row.origin,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), latestJob: null };
}
function stateAllowsJob(site: SiteRow, job: JobRow) {
  if (job.kind === "PROVISION") return site.status === "APPROVED" || site.status === "PROVISIONING";
  return job.kind === "ACTIVATE_SITE" ? site.status === "ACTIVATING" : site.status === "ACTIVE";
}
async function markFailed(transaction: V2Transaction, site: SiteRow, job: JobRow, code: CommunitySiteProvisioningErrorCode, resources?: Record<string, string>) {
  const now = new Date();
  await transaction.update(communitySiteProvisioningJobs).set({ status: "FAILED", errorCode: code, leaseToken: null, leaseExpiresAt: null,
    updatedAt: now, completedAt: now, ...(resources ? { resourceJson: resources } : {}) }).where(eq(communitySiteProvisioningJobs.id, job.id));
  if (job.kind === "PROVISION" && (site.status === "APPROVED" || site.status === "PROVISIONING")) {
    await transaction.update(communitySites).set({ status: "FAILED", revision: site.revision + 1, updatedAt: now }).where(eq(communitySites.id, site.id));
  }
  if (job.kind === "ACTIVATE_SITE" && code === "ACTIVATION_NOT_APPLIED" && site.status === "ACTIVATING") {
    // Only a verified observation of the private child permits a return to owner acceptance.
    await transaction.update(communitySites).set({ status: "AWAITING_OWNER", revision: site.revision + 1, updatedAt: now }).where(eq(communitySites.id, site.id));
  }
  await transaction.insert(auditEvents).values({ requestId: randomUUID(), action: "COMMUNITY_SITE_PROVISIONING_FAILED", targetType: "COMMUNITY_SITE", targetId: site.id,
    beforeJson: { status: site.status, checkpoint: job.checkpoint }, afterJson: { errorCode: code }, metadataJson: { jobId: job.id, kind: job.kind }, createdAt: now });
}
async function claim(database: V2Database) {
  return withTransaction(database, async (transaction) => {
    const due = or(and(eq(communitySiteProvisioningJobs.status, "PENDING"), sql`${communitySiteProvisioningJobs.nextAttemptAt} <= clock_timestamp()`),
      and(eq(communitySiteProvisioningJobs.status, "RUNNING"), sql`${communitySiteProvisioningJobs.leaseExpiresAt} < clock_timestamp()`));
    const candidates = await transaction.select({ job: communitySiteProvisioningJobs, ownerId: communitySites.ownerUserAccountId })
      .from(communitySiteProvisioningJobs).innerJoin(communitySites, eq(communitySites.id, communitySiteProvisioningJobs.siteId))
      .where(due).orderBy(asc(communitySiteProvisioningJobs.nextAttemptAt), asc(communitySiteProvisioningJobs.createdAt)).limit(10);
    for (const candidate of candidates) {
      // Match mutation lock ordering: account -> site -> job. Skip busy owners/sites rather than invert those locks.
      const owner = (await transaction.select().from(userAccounts).where(eq(userAccounts.id, candidate.ownerId)).for("update", { skipLocked: true }).limit(1))[0];
      if (!owner) continue;
      const site = (await transaction.select().from(communitySites).where(eq(communitySites.id, candidate.job.siteId)).for("update", { skipLocked: true }).limit(1))[0];
      if (!site || site.ownerUserAccountId !== owner.id) continue;
      const job = (await transaction.select().from(communitySiteProvisioningJobs).where(and(eq(communitySiteProvisioningJobs.id, candidate.job.id), due)).for("update", { skipLocked: true }).limit(1))[0];
      if (!job) continue;
      const ownerUnavailable = !!owner.deletedAt || owner.status !== "APPROVED";
      const errorCode: CommunitySiteProvisioningErrorCode | null = !stateAllowsJob(site, job) ? "SITE_STATE_CHANGED" : ownerUnavailable && job.kind !== "ACTIVATE_SITE" ? "OWNER_UNAVAILABLE" : null;
      if (errorCode) {
        await markFailed(transaction, site, job, errorCode);
        return { kind: "failed" as const, jobId: job.id, errorCode };
      }
      const leaseToken = randomUUID();
      const [claimed] = await transaction.update(communitySiteProvisioningJobs).set({ status: "RUNNING", leaseToken,
        leaseExpiresAt: sql`clock_timestamp() + (${LEASE_SECONDS} * interval '1 second')`, attemptCount: job.attemptCount + 1,
        updatedAt: new Date(), errorCode: null }).where(eq(communitySiteProvisioningJobs.id, job.id)).returning();
      let currentSite = site;
      if (job.kind === "PROVISION" && site.status === "APPROVED") {
        [currentSite] = await transaction.update(communitySites).set({ status: "PROVISIONING", revision: site.revision + 1, updatedAt: new Date() })
          .where(eq(communitySites.id, site.id)).returning();
      }
      return { kind: "claimed" as const, site: currentSite!, job: claimed!, leaseToken, activationMode: ownerUnavailable ? "OBSERVE_ONLY" as const : "APPLY" as const };
    }
    return { kind: "idle" as const };
  });
}

/** One bounded provider step; cron invocations can overlap safely and expired leases can resume. */
export async function runNextCommunitySiteProvisioningJob(database: V2Database, provider: CommunitySiteProvisioningProvider): Promise<CommunitySiteProvisioningRunResult> {
  const claimed = await claim(database);
  if (claimed.kind !== "claimed") return claimed;
  let result: CommunitySiteProvisioningStepResult | undefined;
  let failure: CommunitySiteProvisioningErrorCode | undefined;
  try {
    result = validateProvisioningStepResult(claimed.job.checkpoint, await provider.step({ site: siteDto(claimed.site),
      job: { id: claimed.job.id, siteId: claimed.job.siteId, kind: claimed.job.kind, configuration: validateCommunitySiteConfig(claimed.job.configurationJson),
        siteRevision: claimed.job.siteRevision, checkpoint: claimed.job.checkpoint, attemptCount: claimed.job.attemptCount }, resources: claimed.job.resourceJson,
      ...(claimed.job.kind === "ACTIVATE_SITE" ? { activationMode: claimed.activationMode } : {}) }));
  } catch (error) {
    failure = error instanceof CommunitySiteProvisioningError && (COMMUNITY_SITE_PROVISIONING_ERROR_CODES as readonly string[]).includes(error.code) ? error.code : "PROVISIONING_FAILED";
  }
  return withTransaction(database, async (transaction) => {
    const owner = (await transaction.select().from(userAccounts).where(eq(userAccounts.id, claimed.site.ownerUserAccountId)).for("update").limit(1))[0];
    const site = (await transaction.select().from(communitySites).where(eq(communitySites.id, claimed.site.id)).for("update").limit(1))[0];
    const job = (await transaction.select().from(communitySiteProvisioningJobs).where(and(eq(communitySiteProvisioningJobs.id, claimed.job.id),
      eq(communitySiteProvisioningJobs.status, "RUNNING"), eq(communitySiteProvisioningJobs.leaseToken, claimed.leaseToken),
      sql`${communitySiteProvisioningJobs.leaseExpiresAt} > clock_timestamp()`)).for("update").limit(1))[0];
    if (!job || !site) return { kind: "lost_lease", jobId: claimed.job.id };
    const identityChanged = !!result && Object.entries(job.resourceJson).some(([key, resource]) => /(?:projectId|branchId|endpointId|databaseName|storeId)$/iu.test(key)
      && result.resources[key] !== undefined && result.resources[key] !== resource);
    const resources = identityChanged ? job.resourceJson : { ...job.resourceJson, ...(result?.resources ?? {}) };
    if (identityChanged) failure = "RESOURCE_CONFLICT";
    const ownerUnavailable = !owner || !!owner.deletedAt || owner.status !== "APPROVED";
    // Once the child has committed publication, a later account revocation cannot undo that fact.
    // Record the observed external result; a future claim with a revoked owner can only observe.
    if (ownerUnavailable && job.kind !== "ACTIVATE_SITE") failure = "OWNER_UNAVAILABLE";
    else if (site.ownerUserAccountId !== claimed.site.ownerUserAccountId || !stateAllowsJob(site, job)) failure = "SITE_STATE_CHANGED";
    if (result?.completed && job.kind !== "PROVISION" && result.origin !== site.origin) failure = "RESOURCE_CONFLICT";
    if (failure) {
      if (job.kind === "ACTIVATE_SITE" && failure !== "ACTIVATION_NOT_APPLIED" && stateAllowsJob(site, job)) {
        const now = new Date();
        const delay = Math.min(900_000, 15_000 * 2 ** Math.min(job.attemptCount - 1, 6));
        await transaction.update(communitySiteProvisioningJobs).set({ status: "PENDING", errorCode: failure, resourceJson: resources,
          leaseToken: null, leaseExpiresAt: null, updatedAt: now, nextAttemptAt: new Date(now.getTime() + delay) }).where(eq(communitySiteProvisioningJobs.id, job.id));
        await transaction.insert(auditEvents).values({ requestId: randomUUID(), action: "COMMUNITY_SITE_ACTIVATION_RECONCILIATION_PENDING",
          targetType: "COMMUNITY_SITE", targetId: site.id, beforeJson: { status: site.status }, afterJson: { status: "ACTIVATING", errorCode: failure },
          metadataJson: { jobId: job.id, activationMode: claimed.activationMode, ownerUnavailable }, createdAt: now });
        return { kind: "pending", jobId: job.id, errorCode: failure };
      }
      await markFailed(transaction, site, job, failure, resources);
      return { kind: "failed", jobId: job.id, errorCode: failure };
    }
    if (!result) throw new CommunitySiteProvisioningError("INVALID_PROVIDER_RESULT");
    const now = new Date();
    await transaction.update(communitySiteProvisioningJobs).set({ resourceJson: resources, checkpoint: result.checkpoint,
      status: result.completed ? "SUCCEEDED" : "PENDING", leaseToken: null, leaseExpiresAt: null, errorCode: null,
      updatedAt: now, completedAt: result.completed ? now : null, nextAttemptAt: new Date(now.getTime() + (result.pending ? POLL_DELAY_MS : 0)) })
      .where(eq(communitySiteProvisioningJobs.id, job.id));
    if (result.completed) {
      await transaction.update(communitySites).set({ status: job.kind === "PROVISION" ? "AWAITING_OWNER" : "ACTIVE",
        origin: result.origin!, ...(job.kind === "ACTIVATE_SITE" ? {} : { publishedConfigurationJson: validateCommunitySiteConfig(job.configurationJson) }),
        revision: site.revision + 1, updatedAt: now }).where(eq(communitySites.id, site.id));
    }
    await transaction.insert(auditEvents).values({ requestId: randomUUID(), action: result.completed ? "COMMUNITY_SITE_PROVISIONING_COMPLETED" : "COMMUNITY_SITE_PROVISIONING_PROGRESS",
      targetType: "COMMUNITY_SITE", targetId: site.id, beforeJson: { status: site.status, checkpoint: job.checkpoint },
      afterJson: { checkpoint: result.checkpoint, completed: result.completed === true },
      metadataJson: { jobId: job.id, kind: job.kind, ...(job.kind === "ACTIVATE_SITE" ? { activationMode: claimed.activationMode, ownerUnavailable, publicationDecision: "CHILD_COMMITTED_STATE_OBSERVED" } : {}) }, createdAt: now });
    return { kind: result.completed ? "completed" : result.pending ? "pending" : "progress", jobId: job.id };
  });
}
