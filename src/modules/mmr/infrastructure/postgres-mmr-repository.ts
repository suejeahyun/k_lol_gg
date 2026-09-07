import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { matchGames, matchParticipants, matchRecalculationOutbox, matchSeries } from "@/platform/db/schema/matches";
import {
  mmrCommandReceipts,
  mmrConsumerReceipts,
  mmrManualAdjustments,
  mmrMatchResultEvents,
  mmrOutbox,
  mmrPlayerPositionProfiles,
  mmrPlayerProfiles,
  mmrProjectionRuns,
  mmrProjectionStates,
} from "@/platform/db/schema/mmr";
import { players } from "@/platform/db/schema/registry";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type {
  MmrAdjustmentInput,
  MmrAdjustmentReview,
  MmrCatchUpResult,
  MmrCommandEnvelope,
  MmrMutationResult,
  MmrPage,
  MmrPlayerListItem,
  MmrPlayerQuery,
  MmrProjectionSummary,
  MmrRepository,
} from "../application/ports/mmr-repository";
import { MmrServiceError } from "../application/mmr-service";
import {
  MMR_FORMULA_VERSION,
  MMR_POSITIONS,
  rebuildMmrProjection,
  toPublicMmrProfileDto,
  type MmrManualAdjustmentSource,
  type MmrMatchSource,
  type MmrPlayerProfile,
} from "../domain/mmr-projection";

const GLOBAL_STATE_KEY = "GLOBAL";
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;

type SuccessfulMutation = Omit<MmrMutationResult, "replayed">;

function postgresCode(error: unknown): string | undefined {
  let current = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: string; cause?: unknown };
    if (candidate.code && /^[0-9A-Z]{5}$/u.test(candidate.code)) return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

async function currentState(transaction: V2Transaction) {
  await transaction.insert(mmrProjectionStates).values({ key: GLOBAL_STATE_KEY }).onConflictDoNothing();
  return (
    await transaction
      .select()
      .from(mmrProjectionStates)
      .where(eq(mmrProjectionStates.key, GLOBAL_STATE_KEY))
      .for("update")
      .limit(1)
  )[0]!;
}

async function loadLedger(transaction: V2Transaction) {
  const seriesRows = await transaction
    .select({ id: matchSeries.id, playedOn: matchSeries.playedOn, status: matchSeries.status })
    .from(matchSeries)
    .where(eq(matchSeries.status, "PUBLISHED"))
    .orderBy(asc(matchSeries.playedOn), asc(matchSeries.id));
  const seriesIds = seriesRows.map((row) => row.id);
  const gameRows = seriesIds.length === 0
    ? []
    : await transaction
        .select({ id: matchGames.id, seriesId: matchGames.seriesId, gameNumber: matchGames.gameNumber, winnerTeam: matchGames.winnerTeam })
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
          team: matchParticipants.team,
          position: matchParticipants.position,
          kills: matchParticipants.kills,
          deaths: matchParticipants.deaths,
          assists: matchParticipants.assists,
        })
        .from(matchParticipants)
        .where(inArray(matchParticipants.gameId, gameIds))
        .orderBy(asc(matchParticipants.gameId), asc(matchParticipants.team), asc(matchParticipants.position), asc(matchParticipants.playerId));
  const participantsByGame = new Map<string, typeof participantRows>();
  for (const row of participantRows) {
    const entries = participantsByGame.get(row.gameId) ?? [];
    entries.push(row);
    participantsByGame.set(row.gameId, entries);
  }
  const gamesBySeries = new Map<string, typeof gameRows>();
  for (const row of gameRows) {
    const entries = gamesBySeries.get(row.seriesId) ?? [];
    entries.push(row);
    gamesBySeries.set(row.seriesId, entries);
  }
  const matches: MmrMatchSource[] = seriesRows.map((series) => ({
    id: series.id,
    orderKey: `${series.playedOn}:${series.id}`,
    status: series.status,
    games: (gamesBySeries.get(series.id) ?? []).map((game) => ({
      id: game.id,
      gameNumber: game.gameNumber,
      winnerTeam: game.winnerTeam,
      participants: (participantsByGame.get(game.id) ?? []).map((participant) => ({
        playerId: participant.playerId,
        team: participant.team,
        position: participant.position,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
      })),
    })),
  }));
  const adjustmentRows = await transaction.select().from(mmrManualAdjustments).orderBy(
    asc(mmrManualAdjustments.createdAt),
    asc(mmrManualAdjustments.id),
  );
  const adjustments: MmrManualAdjustmentSource[] = adjustmentRows.map((row) => ({
    id: row.id,
    orderKey: `${row.createdAt.toISOString()}:${row.id}`,
    playerId: row.playerId,
    position: row.position,
    deltaBp: row.deltaBp,
    reasonCode: row.reasonCode,
  }));
  return { matches, adjustments };
}

