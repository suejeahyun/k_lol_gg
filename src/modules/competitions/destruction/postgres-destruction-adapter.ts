import { randomUUID } from "node:crypto";

import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import {
  destructionApplicationIndex,
  destructionCommandReceipts,
  destructionCompetitions,
  destructionOutbox,
} from "@/platform/db/schema/destruction-competitions";
import {
  mediaGalleries,
  mediaGalleryAssets,
  mediaGalleryExternalImages,
} from "@/platform/db/schema/media";
import { privateAssets } from "@/platform/db/schema/matches";
import { players } from "@/platform/db/schema/registry";
import type { V2Transaction } from "@/platform/db/transaction";
import { deriveLegacyCompetitionUuid } from "@/platform/legacy-identifiers";
import { loadCompetitionPlayerDisplayCatalog } from "../infrastructure/postgres-player-display-catalog";

import type { CompetitionCommandReceipt } from "../core";
import { DestructionCommandHandler, type DestructionCommandHandlerDependencies, type DestructionReceiptClaim, type DestructionTransactionContext } from "./destruction-command-handler";
import type { DestructionHttpCommand, DestructionHttpMutationBody, DestructionListQuery, DestructionPage, DestructionQueryPort } from "./http-contract";
import { toDestructionPublicDto, type DestructionAggregate, type DestructionPublicGalleryDto } from "./state";

type DestructionRow = typeof destructionCompetitions.$inferSelect;

