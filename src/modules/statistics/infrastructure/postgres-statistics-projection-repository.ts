import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import type { V2Database } from "@/platform/db/database";
import {
  matchGames,
  matchParticipants,
  matchProjectionReceipts,
  matchRecalculationOutbox,
  matchSeries,
  playerChampionStats,
  playerPositionStats,
  playerSeasonStats,
  seasonCommandReceipts,
  seasonProjectionStates,
  seasons,
  statisticsProjectionRuns,
} from "@/platform/db/schema";
import type { V2Transaction } from "@/platform/db/transaction";
import {
  buildSeasonStatisticsProjection,
  type PublishedMatchSource,
  type SeasonStatisticsProjection,
} from "../domain/season-statistics";
import type {
  ClaimedMatchChangedEvent,
  MatchChangedApplyResult,
  SeasonProjectionApplyResult,
  StatisticsProjectionRepository,
} from "../application/ports/statistics-projection-repository";
import type {
  StatisticsCommandEnvelope,
  StatisticsCommandRepository,
  StatisticsRecalculationResult,
} from "../application/ports/statistics-query-repository";
import { StatisticsServiceError } from "../application/statistics-service";

type ClaimRow = {
  eventId: string;
  eventType: "MATCH_CHANGED";
  action: ClaimedMatchChangedEvent["action"];
  matchId: string;
  matchRevision: string | number;
  oldSeasonId: string | null;
  newSeasonId: string | null;
  inputDigest: Buffer;
  lockedAt: Date | string;
};

const LEASE_SECONDS = 60;
const COMMAND_RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;
const SUPER_STATISTICS_POLICY = {
  purpose: "ADMIN",
  minimumRole: "SUPER_ADMIN",
  allowedStatuses: ["APPROVED"],
  allowMustChangePassword: false,
  adminTotp: "REQUIRED",
} as const;

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_STATISTICS_LEASE_TIME");
  return date;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function omitGeneration<T extends { generation: number }>(value: T): Omit<T, "generation"> {
  const { generation, ...rest } = value;
  void generation;
  return rest;
}

export function seasonProjectionSourceDigest(projection: SeasonStatisticsProjection): Buffer {
  const withoutGeneration = {
    seasonId: projection.seasonId,
    sourceMatchCount: projection.sourceMatchCount,
    sourceGameCount: projection.sourceGameCount,
    sourceParticipantCount: projection.sourceParticipantCount,
    playerStats: projection.playerStats.map(omitGeneration),
    championStats: projection.championStats.map(omitGeneration),
    positionStats: projection.positionStats.map(omitGeneration),
  };
  return createHash("sha256").update(JSON.stringify(stableValue(withoutGeneration))).digest();
}

function sameBuffer(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && left.equals(right);
}

function projectionResult(
  seasonId: string,
  generation: number,
  sourceMatchCount: number,
  sourceGameCount: number,
  sourceParticipantCount: number,
  sourceChecksum: Buffer,
): SeasonProjectionApplyResult {
  return {
    seasonId,
    generation,
    sourceMatchCount,
    sourceGameCount,
    sourceParticipantCount,
    sourceChecksumHex: sourceChecksum.toString("hex"),
  };
}

