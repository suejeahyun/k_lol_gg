import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";

import type { PrivateAssetActor, PrivateAssetResourceBinding } from "../application/private-asset-policy";
import type {
  PrivateAssetAuditEvent,
  PrivateAssetAuthorizationPort,
  PrivateAssetRepository,
  PrivateAssetTransaction,
  PrivateAssetUnitOfWork,
} from "../application/ports/private-asset-ports";
import {
  PRIVATE_ASSET_PURPOSES,
  type PrivateAssetBinding,
  type PrivateAssetListQuery,
  type PrivateAssetPurpose,
  type PrivateAssetRecord,
  type PrivateAssetResourceType,
} from "../domain/private-asset";
import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { disciplineAssetBindings } from "@/platform/db/schema/discipline";
import { matchSubmissionImages, matchSubmissions, privateAssets } from "@/platform/db/schema/matches";
import { mediaGalleries, mediaHighlights } from "@/platform/db/schema/media";
import type { V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

const RESOURCE_TYPES = new Set<PrivateAssetResourceType>([
  "MATCH_SUBMISSION",
  "INHOUSE_RESULT",
  "DISCIPLINE_TASK",
  "GALLERY_ENTRY",
  "HIGHLIGHT",
  "SECURITY_INCIDENT",
]);

function recordFromRow(row: typeof privateAssets.$inferSelect): PrivateAssetRecord | null {
  if (!PRIVATE_ASSET_PURPOSES.includes(row.purpose as PrivateAssetPurpose)) return null;
  if (!(["image/png", "image/jpeg", "image/webp"] as const).includes(row.contentType as never)) return null;
  return {
    id: row.id,
    createdByUserAccountId: row.createdByUserAccountId,
    ingestSource: row.ingestSource,
    storageProvider: row.storageProvider,
    storageKey: row.storageKey,
    originalFileName: row.originalFileName,
    contentType: row.contentType as PrivateAssetRecord["contentType"],
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    purpose: row.purpose as PrivateAssetPurpose,
    status: row.status,
    readyAt: row.readyAt?.toISOString() ?? null,
    deleteRequestedAt: row.deleteRequestedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function auditedBinding(
  asset: PrivateAssetRecord,
  metadata: Record<string, unknown> | null,
): PrivateAssetBinding | null {
  const resourceType = metadata?.resourceType;
  const resourceId = metadata?.resourceId;
  if (
    typeof resourceType !== "string" ||
    !RESOURCE_TYPES.has(resourceType as PrivateAssetResourceType) ||
    typeof resourceId !== "string" ||
    resourceId.length < 1 ||
    resourceId.length > 255 ||
    metadata?.purpose !== asset.purpose
  ) return null;
  return {
    asset,
    resourceType: resourceType as PrivateAssetResourceType,
    resourceId,
    ownerUserAccountId: null,
    public: resourceType === "GALLERY_ENTRY" || resourceType === "HIGHLIGHT",
  };
}

export class PostgresPrivateAssetAdminAdapter implements
  PrivateAssetUnitOfWork,
  PrivateAssetAuthorizationPort,
  PrivateAssetRepository {
  private readonly transactions = new WeakMap<PrivateAssetTransaction, V2Transaction>();

  constructor(private readonly database: V2Database) {}

  transaction<T>(work: (transaction: PrivateAssetTransaction) => Promise<T>) {
    return withTransaction(this.database, async (databaseTransaction) => {
      const context = Object.freeze({ transactionId: randomUUID() });
      this.transactions.set(context, databaseTransaction);
      try { return await work(context); }
      finally { this.transactions.delete(context); }
    });
  }

  async recheck<TActor extends PrivateAssetActor>(context: PrivateAssetTransaction, actor: TActor): Promise<TActor | null> {
    const transaction = this.tx(context);
    if (actor.purpose !== "ADMIN") return null;
    const locked = await lockTransactionSessionActor(transaction, {
      userAccountId: actor.userAccountId,
      sessionId: actor.sessionId,
      role: actor.role,
      authVersion: actor.authVersion,
    }, new Date(), ADMIN_MUTATION_SESSION_POLICY);
    if (!locked || (locked.role !== "ADMIN" && locked.role !== "SUPER_ADMIN")) return null;
    return { ...actor, role: locked.role, approvalStatus: "APPROVED" } as TActor;
  }

  async resolveResourceForUpdate(
    context: PrivateAssetTransaction,
    resource: Readonly<{ resourceType: PrivateAssetResourceType; resourceId: string }>,
  ): Promise<PrivateAssetResourceBinding | null> {
    const transaction = this.tx(context);
    if (resource.resourceType === "HIGHLIGHT") {
      const row = (await transaction.select({ id: mediaHighlights.id }).from(mediaHighlights).where(and(
        eq(mediaHighlights.id, resource.resourceId),
        eq(mediaHighlights.status, "DRAFT"),
      )).for("update").limit(1))[0];
      return row ? { ...resource, ownerUserAccountId: null, public: true } : null;
    }
    if (resource.resourceType === "GALLERY_ENTRY") {
      const row = (await transaction.select({ id: mediaGalleries.id }).from(mediaGalleries).where(and(
        eq(mediaGalleries.id, resource.resourceId),
        eq(mediaGalleries.status, "DRAFT"),
      )).for("update").limit(1))[0];
      return row ? { ...resource, ownerUserAccountId: null, public: true } : null;
    }
    return null;
  }

  async findDuplicateForUpdate(
    context: PrivateAssetTransaction,
    input: Readonly<{
      resourceType: PrivateAssetResourceType;
      resourceId: string;
      purpose: PrivateAssetPurpose;
      sha256: Uint8Array;
    }>,
  ) {
    const transaction = this.tx(context);
    const digestHex = Buffer.from(input.sha256).toString("hex");
    const lockIdentity = `${input.resourceType}:${input.resourceId}:${input.purpose}:${digestHex}`;
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))`);
    const row = (await transaction.select({ asset: privateAssets, metadata: auditEvents.metadataJson })
      .from(privateAssets)
      .innerJoin(auditEvents, and(
        eq(auditEvents.targetType, "PRIVATE_ASSET"),
        eq(auditEvents.action, "PRIVATE_ASSET_STAGED"),
        sql<boolean>`${auditEvents.targetId} = ${privateAssets.id}::text`,
      ))
      .where(and(
        eq(privateAssets.purpose, input.purpose),
        eq(privateAssets.sha256, Buffer.from(input.sha256)),
        sql<boolean>`${auditEvents.metadataJson}->>'resourceType' = ${input.resourceType}`,
        sql<boolean>`${auditEvents.metadataJson}->>'resourceId' = ${input.resourceId}`,
      )).orderBy(asc(auditEvents.id)).limit(1))[0];
    const asset = row ? recordFromRow(row.asset) : null;
    return asset ? auditedBinding(asset, row!.metadata) : null;
  }

  async insertStaged(context: PrivateAssetTransaction, binding: PrivateAssetBinding) {
    const asset = binding.asset;
    await this.tx(context).insert(privateAssets).values({
      id: asset.id,
      createdByUserAccountId: asset.createdByUserAccountId,
      ingestSource: asset.ingestSource,
      storageProvider: asset.storageProvider,
      storageKey: asset.storageKey,
      originalFileName: asset.originalFileName,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      sha256: Buffer.from(asset.sha256),
      purpose: asset.purpose,
      status: asset.status,
      readyAt: asset.readyAt ? new Date(asset.readyAt) : null,
      deleteRequestedAt: asset.deleteRequestedAt ? new Date(asset.deleteRequestedAt) : null,
      createdAt: new Date(asset.createdAt),
    });
  }

  async findByIdForUpdate(context: PrivateAssetTransaction, assetId: string) {
    const transaction = this.tx(context);
    const row = (await transaction.select().from(privateAssets).where(eq(privateAssets.id, assetId)).for("update").limit(1))[0];
    if (!row) return null;
    return this.bindingFor(transaction, row);
  }

  async updateLifecycle(context: PrivateAssetTransaction, asset: PrivateAssetRecord) {
    await this.tx(context).update(privateAssets).set({
      status: asset.status,
      readyAt: asset.readyAt ? new Date(asset.readyAt) : null,
      deleteRequestedAt: asset.deleteRequestedAt ? new Date(asset.deleteRequestedAt) : null,
    }).where(eq(privateAssets.id, asset.id));
  }

  async list(
    context: PrivateAssetTransaction,
    query: PrivateAssetListQuery,
    allowedPurposes: readonly PrivateAssetPurpose[],
  ) {
    const transaction = this.tx(context);
    const cursorAt = query.cursor ? new Date(query.cursor.createdAt) : null;
    const rows = await transaction.select().from(privateAssets).where(and(
      inArray(privateAssets.purpose, [...allowedPurposes]),
      query.purpose ? eq(privateAssets.purpose, query.purpose) : undefined,
      query.status ? eq(privateAssets.status, query.status) : undefined,
      query.createdByUserAccountId ? eq(privateAssets.createdByUserAccountId, query.createdByUserAccountId) : undefined,
      query.resourceType || query.resourceId ? or(
        sql<boolean>`exists (
          select 1 from audit.events ae
          where ae.target_type = 'PRIVATE_ASSET'
            and ae.action = 'PRIVATE_ASSET_STAGED'
            and ae.target_id = ${privateAssets.id}::text
            and ${query.resourceType ? sql`ae.metadata_json->>'resourceType' = ${query.resourceType}` : sql`true`}
            and ${query.resourceId ? sql`ae.metadata_json->>'resourceId' = ${query.resourceId}` : sql`true`}
        )`,
        !query.resourceType || query.resourceType === "MATCH_SUBMISSION" ? sql<boolean>`exists (
          select 1 from matches.match_submission_images msi
          where msi.private_asset_id = ${privateAssets.id}
            and ${query.resourceId ? sql`msi.submission_id::text = ${query.resourceId}` : sql`true`}
        )` : undefined,
        !query.resourceType || query.resourceType === "DISCIPLINE_TASK" ? sql<boolean>`exists (
          select 1 from discipline.asset_bindings dab
          where dab.private_asset_id = ${privateAssets.id}
            and ${query.resourceId ? sql`dab.task_id::text = ${query.resourceId}` : sql`true`}
        )` : undefined,
      ) : undefined,
      query.cursor ? or(
        lt(privateAssets.createdAt, cursorAt!),
        and(eq(privateAssets.createdAt, cursorAt!), lt(privateAssets.id, query.cursor.id)),
      ) : undefined,
    )).orderBy(desc(privateAssets.createdAt), desc(privateAssets.id)).limit(query.pageSize + 1);
    const bindings = (await Promise.all(rows.map((row) => this.bindingFor(transaction, row))))
      .filter((binding): binding is PrivateAssetBinding => binding !== null);
    const page = bindings.slice(0, query.pageSize);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: rows.length > query.pageSize && last
        ? Buffer.from(JSON.stringify([last.asset.createdAt, last.asset.id])).toString("base64url")
        : null,
    };
  }

  async listCleanupCandidates(context: PrivateAssetTransaction, limit: number) {
    const rows = await this.tx(context).select().from(privateAssets).where(and(
      eq(privateAssets.status, "DELETE_PENDING"),
      sql<boolean>`not exists (
        select 1 from audit.events ae where ae.target_type = 'PRIVATE_ASSET'
          and ae.action = 'PRIVATE_ASSET_CLEANUP_OUTCOME' and ae.target_id = ${privateAssets.id}::text
          and ae.metadata_json->>'succeeded' = 'true'
      )`,
    )).orderBy(asc(privateAssets.deleteRequestedAt), asc(privateAssets.id)).limit(limit).for("update", { skipLocked: true });
    return rows.map(recordFromRow).filter((asset): asset is PrivateAssetRecord => asset !== null);
  }

  async listStaleStagedCandidates(context: PrivateAssetTransaction, before: string, limit: number) {
    const transaction = this.tx(context);
    const rows = await transaction.select().from(privateAssets).where(and(
      eq(privateAssets.status, "STAGED"),
      lt(privateAssets.createdAt, new Date(before)),
    )).orderBy(asc(privateAssets.createdAt), asc(privateAssets.id)).limit(limit).for("update", { skipLocked: true });
    const bindings = await Promise.all(rows.map((row) => this.bindingFor(transaction, row)));
    return bindings.filter((binding): binding is PrivateAssetBinding => binding !== null);
  }

  async recordCleanupOutcome(
    context: PrivateAssetTransaction,
    outcome: Readonly<{ assetId: string; attemptedAt: string; succeeded: boolean; failureCode: "STORAGE_UNAVAILABLE" | null }>,
  ) {
    await this.tx(context).insert(auditEvents).values({
      requestId: randomUUID(),
      action: "PRIVATE_ASSET_CLEANUP_OUTCOME",
      targetType: "PRIVATE_ASSET",
      targetId: outcome.assetId,
      metadataJson: { succeeded: outcome.succeeded, failureCode: outcome.failureCode },
      createdAt: new Date(outcome.attemptedAt),
    });
  }

  auditPort() {
    return { append: async (context: PrivateAssetTransaction, event: PrivateAssetAuditEvent) => {
      await this.tx(context).insert(auditEvents).values({
        requestId: event.eventId,
        actorUserAccountId: event.actorUserAccountId,
        action: `PRIVATE_ASSET_${event.action}`,
        targetType: "PRIVATE_ASSET",
        targetId: event.assetId,
        metadataJson: {
          actorPurpose: event.actorPurpose,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          purpose: event.purpose,
          succeeded: event.succeeded,
        },
        createdAt: new Date(event.occurredAt),
      });
    } };
  }

  private tx(context: PrivateAssetTransaction) {
    const transaction = this.transactions.get(context);
    if (!transaction) throw new Error("Private asset transaction is inactive.");
    return transaction;
  }

  private async bindingFor(transaction: V2Transaction, row: typeof privateAssets.$inferSelect): Promise<PrivateAssetBinding | null> {
    const asset = recordFromRow(row);
    if (!asset) return null;
    const stagedAudit = (await transaction.select({ metadata: auditEvents.metadataJson }).from(auditEvents).where(and(
      eq(auditEvents.targetType, "PRIVATE_ASSET"),
      eq(auditEvents.action, "PRIVATE_ASSET_STAGED"),
      eq(auditEvents.targetId, asset.id),
    )).orderBy(asc(auditEvents.id)).limit(1))[0];
    const fromAudit = auditedBinding(asset, stagedAudit?.metadata ?? null);
    if (fromAudit) return fromAudit;

    if (asset.purpose !== "MATCH_SCOREBOARD") {
      if (asset.purpose !== "DISCIPLINE_ISSUE" && asset.purpose !== "DISCIPLINE_RESOLUTION") return null;
      const discipline = (await transaction.select({
        resourceId: disciplineAssetBindings.taskId,
        ownerUserAccountId: disciplineAssetBindings.ownerUserAccountId,
      }).from(disciplineAssetBindings).where(eq(disciplineAssetBindings.privateAssetId, asset.id)).limit(1))[0];
      return discipline
        ? { asset, resourceType: "DISCIPLINE_TASK", resourceId: discipline.resourceId, ownerUserAccountId: discipline.ownerUserAccountId, public: false }
        : null;
    }

    const match = (await transaction.select({
      resourceId: matchSubmissionImages.submissionId,
      ownerUserAccountId: matchSubmissions.ownerUserAccountId,
    }).from(matchSubmissionImages).innerJoin(matchSubmissions, eq(matchSubmissions.id, matchSubmissionImages.submissionId))
      .where(eq(matchSubmissionImages.privateAssetId, asset.id)).limit(1))[0];
    return match
      ? { asset, resourceType: "MATCH_SUBMISSION", resourceId: match.resourceId, ownerUserAccountId: match.ownerUserAccountId, public: false }
      : null;
  }
}