function normalizeText(value: string) { return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR"); }
function snapshot(aggregate: DestructionAggregate) { return JSON.parse(JSON.stringify(aggregate)) as Record<string, unknown>; }
function same(left: Uint8Array, right: Uint8Array) { return Buffer.from(left).equals(Buffer.from(right)); }

function aggregateFromRow(row: DestructionRow): DestructionAggregate {
  const value = row.aggregateJson as unknown as DestructionAggregate;
  if (!value || value.id !== row.id || value.revision !== row.revision || value.lifecycle?.status !== row.status || value.configuration?.preliminaryFormat !== row.preliminaryFormat || !Array.isArray(value.applications) || !Array.isArray(value.participants) || !Array.isArray(value.teams)) throw new Error("DESTRUCTION_SNAPSHOT_INCONSISTENT");
  const snapshotGalleryId = value.galleryId ?? null;
  if (snapshotGalleryId !== (row.galleryId ?? null)) throw new Error("DESTRUCTION_SNAPSHOT_INCONSISTENT");
  return Object.freeze({ ...value, galleryId: snapshotGalleryId });
}

function rowValues(aggregate: DestructionAggregate, actorUserAccountId: string) {
  if (aggregate.participants.length > aggregate.configuration.teamCount * 5) throw new Error("DESTRUCTION_PARTICIPANT_OVERFLOW");
  return {
    title: aggregate.title,
    titleNormalized: normalizeText(aggregate.title),
    status: aggregate.lifecycle.status,
    preliminaryFormat: aggregate.configuration.preliminaryFormat,
    teamCount: aggregate.configuration.teamCount,
    participantCount: aggregate.participants.length,
    galleryId: aggregate.galleryId,
    aggregateJson: snapshot(aggregate),
    revision: aggregate.revision,
    updatedByUserAccountId: actorUserAccountId,
    updatedAt: new Date(aggregate.updatedAt),
  };
}

export class PostgresDestructionAdapter implements DestructionQueryPort {
  private readonly contexts = new WeakMap<DestructionTransactionContext, V2Transaction>();
  private readonly actors = new WeakMap<DestructionTransactionContext, DestructionHttpCommand["metadata"]["actor"]>();

  readonly dependencies: DestructionCommandHandlerDependencies = {
    unitOfWork: {
      transaction: (operation) => this.database.transaction(async (transaction) => {
        const context = Object.freeze({}) as DestructionTransactionContext;
        this.contexts.set(context, transaction);
        try { return await operation(context); } finally { this.contexts.delete(context); this.actors.delete(context); }
      }, { isolationLevel: "serializable" }),
    },
    repository: {
      loadForUpdate: async (context, tournamentId) => {
        const row = (await this.tx(context).select().from(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)).for("update").limit(1))[0];
        return row ? aggregateFromRow(row) : null;
      },
      assertPublishedReadyGallery: async (context, galleryId) => {
        const transaction = this.tx(context);
        const gallery = (await transaction.select({ id: mediaGalleries.id }).from(mediaGalleries).where(and(eq(mediaGalleries.id, galleryId), eq(mediaGalleries.status, "PUBLISHED"))).for("share").limit(1))[0];
        if (!gallery) throw new TypeError("INVALID_GALLERY");
        const assets = await transaction.select({ status: privateAssets.status, purpose: privateAssets.purpose }).from(mediaGalleryAssets).innerJoin(privateAssets, eq(mediaGalleryAssets.privateAssetId, privateAssets.id)).where(eq(mediaGalleryAssets.galleryId, galleryId));
        const externalImages = await transaction.select({ url: mediaGalleryExternalImages.sourceUrl })
          .from(mediaGalleryExternalImages).where(eq(mediaGalleryExternalImages.galleryId, galleryId));
        if (
          assets.length + externalImages.length < 1 || assets.length + externalImages.length > 5 ||
          assets.some((asset) => asset.status !== "READY" || asset.purpose !== "GALLERY")
        ) throw new TypeError("INVALID_GALLERY");
      },
      save: async (context, input) => {
        const transaction = this.tx(context);
        const actor = this.actor(context);
        const values = rowValues(input.aggregate, actor.userAccountId);
        if (input.create) {
          await transaction.insert(destructionCompetitions).values({ id: input.aggregate.id, ...values, createdByUserAccountId: actor.userAccountId, createdAt: new Date(input.aggregate.createdAt) });
        } else {
          const rows = await transaction.update(destructionCompetitions).set(values).where(and(eq(destructionCompetitions.id, input.aggregate.id), eq(destructionCompetitions.revision, input.expectedRevision))).returning({ id: destructionCompetitions.id });
          if (!rows[0]) throw new Error("DESTRUCTION_REVISION_CONFLICT");
        }
        for (const application of input.aggregate.applications) {
          await transaction.insert(destructionApplicationIndex).values({ tournamentId: input.aggregate.id, applicationId: application.id, ownerUserAccountId: application.userAccountId, playerId: application.playerId, position: application.position, status: application.status, updatedAt: new Date(input.aggregate.updatedAt) }).onConflictDoUpdate({
            target: [destructionApplicationIndex.tournamentId, destructionApplicationIndex.applicationId],
            set: { position: application.position, status: application.status, updatedAt: new Date(input.aggregate.updatedAt) },
          });
        }
      },
    },
    authorization: {
      recheck: async (context, command) => {
        const intent = command.metadata.authorizationIntent;
        const policy = intent.kind === "ADMIN_TOTP"
          ? { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: intent.minimumRole }
          : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
        const account = await lockTransactionSessionActor(this.tx(context), command.metadata.actor, new Date(), policy);
        if (!account) throw new TypeError("FORBIDDEN");
        this.actors.set(context, command.metadata.actor);
        if (intent.kind === "APPROVED_OWNER") {
          const commandPlayerId = command.type === "CAST_MVP_VOTE"
            ? command.payload.voterPlayerId
            : command.type === "UPSERT_OWN_APPLICATION" || command.type === "CANCEL_OWN_APPLICATION"
              ? command.payload.playerId
              : null;
          if (intent.ownerUserAccountId !== command.metadata.actor.userAccountId || intent.playerId !== commandPlayerId) throw new TypeError("FORBIDDEN");
          const owned = (await this.tx(context).select({ id: players.id }).from(players).where(and(eq(players.id, intent.playerId), eq(players.userAccountId, intent.ownerUserAccountId), eq(players.status, "ACTIVE"))).for("update").limit(1))[0];
          if (!owned) throw new TypeError("FORBIDDEN");
        }
      },
    },
    receipts: {
      claim: async (context, command): Promise<DestructionReceiptClaim> => {
        const transaction = this.tx(context);
        const material = `${command.metadata.actor.userAccountId}:${command.metadata.idempotency.scope}:${Buffer.from(command.metadata.idempotency.keyHash).toString("hex")}`;
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${material}, 0))`);
        await transaction.delete(destructionCommandReceipts).where(and(eq(destructionCommandReceipts.actorUserAccountId, command.metadata.actor.userAccountId), eq(destructionCommandReceipts.scope, command.metadata.idempotency.scope), eq(destructionCommandReceipts.keyHash, Buffer.from(command.metadata.idempotency.keyHash)), sql<boolean>`${destructionCommandReceipts.expiresAt} <= clock_timestamp()`));
        const row = (await transaction.select().from(destructionCommandReceipts).where(and(eq(destructionCommandReceipts.actorUserAccountId, command.metadata.actor.userAccountId), eq(destructionCommandReceipts.scope, command.metadata.idempotency.scope), eq(destructionCommandReceipts.keyHash, Buffer.from(command.metadata.idempotency.keyHash)), sql<boolean>`${destructionCommandReceipts.expiresAt} > clock_timestamp()`)).limit(1))[0];
        if (!row) return { kind: "CLAIMED" };
        if (!same(row.requestHash, command.metadata.idempotency.requestFingerprint)) return { kind: "MISMATCH" };
        return { kind: "REPLAY", receipt: { actorUserAccountId: row.actorUserAccountId, scope: row.scope, keyHash: row.keyHash, requestHash: row.requestHash, responseStatus: row.responseStatus, body: row.responseJson as DestructionHttpMutationBody, revision: row.revision, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() } };
      },
      complete: async (context, receipt: CompetitionCommandReceipt<DestructionHttpMutationBody>) => {
        await this.tx(context).insert(destructionCommandReceipts).values({ id: randomUUID(), tournamentId: receipt.body.tournamentId, actorUserAccountId: receipt.actorUserAccountId, scope: receipt.scope, keyHash: Buffer.from(receipt.keyHash), requestHash: Buffer.from(receipt.requestHash), responseStatus: receipt.responseStatus, responseJson: receipt.body, revision: receipt.revision!, createdAt: new Date(receipt.createdAt), expiresAt: new Date(receipt.expiresAt) });
      },
    },
    audit: {
      append: async (context, event) => { await this.tx(context).insert(auditEvents).values({ requestId: event.requestId, actorUserAccountId: event.actorUserAccountId, action: event.action, targetType: event.targetType, targetId: event.targetId, beforeJson: event.before, afterJson: event.after, metadataJson: event.metadata, createdAt: new Date(event.occurredAt) }); },
    },
    outbox: {
      append: async (context, event) => { await this.tx(context).insert(destructionOutbox).values({ id: event.id, requestId: event.requestId, tournamentId: event.aggregateId, aggregateRevision: event.aggregateRevision, eventType: event.eventType, dedupeKey: event.dedupeKey, payloadJson: event.payload, status: event.status, attemptCount: event.attemptCount, createdAt: new Date(event.occurredAt), deliveredAt: event.deliveredAt ? new Date(event.deliveredAt) : null }); },
    },
    clock: { now: () => new Date().toISOString(), receiptExpiresAt: (now) => new Date(Date.parse(now) + 24 * 60 * 60 * 1_000).toISOString() },
  };

  constructor(private readonly database: V2Database) {}
  commandHandler() { return new DestructionCommandHandler(this.dependencies); }
  private tx(context: DestructionTransactionContext) { const transaction = this.contexts.get(context); if (!transaction) throw new Error("Destruction transaction context escaped its unit of work."); return transaction; }
  private actor(context: DestructionTransactionContext) { const actor = this.actors.get(context); if (!actor) throw new Error("Destruction actor was not authorized in the transaction."); return actor; }

  private async getPublishedReadyGallery(galleryId: string | null): Promise<DestructionPublicGalleryDto | null> {
    if (!galleryId) return null;
    const gallery = (await this.database.select({ id: mediaGalleries.id, title: mediaGalleries.title, description: mediaGalleries.description }).from(mediaGalleries).where(and(eq(mediaGalleries.id, galleryId), eq(mediaGalleries.status, "PUBLISHED"))).limit(1))[0];
    if (!gallery) return null;
    const assets = await this.database.select({ assetId: mediaGalleryAssets.privateAssetId, ordinal: mediaGalleryAssets.ordinal, status: privateAssets.status, purpose: privateAssets.purpose }).from(mediaGalleryAssets).innerJoin(privateAssets, eq(mediaGalleryAssets.privateAssetId, privateAssets.id)).where(eq(mediaGalleryAssets.galleryId, galleryId)).orderBy(mediaGalleryAssets.ordinal);
    const externalImages = await this.database.select({ ordinal: mediaGalleryExternalImages.ordinal, url: mediaGalleryExternalImages.sourceUrl })
      .from(mediaGalleryExternalImages).where(eq(mediaGalleryExternalImages.galleryId, galleryId))
      .orderBy(mediaGalleryExternalImages.ordinal);
    if (
      assets.length + externalImages.length < 1 || assets.length + externalImages.length > 5 ||
      assets.some((asset) => asset.status !== "READY" || asset.purpose !== "GALLERY")
    ) return null;
    const images = [
      ...assets.map((asset) => ({ assetId: asset.assetId, ordinal: asset.ordinal, url: `/api/media/assets/${asset.assetId}` })),
      ...externalImages.map((image) => ({ assetId: `external:${gallery.id}:${image.ordinal}`, ...image })),
    ].sort((left, right) => left.ordinal - right.ordinal);
    return Object.freeze({
      id: gallery.id,
      title: gallery.title,
      description: gallery.description,
      images: Object.freeze(images.map((image) => Object.freeze(image))),
    });
  }

  private async list(query: DestructionListQuery): Promise<DestructionPage> {
    const conditions = [query.query ? or(ilike(destructionCompetitions.titleNormalized, `%${normalizeText(query.query)}%`), ilike(destructionCompetitions.title, `%${query.query}%`)) : undefined, query.status ? eq(destructionCompetitions.status, query.status) : undefined, query.format ? eq(destructionCompetitions.preliminaryFormat, query.format) : undefined].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, totals] = await Promise.all([this.database.select().from(destructionCompetitions).where(where).orderBy(desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize), this.database.select({ value: count() }).from(destructionCompetitions).where(where)]);
    const total = totals[0]?.value ?? 0;
    const aggregates = rows.map(aggregateFromRow);
    const catalog = await loadCompetitionPlayerDisplayCatalog(
      this.database,
      aggregates.flatMap((aggregate) => [
        ...aggregate.participants.map((entry) => entry.playerId),
        ...aggregate.mvpBallots.flatMap((ballot) => ballot.finalizedPlayerId ? [ballot.finalizedPlayerId] : []),
      ]),
    );
    return { items: rows.map((row, index) => ({ ...toDestructionPublicDto(aggregates[index]!, catalog.labels), participantCount: row.participantCount })), page: query.page, pageSize: query.pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize) };
  }

  listPublic(query: DestructionListQuery) { return this.list(query); }
  listAdmin(query: DestructionListQuery) { return this.list(query); }
  async resolveLegacyId(legacyId: number) {
    const tournamentId = deriveLegacyCompetitionUuid("competition.destruction_competitions", legacyId);
    if (!tournamentId) return null;
    const row = (await this.database.select({ id: destructionCompetitions.id }).from(destructionCompetitions)
      .where(eq(destructionCompetitions.id, tournamentId)).limit(1))[0];
    return row?.id ?? null;
  }
  async getPublic(tournamentId: string) {
    const row = (await this.database.select().from(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)).limit(1))[0];
    if (!row) return null;
    const aggregate = aggregateFromRow(row);
    const [catalog, gallery] = await Promise.all([
      loadCompetitionPlayerDisplayCatalog(this.database, [
        ...aggregate.participants.map((entry) => entry.playerId),
        ...aggregate.mvpBallots.flatMap((ballot) => ballot.finalizedPlayerId ? [ballot.finalizedPlayerId] : []),
      ]),
      this.getPublishedReadyGallery(aggregate.galleryId),
    ]);
    return toDestructionPublicDto(aggregate, catalog.labels, gallery);
  }
  async getAdmin(tournamentId: string) { const row = (await this.database.select().from(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)).limit(1))[0]; return row ? aggregateFromRow(row) : null; }
  async getAdminWorkspace(tournamentId: string) {
    const destruction = await this.getAdmin(tournamentId);
    if (!destruction) return null;
    const catalog = await loadCompetitionPlayerDisplayCatalog(
      this.database,
      [...destruction.applications.map((entry) => entry.playerId), ...destruction.participants.map((entry) => entry.playerId)],
      true,
    );
    const candidateGalleries = await this.database.select({ id: mediaGalleries.id, title: mediaGalleries.title }).from(mediaGalleries).where(eq(mediaGalleries.status, "PUBLISHED")).orderBy(desc(mediaGalleries.publishedAt), mediaGalleries.id).limit(50);
    const galleryOptions = (await Promise.all(candidateGalleries.map(async (gallery) => await this.getPublishedReadyGallery(gallery.id) ? gallery : null))).filter((gallery): gallery is NonNullable<typeof gallery> => gallery !== null);
    return {
      destruction,
      playerOptions: catalog.options,
      playerLabels: Object.fromEntries(catalog.labels),
      galleryOptions,
    };
  }
  async getOwnApplication(tournamentId: string, ownerUserAccountId: string) {
    const row = (await this.database.select({ applicationId: destructionApplicationIndex.applicationId, playerId: destructionApplicationIndex.playerId, position: destructionApplicationIndex.position, status: destructionApplicationIndex.status, revision: destructionCompetitions.revision }).from(destructionApplicationIndex).innerJoin(destructionCompetitions, eq(destructionCompetitions.id, destructionApplicationIndex.tournamentId)).where(and(eq(destructionApplicationIndex.tournamentId, tournamentId), eq(destructionApplicationIndex.ownerUserAccountId, ownerUserAccountId))).limit(1))[0];
    return row ? { applicationId: row.applicationId, tournamentId, tournamentRevision: row.revision, playerId: row.playerId, position: row.position, status: row.status } : null;
  }
  async getOwnMvpBallots(tournamentId: string, ownerUserAccountId: string) {
    const row = (await this.database.select().from(destructionCompetitions).where(eq(destructionCompetitions.id, tournamentId)).limit(1))[0];
    if (!row) return [];
    const application = await this.getOwnApplication(tournamentId, ownerUserAccountId);
    if (!application) return [];
    const aggregate = aggregateFromRow(row);
    const ballots = aggregate.mvpBallots.filter((ballot) =>
      ballot.finalizedPlayerId === null && ballot.participantPlayerIds.includes(application.playerId));
    const catalog = await loadCompetitionPlayerDisplayCatalog(this.database, ballots.flatMap((ballot) => ballot.candidatePlayerIds));
    const publicProjection = toDestructionPublicDto(aggregate, catalog.labels);
    const fixtureNames = new Map([
      ...publicProjection.preliminaryFixtures.map((fixture) => [fixture.id, `${fixture.teamAName} vs ${fixture.teamBName}`] as const),
      ...publicProjection.tournamentFixtures.map((fixture) => [fixture.id, `${fixture.teamAName} vs ${fixture.teamBName}`] as const),
    ]);
    return ballots.map((ballot) => ({
      fixtureId: ballot.fixtureId,
      fixtureName: fixtureNames.get(ballot.fixtureId) ?? "알 수 없는 경기",
      candidates: ballot.candidatePlayerIds.filter((playerId) => playerId !== application.playerId).map((playerId) => ({
        playerId,
        playerName: catalog.labels.get(playerId) ?? "알 수 없는 선수",
      })),
    }));
  }
  async getOwnedPlayerId(ownerUserAccountId: string) { return (await this.database.select({ id: players.id }).from(players).where(and(eq(players.userAccountId, ownerUserAccountId), eq(players.status, "ACTIVE"))).limit(1))[0]?.id ?? null; }
}