async function pendingSourceRows(transaction: V2Transaction) {
  return transaction
    .select({
      id: matchRecalculationOutbox.id,
      matchId: matchRecalculationOutbox.aggregateId,
      matchRevision: matchRecalculationOutbox.matchRevision,
      inputDigest: matchRecalculationOutbox.inputDigest,
    })
    .from(matchRecalculationOutbox)
    .leftJoin(mmrConsumerReceipts, eq(mmrConsumerReceipts.outboxEventId, matchRecalculationOutbox.id))
    .where(isNull(mmrConsumerReceipts.outboxEventId))
    .orderBy(asc(matchRecalculationOutbox.createdAt), asc(matchRecalculationOutbox.id));
}

async function publishProjection(
  transaction: V2Transaction,
  input: Readonly<{
    trigger: "BOOTSTRAP" | "CATCH_UP" | "ADMIN" | "ADJUSTMENT";
    actorUserAccountId: string | null;
    expectedGeneration: number | null;
    requestId: string;
    adjustment: MmrAdjustmentInput | null;
    now: Date;
  }>,
) {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('mmr:projection:global', 0))`);
  const state = await currentState(transaction);
  if (input.expectedGeneration !== null && state.generation !== input.expectedGeneration) {
    throw new MmrServiceError("PRECONDITION_FAILED", "MMR generation이 변경되었습니다.");
  }
  if (input.adjustment) {
    const player = (
      await transaction.select({ id: players.id }).from(players).where(eq(players.id, input.adjustment.playerId)).for("share").limit(1)
    )[0];
    if (!player) throw new MmrServiceError("NOT_FOUND", "플레이어를 찾을 수 없습니다.");
    await transaction.insert(mmrManualAdjustments).values({
      id: randomUUID(),
      ...input.adjustment,
      actorUserAccountId: input.actorUserAccountId!,
      createdAt: input.now,
    });
  }
  // Capture receipts before reading the ledger. If S04 commits concurrently after
  // this point, the rebuild may include extra fresh data but can never acknowledge
  // an event that was absent from this projection's source boundary.
  const sources = await pendingSourceRows(transaction);
  const ledger = await loadLedger(transaction);
  const generation = state.generation + 1;
  const projection = rebuildMmrProjection({
    generation,
    matches: ledger.matches,
    manualAdjustments: ledger.adjustments,
  });
  const checksum = createHash("sha256").update(canonicalJson(ledger)).digest();
  const runId = randomUUID();
  await transaction.insert(mmrProjectionRuns).values({
    id: runId,
    trigger: input.trigger,
    actorUserAccountId: input.actorUserAccountId,
    baseGeneration: state.generation,
    resultGeneration: generation,
    sourceMatchCount: projection.sourceMatchCount,
    sourceGameCount: projection.sourceGameCount,
    sourceAdjustmentCount: projection.sourceAdjustmentCount,
    sourceChecksum: checksum,
    startedAt: input.now,
    completedAt: input.now,
  });
  if (projection.profiles.length > 0) {
    await transaction.insert(mmrPlayerProfiles).values(projection.profiles.map((profile) => ({
      generation,
      playerId: profile.playerId,
      overallScoreBp: profile.overallScoreBp,
      confidenceBp: profile.confidenceBp,
      sampleSize: profile.sampleSize,
      formulaVersion: MMR_FORMULA_VERSION,
      calculatedAt: input.now,
    })));
    await transaction.insert(mmrPlayerPositionProfiles).values(projection.profiles.flatMap((profile) =>
      MMR_POSITIONS.map((position) => ({
        generation,
        playerId: profile.playerId,
        position,
        scoreBp: profile.positions[position].scoreBp,
        sampleSize: profile.positions[position].sampleSize,
        calculatedAt: input.now,
      })),
    ));
  }
  if (projection.matchEvents.length > 0) {
    await transaction.insert(mmrMatchResultEvents).values(projection.matchEvents.map((event) => ({
      id: randomUUID(),
      generation,
      sourceEventId: event.sourceEventId,
      matchId: event.matchId,
      gameId: event.gameId,
      gameNumber: event.gameNumber,
      playerId: event.playerId,
      team: event.team,
      position: event.position,
      won: event.won,
      expectedWinRateBp: event.expectedWinRateBp,
      actualPerformanceBp: event.actualPerformanceBp,
      overallDeltaBp: event.overallDeltaBp,
      positionDeltaBp: event.positionDeltaBp,
      formulaVersion: event.formulaVersion,
      createdAt: input.now,
    })));
  }
  let consumedEventCount = 0;
  if (sources.length > 0) {
    consumedEventCount = (
      await transaction.insert(mmrConsumerReceipts).values(sources.map((source) => ({
        outboxEventId: source.id,
        runId,
        generation,
        matchId: source.matchId,
        matchRevision: source.matchRevision,
        inputDigest: source.inputDigest,
        appliedAt: input.now,
      }))).onConflictDoNothing().returning({ id: mmrConsumerReceipts.outboxEventId })
    ).length;
  }
  await transaction.update(mmrProjectionStates).set({
    generation,
    status: "READY",
    formulaVersion: MMR_FORMULA_VERSION,
    sourceMatchCount: projection.sourceMatchCount,
    sourceGameCount: projection.sourceGameCount,
    sourceAdjustmentCount: projection.sourceAdjustmentCount,
    sourceChecksum: checksum,
    calculatedAt: input.now,
    updatedAt: input.now,
  }).where(eq(mmrProjectionStates.key, GLOBAL_STATE_KEY));
  await transaction.insert(auditEvents).values({
    requestId: input.requestId,
    actorUserAccountId: input.actorUserAccountId,
    action: input.trigger === "ADJUSTMENT" ? "MMR_MANUAL_ADJUSTMENT_APPLIED" : "MMR_PROJECTION_REBUILT",
    targetType: "MMR_PROJECTION",
    targetId: GLOBAL_STATE_KEY,
    beforeJson: { generation: state.generation, status: state.status },
    afterJson: { generation, formulaVersion: MMR_FORMULA_VERSION, sourceChecksum: checksum.toString("hex") },
  });
  await transaction.insert(mmrOutbox).values({
    id: randomUUID(),
    requestId: input.requestId,
    runId,
    generation,
    eventType: input.trigger === "ADJUSTMENT" ? "MMR_ADJUSTMENT_APPLIED" : "MMR_PROJECTION_REBUILT",
    createdAt: input.now,
  });
  return { generation, projection, consumedEventCount, runId };
}

export class PostgresMmrRepository implements MmrRepository {
  constructor(private readonly database: V2Database) {}

  async getSummary(): Promise<MmrProjectionSummary> {
    const [state, pending] = await Promise.all([
      this.database.select().from(mmrProjectionStates).where(eq(mmrProjectionStates.key, GLOBAL_STATE_KEY)).limit(1),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(matchRecalculationOutbox)
        .leftJoin(mmrConsumerReceipts, eq(mmrConsumerReceipts.outboxEventId, matchRecalculationOutbox.id))
        .where(isNull(mmrConsumerReceipts.outboxEventId)),
    ]);
    const row = state[0];
    return row
      ? {
          status: row.status,
          generation: row.generation,
          formulaVersion: row.formulaVersion,
          sourceMatchCount: row.sourceMatchCount,
          sourceGameCount: row.sourceGameCount,
          sourceAdjustmentCount: row.sourceAdjustmentCount,
          pendingSourceCount: pending[0]?.count ?? 0,
          calculatedAt: row.calculatedAt?.toISOString() ?? null,
        }
      : {
          status: "EMPTY",
          generation: 0,
          formulaVersion: null,
          sourceMatchCount: 0,
          sourceGameCount: 0,
          sourceAdjustmentCount: 0,
          pendingSourceCount: pending[0]?.count ?? 0,
          calculatedAt: null,
        };
  }

  private async projectionGeneration() {
    const row = (
      await this.database.select({ generation: mmrProjectionStates.generation, status: mmrProjectionStates.status })
        .from(mmrProjectionStates).where(eq(mmrProjectionStates.key, GLOBAL_STATE_KEY)).limit(1)
    )[0];
    return row?.status === "READY" ? row.generation : null;
  }

  private async playerDtos(generation: number, playerRows: readonly (typeof mmrPlayerProfiles.$inferSelect & {
    displayName: string;
    nickname: string;
    tagLine: string;
  })[]): Promise<MmrPlayerListItem[]> {
    if (playerRows.length === 0) return [];
    const positions = await this.database.select().from(mmrPlayerPositionProfiles).where(and(
      eq(mmrPlayerPositionProfiles.generation, generation),
      inArray(mmrPlayerPositionProfiles.playerId, playerRows.map((row) => row.playerId)),
    ));
    const byPlayer = new Map<string, MmrPlayerProfile["positions"]>();
    for (const row of playerRows) {
      byPlayer.set(row.playerId, Object.fromEntries(MMR_POSITIONS.map((position) => [position, {
        scoreBp: row.overallScoreBp,
        sampleSize: 0,
      }])) as MmrPlayerProfile["positions"]);
    }
    for (const row of positions) {
      const profile = byPlayer.get(row.playerId);
      if (profile) (profile as Record<string, { scoreBp: number; sampleSize: number }>)[row.position] = {
        scoreBp: row.scoreBp,
        sampleSize: row.sampleSize,
      };
    }
    return playerRows.map((row) => {
      const dto = toPublicMmrProfileDto({
        generation,
        playerId: row.playerId,
        overallScoreBp: row.overallScoreBp,
        confidenceBp: row.confidenceBp,
        sampleSize: row.sampleSize,
        positions: byPlayer.get(row.playerId)!,
      });
      return {
        ...dto,
        displayName: row.displayName,
        riotId: `${row.nickname}#${row.tagLine}`,
      };
    });
  }

  async listPlayers(query: MmrPlayerQuery): Promise<MmrPage<MmrPlayerListItem>> {
    const generation = await this.projectionGeneration();
    if (generation === null) return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 };
    const normalizedQuery = query.query.toLocaleLowerCase("en-US");
    const search = normalizedQuery
      ? or(ilike(players.nicknameNormalized, `%${normalizedQuery}%`), ilike(players.tagLineNormalized, `%${normalizedQuery}%`))
      : undefined;
    const where = and(eq(mmrPlayerProfiles.generation, generation), search);
    const scoreOrder = query.position
      ? sql<number>`(
          select position_profile.score_bp
          from mmr.player_position_profiles position_profile
          where position_profile.generation = ${mmrPlayerProfiles.generation}
            and position_profile.player_id = ${mmrPlayerProfiles.playerId}
            and position_profile.position = ${query.position}
        )`
      : mmrPlayerProfiles.overallScoreBp;
    const [rows, countRows] = await Promise.all([
      this.database
        .select({
          generation: mmrPlayerProfiles.generation,
          playerId: mmrPlayerProfiles.playerId,
          overallScoreBp: mmrPlayerProfiles.overallScoreBp,
          confidenceBp: mmrPlayerProfiles.confidenceBp,
          sampleSize: mmrPlayerProfiles.sampleSize,
          formulaVersion: mmrPlayerProfiles.formulaVersion,
          calculatedAt: mmrPlayerProfiles.calculatedAt,
          displayName: players.nickname,
          nickname: players.nickname,
          tagLine: players.tagLine,
        })
        .from(mmrPlayerProfiles)
        .innerJoin(players, eq(players.id, mmrPlayerProfiles.playerId))
        .where(where)
        .orderBy(desc(scoreOrder), desc(mmrPlayerProfiles.sampleSize), asc(mmrPlayerProfiles.playerId))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(mmrPlayerProfiles)
        .innerJoin(players, eq(players.id, mmrPlayerProfiles.playerId))
        .where(where),
    ]);
    const total = countRows[0]?.count ?? 0;
    return {
      items: await this.playerDtos(generation, rows),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async getPlayer(playerId: string): Promise<MmrPlayerListItem | null> {
    const generation = await this.projectionGeneration();
    if (generation === null) return null;
    const rows = await this.database
      .select({
        generation: mmrPlayerProfiles.generation,
        playerId: mmrPlayerProfiles.playerId,
        overallScoreBp: mmrPlayerProfiles.overallScoreBp,
        confidenceBp: mmrPlayerProfiles.confidenceBp,
        sampleSize: mmrPlayerProfiles.sampleSize,
        formulaVersion: mmrPlayerProfiles.formulaVersion,
        calculatedAt: mmrPlayerProfiles.calculatedAt,
        displayName: players.nickname,
        nickname: players.nickname,
        tagLine: players.tagLine,
      })
      .from(mmrPlayerProfiles)
      .innerJoin(players, eq(players.id, mmrPlayerProfiles.playerId))
      .where(and(eq(mmrPlayerProfiles.generation, generation), eq(mmrPlayerProfiles.playerId, playerId)))
      .limit(1);
    return (await this.playerDtos(generation, rows))[0] ?? null;
  }

  async listAdjustments(page: number, pageSize: number): Promise<MmrPage<MmrAdjustmentReview>> {
    const [rows, counts] = await Promise.all([
      this.database
        .select({
          id: mmrManualAdjustments.id,
          playerId: mmrManualAdjustments.playerId,
          playerDisplayName: players.nickname,
          position: mmrManualAdjustments.position,
          deltaBp: mmrManualAdjustments.deltaBp,
          reasonCode: mmrManualAdjustments.reasonCode,
          publicNote: mmrManualAdjustments.publicNote,
          actorUserAccountId: mmrManualAdjustments.actorUserAccountId,
          createdAt: mmrManualAdjustments.createdAt,
        })
        .from(mmrManualAdjustments)
        .innerJoin(players, eq(players.id, mmrManualAdjustments.playerId))
        .orderBy(desc(mmrManualAdjustments.createdAt), desc(mmrManualAdjustments.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.database.select({ count: sql<number>`count(*)::int` }).from(mmrManualAdjustments),
    ]);
    const total = counts[0]?.count ?? 0;
    return {
      items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async getAdjustment(adjustmentId: string): Promise<MmrAdjustmentReview | null> {
    const row = (await this.database
      .select({
        id: mmrManualAdjustments.id,
        playerId: mmrManualAdjustments.playerId,
        playerDisplayName: players.nickname,
        position: mmrManualAdjustments.position,
        deltaBp: mmrManualAdjustments.deltaBp,
        reasonCode: mmrManualAdjustments.reasonCode,
        publicNote: mmrManualAdjustments.publicNote,
        actorUserAccountId: mmrManualAdjustments.actorUserAccountId,
        createdAt: mmrManualAdjustments.createdAt,
      })
      .from(mmrManualAdjustments)
      .innerJoin(players, eq(players.id, mmrManualAdjustments.playerId))
      .where(eq(mmrManualAdjustments.id, adjustmentId))
      .limit(1))[0];
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }

  private async idempotent(
    envelope: MmrCommandEnvelope,
    work: (transaction: V2Transaction) => Promise<SuccessfulMutation>,
  ): Promise<MmrMutationResult> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (envelope.actorSession.role !== "SUPER_ADMIN") {
          throw new MmrServiceError("FORBIDDEN", "SUPER_ADMIN만 MMR 원장을 변경할 수 있습니다.");
        }
        if (!(await lockTransactionSessionActor(transaction, envelope.actorSession, new Date(), ADMIN_MUTATION_SESSION_POLICY))) {
          throw new MmrServiceError("SESSION_STALE", "관리자 세션이 더 이상 유효하지 않습니다.");
        }
        const lockKey = `${envelope.actorSession.userAccountId}:${envelope.scope}:${envelope.keyHash.toString("hex")}`;
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
        await transaction.delete(mmrCommandReceipts).where(and(
          eq(mmrCommandReceipts.actorUserAccountId, envelope.actorSession.userAccountId),
          eq(mmrCommandReceipts.scope, envelope.scope),
          eq(mmrCommandReceipts.keyHash, envelope.keyHash),
          sql<boolean>`${mmrCommandReceipts.expiresAt} <= clock_timestamp()`,
        ));
        const receipt = (
          await transaction.select().from(mmrCommandReceipts).where(and(
            eq(mmrCommandReceipts.actorUserAccountId, envelope.actorSession.userAccountId),
            eq(mmrCommandReceipts.scope, envelope.scope),
            eq(mmrCommandReceipts.keyHash, envelope.keyHash),
          )).limit(1)
        )[0];
        if (receipt) {
          if (!Buffer.from(receipt.requestHash).equals(envelope.requestHash)) {
            throw new MmrServiceError("IDEMPOTENCY_MISMATCH", "멱등성 키가 다른 MMR 요청에 사용되었습니다.");
          }
          const revision = receipt.responseJson.revision;
          if (typeof revision !== "number") throw new Error("MMR receipt revision is missing.");
          return { body: receipt.responseJson, status: receipt.responseStatus, revision, replayed: true };
        }
        const receiptId = randomUUID();
        await transaction.insert(mmrCommandReceipts).values({
          id: receiptId,
          actorUserAccountId: envelope.actorSession.userAccountId,
          scope: envelope.scope,
          keyHash: envelope.keyHash,
          requestHash: envelope.requestHash,
          responseStatus: 202,
          responseJson: { revision: 0, pending: true },
          responseEtag: '"0"',
          createdAt: sql`clock_timestamp()`,
          expiresAt: sql`clock_timestamp() + (${RECEIPT_TTL_MS} * interval '1 millisecond')`,
        });
        const result = await work(transaction);
        await transaction.update(mmrCommandReceipts).set({
          responseStatus: result.status,
          responseJson: result.body,
          responseEtag: `"${result.revision}"`,
        }).where(eq(mmrCommandReceipts.id, receiptId));
        return { ...result, replayed: false };
      });
    } catch (error) {
      if (postgresCode(error) === "23505") throw new MmrServiceError("IDEMPOTENCY_MISMATCH", "중복된 MMR 명령입니다.");
      throw error;
    }
  }

  recalculate(envelope: MmrCommandEnvelope, expectedGeneration: number, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const result = await publishProjection(transaction, {
        trigger: "ADMIN",
        actorUserAccountId: envelope.actorSession.userAccountId,
        expectedGeneration,
        requestId: envelope.requestId,
        adjustment: null,
        now,
      });
      return {
        body: { revision: result.generation, generation: result.generation, consumedEventCount: result.consumedEventCount },
        status: 200,
        revision: result.generation,
      };
    });
  }

  addAdjustment(envelope: MmrCommandEnvelope, expectedGeneration: number, adjustment: MmrAdjustmentInput, now: Date) {
    return this.idempotent(envelope, async (transaction) => {
      const result = await publishProjection(transaction, {
        trigger: "ADJUSTMENT",
        actorUserAccountId: envelope.actorSession.userAccountId,
        expectedGeneration,
        requestId: envelope.requestId,
        adjustment,
        now,
      });
      return {
        body: { revision: result.generation, generation: result.generation, playerId: adjustment.playerId },
        status: 201,
        revision: result.generation,
      };
    });
  }

  async catchUp(now: Date): Promise<MmrCatchUpResult> {
    return withTransaction(this.database, async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('mmr:projection:global', 0))`);
      const state = await currentState(transaction);
      const pending = await pendingSourceRows(transaction);
      if (state.status === "READY" && pending.length === 0) return { kind: "IDLE", generation: state.generation };
      const result = await publishProjection(transaction, {
        trigger: state.status === "EMPTY" ? "BOOTSTRAP" : "CATCH_UP",
        actorUserAccountId: null,
        expectedGeneration: state.generation,
        requestId: randomUUID(),
        adjustment: null,
        now,
      });
      return { kind: "REBUILT", generation: result.generation, consumedEventCount: result.consumedEventCount };
    });
  }
}
