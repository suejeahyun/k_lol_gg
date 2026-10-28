import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ADMIN_MUTATION_SESSION_POLICY, APPROVED_ACCOUNT_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { V2Database } from "@/platform/db/database";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";
import { auditEvents } from "@/platform/db/schema/audit";
import { networkCommunities } from "@/platform/db/schema/community-network";
import { communitySiteCommandReceipts, communitySiteProvisioningJobs, communitySites } from "@/platform/db/schema/community-sites";
import type { CommunitySiteCommandMetadata, CommunitySiteCommandResult, CommunitySitesRepository } from "../application/ports";
import {
  assertCommunitySiteRevision, CommunitySiteError, ownerCommunitySiteTransition, parseCommunitySiteId,
  parseCreateCommunitySiteCommand, parseOwnerCommunitySiteCommand, parseReviewCommunitySiteCommand,
  reviewCommunitySiteTransition, type CommunityPublicSite, type CommunitySite, type CommunitySiteJobSummary,
} from "../domain/community-site";
import { validateCommunitySiteConfig } from "../domain/site-configuration";

type SiteRow = typeof communitySites.$inferSelect;
type JobRow = typeof communitySiteProvisioningJobs.$inferSelect;
type Scope = "owner" | "admin";
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

function jobSummary(job: JobRow): CommunitySiteJobSummary {
  return { id: job.id, kind: job.kind, status: job.status, checkpoint: job.checkpoint,
    attemptCount: job.attemptCount, errorCode: job.errorCode, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString() };
}
function siteDto(row: SiteRow, job?: JobRow): CommunitySite {
  return { id: row.id, ownerUserAccountId: row.ownerUserAccountId, configuration: validateCommunitySiteConfig(row.configurationJson),
    publishedConfiguration: row.publishedConfigurationJson ? validateCommunitySiteConfig(row.publishedConfigurationJson) : null,
    status: row.status, revision: row.revision, reviewReason: row.reviewReason, origin: row.origin,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), latestJob: job ? jobSummary(job) : null };
}
async function authorize(transaction: V2Transaction, actor: TransactionSessionActor, scope: Scope) {
  const current = await lockTransactionSessionActor(transaction, actor, new Date(), scope === "admin"
    ? { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: "SUPER_ADMIN" }
    : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY);
  if (!current) throw new CommunitySiteError("SESSION_STALE");
  return current;
}
async function readSite(transaction: V2Transaction, id: string, ownerId?: string) {
  const row = (await transaction.select().from(communitySites).where(and(eq(communitySites.id, id),
    ownerId ? eq(communitySites.ownerUserAccountId, ownerId) : undefined)).for("update").limit(1))[0];
  if (!row) throw new CommunitySiteError("COMMUNITY_SITE_NOT_FOUND");
  return row;
}
async function readDto(transaction: V2Transaction, row: SiteRow) {
  const job = (await transaction.select().from(communitySiteProvisioningJobs).where(eq(communitySiteProvisioningJobs.siteId, row.id))
    .orderBy(desc(communitySiteProvisioningJobs.createdAt), desc(communitySiteProvisioningJobs.id)).limit(1))[0];
  return siteDto(row, job);
}
function uniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || (!!candidate.cause && candidate.cause !== error && uniqueViolation(candidate.cause));
}
async function checkRegistrySlug(transaction: V2Transaction, slug: string, siteId?: string) {
  const row = (await transaction.select({ id: networkCommunities.id }).from(networkCommunities).where(eq(networkCommunities.slug, slug)).limit(1))[0];
  if (row && row.id !== siteId) throw new CommunitySiteError("COMMUNITY_SITE_UNIQUE_CONFLICT");
}

export class PostgresCommunitySitesRepository implements CommunitySitesRepository {
  constructor(private readonly database: V2Database) {}

  async getPublicSites(): Promise<CommunityPublicSite[]> {
    // Only the currently published public fields: never expose draft settings, ownership, jobs or provider resources.
    const rows = await this.database.select({ id: communitySites.id, origin: communitySites.origin,
      name: sql<string>`${communitySites.publishedConfigurationJson}->>'name'`,
      description: sql<string>`${communitySites.publishedConfigurationJson}->>'description'` }).from(communitySites)
      .where(eq(communitySites.status, "ACTIVE")).orderBy(asc(communitySites.createdAt), asc(communitySites.id));
    return rows.map((row) => ({ id: row.id, name: row.name, description: row.description, origin: row.origin! }));
  }

