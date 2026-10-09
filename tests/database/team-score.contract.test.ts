import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { TeamBalanceRatingProvider } from "../../src/modules/team-tools/application/ports/team-balance-rating-provider";
import { teamBalanceCommandEnvelope } from "../../src/modules/team-tools/application/team-balance-service";
import { evaluateTeamBalancePlayerScore, TEAM_BALANCE_POSITIONS, type TeamBalanceRatingProviderDto } from "../../src/modules/team-tools/domain/team-balance";
import { TeamBalanceServiceError } from "../../src/modules/team-tools/domain/team-balance-draft";
import { PostgresTeamBalanceRatingProvider } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-rating-provider";
import { PostgresTeamBalanceRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-repository";
import { PostgresTeamScoreRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-score-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { auditEvents, authSessions, players, teamBalanceCommandReceipts, teamBalancePlayerOverrides, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const baseQuery = { playerId: null, query: "", page: 1, pageSize: 20 } as const;

function openTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "Only the disposable database harness may run this contract.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  return createDatabaseHandle(connectionString, { max: 4 });
}

function playerInput(id: string, label: string, tier: string | null = "GOLD IV") {
  return { id, memberName: label, memberNameNormalized: label.toLowerCase(), nickname: label,
    nicknameNormalized: label.toLowerCase(), tagLine: "TEST", tagLineNormalized: "test", currentTier: tier };
}

test("team score detail reads persisted audits and rating inputs from one read-only snapshot", async () => {
  const { database, pool } = openTestDatabase();
  const playerId = randomUUID();
  const inactiveId = randomUUID();
  const actorId = randomUUID();
  const actorPlayerId = randomUUID();
  const sessionId = randomUUID();
  const now = new Date();
  const actor = { userAccountId: actorId, sessionId, role: "ADMIN", authVersion: 0 } as const;
  const mutations = new PostgresTeamBalanceRepository(database);
  const provider = new PostgresTeamBalanceRatingProvider(() => now);
  const save = (revision: number, score: number, reason: string) => {
    const input = { playerId, score, reason };
    const command = teamBalanceCommandEnvelope({ actorSession: actor, authorization: "ADMIN_MUTATION",
      idempotencyMaterial: new TextEncoder().encode(randomUUID()), requestId: randomUUID() }, "admin:team-balance:override", { ...input, expectedRevision: revision });
    return mutations.setPlayerOverride(command, revision, input, new Date(now.getTime() + revision));
  };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: actorId, loginId: `score-private-${actorId}`, loginIdNormalized: `score-private-${actorId}`, status: "APPROVED", role: "ADMIN" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: actorId,
      authVersion: 0, role: "ADMIN", purpose: "ADMIN", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    await database.insert(players).values([
      playerInput(playerId, `Score${playerId.slice(0, 8)}`),
      { ...playerInput(actorPlayerId, `Manager${actorPlayerId.slice(0, 8)}`), userAccountId: actorId },
      { ...playerInput(inactiveId, `Inactive${inactiveId.slice(0, 8)}`), status: "INACTIVE", deactivatedAt: now },
    ]);
    const repository = new PostgresTeamScoreRepository(database);
    const empty = await repository.read({ ...baseQuery, playerId });
    assert.equal(empty.kind, "player");
    if (empty.kind !== "player") throw new Error("Expected player details.");
    assert.equal(empty.override.configured, false);
    assert.equal(empty.override.score, 0);
    assert.equal(empty.history.total, 0);
    await save(0, 25, "First synthetic adjustment");
    await save(1, 0, "Reset synthetic adjustment");
    const detail = await repository.read({ ...baseQuery, playerId, pageSize: 1 });
    assert.equal(detail.kind, "player");
    if (detail.kind !== "player") throw new Error("Expected player details.");
    assert.equal(detail.override.configured, true);
    assert.equal(detail.override.revision, 2);
    assert.equal(detail.history.total, 2);
    assert.equal(detail.history.items.length, 1);
    assert.equal(detail.history.items[0]?.beforeScore, 25);
    assert.equal(detail.history.items[0]?.afterScore, 0);
    assert.equal(detail.history.items[0]?.actorLabel, `Manager${actorPlayerId.slice(0, 8)}`);
    assert.doesNotMatch(JSON.stringify(detail), /score-private-|actorUserAccountId|requestId|metadataJson|authVersion/);
    const firstPage = await repository.read({ ...baseQuery, playerId, page: 2, pageSize: 1 });
    assert.equal(firstPage.kind === "player" && firstPage.history.items[0]?.beforeScore, null);
    assert.equal(firstPage.kind === "player" && firstPage.history.items[0]?.afterScore, 25);
    await database.update(players).set({ userAccountId: null }).where(eq(players.id, actorPlayerId));
    const unlinkedActor = await repository.read({ ...baseQuery, playerId });
    assert.equal(unlinkedActor.kind === "player" && unlinkedActor.history.items[0]?.actorLabel, `관리자 ${actorId.slice(0, 8)}`);
    assert.ok(!JSON.stringify(unlinkedActor).includes(actorId), "actor fallback does not expose the complete account identifier");
    assert.deepEqual(detail.breakdown, evaluateTeamBalancePlayerScore({ playerId,
      eligiblePositions: TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "MAIN" })), rating: (await provider.load(database, [playerId])).ratings.get(playerId) ?? null }));
    for (const id of [inactiveId, randomUUID()]) await assert.rejects(repository.read({ ...baseQuery, playerId: id }),
      (error: unknown) => error instanceof TeamBalanceServiceError && error.code === "NOT_FOUND");

    let concurrentlySaved = false;
    const concurrentProvider: TeamBalanceRatingProvider = { async load(executor, ids) {
      const settings = (await executor.execute<{ isolation: string; readonly: string }>(sql`select current_setting('transaction_isolation') as isolation, current_setting('transaction_read_only') as readonly`)).rows[0]!;
      assert.equal(settings.isolation, "repeatable read");
      assert.equal(settings.readonly, "on");
      if (!concurrentlySaved) { concurrentlySaved = true; await save(2, -10, "Concurrent synthetic adjustment"); }
      return provider.load(executor, ids);
    } };
    const snapshot = await new PostgresTeamScoreRepository(database, concurrentProvider).read({ ...baseQuery, playerId });
    assert.equal(snapshot.kind, "player");
    if (snapshot.kind !== "player") throw new Error("Expected player details.");
    assert.equal(snapshot.override.revision, 2);
    assert.equal(snapshot.breakdown.overrideScore, 0);
    assert.equal(snapshot.history.total, 2, "concurrent audit is outside the same snapshot");
    const fresh = await repository.read({ ...baseQuery, playerId });
    assert.equal(fresh.kind === "player" && fresh.override.revision, 3);
    assert.equal(fresh.kind === "player" && fresh.breakdown.overrideScore, -10);
    assert.equal(fresh.kind === "player" && fresh.history.total, 3);
  } finally {
    await database.delete(auditEvents).where(and(eq(auditEvents.targetType, "TEAM_BALANCE_PLAYER_OVERRIDE"), eq(auditEvents.targetId, playerId)));
    await database.delete(teamBalanceCommandReceipts).where(eq(teamBalanceCommandReceipts.actorUserAccountId, actorId));
    await database.delete(teamBalancePlayerOverrides).where(eq(teamBalancePlayerOverrides.playerId, playerId));
    await database.delete(players).where(inArray(players.id, [playerId, inactiveId, actorPlayerId]));
    await database.delete(authSessions).where(eq(authSessions.id, sessionId));
    await database.delete(userAccounts).where(eq(userAccounts.id, actorId));
    await pool.end();
  }
});

