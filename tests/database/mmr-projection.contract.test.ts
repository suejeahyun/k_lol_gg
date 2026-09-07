import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { MmrService, MmrServiceError, type MmrCommandContext } from "../../src/modules/mmr";
import { PostgresMmrRepository } from "../../src/modules/mmr/infrastructure/postgres-mmr-repository";
import { PostgresTeamBalanceRatingProvider } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-rating-provider";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  championCatalog,
  matchGames,
  matchParticipants,
  matchRecalculationOutbox,
  matchSeries,
  mmrCommandReceipts,
  mmrConsumerReceipts,
  mmrManualAdjustments,
  mmrMatchResultEvents,
  mmrOutbox,
  mmrPlayerPositionProfiles,
  mmrPlayerProfiles,
  mmrProjectionRuns,
  mmrProjectionStates,
  playerSeasonStats,
  players,
  seasonProjectionStates,
  seasons,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function commandContext(actorSession: TransactionSessionActor, key: string): MmrCommandContext {
  return { actorSession, requestId: randomUUID(), idempotencyMaterial: new TextEncoder().encode(key) };
}

function serviceError(code: MmrServiceError["code"]) {
  return (error: unknown) => error instanceof MmrServiceError && error.code === code;
}

test("S05-B persists canonical full-ledger MMR replay without competing for the S04 outbox", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const repository = new PostgresMmrRepository(database);
  const service = new MmrService(repository);
  const superId = randomUUID();
  const superSessionId = randomUUID();
  const adminId = randomUUID();
  const adminSessionId = randomUUID();
  const seasonId = randomUUID();
  const matchIds = [randomUUID(), randomUUID()] as const;
  const gameIds = [randomUUID(), randomUUID()] as const;
  const playerIds = Array.from({ length: 11 }, () => randomUUID());
  const championKeys = Array.from({ length: 10 }, () => `mmr-${randomUUID()}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const superActor = { userAccountId: superId, sessionId: superSessionId, role: "SUPER_ADMIN", authVersion: 0 } as const;
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;

  async function enqueue(matchId: string, revision: number, action: "PUBLISHED" | "AMENDED", eventNow: Date) {
    const id = randomUUID();
    await database.insert(matchRecalculationOutbox).values({
      id,
      aggregateType: "MATCH_SERIES",
      aggregateId: matchId,
      eventType: "MATCH_CHANGED",
      action,
      dedupeKey: `mmr:${matchId}:${revision}`,
      matchRevision: revision,
      oldSeasonId: action === "PUBLISHED" ? null : null,
      newSeasonId: action === "PUBLISHED" ? seasonId : null,
      oldOrderKey: null,
      newOrderKey: action === "PUBLISHED" ? `2026-09-0${revision + 1}:${matchId}` : null,
      inputDigest: createHash("sha256").update(`${matchId}:${revision}`).digest(),
      payloadJson: { matchId, revision },
      status: "PENDING",
      availableAt: eventNow,
      createdAt: eventNow,
      updatedAt: eventNow,
    });
    return id;
  }

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'mmr'",
    );
    assert.equal(tables.rowCount, 9);

    await database.insert(userAccounts).values([
      { id: superId, loginId: "mmr-super", loginIdNormalized: "mmr-super", role: "SUPER_ADMIN", status: "APPROVED" },
      { id: adminId, loginId: "mmr-admin", loginIdNormalized: "mmr-admin", role: "ADMIN", status: "APPROVED" },
    ]);
    await database.insert(authSessions).values([
      { id: superSessionId, tokenHash: randomBytes(32), userAccountId: superId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
    ]);
    await database.insert(seasons).values({ id: seasonId, name: "MMR 계약 시즌", nameNormalized: "mmr-contract-season", status: "ACTIVE", activatedAt: now });
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      memberName: `MMR 회원 ${index + 1}`,
      memberNameNormalized: `mmr 회원 ${index + 1}`,
      nickname: `MMR플레이어${index + 1}`,
      nicknameNormalized: `mmr플레이어${index + 1}`,
      tagLine: `M${index + 1}`,
      tagLineNormalized: `m${index + 1}`,
    })));
    await database.insert(championCatalog).values(championKeys.map((key, index) => ({ key, displayName: `MMR 챔피언 ${index + 1}` })));
    // Full-ledger MMR requires exactly ten participants per published game.
    // Earlier projection contracts intentionally use compact two-player
    // fixtures, so retire only those already-tested rows in the shared DB.
    await database.update(matchSeries).set({
      status: "VOIDED", voidReason: "Shared contract fixture retired before full-ledger MMR", voidedAt: now, updatedAt: now,
    }).where(eq(matchSeries.status, "PUBLISHED"));
    const priorUnconsumedEventCount = (await database.select().from(matchRecalculationOutbox)).length;
    await database.insert(matchSeries).values([
      { id: matchIds[1], seasonId, title: "두 번째 경기", titleNormalized: "두 번째 경기", playedOn: "2026-09-02", blueWins: 1, redWins: 0, gameCount: 1, status: "PUBLISHED", publishedAt: now },
      { id: matchIds[0], seasonId, title: "첫 번째 경기", titleNormalized: "첫 번째 경기", playedOn: "2026-09-01", blueWins: 1, redWins: 0, gameCount: 1, status: "PUBLISHED", publishedAt: now },
    ]);
    await database.insert(matchGames).values(matchIds.map((seriesId, index) => ({
      id: gameIds[index], seriesId, gameNumber: 1, durationSeconds: 1800, winnerTeam: "BLUE" as const,
      mvpPlayerId: playerIds[0]!, mvpScoreUnits2: 20, mvpFormulaVersion: "V1_COMPAT_1", mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1",
    })));
    await database.insert(matchParticipants).values(gameIds.flatMap((gameId, gameIndex) => playerIds.slice(0, 10).map((playerId, index) => ({
      id: randomUUID(), gameId, playerId, nicknameSnapshot: `MMR플레이어${index + 1}`, tagLineSnapshot: `M${index + 1}`,
      championKey: championKeys[index]!, team: index < 5 ? "BLUE" as const : "RED" as const,
      position: (["TOP", "JGL", "MID", "ADC", "SUP"] as const)[index % 5]!, kills: gameIndex + index,
      deaths: Math.max(1, 8 - index), assists: index + 2, mvpScoreUnits2: 10, mvpFormulaVersion: "V1_COMPAT_1",
    }))));
    await enqueue(matchIds[0], 0, "PUBLISHED", now);
    await enqueue(matchIds[1], 0, "PUBLISHED", new Date(now.getTime() + 1));

    const first = await repository.catchUp(now);
    assert.deepEqual(first, { kind: "REBUILT", generation: 1, consumedEventCount: priorUnconsumedEventCount + 2 });
    assert.deepEqual(await repository.catchUp(now), { kind: "IDLE", generation: 1 });
    assert.equal((await database.select().from(mmrPlayerProfiles)).length, 10);
    assert.equal((await database.select().from(mmrPlayerPositionProfiles)).length, 50);
    assert.equal((await database.select().from(mmrMatchResultEvents)).length, 20);
    assert.equal((await database.select().from(mmrConsumerReceipts)).length, priorUnconsumedEventCount + 2);
    assert.ok((await database.select().from(matchRecalculationOutbox))
      .filter((row) => (matchIds as readonly string[]).includes(row.aggregateId))
      .every((row) => row.status === "PENDING"));

    const beforeSecond = (
      await database.select().from(mmrMatchResultEvents).where(and(
        eq(mmrMatchResultEvents.generation, 1), eq(mmrMatchResultEvents.gameId, gameIds[1]), eq(mmrMatchResultEvents.playerId, playerIds[0]!),
      )).limit(1)
    )[0]!;
    await database.update(matchParticipants).set({ kills: 40 }).where(and(
      eq(matchParticipants.gameId, gameIds[0]), eq(matchParticipants.playerId, playerIds[0]!),
    ));
    await enqueue(matchIds[0], 1, "AMENDED", new Date(now.getTime() + 2));
    assert.deepEqual(await repository.catchUp(new Date(now.getTime() + 2)), { kind: "REBUILT", generation: 2, consumedEventCount: 1 });
    const afterSecond = (
      await database.select().from(mmrMatchResultEvents).where(and(
        eq(mmrMatchResultEvents.generation, 2), eq(mmrMatchResultEvents.gameId, gameIds[1]), eq(mmrMatchResultEvents.playerId, playerIds[0]!),
      )).limit(1)
    )[0]!;
    assert.notEqual(afterSecond.expectedWinRateBp, beforeSecond.expectedWinRateBp, "earlier corrections must affect later replay");

    const recalculateContext = commandContext(superActor, "recalculate-1");
    const recalculated = await service.recalculate(recalculateContext, 2, {}, now);
    assert.equal(recalculated.revision, 3);
    assert.equal((await service.recalculate(recalculateContext, 2, {}, now)).replayed, true);
    assert.equal((await database.select().from(mmrProjectionRuns)).length, 3);
    await assert.rejects(service.recalculate(recalculateContext, 1, {}, now), serviceError("IDEMPOTENCY_MISMATCH"));
    await assert.rejects(service.recalculate(commandContext(adminActor, "admin-denied"), 3, {}, now), serviceError("FORBIDDEN"));

    const adjustmentContext = commandContext(superActor, "adjustment-1");
    const adjusted = await service.addAdjustment(adjustmentContext, 3, {
      playerId: playerIds[0], position: "TOP", deltaBp: 500, reasonCode: "REVIEWED", publicNote: "관리자 검토 결과를 반영했습니다.",
    }, now);
    assert.equal(adjusted.revision, 4);
    assert.equal((await service.addAdjustment(adjustmentContext, 3, {
      playerId: playerIds[0], position: "TOP", deltaBp: 500, reasonCode: "REVIEWED", publicNote: "관리자 검토 결과를 반영했습니다.",
    }, now)).replayed, true);
    assert.equal((await database.select().from(mmrManualAdjustments)).length, 1);
    assert.equal((await database.select().from(mmrCommandReceipts)).length, 2);
    assert.equal((await database.select().from(mmrOutbox)).length, 4);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "MMR_PROJECTION"))).length, 4);
    assert.equal((await database.select().from(mmrProjectionStates))[0]?.generation, 4);
    assert.equal((await database.select().from(mmrPlayerProfiles)).length, 40, "published generations remain append-only");

    await database.insert(seasonProjectionStates).values({
      seasonId, generation: 1, status: "READY", sourceMatchCount: 2, sourceGameCount: 2,
      sourceParticipantCount: 20, sourceChecksum: randomBytes(32), calculatedAt: now,
    });
    await database.insert(playerSeasonStats).values({
      seasonId, playerId: playerIds[10], generation: 1, totalGames: 4, participationCount: 2,
      wins: 3, losses: 1, mvpCount: 0, calculatedAt: now,
    });
    const rating = await new PostgresTeamBalanceRatingProvider().load(database, [playerIds[0]!, playerIds[10]!]);
    assert.equal(rating.generation, 4);
    assert.equal(rating.ratings.get(playerIds[0]!)?.positions?.TOP?.sampleSize, 2);
    assert.equal(rating.ratings.get(playerIds[10]!)?.overall, 75, "players absent from READY MMR use S05 statistics fallback");

    const publicPage = await repository.listPlayers({ query: "MMR플레이어", position: null, page: 1, pageSize: 20 });
    assert.equal(publicPage.total, 10);
    assert.deepEqual(Object.keys(publicPage.items[0]!).sort(), ["confidence", "displayName", "overallScore", "playerId", "positions", "riotId", "sampleSize"]);
  } finally {
    await pool.end();
  }
});
