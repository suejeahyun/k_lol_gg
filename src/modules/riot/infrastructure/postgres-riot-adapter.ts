import { randomUUID } from "node:crypto";

import { and, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { players } from "@/platform/db/schema/registry";
import {
  riotAccountLinks,
  riotCommandReceipts,
  riotOutbox,
  riotRsoStates,
  riotSummaries,
  riotSyncJobs,
} from "@/platform/db/schema/riot";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";

import type {
  CurrentRiotActor,
  RiotCommandReceipt,
  RiotJobAuthorizationVerifierPort,
  RiotReceiptIdentity,
  RiotSafeBody,
  RiotTransaction,
} from "../application/ports";
import type { RiotApplicationDependencies } from "../application/riot-application";
import type { AdminRiotPageDto, AdminRiotQuery, RiotQueryRepository } from "../application/riot-query";
import type { RiotAccountLink, RiotRsoState, RiotSyncJob } from "../domain/riot-integration";

type LinkRow = typeof riotAccountLinks.$inferSelect;
type StateRow = typeof riotRsoStates.$inferSelect;
type JobRow = typeof riotSyncJobs.$inferSelect;

function linkFromRow(row: LinkRow): RiotAccountLink {
  return {
    id: row.id,
    revision: row.revision,
    playerId: row.playerId,
    ownerAccountId: row.ownerUserAccountId,
    gameName: row.gameName,
    tagLine: row.tagLine,
    puuidCiphertext: row.protectedPuuid,
    method: row.method,
    status: row.status,
    linkedAt: row.linkedAt,
    disconnectedAt: row.disconnectedAt,
  };
}

function stateFromRow(row: StateRow): RiotRsoState {
  return {
    id: row.id,
    ownerAccountId: row.ownerUserAccountId,
    stateDigestHex: row.stateDigest.toString("hex"),
    returnTo: row.returnTo,
    expiresAt: row.expiresAt,
    exchangeId: row.exchangeId,
    exchangeStartedAt: row.exchangeStartedAt,
    consumedAt: row.consumedAt,
  };
}

function jobFromRow(row: JobRow): RiotSyncJob {
  return {
    id: row.id,
    revision: row.revision,
    linkId: row.linkId,
    requestedBy: row.requestedBy,
    status: row.status,
    attemptCount: row.attemptCount,
    maximumAttempts: row.maximumAttempts,
    requestedAt: row.requestedAt,
    availableAt: row.availableAt,
    lockedAt: row.lockedAt,
    leaseId: row.leaseId,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
  };
}

function same(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function receiptFromRow(row: typeof riotCommandReceipts.$inferSelect): RiotCommandReceipt {
  return {
    principalId: row.actorUserAccountId,
    scope: row.scope,
    keyHash: row.keyHash,
    requestHash: row.requestHash,
    bodyDigestHex: row.bodyDigestHex,
    body: row.responseJson as RiotSafeBody,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export class PostgresRiotAdapter implements RiotQueryRepository {
  private readonly transactions = new WeakMap<RiotTransaction, V2Transaction>();
  private readonly actors = new WeakMap<RiotTransaction, CurrentRiotActor>();

  readonly dependencies: Pick<
    RiotApplicationDependencies,
    "unitOfWork" | "features" | "authorization" | "receipts" | "repository" | "audit" | "outbox" | "clock" | "ids"
  >;

  constructor(
    private readonly database: V2Database,
    options: Readonly<{
      featureEnabled: boolean;
      jobVerifier?: RiotJobAuthorizationVerifierPort<V2Transaction>;
    }>,
  ) {
    this.dependencies = {
      unitOfWork: {
        transaction: (operation) => this.database.transaction(async (databaseTransaction) => {
          const context = Object.freeze({}) as RiotTransaction;
          this.transactions.set(context, databaseTransaction);
          try { return await operation(context); }
          finally {
            this.actors.delete(context);
            this.transactions.delete(context);
          }
        }, { isolationLevel: "serializable" }),
      },
      features: { isEnabled: async (context) => (this.tx(context), options.featureEnabled) },
      authorization: {
        recheck: async (context, input) => {
          const transaction = this.tx(context);
          const intent = input.intent;
          let actor: CurrentRiotActor | null = null;
          if (intent.kind === "SIGNED_JOB") {
            if (!options.jobVerifier || !(await options.jobVerifier.verifyAndConsume(transaction, intent))) return null;
            actor = { purpose: "JOB", principalId: input.principalId, jobName: "riot-sync" };
          } else {
            const locked = await lockTransactionSessionActor(transaction, {
              userAccountId: input.principalId,
              sessionId: intent.sessionId,
              role: intent.role,
              authVersion: intent.authVersion,
            }, new Date(), intent.kind === "ADMIN_TOTP" ? ADMIN_MUTATION_SESSION_POLICY : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY);
            if (!locked) return null;
            if (intent.kind === "ADMIN_TOTP") {
              actor = { purpose: "ADMIN", principalId: input.principalId, userAccountId: locked.id, role: locked.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN" };
            } else {
              const owned = (await transaction.select({ id: players.id }).from(players).where(and(
                eq(players.userAccountId, locked.id),
                eq(players.status, "ACTIVE"),
              )).for("update").limit(1))[0];
              actor = { purpose: "ACCOUNT", principalId: input.principalId, userAccountId: locked.id, playerId: owned?.id ?? null, accountStatus: "APPROVED" };
            }
          }
          this.actors.set(context, actor);
          return actor;
        },
      },
      receipts: {
        inspect: async (context, identity) => {
          const row = await this.activeReceipt(context, identity);
          if (!row) return { kind: "NONE" };
          return same(row.requestHash, identity.requestHash) && row.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt: receiptFromRow(row) }
            : { kind: "MISMATCH" };
        },
        claim: async (context, identity) => {
          const transaction = this.tx(context);
          const lockKey = `${identity.principalId}:${identity.scope}:${Buffer.from(identity.keyHash).toString("hex")}`;
          await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
          await transaction.delete(riotCommandReceipts).where(and(
            eq(riotCommandReceipts.actorUserAccountId, identity.principalId),
            eq(riotCommandReceipts.scope, identity.scope),
            eq(riotCommandReceipts.keyHash, Buffer.from(identity.keyHash)),
            lte(riotCommandReceipts.expiresAt, new Date()),
          ));
          const row = await this.activeReceipt(context, identity);
          if (!row) return { kind: "CLAIMED" };
          return same(row.requestHash, identity.requestHash) && row.bodyDigestHex === identity.bodyDigestHex
            ? { kind: "REPLAY", receipt: receiptFromRow(row) }
            : { kind: "MISMATCH" };
        },
        complete: async (context, receipt) => {
          await this.tx(context).insert(riotCommandReceipts).values({
            id: randomUUID(),
            actorUserAccountId: receipt.principalId,
            scope: receipt.scope,
            keyHash: Buffer.from(receipt.keyHash),
            requestHash: Buffer.from(receipt.requestHash),
            bodyDigestHex: receipt.bodyDigestHex,
            responseJson: receipt.body,
            createdAt: new Date(receipt.createdAt),
            expiresAt: new Date(receipt.expiresAt),
          });
        },
      },
      repository: {
        loadPlayerOwnerAccountIdForUpdate: async (context, playerId) => (await this.tx(context).select({ owner: players.userAccountId }).from(players).where(and(eq(players.id, playerId), eq(players.status, "ACTIVE"))).for("update").limit(1))[0]?.owner ?? null,
        loadLinkForPlayerForUpdate: async (context, playerId) => {
          const row = (await this.tx(context).select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, playerId)).for("update").limit(1))[0];
          return row ? linkFromRow(row) : null;
        },
        loadLinkForUpdate: async (context, linkId) => {
          const row = (await this.tx(context).select().from(riotAccountLinks).where(eq(riotAccountLinks.id, linkId)).for("update").limit(1))[0];
          return row ? linkFromRow(row) : null;
        },
        saveLink: async (context, link, expectedRevision) => {
          const transaction = this.tx(context);
          const values = {
            revision: link.revision,
            playerId: link.playerId,
            ownerUserAccountId: link.ownerAccountId,
            gameName: link.gameName,
            tagLine: link.tagLine,
            normalizedKey: `${link.gameName.toLocaleLowerCase("ko-KR")}#${link.tagLine.toLocaleLowerCase("en-US")}`,
            protectedPuuid: link.puuidCiphertext,
            method: link.method,
            status: link.status,
            linkedAt: link.linkedAt,
            disconnectedAt: link.disconnectedAt,
            updatedAt: new Date(),
          } as const;
          const exists = (await transaction.select({ id: riotAccountLinks.id }).from(riotAccountLinks).where(eq(riotAccountLinks.id, link.id)).limit(1))[0];
          if (!exists) await transaction.insert(riotAccountLinks).values({ id: link.id, ...values });
          else {
            const updated = await transaction.update(riotAccountLinks).set(values).where(and(eq(riotAccountLinks.id, link.id), eq(riotAccountLinks.revision, expectedRevision))).returning({ id: riotAccountLinks.id });
            if (!updated[0]) throw new Error("STALE_RIOT_REVISION");
          }
        },
        loadRsoStateForUpdate: async (context, stateDigestHex) => {
          const row = (await this.tx(context).select().from(riotRsoStates).where(eq(riotRsoStates.stateDigest, Buffer.from(stateDigestHex, "hex"))).for("update").limit(1))[0];
          return row ? stateFromRow(row) : null;
        },
        saveRsoState: async (context, state) => {
          await this.tx(context).insert(riotRsoStates).values({
            id: state.id,
            ownerUserAccountId: state.ownerAccountId,
            stateDigest: Buffer.from(state.stateDigestHex, "hex"),
            returnTo: state.returnTo,
            expiresAt: state.expiresAt,
            exchangeId: state.exchangeId,
            exchangeStartedAt: state.exchangeStartedAt,
            consumedAt: state.consumedAt,
          }).onConflictDoUpdate({
            target: riotRsoStates.id,
            set: { exchangeId: state.exchangeId, exchangeStartedAt: state.exchangeStartedAt, consumedAt: state.consumedAt },
          });
        },
        latestSyncRequestedAt: async (context, linkId) => (await this.tx(context).select({ value: riotSyncJobs.requestedAt }).from(riotSyncJobs).where(eq(riotSyncJobs.linkId, linkId)).orderBy(desc(riotSyncJobs.requestedAt)).limit(1))[0]?.value ?? null,
        listConnectedLinksForUpdate: async (context, linkIds) => {
          const rows = await this.tx(context).select().from(riotAccountLinks).where(and(
            eq(riotAccountLinks.status, "CONNECTED"),
            linkIds ? inArray(riotAccountLinks.id, [...linkIds]) : undefined,
          )).orderBy(riotAccountLinks.id).for("update");
          return rows.map(linkFromRow);
        },
        saveSyncJob: async (context, job) => {
          await this.tx(context).insert(riotSyncJobs).values({
            id: job.id,
            revision: job.revision,
            linkId: job.linkId,
            requestedBy: job.requestedBy,
            status: job.status,
            attemptCount: job.attemptCount,
            maximumAttempts: job.maximumAttempts,
            requestedAt: job.requestedAt,
            availableAt: job.availableAt,
            lockedAt: job.lockedAt,
            leaseId: job.leaseId,
            completedAt: job.completedAt,
            failureCode: job.failureCode,
          }).onConflictDoUpdate({ target: riotSyncJobs.id, set: {
            revision: job.revision,
            status: job.status,
            attemptCount: job.attemptCount,
            availableAt: job.availableAt,
            lockedAt: job.lockedAt,
            leaseId: job.leaseId,
            completedAt: job.completedAt,
            failureCode: job.failureCode,
            updatedAt: new Date(),
          } });
        },
        loadNextClaimableSyncJobForUpdate: async (context, now) => {
          const staleAt = new Date(now.getTime() - 60_000);
          const row = (await this.tx(context).select().from(riotSyncJobs).where(or(
            and(inArray(riotSyncJobs.status, ["QUEUED", "RETRY_WAIT"]), lte(riotSyncJobs.availableAt, now)),
            and(eq(riotSyncJobs.status, "RUNNING"), lte(riotSyncJobs.lockedAt, staleAt)),
          )).orderBy(riotSyncJobs.availableAt, riotSyncJobs.id).for("update", { skipLocked: true }).limit(1))[0];
          return row ? jobFromRow(row) : null;
        },
        loadSyncJobForUpdate: async (context, jobId) => {
          const row = (await this.tx(context).select().from(riotSyncJobs).where(eq(riotSyncJobs.id, jobId)).for("update").limit(1))[0];
          return row ? jobFromRow(row) : null;
        },
        saveProjection: async (context, projection) => {
          const link = (await this.tx(context).select({ id: riotAccountLinks.id }).from(riotAccountLinks).where(eq(riotAccountLinks.playerId, projection.playerId)).limit(1))[0];
          if (!link) throw new Error("RIOT_LINK_NOT_FOUND");
          await this.tx(context).insert(riotSummaries).values({
            playerId: projection.playerId,
            linkId: link.id,
            gameName: projection.gameName,
            tagLine: projection.tagLine,
            soloTier: projection.soloTier,
            soloRank: projection.soloRank,
            leaguePoints: projection.leaguePoints,
            wins: projection.wins,
            losses: projection.losses,
            lastSyncedAt: projection.syncedAt,
          }).onConflictDoUpdate({ target: riotSummaries.playerId, set: {
            linkId: link.id,
            gameName: projection.gameName,
            tagLine: projection.tagLine,
            soloTier: projection.soloTier,
            soloRank: projection.soloRank,
            leaguePoints: projection.leaguePoints,
            wins: projection.wins,
            losses: projection.losses,
            lastSyncedAt: projection.syncedAt,
            updatedAt: new Date(),
          } });
        },
      },
      audit: {
        append: async (context, event) => {
          const actor = this.actors.get(context);
          await this.tx(context).insert(auditEvents).values({
            requestId: event.requestId,
            actorUserAccountId: actor && actor.purpose !== "JOB" ? actor.userAccountId : null,
            action: event.action,
            targetType: "RIOT_INTEGRATION",
            targetId: event.targetId,
            beforeJson: event.before,
            afterJson: event.after,
            metadataJson: { source: actor?.purpose ?? "UNKNOWN" },
            createdAt: new Date(event.occurredAt),
          });
        },
      },
      outbox: {
        append: async (context, event) => {
          await this.tx(context).insert(riotOutbox).values({
            id: event.id,
            requestId: event.requestId,
            aggregateId: event.aggregateId,
            aggregateRevision: event.aggregateRevision,
            eventType: event.eventType,
            dedupeKey: event.dedupeKey,
            payloadJson: event.payload,
            createdAt: new Date(event.occurredAt),
          });
        },
      },
      clock: { now: () => new Date(), receiptExpiresAt: (now) => new Date(now.getTime() + 24 * 60 * 60_000) },
      ids: { next: () => randomUUID() },
    };
  }

  private tx(context: RiotTransaction) {
    const transaction = this.transactions.get(context);
    if (!transaction) throw new Error("Riot transaction context escaped its unit of work.");
    return transaction;
  }

  private async activeReceipt(context: RiotTransaction, identity: RiotReceiptIdentity) {
    return (await this.tx(context).select().from(riotCommandReceipts).where(and(
      eq(riotCommandReceipts.actorUserAccountId, identity.principalId),
      eq(riotCommandReceipts.scope, identity.scope),
      eq(riotCommandReceipts.keyHash, Buffer.from(identity.keyHash)),
      sql<boolean>`${riotCommandReceipts.expiresAt} > clock_timestamp()`,
    )).limit(1))[0];
  }

  async getPublicSummary(playerId: string) {
    const row = (await this.database.select().from(riotSummaries).innerJoin(riotAccountLinks, and(
      eq(riotAccountLinks.id, riotSummaries.linkId),
      eq(riotAccountLinks.status, "CONNECTED"),
    )).where(eq(riotSummaries.playerId, playerId)).limit(1))[0];
    if (!row) return null;
    const summary = row.summaries;
    return {
      playerId: summary.playerId,
      riotId: `${summary.gameName}#${summary.tagLine}`,
      soloTier: summary.soloTier,
      soloRank: summary.soloRank,
      leaguePoints: summary.leaguePoints,
      wins: summary.wins,
      losses: summary.losses,
      lastSyncedAt: summary.lastSyncedAt.toISOString(),
    };
  }

  async getOwnerStatus(ownerUserAccountId: string) {
    const player = (await this.database.select({ id: players.id }).from(players).where(and(eq(players.userAccountId, ownerUserAccountId), eq(players.status, "ACTIVE"))).limit(1))[0];
    if (!player) return null;
    const linkRow = (await this.database.select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, player.id)).limit(1))[0];
    const lastJob = linkRow ? (await this.database.select().from(riotSyncJobs).where(eq(riotSyncJobs.linkId, linkRow.id)).orderBy(desc(riotSyncJobs.requestedAt)).limit(1))[0] : null;
    return {
      featureEnabled: true as const,
      playerId: player.id,
      link: linkRow ? {
        id: linkRow.id,
        revision: linkRow.revision,
        riotId: `${linkRow.gameName}#${linkRow.tagLine}`,
        method: linkRow.method,
        status: linkRow.status,
        linkedAt: linkRow.linkedAt.toISOString(),
      } : null,
      lastSync: lastJob ? {
        id: lastJob.id,
        status: lastJob.status,
        attemptCount: lastJob.attemptCount,
        requestedAt: lastJob.requestedAt.toISOString(),
        availableAt: lastJob.availableAt.toISOString(),
        failureCode: lastJob.failureCode,
      } : null,
      summary: await this.getPublicSummary(player.id),
    };
  }

  async listAdmin(query: AdminRiotQuery): Promise<AdminRiotPageDto> {
    const condition = query.status === "ALL" ? undefined
      : query.status === "UNLINKED" ? isNull(riotAccountLinks.id)
      : query.status === "FAILED" ? sql<boolean>`exists (select 1 from riot.sync_jobs failure_job where failure_job.link_id = ${riotAccountLinks.id} and failure_job.status = 'FAILED')`
      : eq(riotAccountLinks.status, query.status);
    const base = this.database.select({
      playerId: players.id,
      displayName: players.nickname,
      registryGameName: players.nickname,
      registryTagLine: players.tagLine,
      ownerUserAccountId: players.userAccountId,
      linkId: riotAccountLinks.id,
      revision: riotAccountLinks.revision,
      gameName: riotAccountLinks.gameName,
      tagLine: riotAccountLinks.tagLine,
      method: riotAccountLinks.method,
      status: riotAccountLinks.status,
      lastSyncedAt: riotSummaries.lastSyncedAt,
    }).from(players).leftJoin(riotAccountLinks, eq(riotAccountLinks.playerId, players.id)).leftJoin(riotSummaries, eq(riotSummaries.playerId, players.id)).where(condition);
    const [rows, totals] = await Promise.all([
      base.orderBy(desc(players.updatedAt), players.id).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.database.select({ value: count() }).from(players).leftJoin(riotAccountLinks, eq(riotAccountLinks.playerId, players.id)).where(condition),
    ]);
    const items = await Promise.all(rows.map(async (row) => {
      const lastJob = row.linkId ? (await this.database.select().from(riotSyncJobs).where(eq(riotSyncJobs.linkId, row.linkId)).orderBy(desc(riotSyncJobs.requestedAt)).limit(1))[0] : null;
      return {
        playerId: row.playerId,
        displayName: row.displayName,
        ownerUserAccountId: row.ownerUserAccountId,
        linkId: row.linkId,
        revision: row.revision,
        riotId: `${row.gameName ?? row.registryGameName}#${row.tagLine ?? row.registryTagLine}`,
        method: row.method,
        status: row.status ?? "UNLINKED" as const,
        lastSyncStatus: lastJob?.status ?? null,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        failureCode: lastJob?.failureCode ?? null,
      };
    }));
    const total = totals[0]?.value ?? 0;
    return { items, page: query.page, pageSize: query.pageSize, total, totalPages: total ? Math.ceil(total / query.pageSize) : 0 };
  }
}