test("team score overview batches active players, includes saved zero scores, paginates and excludes override from tier statistics", async () => {
  const { database, pool } = openTestDatabase();
  const ids = Array.from({ length: 202 }, () => randomUUID());
  const prefix = `ScoreBatch${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();
  const observedCalls: string[][] = [];
  const reference: TeamBalanceRatingProviderDto = { overall: 50, confidence: 0, sampleSize: 0, positions: null,
    v1: { legacyPlayerId: null, currentTier: "GOLD IV", peakTier: null, season: null, internalGames: 0, internalPositionGames: {},
      recentSolo: null, balanceOverrideScore: 999, mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [] } };
  const stronger = { ...reference, v1: { ...reference.v1!, currentTier: "DIAMOND IV", balanceOverrideScore: -999 } };
  const scoreOf = (rating: TeamBalanceRatingProviderDto) => evaluateTeamBalancePlayerScore({ playerId: ids[0]!, eligiblePositions: [{ position: "MID", preference: "MAIN" }], rating }).baseScore;
  const provider: TeamBalanceRatingProvider = { async load(_executor, batch) {
    observedCalls.push([...batch]);
    return { generation: 7, ratings: new Map(batch.map((id) => [id, id === ids[0] ? stronger : reference])) };
  } };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: actorId, loginId: `batch-${actorId}`, loginIdNormalized: `batch-${actorId}`, status: "APPROVED", role: "ADMIN" });
    await database.insert(players).values(ids.map((id, index) => ({ ...playerInput(id, `${prefix}${index}`),
      ...(index === 201 ? { status: "INACTIVE" as const, deactivatedAt: new Date() } : {}) })));
    await database.insert(teamBalancePlayerOverrides).values([0, 1, 2, 201].map((index) => ({ playerId: ids[index]!, score: index === 0 ? 0 : 100,
      reason: "Synthetic batch correction", revision: 1, updatedByUserAccountId: actorId, updatedAt: new Date("2026-10-10T00:00:00Z") })));
    const repository = new PostgresTeamScoreRepository(database, provider);
    const first = await repository.read({ ...baseQuery, query: prefix, pageSize: 2 });
    assert.equal(first.kind, "overview");
    if (first.kind !== "overview") throw new Error("Expected score overview.");
    assert.equal(first.configured.total, 3);
    assert.equal(first.configured.items.length, 2);
    assert.ok(observedCalls.length >= 2);
    assert.ok(observedCalls.every((batch) => batch.length <= 200));
    assert.ok(observedCalls.flat().includes(ids[0]!));
    assert.ok(!observedCalls.flat().includes(ids[201]!));
    assert.equal(new Set(observedCalls.flat()).size, first.activePlayerCount);
    assert.equal(first.tiers.reduce((sum, tier) => sum + tier.playerCount, 0), first.activePlayerCount);
    assert.equal(first.scoreBasis, "ACTIVE_REGISTERED_PLAYERS_BASE_SCORE");
    const gold = first.tiers.find((tier) => tier.tier === "GOLD")!;
    const expectedMean = Math.round((scoreOf(reference) * (gold.playerCount - 1) + scoreOf(stronger)) / gold.playerCount * 100) / 100;
    assert.equal(gold.averageBaseScore, expectedMean);
    assert.equal(gold.medianBaseScore, scoreOf(reference));
    const second = await repository.read({ ...baseQuery, query: prefix, page: 2, pageSize: 2 });
    if (second.kind !== "overview") throw new Error("Expected score overview.");
    assert.equal(second.configured.items.length, 1);
    const configured = [...first.configured.items, ...second.configured.items];
    assert.equal(new Set(configured.map((item) => item.playerId)).size, 3, "stable id ordering breaks timestamp ties");
    assert.equal(configured.find((item) => item.playerId === ids[0])?.score, 0, "reset rows remain in configured history list");
    const empty = await repository.read({ ...baseQuery, query: `${prefix}%` });
    if (empty.kind !== "overview") throw new Error("Expected score overview.");
    assert.equal(empty.configured.total, 0, "LIKE wildcards are literal search input");
    assert.deepEqual(empty.tiers, first.tiers, "search applies only to configured list, not population statistics");
  } finally {
    await database.delete(teamBalancePlayerOverrides).where(inArray(teamBalancePlayerOverrides.playerId, ids));
    await database.delete(players).where(inArray(players.id, ids));
    await database.delete(userAccounts).where(eq(userAccounts.id, actorId));
    await pool.end();
  }
});