  async listSites(actor: TransactionSessionActor, scope: Scope): Promise<CommunitySite[]> {
    return withTransaction(this.database, async (transaction) => {
      const account = await authorize(transaction, actor, scope);
      const rows = await transaction.select().from(communitySites)
        .where(scope === "owner" ? eq(communitySites.ownerUserAccountId, account.id) : undefined)
        .orderBy(desc(communitySites.updatedAt), desc(communitySites.id));
      if (!rows.length) return [];
      const jobs = await transaction.select().from(communitySiteProvisioningJobs).where(inArray(communitySiteProvisioningJobs.siteId, rows.map((row) => row.id)))
        .orderBy(desc(communitySiteProvisioningJobs.createdAt), desc(communitySiteProvisioningJobs.id));
      const latest = new Map<string, JobRow>();
      for (const job of jobs) if (!latest.has(job.siteId)) latest.set(job.siteId, job);
      return rows.map((row) => siteDto(row, latest.get(row.id)));
    });
  }

  async getSite(actor: TransactionSessionActor, id: string, scope: Scope): Promise<CommunitySite> {
    parseCommunitySiteId(id);
    return withTransaction(this.database, async (transaction) => {
      const account = await authorize(transaction, actor, scope);
      return readDto(transaction, await readSite(transaction, id, scope === "owner" ? account.id : undefined));
    });
  }

