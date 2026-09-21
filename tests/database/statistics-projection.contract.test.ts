import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  affectedSeasonIdsForMatchChanged,
  PostgresStatisticsProjectionRepository,
} from "../../src/modules/statistics";
import { PostgresStatisticsQueryRepository } from "../../src/modules/statistics/infrastructure/postgres-statistics-query-repository";
import { handleStatisticsProjectionCron } from "../../src/modules/statistics/infrastructure/statistics-projection-cron";
import type { StatisticsProjectionRepository } from "../../src/modules/statistics/application/ports/statistics-projection-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  championCatalog,
  matchGames,
  matchParticipants,
  matchProjectionReceipts,
  matchRecalculationOutbox,
  matchSeries,
  playerChampionStats,
  playerPositionStats,
  playerSeasonStats,
  players,
  seasonProjectionStates,
  seasons,
  statisticsProjectionRuns,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("S05 rebuilds PUBLISHED match statistics atomically and receipts make replay idempotent", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const repository = new PostgresStatisticsProjectionRepository(database);
  const queryRepository = new PostgresStatisticsQueryRepository(database);
  const seasonId = randomUUID();
  const movedSeasonId = randomUUID();
  const constraintSeasonId = randomUUID();
  const matchId = randomUUID();
  const gameIds = [randomUUID(), randomUUID()] as const;
  const playerIds = [randomUUID(), randomUUID()] as const;
  const championKeys = [`stats-${randomUUID()}`, `stats-${randomUUID()}`] as const;
  const now = new Date("2026-09-07T05:00:00.000Z");

  async function enqueue(
    action: "PUBLISHED" | "AMENDED" | "VOIDED" | "RESTORED",
    revision: number,
    oldSeasonId: string | null,
    newSeasonId: string | null,
    eventNow: Date,
  ): Promise<string> {
    const eventId = randomUUID();
    await database.insert(matchRecalculationOutbox).values({
      id: eventId,
      aggregateType: "MATCH_SERIES",
      aggregateId: matchId,
      eventType: "MATCH_CHANGED",
      action,
      dedupeKey: `statistics:${matchId}:${revision}`,
      matchRevision: revision,
      oldSeasonId,
      newSeasonId,
      oldOrderKey: oldSeasonId ? `2026-09-07:${matchId}` : null,
      newOrderKey: newSeasonId ? `2026-09-07:${matchId}` : null,
      inputDigest: createHash("sha256").update(`statistics:${matchId}:${revision}`).digest(),
      payloadJson: { matchId, revision },
      status: "PENDING",
      availableAt: eventNow,
      createdAt: eventNow,
      updatedAt: eventNow,
    });
    return eventId;
  }

  function runCron(at: Date, worker: StatisticsProjectionRepository = repository) {
    const secret = "synthetic-statistics-cron-secret-000000";
    return handleStatisticsProjectionCron(new Request("https://v2.example/api/cron/statistics-projection", {
      headers: { authorization: `Bearer ${secret}` },
    }), { secret, getRepository: () => worker, now: () => at });
  }

  try {
    await applyMigrations(database);
    await applyMigrations(database);

    await database.insert(seasons).values([
      { id: seasonId, name: `통계 계약 ${seasonId}`, nameNormalized: `stats-${seasonId}` },
      {
        id: movedSeasonId,
        name: `통계 이동 ${movedSeasonId}`,
        nameNormalized: `stats-moved-${movedSeasonId}`,
      },
      {
        id: constraintSeasonId,
        name: `통계 제약 ${constraintSeasonId}`,
        nameNormalized: `stats-constraint-${constraintSeasonId}`,
      },
    ]);
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      memberName: `통계 비공개 회원 ${index + 1}`,
      memberNameNormalized: `통계 비공개 회원 ${index + 1}`,
      nickname: `통계닉${index + 1}`,
      nicknameNormalized: `통계닉${index + 1}`,
      tagLine: `S${index + 1}`,
      tagLineNormalized: `s${index + 1}`,
    })));
    await database.insert(championCatalog).values(championKeys.map((key, index) => ({
      key,
      displayName: `통계 챔피언 ${index + 1}`,
    })));
    await database.insert(matchSeries).values({
      id: matchId,
      seasonId,
      title: "통계 집계 계약 경기",
      titleNormalized: "통계 집계 계약 경기",
      playedOn: "2026-09-07",
      blueWins: 1,
      redWins: 1,
      gameCount: 2,
      status: "PUBLISHED",
      publishedAt: now,
    });
    await database.insert(matchGames).values([
      {
        id: gameIds[0],
        seriesId: matchId,
        gameNumber: 1,
        durationSeconds: 1800,
        winnerTeam: "BLUE",
        mvpPlayerId: playerIds[0],
        mvpScoreUnits2: 20,
        mvpFormulaVersion: "V1_COMPAT_1",
        mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1",
      },
      {
        id: gameIds[1],
        seriesId: matchId,
        gameNumber: 2,
        durationSeconds: 1900,
        winnerTeam: "RED",
        mvpPlayerId: playerIds[1],
        mvpScoreUnits2: 22,
        mvpFormulaVersion: "V1_COMPAT_1",
        mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1",
      },
    ]);
    await database.insert(matchParticipants).values(gameIds.flatMap((gameId, gameIndex) =>
      playerIds.map((playerId, playerIndex) => ({
        id: randomUUID(),
        gameId,
        playerId,
        nicknameSnapshot: `통계닉${playerIndex + 1}`,
        tagLineSnapshot: `S${playerIndex + 1}`,
        championKey: championKeys[playerIndex],
        team: playerIndex === 0 ? "BLUE" as const : "RED" as const,
        position: "TOP" as const,
        kills: gameIndex + playerIndex,
        deaths: 1,
        assists: 2,
        mvpScoreUnits2: gameIndex === playerIndex ? 20 : 10,
        mvpFormulaVersion: "V1_COMPAT_1",
      })),
    ));

    // Other contract files intentionally leave match-change events behind in
    // the shared upgrade database. This test owns only the event it enqueues.
    await database.update(matchRecalculationOutbox).set({
      status: "DELIVERED", lockedAt: null, deliveredAt: now, lastErrorCode: null, updatedAt: now,
    });
    const eventId = await enqueue("PUBLISHED", 1, null, seasonId, now);
    const pendingAdminStatus = await queryRepository.getAdminStatus(null);
    assert.equal(pendingAdminStatus.pendingEventCount, 1);
    assert.equal(pendingAdminStatus.failedEventCount, 0);
    assert.equal(
      pendingAdminStatus.seasons.find((item) => item.season.id === seasonId)?.pendingEventCount,
      1,
    );
    const claimed = await repository.claimNextMatchChanged(now);
    assert.ok(claimed);
    assert.equal(claimed.eventId, eventId);
    const affectedSeasonIds = affectedSeasonIdsForMatchChanged(claimed);
    const applied = await repository.applyClaimedMatchChanged({
      event: claimed,
      affectedSeasonIds,
      now,
    });
    assert.equal(applied.kind, "APPLIED");
    assert.deepEqual(applied.projections.map((projection) => ({
      seasonId: projection.seasonId,
      generation: projection.generation,
      sourceMatchCount: projection.sourceMatchCount,
      sourceGameCount: projection.sourceGameCount,
      sourceParticipantCount: projection.sourceParticipantCount,
    })), [{
      seasonId,
      generation: 1,
      sourceMatchCount: 1,
      sourceGameCount: 2,
      sourceParticipantCount: 4,
    }]);

    const seasonRows = await database
      .select()
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.seasonId, seasonId));
    assert.deepEqual(
      seasonRows
        .map((row) => ({
          playerId: row.playerId,
          totalGames: row.totalGames,
          participationCount: row.participationCount,
          wins: row.wins,
          losses: row.losses,
          mvpCount: row.mvpCount,
        }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
      playerIds
        .map((playerId) => ({
          playerId,
          totalGames: 2,
          participationCount: 1,
          wins: 1,
          losses: 1,
          mvpCount: 1,
        }))
        .sort((left, right) => left.playerId.localeCompare(right.playerId)),
    );
    assert.equal(
      (await database.select().from(playerChampionStats).where(eq(playerChampionStats.seasonId, seasonId))).length,
      2,
    );
    assert.equal(
      (await database.select().from(playerPositionStats).where(eq(playerPositionStats.seasonId, seasonId))).length,
      2,
    );

    await database.update(seasons).set({
      status: "ENDED",
      activatedAt: new Date(now.getTime() - 86_400_000),
      endedAt: now,
      updatedAt: now,
    }).where(eq(seasons.id, seasonId));
    const publicPlayerStatistics = await queryRepository.getPublicPlayerStatistics(playerIds[0], seasonId);
    assert.ok(publicPlayerStatistics);
    assert.deepEqual(publicPlayerStatistics.performance, {
      gameCount: 2,
      averageKills: 0.5,
      averageDeaths: 1,
      averageAssists: 2,
      averageKda: 2.5,
      averageBalanceScore: null,
      assignmentGames: { main: 0, sub: 0, all: 0, nonPreferred: 0, unclassified: 2 },
    });

    const replay = await repository.applyClaimedMatchChanged({
      event: claimed,
      affectedSeasonIds,
      now: new Date(now.getTime() + 1_000),
    });
    assert.equal(replay.kind, "REPLAYED");
    assert.equal(replay.projections[0]?.generation, 1);
    assert.equal(
      (await database.select().from(statisticsProjectionRuns).where(eq(statisticsProjectionRuns.requestedOutboxEventId, eventId))).length,
      1,
    );
    assert.equal(
      (await database.select().from(matchProjectionReceipts).where(eq(matchProjectionReceipts.outboxEventId, eventId))).length,
      1,
    );
    assert.deepEqual(
      await database
        .select({ status: matchRecalculationOutbox.status, lockedAt: matchRecalculationOutbox.lockedAt })
        .from(matchRecalculationOutbox)
        .where(eq(matchRecalculationOutbox.id, eventId)),
      [{ status: "DELIVERED", lockedAt: null }],
    );

    const movedAt = new Date(now.getTime() + 2_000);
    await database
      .update(matchSeries)
      .set({ seasonId: movedSeasonId, revision: 2, updatedAt: movedAt })
      .where(eq(matchSeries.id, matchId));
    const movedEventId = await enqueue("AMENDED", 2, seasonId, movedSeasonId, movedAt);
    const movedClaim = await repository.claimNextMatchChanged(movedAt);
    assert.ok(movedClaim);
    assert.equal(movedClaim.eventId, movedEventId);
    const moved = await repository.applyClaimedMatchChanged({
      event: movedClaim,
      affectedSeasonIds: affectedSeasonIdsForMatchChanged(movedClaim),
      now: movedAt,
    });
    assert.equal(moved.kind, "APPLIED");
    assert.deepEqual(
      moved.projections
        .map((projection) => ({
          seasonId: projection.seasonId,
          generation: projection.generation,
          sourceMatchCount: projection.sourceMatchCount,
        }))
        .sort((left, right) => left.seasonId.localeCompare(right.seasonId)),
      [
        { seasonId, generation: 2, sourceMatchCount: 0 },
        { seasonId: movedSeasonId, generation: 1, sourceMatchCount: 1 },
      ].sort((left, right) => left.seasonId.localeCompare(right.seasonId)),
    );
    assert.equal(
      (await database.select().from(playerSeasonStats).where(eq(playerSeasonStats.seasonId, seasonId))).length,
      0,
    );
    assert.equal(
      (await database.select().from(playerSeasonStats).where(eq(playerSeasonStats.seasonId, movedSeasonId))).length,
      2,
    );

    // The production HTTP boundary consumes the same repository. Failed work
    // retains READY data, backs off durably, then converges on a later invocation.
    const failureAt = new Date(now.getTime() + 3_000);
    const retryEventId = await enqueue("AMENDED", 3, movedSeasonId, movedSeasonId, failureAt);
    const failed = await runCron(failureAt, {
      claimNextMatchChanged: (at) => repository.claimNextMatchChanged(at),
      async applyClaimedMatchChanged() { throw new Error("synthetic private driver error"); },
      failClaimedMatchChanged: (input) => repository.failClaimedMatchChanged(input),
    });
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).failed, 1);
    const failedRow = (await database.select().from(matchRecalculationOutbox).where(eq(matchRecalculationOutbox.id, retryEventId)))[0]!;
    assert.equal(failedRow.status, "FAILED");
    assert.equal(failedRow.attemptCount, 1);
    assert.equal(failedRow.lastErrorCode, "STATISTICS_PROJECTION_FAILED");
    assert.equal(failedRow.availableAt.getTime(), failureAt.getTime() + 30_000);
    assert.equal(await repository.claimNextMatchChanged(new Date(failureAt.getTime() + 29_999)), null);
    assert.equal((await database.select().from(seasonProjectionStates).where(eq(seasonProjectionStates.seasonId, movedSeasonId)))[0]!.generation, 1);

    const recovered = await runCron(failedRow.availableAt);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).applied, 1);
    const recoveredRow = (await database.select().from(matchRecalculationOutbox).where(eq(matchRecalculationOutbox.id, retryEventId)))[0]!;
    assert.equal(recoveredRow.status, "DELIVERED");
    assert.equal(recoveredRow.attemptCount, 2);
    assert.equal(recoveredRow.lastErrorCode, null);

    const voidedAt = new Date(now.getTime() + 40_000);
    await database.update(matchSeries).set({ status: "VOIDED", revision: 4, voidedAt, voidReason: "합성 무효화 회귀", updatedAt: voidedAt }).where(eq(matchSeries.id, matchId));
    await enqueue("VOIDED", 4, movedSeasonId, null, voidedAt);
    assert.equal((await (await runCron(voidedAt)).json()).applied, 1);
    assert.equal((await database.select().from(playerSeasonStats).where(eq(playerSeasonStats.seasonId, movedSeasonId))).length, 0);
    assert.equal((await database.select().from(seasonProjectionStates).where(eq(seasonProjectionStates.seasonId, movedSeasonId)))[0]!.sourceMatchCount, 0);

    const restoredAt = new Date(now.getTime() + 41_000);
    await database.update(matchSeries).set({ status: "PUBLISHED", revision: 5, voidedAt: null, voidReason: null, updatedAt: restoredAt }).where(eq(matchSeries.id, matchId));
    await enqueue("RESTORED", 5, null, movedSeasonId, restoredAt);
    assert.equal((await (await runCron(restoredAt)).json()).applied, 1);
    assert.equal((await database.select().from(playerSeasonStats).where(eq(playerSeasonStats.seasonId, movedSeasonId))).length, 2);

    // Concurrent deliveries must claim the event once; a crashed worker's lease
    // becomes available to the next invocation without duplicate projection runs.
    const concurrentAt = new Date(now.getTime() + 42_000);
    const concurrentEventId = await enqueue("AMENDED", 6, movedSeasonId, movedSeasonId, concurrentAt);
    const concurrentResponses = await Promise.all([runCron(concurrentAt), runCron(concurrentAt)]);
    assert.deepEqual(concurrentResponses.map((response) => response.status), [200, 200]);
    const concurrentResults = await Promise.all(concurrentResponses.map((response) => response.json()));
    assert.equal(concurrentResults.reduce((sum, result) => sum + result.applied, 0), 1);
    assert.equal((await database.select().from(matchProjectionReceipts).where(eq(matchProjectionReceipts.outboxEventId, concurrentEventId))).length, 1);

    const abandonedAt = new Date(now.getTime() + 43_000);
    const abandonedEventId = await enqueue("AMENDED", 7, movedSeasonId, movedSeasonId, abandonedAt);
    assert.equal((await repository.claimNextMatchChanged(abandonedAt))?.eventId, abandonedEventId);
    assert.equal((await (await runCron(new Date(abandonedAt.getTime() + 59_999))).json()).processed, 0);
    assert.equal((await (await runCron(new Date(abandonedAt.getTime() + 60_000))).json()).applied, 1);
    assert.equal((await database.select().from(statisticsProjectionRuns).where(eq(statisticsProjectionRuns.requestedOutboxEventId, abandonedEventId))).length, 1);

    await assert.rejects(
      database.insert(playerSeasonStats).values({
        seasonId: constraintSeasonId,
        playerId: playerIds[0],
        generation: 1,
        totalGames: 1,
        participationCount: 2,
        wins: 1,
        losses: 0,
        mvpCount: 0,
        calculatedAt: now,
      }),
      (error: unknown) => {
        const constraint = (error as { cause?: { constraint?: string } }).cause?.constraint;
        assert.equal(constraint, "player_season_stats_participation_bounded");
        return true;
      },
    );
    await assert.rejects(
      database.insert(seasonProjectionStates).values({
        seasonId: constraintSeasonId,
        generation: 1,
        status: "READY",
        sourceChecksum: null,
        calculatedAt: now,
      }),
      (error: unknown) => {
        const constraint = (error as { cause?: { constraint?: string } }).cause?.constraint;
        assert.equal(constraint, "season_projection_states_lifecycle_consistency");
        return true;
      },
    );
  } finally {
    await pool.end();
  }
});