async function loadPublishedSeasonSource(
  transaction: V2Transaction,
  seasonId: string,
): Promise<PublishedMatchSource[]> {
  const seriesRows = await transaction
    .select({ id: matchSeries.id, seasonId: matchSeries.seasonId, status: matchSeries.status })
    .from(matchSeries)
    .where(and(eq(matchSeries.seasonId, seasonId), eq(matchSeries.status, "PUBLISHED")))
    .orderBy(asc(matchSeries.id));
  if (seriesRows.length === 0) return [];

  const seriesIds = seriesRows.map((row) => row.id);
  const gameRows = await transaction
    .select({
      id: matchGames.id,
      seriesId: matchGames.seriesId,
      winnerTeam: matchGames.winnerTeam,
      mvpPlayerId: matchGames.mvpPlayerId,
    })
    .from(matchGames)
    .where(inArray(matchGames.seriesId, seriesIds))
    .orderBy(asc(matchGames.seriesId), asc(matchGames.gameNumber), asc(matchGames.id));
  const gameIds = gameRows.map((row) => row.id);
  const participantRows = gameIds.length === 0
    ? []
    : await transaction
      .select({
        gameId: matchParticipants.gameId,
        playerId: matchParticipants.playerId,
        championKey: matchParticipants.championKey,
        team: matchParticipants.team,
        position: matchParticipants.position,
      })
      .from(matchParticipants)
      .where(inArray(matchParticipants.gameId, gameIds))
      .orderBy(asc(matchParticipants.gameId), asc(matchParticipants.team), asc(matchParticipants.position), asc(matchParticipants.playerId));

  const participantsByGame = new Map<string, typeof participantRows>();
  for (const row of participantRows) {
    participantsByGame.set(row.gameId, [...(participantsByGame.get(row.gameId) ?? []), row]);
  }
  const gamesBySeries = new Map<string, PublishedMatchSource["games"][number][]>();
  for (const game of gameRows) {
    const sourceGame: PublishedMatchSource["games"][number] = {
      id: game.id,
      winnerTeam: game.winnerTeam,
      mvpPlayerId: game.mvpPlayerId,
      participants: (participantsByGame.get(game.id) ?? []).map((participant) => ({
        playerId: participant.playerId,
        championKey: participant.championKey,
        team: participant.team,
        position: participant.position,
      })),
    };
    gamesBySeries.set(game.seriesId, [...(gamesBySeries.get(game.seriesId) ?? []), sourceGame]);
  }

  return seriesRows.map((series) => ({
    id: series.id,
    seasonId: series.seasonId,
    status: series.status,
    games: gamesBySeries.get(series.id) ?? [],
  }));
}

