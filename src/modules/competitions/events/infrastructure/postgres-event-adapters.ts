import { randomUUID } from "node:crypto";

import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { calculateTeamBalanceCandidates } from "@/modules/team-tools";
import { PostgresTeamBalanceRatingProvider } from "@/modules/team-tools/infrastructure/postgres-team-balance-rating-provider";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { players } from "@/platform/db/schema/registry";
import {
  eventCommandReceipts,
  eventCompetitions,
  eventOutbox,
  eventParticipantIndex,
} from "@/platform/db/schema/event-competitions";
import type { V2Transaction } from "@/platform/db/transaction";
import { loadCompetitionPlayerDisplayCatalog } from "../../infrastructure/postgres-player-display-catalog";

import type { CompetitionCommandReceipt } from "../../core";
import { EventCommandHandler, type EventCommandHandlerDependencies } from "../application/event-command-handler";
import type { EventCommand } from "../application/event-command";
import type { EventListQuery, EventPage, EventQueryRepository } from "../application/event-query";
import type {
  EventMutationBody,
  EventReceiptClaim,
  EventTransactionContext,
} from "../application/ports";
import { toOwnEventApplicationDto, toPublicEventDto } from "../application/public-event-dto";
import { EventDomainError, type EventAggregate } from "../domain/event";

type EventRow = typeof eventCompetitions.$inferSelect;
type RuntimeActor = EventCommand["metadata"]["actor"] & Readonly<{
  authVersion?: number;
  sessionRole?: "USER" | "ADMIN" | "SUPER_ADMIN";
}>;

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
}

function snapshot(aggregate: EventAggregate): Record<string, unknown> {
  return JSON.parse(JSON.stringify(aggregate)) as Record<string, unknown>;
}

function aggregateFromRow(row: EventRow): EventAggregate {
  const value = row.aggregateJson as unknown as EventAggregate;
  if (
    !value || typeof value !== "object" || value.id !== row.id || value.revision !== row.revision ||
    value.lifecycle?.status !== row.status || !Array.isArray(value.participants) || !Array.isArray(value.teams)
  ) throw new EventDomainError("INVALID_STATE", "The stored event aggregate snapshot is inconsistent.");
  return value;
}

function rowValues(aggregate: EventAggregate, actorUserAccountId: string) {
  const activeParticipantCount = aggregate.participants.filter((entry) => entry.status === "ACTIVE").length;
  if (activeParticipantCount > 10) {
    throw new EventDomainError("PRECONDITION_FAILED", "An event cannot retain more than ten active participants.");
  }
  return {
    title: aggregate.settings.title,
    titleNormalized: normalizeText(aggregate.settings.title),
    description: aggregate.settings.description,
    format: aggregate.settings.format,
    status: aggregate.lifecycle.status,
    recruitmentOpensAt: new Date(aggregate.settings.recruitmentOpensAt),
    recruitmentClosesAt: new Date(aggregate.settings.recruitmentClosesAt),
    bracketBestOf: aggregate.settings.bracketBestOf,
    activeParticipantCount,
    aggregateJson: snapshot(aggregate),
    revision: aggregate.revision,
    updatedByUserAccountId: actorUserAccountId,
    updatedAt: new Date(aggregate.updatedAt),
  };
}