  private async mutate(input: { actor: TransactionSessionActor; id?: string; metadata: CommunitySiteCommandMetadata; scope: Scope;
    apply: (transaction: V2Transaction, current: SiteRow | null, actorId: string, now: Date) => Promise<SiteRow>; action: string }) {
    try {
      return await withTransaction(this.database, async (transaction): Promise<CommunitySiteCommandResult> => {
        const account = await authorize(transaction, input.actor, input.scope);
        if (!/^[a-f0-9]{64}$/u.test(input.metadata.requestHashHex)) throw new CommunitySiteError("INVALID_REQUEST_HASH");
        const keyHash = createHash("sha256").update(`community-sites:v1\0${input.metadata.requestKey}`).digest();
        const requestHash = Buffer.from(input.metadata.requestHashHex, "hex");
        const receiptWhere = and(eq(communitySiteCommandReceipts.actorUserAccountId, account.id), eq(communitySiteCommandReceipts.keyHash, keyHash));
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`community-sites:${account.id}:${keyHash.toString("hex")}`}, 0))`);
        const receipt = (await transaction.select().from(communitySiteCommandReceipts).where(receiptWhere).limit(1))[0];
        if (receipt && receipt.expiresAt > new Date()) {
          if (!Buffer.from(receipt.requestHash).equals(requestHash)) throw new CommunitySiteError("IDEMPOTENCY_MISMATCH");
          // Ownership can change after a successful request. Replays must re-check it too.
          await readSite(transaction, receipt.siteId, input.scope === "owner" ? account.id : undefined);
          return { status: receipt.responseStatus, body: receipt.responseJson as { site: CommunitySite }, revision: receipt.revision, replayed: true };
        }
        const current = input.id ? await readSite(transaction, input.id, input.scope === "owner" ? account.id : undefined) : null;
        assertCommunitySiteRevision(current?.revision ?? 0, input.metadata.expectedRevision);
        const now = new Date();
        const next = await input.apply(transaction, current, account.id, now);
        const site = await readDto(transaction, next);
        const body = { site };
        const status = current ? 200 : 201;
        await transaction.delete(communitySiteCommandReceipts).where(receiptWhere);
        await transaction.insert(communitySiteCommandReceipts).values({ id: randomUUID(), actorUserAccountId: account.id, siteId: site.id,
          keyHash, requestHash, responseJson: body, responseStatus: status, revision: site.revision, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL_MS) });
        await transaction.insert(auditEvents).values({ requestId: input.metadata.requestId, actorUserAccountId: account.id,
          action: `COMMUNITY_SITE_${input.action}`, targetType: "COMMUNITY_SITE", targetId: site.id,
          beforeJson: current ? { revision: current.revision, status: current.status } : null,
          afterJson: { revision: site.revision, status: site.status, templateId: site.configuration.templateId },
          metadataJson: { providerMutationPerformed: false }, createdAt: now });
        return { status, body, revision: site.revision, replayed: false };
      });
    } catch (error) {
      if (uniqueViolation(error)) throw new CommunitySiteError("COMMUNITY_SITE_UNIQUE_CONFLICT");
      throw error;
    }
  }

  async createSite(input: Parameters<CommunitySitesRepository["createSite"]>[0]) {
    const command = parseCreateCommunitySiteCommand(input.command);
    return this.mutate({ ...input, scope: "owner", action: "SUBMITTED", apply: async (transaction, _current, actorId, now) => {
      await checkRegistrySlug(transaction, command.configuration.slug);
      const [created] = await transaction.insert(communitySites).values({ id: randomUUID(), ownerUserAccountId: actorId,
        slug: command.configuration.slug, configurationJson: command.configuration, status: "SUBMITTED", revision: 1, createdAt: now, updatedAt: now }).returning();
      return created!;
    } });
  }

  async updateSite(input: Parameters<CommunitySitesRepository["updateSite"]>[0]) {
    const id = parseCommunitySiteId(input.id);
    const command = parseOwnerCommunitySiteCommand(input.command);
    return this.mutate({ ...input, id, scope: "owner", action: command.action.toUpperCase(), apply: async (transaction, current, actorId, now) => {
      if (!current) throw new CommunitySiteError("COMMUNITY_SITE_NOT_FOUND");
      const status = ownerCommunitySiteTransition(current.status, command);
      const configuration = command.action === "update" ? command.configuration : validateCommunitySiteConfig(current.configurationJson);
      // Deployed addresses are stable identities; changing a live slug needs a separate verified domain workflow.
      if (current.status === "ACTIVE" && configuration.slug !== current.slug) throw new CommunitySiteError("COMMUNITY_SITE_SLUG_LOCKED");
      if (status !== "CANCELLED" && status !== "REJECTED") await checkRegistrySlug(transaction, configuration.slug, current.id);
      if (command.action === "activate" && (!current.origin || !current.publishedConfigurationJson)) throw new CommunitySiteError("COMMUNITY_SITE_STATE_CONFLICT");
      if (command.action === "publish" || command.action === "activate") {
        const active = (await transaction.select({ id: communitySiteProvisioningJobs.id }).from(communitySiteProvisioningJobs)
          .where(and(eq(communitySiteProvisioningJobs.siteId, id), inArray(communitySiteProvisioningJobs.status, ["PENDING", "RUNNING"]))).limit(1))[0];
        if (active) throw new CommunitySiteError("COMMUNITY_SITE_JOB_IN_PROGRESS");
        const lastProvision = (await transaction.select().from(communitySiteProvisioningJobs)
          .where(and(eq(communitySiteProvisioningJobs.siteId, id), eq(communitySiteProvisioningJobs.kind, "PROVISION"), eq(communitySiteProvisioningJobs.status, "SUCCEEDED")))
          .orderBy(desc(communitySiteProvisioningJobs.createdAt)).limit(1))[0];
        if (!lastProvision) throw new CommunitySiteError("COMMUNITY_SITE_STATE_CONFLICT");
        // Keep stable provider identities; a new publication must not mistake an older deployment for its own result.
        const resources = Object.fromEntries(Object.entries(lastProvision.resourceJson).filter(([key]) => !/deployment/i.test(key)));
        const failedActivation = command.action === "activate" ? (await transaction.select().from(communitySiteProvisioningJobs)
          .where(and(eq(communitySiteProvisioningJobs.siteId, id), eq(communitySiteProvisioningJobs.kind, "ACTIVATE_SITE"), eq(communitySiteProvisioningJobs.status, "FAILED")))
          .orderBy(desc(communitySiteProvisioningJobs.createdAt)).for("update").limit(1))[0] : undefined;
        if (failedActivation) {
          await transaction.update(communitySiteProvisioningJobs).set({ status: "PENDING", errorCode: null, leaseToken: null,
            leaseExpiresAt: null, completedAt: null, nextAttemptAt: now, updatedAt: now, requestedByUserAccountId: actorId })
            .where(eq(communitySiteProvisioningJobs.id, failedActivation.id));
        } else {
          await transaction.insert(communitySiteProvisioningJobs).values({ id: randomUUID(), siteId: id,
            kind: command.action === "activate" ? "ACTIVATE_SITE" : "PUBLISH_CONFIGURATION",
            configurationJson: command.action === "activate" ? validateCommunitySiteConfig(current.publishedConfigurationJson) : configuration,
            siteRevision: command.action === "activate" ? lastProvision.siteRevision : current.revision + 1,
            requestedByUserAccountId: actorId, resourceJson: resources, createdAt: now, updatedAt: now });
        }
      }
      const [next] = await transaction.update(communitySites).set({ configurationJson: configuration, slug: configuration.slug, status,
        revision: current.revision + 1, updatedAt: now, ...(command.action === "submit" ? { reviewReason: null, reviewedAt: null, reviewedByUserAccountId: null } : {}) })
        .where(eq(communitySites.id, id)).returning();
      return next!;
    } });
  }

  async reviewSite(input: Parameters<CommunitySitesRepository["reviewSite"]>[0]) {
    const id = parseCommunitySiteId(input.id);
    const command = parseReviewCommunitySiteCommand(input.command);
    return this.mutate({ ...input, id, scope: "admin", action: command.action.toUpperCase(), apply: async (transaction, current, actorId, now) => {
      if (!current) throw new CommunitySiteError("COMMUNITY_SITE_NOT_FOUND");
      const status = reviewCommunitySiteTransition(current.status, command);
      if (command.action === "approve") {
        await checkRegistrySlug(transaction, current.slug, current.id);
        if (current.status === "FAILED") {
          const failed = (await transaction.select().from(communitySiteProvisioningJobs)
            .where(and(eq(communitySiteProvisioningJobs.siteId, id), eq(communitySiteProvisioningJobs.kind, "PROVISION"), eq(communitySiteProvisioningJobs.status, "FAILED")))
            .orderBy(desc(communitySiteProvisioningJobs.createdAt)).for("update").limit(1))[0];
          if (!failed) throw new CommunitySiteError("COMMUNITY_SITE_STATE_CONFLICT");
          const rebuildFailedDeployment = failed.checkpoint === "DEPLOYMENT_CREATED" && failed.errorCode === "PROVISIONING_FAILED";
          const retryResources = rebuildFailedDeployment
            ? Object.fromEntries(Object.entries(failed.resourceJson).filter(([key]) => key !== "vercelDeploymentId"))
            : failed.resourceJson;
          // The approved config/revision are immutable across retries: the child may already store that exact version.
          // An explicitly failed deployment alone is rebuilt; existing database/project identities are preserved.
          await transaction.update(communitySiteProvisioningJobs).set({ status: "PENDING", errorCode: null, leaseToken: null,
            leaseExpiresAt: null, completedAt: null, nextAttemptAt: now, updatedAt: now, requestedByUserAccountId: actorId,
            checkpoint: rebuildFailedDeployment ? "ENVIRONMENT_CONFIGURED" : failed.checkpoint,
            resourceJson: retryResources }).where(eq(communitySiteProvisioningJobs.id, failed.id));
        } else {
          await transaction.insert(communitySiteProvisioningJobs).values({ id: randomUUID(), siteId: id, kind: "PROVISION",
            configurationJson: validateCommunitySiteConfig(current.configurationJson), siteRevision: current.revision + 1,
            requestedByUserAccountId: actorId, createdAt: now, updatedAt: now });
        }
      }
      const [next] = await transaction.update(communitySites).set({ status, reviewReason: command.reason || null,
        reviewedByUserAccountId: actorId, reviewedAt: now, revision: current.revision + 1, updatedAt: now })
        .where(eq(communitySites.id, id)).returning();
      return next!;
    } });
  }
}