async function rebuildSeasonProjection(
  transaction: V2Transaction,
  input: Readonly<{
    seasonId: string;
    currentState: typeof seasonProjectionStates.$inferSelect;
    trigger: "OUTBOX" | "ADMIN";
    requestedOutboxEventId: string | null;
    now: Date;
  }>,
): Promise<SeasonProjectionApplyResult> {
  const generation = input.currentState.generation + 1;
  const source = await loadPublishedSeasonSource(transaction, input.seasonId);
  const projection = buildSeasonStatisticsProjection({
    seasonId: input.seasonId,
    generation,
    matches: source,
  });
  const checksum = seasonProjectionSourceDigest(projection);

  await transaction.delete(playerChampionStats).where(eq(playerChampionStats.seasonId, input.seasonId));
  await transaction.delete(playerPositionStats).where(eq(playerPositionStats.seasonId, input.seasonId));
  await transaction.delete(playerSeasonStats).where(eq(playerSeasonStats.seasonId, input.seasonId));
  if (projection.playerStats.length > 0) {
    await transaction.insert(playerSeasonStats).values(
      projection.playerStats.map((row) => ({ ...row, calculatedAt: input.now })),
    );
  }
  if (projection.championStats.length > 0) {
    await transaction.insert(playerChampionStats).values(
      projection.championStats.map((row) => ({ ...row, calculatedAt: input.now })),
    );
  }
  if (projection.positionStats.length > 0) {
    await transaction.insert(playerPositionStats).values(
      projection.positionStats.map((row) => ({ ...row, calculatedAt: input.now })),
    );
  }

  await transaction.insert(statisticsProjectionRuns).values({
    id: randomUUID(),
    seasonId: input.seasonId,
    trigger: input.trigger,
    status: "SUCCEEDED",
    requestedOutboxEventId: input.requestedOutboxEventId,
    baseGeneration: input.currentState.generation,
    resultGeneration: generation,
    sourceMatchCount: projection.sourceMatchCount,
    sourceGameCount: projection.sourceGameCount,
    sourceParticipantCount: projection.sourceParticipantCount,
    sourceChecksum: checksum,
    startedAt: input.now,
    completedAt: input.now,
  });
  await transaction
    .update(seasonProjectionStates)
    .set({
      generation,
      status: "READY",
      sourceMatchCount: projection.sourceMatchCount,
      sourceGameCount: projection.sourceGameCount,
      sourceParticipantCount: projection.sourceParticipantCount,
      sourceChecksum: checksum,
      calculatedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(seasonProjectionStates.seasonId, input.seasonId));
  return projectionResult(
    input.seasonId,
    generation,
    projection.sourceMatchCount,
    projection.sourceGameCount,
    projection.sourceParticipantCount,
    checksum,
  );
}

export class PostgresStatisticsProjectionRepository implements StatisticsProjectionRepository, StatisticsCommandRepository {
  constructor(private readonly database: V2Database) {}

  async claimNextMatchChanged(now: Date): Promise<ClaimedMatchChangedEvent | null> {
    return this.database.transaction(async (transaction) => {
      const result = await transaction.execute(sql<ClaimRow>`
        WITH candidate AS (
          SELECT id
          FROM competition.match_recalculation_outbox
          WHERE event_type = 'MATCH_CHANGED'
            AND available_at <= ${now}
            AND (
              status IN ('PENDING', 'FAILED')
              OR (
                status = 'PROCESSING'
                AND locked_at <= ${now}::timestamptz - make_interval(secs => ${LEASE_SECONDS})
              )
            )
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE competition.match_recalculation_outbox AS outbox
        SET status = 'PROCESSING',
            attempt_count = outbox.attempt_count + 1,
            locked_at = ${now},
            delivered_at = NULL,
            last_error_code = NULL,
            updated_at = ${now}
        FROM candidate
        WHERE outbox.id = candidate.id
        RETURNING outbox.id AS "eventId",
                  outbox.event_type AS "eventType",
                  outbox.action,
                  outbox.aggregate_id AS "matchId",
                  outbox.match_revision AS "matchRevision",
                  outbox.old_season_id AS "oldSeasonId",
                  outbox.new_season_id AS "newSeasonId",
                  outbox.input_digest AS "inputDigest",
                  outbox.locked_at AS "lockedAt"
      `);
      const row = result.rows[0] as ClaimRow | undefined;
      if (!row) return null;
      const matchRevision = Number(row.matchRevision);
      if (!Number.isSafeInteger(matchRevision) || matchRevision < 0) {
        throw new Error("INVALID_STATISTICS_EVENT_REVISION");
      }
      return {
        eventId: row.eventId,
        eventType: row.eventType,
        action: row.action,
        matchId: row.matchId,
        matchRevision,
        oldSeasonId: row.oldSeasonId,
        newSeasonId: row.newSeasonId,
        inputDigest: Buffer.from(row.inputDigest),
        lockedAt: asDate(row.lockedAt),
      };
    });
  }

  async applyClaimedMatchChanged(input: Readonly<{
    event: ClaimedMatchChangedEvent;
    affectedSeasonIds: readonly string[];
    now: Date;
  }>): Promise<MatchChangedApplyResult> {
    return this.database.transaction(async (transaction) => {
      const [receipt] = await transaction
        .select()
        .from(matchProjectionReceipts)
        .where(eq(matchProjectionReceipts.outboxEventId, input.event.eventId))
        .limit(1);
      if (receipt) {
        if (
          receipt.matchId !== input.event.matchId ||
          receipt.matchRevision !== input.event.matchRevision ||
          receipt.action !== input.event.action ||
          receipt.oldSeasonId !== input.event.oldSeasonId ||
          receipt.newSeasonId !== input.event.newSeasonId ||
          !sameBuffer(receipt.inputDigest, input.event.inputDigest)
        ) {
          throw new Error("STATISTICS_RECEIPT_PROVENANCE_MISMATCH");
        }
        const states = input.affectedSeasonIds.length === 0
          ? []
          : await transaction
            .select()
            .from(seasonProjectionStates)
            .where(inArray(seasonProjectionStates.seasonId, input.affectedSeasonIds));
        return {
          eventId: input.event.eventId,
          kind: "REPLAYED",
          affectedSeasonIds: input.affectedSeasonIds,
          projections: states
            .filter((state) => state.status === "READY" && state.sourceChecksum)
            .map((state) => projectionResult(
              state.seasonId,
              state.generation,
              state.sourceMatchCount,
              state.sourceGameCount,
              state.sourceParticipantCount,
              state.sourceChecksum!,
            )),
        };
      }

      const [storedEvent] = await transaction
        .select()
        .from(matchRecalculationOutbox)
        .where(eq(matchRecalculationOutbox.id, input.event.eventId))
        .for("update");
      if (
        !storedEvent ||
        storedEvent.status !== "PROCESSING" ||
        !storedEvent.lockedAt ||
        storedEvent.lockedAt.getTime() !== input.event.lockedAt.getTime() ||
        storedEvent.aggregateId !== input.event.matchId ||
        storedEvent.matchRevision !== input.event.matchRevision ||
        storedEvent.action !== input.event.action ||
        storedEvent.oldSeasonId !== input.event.oldSeasonId ||
        storedEvent.newSeasonId !== input.event.newSeasonId ||
        !sameBuffer(storedEvent.inputDigest, input.event.inputDigest)
      ) {
        throw new Error("STATISTICS_EVENT_LEASE_LOST");
      }

      if (input.affectedSeasonIds.length > 0) {
        const lockedSeasons = await transaction
          .select({ id: seasons.id })
          .from(seasons)
          .where(inArray(seasons.id, input.affectedSeasonIds))
          .orderBy(asc(seasons.id))
          .for("update");
        if (lockedSeasons.length !== input.affectedSeasonIds.length) {
          throw new Error("STATISTICS_SEASON_NOT_FOUND");
        }
      }

      const projections: SeasonProjectionApplyResult[] = [];
      for (const seasonId of input.affectedSeasonIds) {
        await transaction
          .insert(seasonProjectionStates)
          .values({ seasonId })
          .onConflictDoNothing({ target: seasonProjectionStates.seasonId });
        const [currentState] = await transaction
          .select()
          .from(seasonProjectionStates)
          .where(eq(seasonProjectionStates.seasonId, seasonId))
          .for("update");
        if (!currentState) throw new Error("STATISTICS_STATE_NOT_FOUND");

        projections.push(await rebuildSeasonProjection(transaction, {
          seasonId,
          currentState,
          trigger: "OUTBOX",
          requestedOutboxEventId: input.event.eventId,
          now: input.now,
        }));
      }

      await transaction.insert(matchProjectionReceipts).values({
        outboxEventId: input.event.eventId,
        matchId: input.event.matchId,
        matchRevision: input.event.matchRevision,
        action: input.event.action,
        oldSeasonId: input.event.oldSeasonId,
        newSeasonId: input.event.newSeasonId,
        inputDigest: input.event.inputDigest,
        appliedAt: input.now,
      });
      const delivered = await transaction
        .update(matchRecalculationOutbox)
        .set({
          status: "DELIVERED",
          lockedAt: null,
          deliveredAt: input.now,
          lastErrorCode: null,
          updatedAt: input.now,
        })
        .where(and(
          eq(matchRecalculationOutbox.id, input.event.eventId),
          eq(matchRecalculationOutbox.status, "PROCESSING"),
          eq(matchRecalculationOutbox.lockedAt, input.event.lockedAt),
        ))
        .returning({ id: matchRecalculationOutbox.id });
      if (delivered.length !== 1) throw new Error("STATISTICS_EVENT_LEASE_LOST");

      return {
        eventId: input.event.eventId,
        kind: "APPLIED",
        affectedSeasonIds: input.affectedSeasonIds,
        projections,
      };
    }, { isolationLevel: "serializable" });
  }

  async failClaimedMatchChanged(input: Readonly<{
    event: ClaimedMatchChangedEvent;
    failureCode: string;
    now: Date;
  }>): Promise<void> {
    await this.database
      .update(matchRecalculationOutbox)
      .set({
        status: "FAILED",
        lockedAt: null,
        deliveredAt: null,
        lastErrorCode: input.failureCode.slice(0, 64),
        updatedAt: input.now,
      })
      .where(and(
        eq(matchRecalculationOutbox.id, input.event.eventId),
        eq(matchRecalculationOutbox.status, "PROCESSING"),
        eq(matchRecalculationOutbox.lockedAt, input.event.lockedAt),
      ));
  }

  async recalculateSeason(
    envelope: StatisticsCommandEnvelope,
    seasonId: string,
    expectedGeneration: number,
    now: Date,
  ): Promise<StatisticsRecalculationResult> {
    return this.database.transaction(async (transaction) => {
      const actor = await lockTransactionSessionActor(
        transaction,
        envelope.actorSession,
        now,
        SUPER_STATISTICS_POLICY,
      );
      if (!actor) {
        throw new StatisticsServiceError("SESSION_STALE", "관리자 세션이 더 이상 유효하지 않습니다.");
      }

      const receiptLockKey = `${envelope.actorSession.userAccountId}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${receiptLockKey}, 0))`);
      await transaction
        .delete(seasonCommandReceipts)
        .where(and(
          eq(seasonCommandReceipts.actorUserAccountId, envelope.actorSession.userAccountId),
          eq(seasonCommandReceipts.scope, envelope.scope),
          eq(seasonCommandReceipts.keyHash, envelope.keyHash),
          sql<boolean>`${seasonCommandReceipts.expiresAt} <= clock_timestamp()`,
        ));
      const priorReceipt = (await transaction
        .select()
        .from(seasonCommandReceipts)
        .where(and(
          eq(seasonCommandReceipts.actorUserAccountId, envelope.actorSession.userAccountId),
          eq(seasonCommandReceipts.scope, envelope.scope),
          eq(seasonCommandReceipts.keyHash, envelope.keyHash),
          sql<boolean>`${seasonCommandReceipts.expiresAt} > clock_timestamp()`,
        ))
        .limit(1))[0];
      if (priorReceipt) {
        if (!Buffer.from(priorReceipt.requestHash).equals(envelope.requestHash)) {
          throw new StatisticsServiceError(
            "IDEMPOTENCY_MISMATCH",
            "같은 멱등성 키가 다른 요청에 사용되었습니다.",
          );
        }
        const body = priorReceipt.responseJson as StatisticsRecalculationResult["body"];
        return {
          body,
          status: 200,
          revision: body.generation,
          replayed: true,
        };
      }

      const season = (await transaction
        .select({ id: seasons.id, name: seasons.name })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .for("update")
        .limit(1))[0];
      if (!season) throw new StatisticsServiceError("NOT_FOUND", "시즌을 찾을 수 없습니다.");
      await transaction
        .insert(seasonProjectionStates)
        .values({ seasonId })
        .onConflictDoNothing({ target: seasonProjectionStates.seasonId });
      const currentState = (await transaction
        .select()
        .from(seasonProjectionStates)
        .where(eq(seasonProjectionStates.seasonId, seasonId))
        .for("update")
        .limit(1))[0];
      if (!currentState) throw new StatisticsServiceError("NOT_FOUND", "통계 상태를 찾을 수 없습니다.");
      if (currentState.generation !== expectedGeneration) {
        throw new StatisticsServiceError(
          "PRECONDITION_FAILED",
          "통계 projection revision이 변경되었습니다.",
        );
      }

      await transaction.insert(seasonCommandReceipts).values({
        id: randomUUID(),
        actorUserAccountId: actor.id,
        scope: envelope.scope,
        keyHash: envelope.keyHash,
        requestHash: envelope.requestHash,
        responseStatus: 202,
        responseJson: { pending: true },
        targetId: seasonId,
        createdAt: sql`clock_timestamp()`,
        expiresAt: sql`clock_timestamp() + (${COMMAND_RECEIPT_TTL_MS} * interval '1 millisecond')`,
      });
      const rebuilt = await rebuildSeasonProjection(transaction, {
        seasonId,
        currentState,
        trigger: "ADMIN",
        requestedOutboxEventId: null,
        now,
      });
      const body: StatisticsRecalculationResult["body"] = {
        seasonId,
        generation: rebuilt.generation,
        sourceMatchCount: rebuilt.sourceMatchCount,
        sourceGameCount: rebuilt.sourceGameCount,
        sourceParticipantCount: rebuilt.sourceParticipantCount,
        sourceChecksum: rebuilt.sourceChecksumHex,
      };
      await transaction.insert(auditEvents).values({
        requestId: envelope.requestId,
        actorUserAccountId: actor.id,
        action: "STATISTICS_RECALCULATED",
        targetType: "SEASON_STATISTICS",
        targetId: seasonId,
        beforeJson: {
          seasonName: season.name,
          generation: currentState.generation,
          status: currentState.status,
          sourceMatchCount: currentState.sourceMatchCount,
          sourceGameCount: currentState.sourceGameCount,
          sourceParticipantCount: currentState.sourceParticipantCount,
        },
        afterJson: body,
      });
      await transaction
        .update(seasonCommandReceipts)
        .set({ responseStatus: 200, responseJson: body })
        .where(and(
          eq(seasonCommandReceipts.actorUserAccountId, actor.id),
          eq(seasonCommandReceipts.scope, envelope.scope),
          eq(seasonCommandReceipts.keyHash, envelope.keyHash),
        ));
      return { body, status: 200, revision: rebuilt.generation, replayed: false };
    }, { isolationLevel: "serializable" });
  }
}