function same(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

export class PostgresEventAdapter implements EventQueryRepository {
  private readonly contexts = new WeakMap<EventTransactionContext, V2Transaction>();
  private readonly ratings = new PostgresTeamBalanceRatingProvider();

  readonly dependencies: EventCommandHandlerDependencies = {
    unitOfWork: {
      transaction: (operation) => this.database.transaction(async (transaction) => {
        const context = Object.freeze({}) as EventTransactionContext;
        this.contexts.set(context, transaction);
        try { return await operation(context); } finally { this.contexts.delete(context); }
      }, { isolationLevel: "serializable" }),
    },
    repository: {
      loadForUpdate: async (context, eventId) => {
        const row = (await this.tx(context).select().from(eventCompetitions)
          .where(eq(eventCompetitions.id, eventId)).for("update").limit(1))[0];
        return row ? aggregateFromRow(row) : null;
      },
      save: async (context, input) => {
        const transaction = this.tx(context);
        const actor = this.actorForContext(context);
        const values = rowValues(input.aggregate, actor.userAccountId);
        if (input.create) {
          await transaction.insert(eventCompetitions).values({
            id: input.aggregate.id,
            ...values,
            createdByUserAccountId: actor.userAccountId,
            createdAt: new Date(input.aggregate.createdAt),
          });
        } else {
          const updated = await transaction.update(eventCompetitions).set(values)
            .where(and(eq(eventCompetitions.id, input.aggregate.id), eq(eventCompetitions.revision, input.expectedRevision)))
            .returning({ id: eventCompetitions.id });
          if (!updated[0]) throw new EventDomainError("REVISION_CONFLICT", "Event revision changed.");
        }
        for (const participant of input.aggregate.participants) {
          await transaction.insert(eventParticipantIndex).values({
            eventId: input.aggregate.id,
            participantId: participant.id,
            playerId: participant.playerId,
            ownerUserAccountId: participant.ownerUserAccountId,
            source: participant.source,
            status: participant.status,
            mainPosition: participant.mainPosition,
            subPositionsJson: [...participant.subPositions],
            updatedAt: new Date(input.aggregate.updatedAt),
          }).onConflictDoUpdate({
            target: [eventParticipantIndex.eventId, eventParticipantIndex.participantId],
            set: {
              status: participant.status,
              mainPosition: participant.mainPosition,
              subPositionsJson: [...participant.subPositions],
              updatedAt: new Date(input.aggregate.updatedAt),
            },
          });
        }
      },
    },
    authorization: {
      recheck: async (context, input) => {
        const transaction = this.tx(context);
        const actor = input.actor as RuntimeActor;
        if (!Number.isSafeInteger(actor.authVersion) || actor.authVersion! < 0) {
          throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "Runtime session authVersion is required.");
        }
        const locked = await lockTransactionSessionActor(transaction, {
          userAccountId: actor.userAccountId,
          sessionId: actor.sessionId,
          role: actor.sessionRole ?? (actor.purpose === "ADMIN" ? "ADMIN" : "USER"),
          authVersion: actor.authVersion!,
        }, new Date(), actor.purpose === "ADMIN" ? ADMIN_MUTATION_SESSION_POLICY : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY);
        if (!locked) throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "The session is stale or no longer authorized.");
        this.actors.set(context, actor);
        if (input.intent.kind === "APPROVED_OWNER") {
          const playerRows = await transaction.select({ id: players.id }).from(players).where(and(
            eq(players.userAccountId, actor.userAccountId),
            eq(players.status, "ACTIVE"),
            ...(input.intent.playerId ? [eq(players.id, input.intent.playerId)] : []),
          )).for("update").limit(1);
          if (!playerRows[0]) throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "An active owned player is required.");
          if (input.intent.playerId === null) {
            const owned = await transaction.select({ participantId: eventParticipantIndex.participantId })
              .from(eventParticipantIndex).where(and(
                eq(eventParticipantIndex.eventId, input.eventId),
                eq(eventParticipantIndex.ownerUserAccountId, actor.userAccountId),
                eq(eventParticipantIndex.playerId, playerRows[0].id),
              )).limit(1);
            if (!owned[0]) throw new EventDomainError("INVALID_AUTHORIZATION_INTENT", "The application is not owned by this account.");
          }
        }
      },
    },
    receipts: {
      claim: async (context, command): Promise<EventReceiptClaim> => {
        const transaction = this.tx(context);
        const key = `${command.metadata.actor.userAccountId}:${command.metadata.idempotency.scope}:${Buffer.from(command.metadata.idempotency.keyHash).toString("hex")}`;
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
        await transaction.delete(eventCommandReceipts).where(and(
          eq(eventCommandReceipts.actorUserAccountId, command.metadata.actor.userAccountId),
          eq(eventCommandReceipts.scope, command.metadata.idempotency.scope),
          eq(eventCommandReceipts.keyHash, Buffer.from(command.metadata.idempotency.keyHash)),
          sql<boolean>`${eventCommandReceipts.expiresAt} <= clock_timestamp()`,
        ));
        const row = (await transaction.select().from(eventCommandReceipts).where(and(
          eq(eventCommandReceipts.actorUserAccountId, command.metadata.actor.userAccountId),
          eq(eventCommandReceipts.scope, command.metadata.idempotency.scope),
          eq(eventCommandReceipts.keyHash, Buffer.from(command.metadata.idempotency.keyHash)),
          sql<boolean>`${eventCommandReceipts.expiresAt} > clock_timestamp()`,
        )).limit(1))[0];
        if (!row) return { kind: "CLAIMED" };
        if (!same(row.requestHash, command.metadata.idempotency.requestFingerprint)) return { kind: "MISMATCH" };
        return { kind: "REPLAY", receipt: {
          actorUserAccountId: row.actorUserAccountId,
          scope: row.scope,
          keyHash: row.keyHash,
          requestHash: row.requestHash,
          responseStatus: row.responseStatus,
          body: row.responseJson as EventMutationBody,
          revision: row.revision,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
        } };
      },
      complete: async (context, receipt: CompetitionCommandReceipt<EventMutationBody>) => {
        const eventId = receipt.body.eventId;
        await this.tx(context).insert(eventCommandReceipts).values({
          id: randomUUID(),
          eventId,
          actorUserAccountId: receipt.actorUserAccountId,
          scope: receipt.scope,
          keyHash: Buffer.from(receipt.keyHash),
          requestHash: Buffer.from(receipt.requestHash),
          responseStatus: receipt.responseStatus,
          responseJson: receipt.body,
          revision: receipt.revision!,
          createdAt: new Date(receipt.createdAt),
          expiresAt: new Date(receipt.expiresAt),
        });
      },
    },
    audit: {
      append: async (context, event) => {
        await this.tx(context).insert(auditEvents).values({
          requestId: event.requestId,
          actorUserAccountId: event.actorUserAccountId,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          beforeJson: event.before,
          afterJson: event.after,
          metadataJson: event.metadata,
          createdAt: new Date(event.occurredAt),
        });
      },
    },
    outbox: {
      append: async (context, event) => {
        await this.tx(context).insert(eventOutbox).values({
          id: event.id,
          requestId: event.requestId,
          eventId: event.aggregateId,
          aggregateRevision: event.aggregateRevision,
          eventType: event.eventType,
          dedupeKey: event.dedupeKey,
          payloadJson: event.payload,
          status: event.status,
          attemptCount: event.attemptCount,
          createdAt: new Date(event.occurredAt),
          deliveredAt: event.deliveredAt ? new Date(event.deliveredAt) : null,
        });
      },
    },
    teamBalance: {
      calculate: async ({ transaction: context, participants }) => {
        const transaction = this.tx(context);
        const ratingSnapshot = await this.ratings.load(transaction, participants.map((entry) => entry.playerId));
        return calculateTeamBalanceCandidates(participants.map((entry) => ({
          playerId: entry.playerId,
          eligiblePositions: entry.eligiblePositions,
          rating: ratingSnapshot.ratings.get(entry.playerId) ?? null,
        })));
      },
    },
    clock: {
      now: () => new Date().toISOString(),
      receiptExpiresAt: (now) => new Date(Date.parse(now) + 24 * 60 * 60 * 1_000).toISOString(),
    },
  };

  private readonly actors = new WeakMap<EventTransactionContext, RuntimeActor>();

  constructor(private readonly database: V2Database) {}

  commandHandler() { return new EventCommandHandler(this.dependencies); }

  private tx(context: EventTransactionContext) {
    const transaction = this.contexts.get(context);
    if (!transaction) throw new Error("Event transaction context escaped its unit of work.");
    return transaction;
  }

  private actorForContext(context: EventTransactionContext) {
    const actor = this.actors.get(context);
    if (!actor) throw new Error("Event actor was not authorized in the transaction.");
    return actor;
  }

  private async list(query: EventListQuery, now: Date): Promise<EventPage> {
    const conditions = [
      query.query ? or(ilike(eventCompetitions.titleNormalized, `%${normalizeText(query.query)}%`), ilike(eventCompetitions.title, `%${query.query}%`)) : undefined,
      query.status ? eq(eventCompetitions.status, query.status) : undefined,
      query.format ? eq(eventCompetitions.format, query.format) : undefined,
    ].filter((value): value is Exclude<typeof value, undefined> => value !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, totals] = await Promise.all([
      this.database.select().from(eventCompetitions).where(where)
        .orderBy(desc(eventCompetitions.recruitmentOpensAt), desc(eventCompetitions.id))
        .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
      this.database.select({ value: count() }).from(eventCompetitions).where(where),
    ]);
    const total = totals[0]?.value ?? 0;
    const aggregates = rows.map(aggregateFromRow);
    const catalog = await loadCompetitionPlayerDisplayCatalog(
      this.database,
      aggregates.flatMap((aggregate) => aggregate.participants.map((entry) => entry.playerId)),
    );
    return {
      items: aggregates.map((aggregate) => toPublicEventDto(aggregate, now.toISOString(), catalog.labels)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  listPublic(query: EventListQuery, now: Date) { return this.list(query, now); }
  listAdmin(query: EventListQuery, now: Date) { return this.list(query, now); }

  async getPublic(eventId: string, now: Date) {
    const row = (await this.database.select().from(eventCompetitions).where(eq(eventCompetitions.id, eventId)).limit(1))[0];
    if (!row) return null;
    const aggregate = aggregateFromRow(row);
    const catalog = await loadCompetitionPlayerDisplayCatalog(this.database, aggregate.participants.map((entry) => entry.playerId));
    return toPublicEventDto(aggregate, now.toISOString(), catalog.labels);
  }

  async getAdmin(eventId: string) {
    const row = (await this.database.select().from(eventCompetitions).where(eq(eventCompetitions.id, eventId)).limit(1))[0];
    return row ? aggregateFromRow(row) : null;
  }

  async getAdminWorkspace(eventId: string) {
    const event = await this.getAdmin(eventId);
    if (!event) return null;
    const catalog = await loadCompetitionPlayerDisplayCatalog(
      this.database,
      event.participants.map((entry) => entry.playerId),
      true,
    );
    return {
      event,
      playerOptions: catalog.options,
      playerLabels: Object.fromEntries(catalog.labels),
    };
  }

  async getOwnApplication(eventId: string, ownerUserAccountId: string) {
    const row = (await this.database.select().from(eventCompetitions).where(eq(eventCompetitions.id, eventId)).limit(1))[0];
    return row ? toOwnEventApplicationDto(aggregateFromRow(row), ownerUserAccountId) : null;
  }

  async getOwnedPlayerId(ownerUserAccountId: string) {
    return (await this.database.select({ id: players.id }).from(players).where(and(
      eq(players.userAccountId, ownerUserAccountId),
      eq(players.status, "ACTIVE"),
    )).limit(1))[0]?.id ?? null;
  }
}
