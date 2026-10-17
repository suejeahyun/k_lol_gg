import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import {
  TeamBalanceService,
  TeamBalanceRecommendationService,
  TeamBalanceServiceError,
  TeamBalanceDomainError,
  evaluateTeamBalanceLayout,
  type TeamBalancePlayer,
  type TeamBalanceCommandContext,
  type TeamBalanceRatingProvider,
  type TeamBalanceRatingSnapshot,
} from "../../src/modules/team-tools";
import { PostgresTeamBalanceRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-repository";
import { PostgresTeamBalanceRatingProvider } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-rating-provider";
import { PostgresTeamBalanceCandidateRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-candidate-repository";
import { teamBalanceCommandEnvelope } from "../../src/modules/team-tools/application/team-balance-service";
import { PostgresTeamBalanceRecommendationRepository } from "../../src/modules/team-tools/infrastructure/postgres-team-balance-recommendation-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import type { V2Database } from "../../src/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "../../src/platform/db/transaction";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  championCatalog,
  matchGames,
  matchParticipants,
  matchSeries,
  matchSubmissions,
  players,
  riotAccountLinks,
  riotSummaries,
  mmrManualAdjustments,
  mmrPlayerProfiles,
  seasonProjectionStates,
  seasonApplications,
  seasons,
  teamBalanceCommandReceipts,
  teamBalanceDraftCandidates,
  teamBalanceDraftParticipants,
  teamBalanceDrafts,
  teamBalanceOutbox,
  teamBalancePlayerOverrides,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { prepareTeamBalanceCaptureFixture } from "../../scripts/test-db/prepare-team-balance-capture-fixture";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

test("team internal experience counts published games only and converges after void and restore", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const playerId = randomUUID();
  const seasonId = randomUUID();
  const championKey = `team-source-${randomUUID()}`;
  const publishedId = randomUUID();
  const now = new Date();
  const provider = new PostgresTeamBalanceRatingProvider(() => now);
  try {
    await applyMigrations(database);
    await database.insert(players).values({ id: playerId, memberName: "내전 집계 계약", memberNameNormalized: `internal-${playerId}`,
      nickname: "InternalCount", nicknameNormalized: `internal-${playerId}`, tagLine: "TEST", tagLineNormalized: "test" });
    await database.insert(seasons).values({ id: seasonId, name: "팀 내전 집계 계약", nameNormalized: `internal-${seasonId}` });
    await database.insert(championCatalog).values({ key: championKey, displayName: "집계 계약 챔피언" });
    const records = [
      { id: publishedId, status: "PUBLISHED" as const, position: "MID" as const },
      { id: randomUUID(), status: "DRAFT" as const, position: "TOP" as const },
      { id: randomUUID(), status: "VOIDED" as const, position: "SUP" as const },
    ];
    for (const record of records) {
      await database.insert(matchSeries).values({ id: record.id, seasonId, title: "팀 집계 계약 경기", titleNormalized: `internal-${record.id}`,
        playedOn: "2026-09-22", blueWins: 1, redWins: 0, gameCount: 1, status: record.status,
        publishedAt: record.status === "DRAFT" ? null : now, voidedAt: record.status === "VOIDED" ? now : null,
        voidReason: record.status === "VOIDED" ? "검증용 무효 경기" : null });
      const gameId = randomUUID();
      await database.insert(matchGames).values({ id: gameId, seriesId: record.id, gameNumber: 1, durationSeconds: 1800,
        winnerTeam: "BLUE", mvpPlayerId: playerId, mvpScoreUnits2: 20, mvpFormulaVersion: "V1_COMPAT_1", mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1" });
      await database.insert(matchParticipants).values({ id: randomUUID(), gameId, playerId, nicknameSnapshot: "InternalCount", tagLineSnapshot: "TEST",
        championKey, team: "BLUE", position: record.position, kills: 2, deaths: 1, assists: 3, mvpScoreUnits2: 20, mvpFormulaVersion: "V1_COMPAT_1" });
    }
    const published = (await provider.load(database, [playerId])).ratings.get(playerId)?.v1;
    assert.equal(published?.internalGames, 1);
    assert.deepEqual(published?.internalPositionGames, { MID: 1 }, "draft and voided positions cannot influence experience");
    await database.update(matchSeries).set({ status: "VOIDED", voidedAt: now, voidReason: "게시 경기 무효 회귀" }).where(eq(matchSeries.id, publishedId));
    const voided = (await provider.load(database, [playerId])).ratings.get(playerId)?.v1;
    assert.equal(voided?.internalGames, 0);
    assert.deepEqual(voided?.internalPositionGames, {});
    assert.equal((await database.select({ id: matchParticipants.id }).from(matchParticipants).where(eq(matchParticipants.playerId, playerId))).length, 3, "void preserves source participants for audit and restore");
    await database.update(matchSeries).set({ status: "PUBLISHED", voidedAt: null, voidReason: null }).where(eq(matchSeries.id, publishedId));
    const restored = (await provider.load(database, [playerId])).ratings.get(playerId)?.v1;
    assert.equal(restored?.internalGames, 1);
    assert.deepEqual(restored?.internalPositionGames, { MID: 1 });
  } finally { await pool.end(); }
});

test("team-only override requires a live admin session and recent solo provider requires connected fresh identity", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const playerId = randomUUID();
  const ownerId = randomUUID();
  const superId = randomUUID();
  const adminId = randomUUID();
  const superSessionId = randomUUID();
  const adminSessionId = randomUUID();
  const ownerSessionId = randomUUID();
  const linkId = randomUUID();
  const now = new Date();
  const superActor = { userAccountId: superId, sessionId: superSessionId, role: "SUPER_ADMIN", authVersion: 0 } as const;
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;
  const ownerActor = { userAccountId: ownerId, sessionId: ownerSessionId, role: "USER", authVersion: 0 } as const;
  const repository = new PostgresTeamBalanceRepository(database);
  const provider = new PostgresTeamBalanceRatingProvider(() => now);
  const input = { playerId, score: 25, reason: "운영자가 확인한 팀 편성 보조 조정" };
  const command = (actor: TransactionSessionActor, key: string, revision = 0, body = input) => teamBalanceCommandEnvelope(
    commandContext(actor, "ADMIN_MUTATION", `override:${key}`), "admin:team-balance:override", { ...body, expectedRevision: revision },
  );
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values([
      { id: ownerId, loginId: `aux-owner-${ownerId}`, loginIdNormalized: `aux-owner-${ownerId}`, status: "APPROVED" },
      { id: superId, loginId: `aux-super-${superId}`, loginIdNormalized: `aux-super-${superId}`, status: "APPROVED", role: "SUPER_ADMIN" },
      { id: adminId, loginId: `aux-admin-${adminId}`, loginIdNormalized: `aux-admin-${adminId}`, status: "APPROVED", role: "ADMIN" },
    ]);
    await database.insert(authSessions).values([superActor, adminActor].map((actor) => ({
      id: actor.sessionId, tokenHash: randomBytes(32), userAccountId: actor.userAccountId, authVersion: 0, role: actor.role,
      purpose: "ADMIN" as const, totpVerifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000),
    })));
    await database.insert(authSessions).values({ id: ownerSessionId, tokenHash: randomBytes(32), userAccountId: ownerId,
      authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    await database.insert(players).values({ id: playerId, userAccountId: ownerId, memberName: "Aux contract", memberNameNormalized: `aux-${playerId}`,
      nickname: "AuxPlayer", nicknameNormalized: `aux${playerId}`, tagLine: "KR1", tagLineNormalized: "kr1" });
    const initial = (await provider.load(database, [playerId])).ratings.get(playerId)?.v1;
    assert.equal(initial?.balanceOverrideScore, 0);
    assert.equal(initial?.recentSolo, null);
    assert.deepEqual(initial?.missingSources, ["RECENT_SOLO", "BALANCE_OVERRIDE"]);
    const mmrBefore = await database.select({ id: mmrManualAdjustments.id }).from(mmrManualAdjustments);
    const original = command(superActor, "set");
    const result = await repository.setPlayerOverride(original, 0, input, now);
    assert.equal(result.revision, 1);
    assert.equal((await repository.setPlayerOverride(original, 0, input, now)).replayed, true);
    assert.equal((await database.select().from(auditEvents).where(and(eq(auditEvents.action, "TEAM_BALANCE_OVERRIDE_SET"), eq(auditEvents.targetId, playerId)))).length, 1);
    const audit = (await database.select().from(auditEvents).where(and(eq(auditEvents.action, "TEAM_BALANCE_OVERRIDE_SET"), eq(auditEvents.targetId, playerId))))[0]!;
    assert.equal(audit.afterJson?.score, 25);
    assert.equal(audit.metadataJson?.affectsMmr, false);
    const adminCommand = command(adminActor, "admin", 1);
    assert.equal((await repository.setPlayerOverride(adminCommand, 1, input, now)).revision, 2);
    assert.equal((await repository.setPlayerOverride(adminCommand, 1, input, now)).replayed, true);
    const adminAudits = await database.select().from(auditEvents).where(and(eq(auditEvents.action, "TEAM_BALANCE_OVERRIDE_SET"), eq(auditEvents.targetId, playerId), eq(auditEvents.actorUserAccountId, adminId)));
    assert.equal(adminAudits.length, 1, "ADMIN replay does not append another audit event");
    assert.equal(adminAudits[0]?.beforeJson?.revision, 1);
    assert.equal(adminAudits[0]?.afterJson?.revision, 2);
    assert.equal(adminAudits[0]?.metadataJson?.affectsMmr, false);
    await assert.rejects(repository.setPlayerOverride(command(ownerActor, "user", 2), 2, input, now), serviceError("FORBIDDEN"));
    for (const actor of [adminActor, superActor]) {
      const accountActor = { ...actor, sessionId: randomUUID() };
      await database.insert(authSessions).values({ id: accountActor.sessionId, tokenHash: randomBytes(32), userAccountId: actor.userAccountId,
        authVersion: 0, role: actor.role, purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
      await assert.rejects(repository.setPlayerOverride(command(accountActor, `account-${actor.role}`, 2), 2, input, now), serviceError("SESSION_STALE"));
      const accountCommand = { ...command(accountActor, `account-auth-${actor.role}`, 2), authorization: "APPROVED_ACCOUNT_MUTATION" as const };
      await assert.rejects(repository.setPlayerOverride(accountCommand, 2, input, now), serviceError("FORBIDDEN"));
    }
    await assert.rejects(repository.setPlayerOverride(command(superActor, "stale"), 0, input, now), serviceError("PRECONDITION_FAILED"));
    const changed = { ...input, score: 40 };
    await assert.rejects(repository.setPlayerOverride(command(superActor, "set", 0, changed), 0, changed, now), serviceError("IDEMPOTENCY_MISMATCH"));
    assert.deepEqual(await database.select({ id: mmrManualAdjustments.id }).from(mmrManualAdjustments), mmrBefore, "team override never creates an MMR adjustment");

    const recentSolo = { games: 2, wins: 1, kda: 3, mainPosition: "MID", subPosition: "TOP", positionConfidence: 0.5, averageDamage: 18000, averageVisionScore: 20 };
    await database.insert(riotAccountLinks).values({ id: linkId, playerId, ownerUserAccountId: ownerId, gameName: "AuxPlayer", tagLine: "KR1", normalizedKey: `aux${playerId.slice(0, 8)}#kr1`, protectedPuuid: "encrypted-test-placeholder", method: "RSO_VERIFIED", linkedAt: now });
    await database.insert(riotSummaries).values({ playerId, linkId, gameName: "AuxPlayer", tagLine: "KR1", lastSyncedAt: now, recentSoloJson: recentSolo, recentSoloSyncedAt: now });
    const fresh = (await provider.load(database, [playerId])).ratings.get(playerId)?.v1;
    assert.deepEqual(fresh?.recentSolo, recentSolo);
    assert.equal(fresh?.balanceOverrideScore, 25);
    assert.deepEqual(fresh?.missingSources, []);
    await database.update(riotSummaries).set({ recentSoloSyncedAt: new Date(now.getTime() - 24 * 3_600_000 - 1) }).where(eq(riotSummaries.playerId, playerId));
    assert.equal((await provider.load(database, [playerId])).ratings.get(playerId)?.v1?.recentSolo, null);
    await database.update(riotSummaries).set({ recentSoloSyncedAt: now, gameName: "OldIdentity" }).where(eq(riotSummaries.playerId, playerId));
    assert.equal((await provider.load(database, [playerId])).ratings.get(playerId)?.v1?.recentSolo, null);
    await database.update(riotSummaries).set({ gameName: "AuxPlayer" }).where(eq(riotSummaries.playerId, playerId));
    await database.update(riotAccountLinks).set({ status: "DISCONNECTED", protectedPuuid: null, disconnectedAt: now }).where(eq(riotAccountLinks.id, linkId));
    assert.equal((await provider.load(database, [playerId])).ratings.get(playerId)?.v1?.recentSolo, null);
    await database.update(riotAccountLinks).set({ status: "CONNECTED", protectedPuuid: "new-encrypted-test-placeholder", disconnectedAt: null, linkedAt: new Date(now.getTime() + 1) }).where(eq(riotAccountLinks.id, linkId));
    assert.equal((await provider.load(database, [playerId])).ratings.get(playerId)?.v1?.recentSolo, null, "relinking requires a summary refreshed after the new link began");
    await assert.rejects(database.update(riotSummaries).set({ recentSoloJson: null }).where(eq(riotSummaries.playerId, playerId)), (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint === "riot_summaries_recent_solo_pair");
    await assert.rejects(database.update(teamBalancePlayerOverrides).set({ score: 1001 }).where(eq(teamBalancePlayerOverrides.playerId, playerId)), (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint === "team_balance_override_score_range");
    await database.update(authSessions).set({ totpVerifiedAt: null }).where(eq(authSessions.id, superSessionId));
    assert.equal((await repository.setPlayerOverride(original, 0, input, now)).replayed, true);
    await database.update(authSessions).set({ totpVerifiedAt: null }).where(eq(authSessions.id, adminSessionId));
    assert.equal((await repository.setPlayerOverride(adminCommand, 1, input, now)).replayed, true);
    for (const changedAccount of [{ role: "USER" as const }, { status: "SUSPENDED" as const }, { authVersion: 1 }]) {
      await database.update(userAccounts).set(changedAccount).where(eq(userAccounts.id, adminId));
      await assert.rejects(repository.setPlayerOverride(adminCommand, 1, input, now), serviceError("SESSION_STALE"));
      await database.update(userAccounts).set({ role: "ADMIN", status: "APPROVED", authVersion: 0 }).where(eq(userAccounts.id, adminId));
    }
    for (const changedSession of [{ role: "SUPER_ADMIN" as const }, { issuedAt: new Date(now.getTime() - 3_600_000), expiresAt: new Date(now.getTime() - 1) }, { revokedAt: now }]) {
      await database.update(authSessions).set(changedSession).where(eq(authSessions.id, adminSessionId));
      await assert.rejects(repository.setPlayerOverride(adminCommand, 1, input, now), serviceError("SESSION_STALE"));
      await database.update(authSessions).set({ role: "ADMIN", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), revokedAt: null }).where(eq(authSessions.id, adminSessionId));
    }
    assert.equal((await repository.setPlayerOverride(adminCommand, 1, input, now)).replayed, true);
    assert.equal((await repository.getPlayerOverride(playerId)).revision, 2, "denied and replayed commands never mutate the override");
    assert.equal((await database.select().from(auditEvents).where(and(eq(auditEvents.action, "TEAM_BALANCE_OVERRIDE_SET"), eq(auditEvents.targetId, playerId)))).length, 2);
    await database.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, superSessionId));
    await assert.rejects(repository.setPlayerOverride(original, 0, input, now), serviceError("SESSION_STALE"));
    await database.update(authSessions).set({ revokedAt: null }).where(eq(authSessions.id, superSessionId));
    await database.update(userAccounts).set({ authVersion: 1 }).where(eq(userAccounts.id, superId));
    await assert.rejects(repository.setPlayerOverride(original, 0, input, now), serviceError("SESSION_STALE"));
  } finally { await pool.end(); }
});

class MutableRatingProvider implements TeamBalanceRatingProvider {
  snapshot: TeamBalanceRatingSnapshot = { generation: null, ratings: new Map() };

  async load(): Promise<TeamBalanceRatingSnapshot> {
    return this.snapshot;
  }
}

function commandContext(
  actorSession: TransactionSessionActor,
  authorization: TeamBalanceCommandContext["authorization"],
  key: string,
): TeamBalanceCommandContext {
  return {
    actorSession,
    authorization,
    idempotencyMaterial: new TextEncoder().encode(key),
    requestId: randomUUID(),
  };
}

function serviceError(code: TeamBalanceServiceError["code"]) {
  return (error: unknown) => error instanceof TeamBalanceServiceError && error.code === code;
}

test("newcomers use registered tiers without inhouse or MMR history and refresh only on explicit draft reevaluation", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "Only the disposable database harness may run this contract.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const ids: string[] = Array.from({ length: 10 }, () => randomUUID());
  const tiers = ["GOLD IV", "MASTER 100", "DIAMOND IV", "PLATINUM II", "SILVER III"] as const;
  const expectedScores = [41, 81.5, 68, 53.6, 33.8] as const;
  const now = new Date();
  const actor = { userAccountId: ownerId, sessionId, role: "USER", authVersion: 0 } as const;
  const viewer = { actorUserAccountId: ownerId, authorization: "OWNER" } as const;
  const provider = new PostgresTeamBalanceRatingProvider(() => now);
  const service = new TeamBalanceService(new PostgresTeamBalanceRepository(database, provider));
  const context = () => commandContext(actor, "APPROVED_ACCOUNT_MUTATION", randomUUID());
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: ownerId, loginId: `newcomer-${ownerId}`, loginIdNormalized: `newcomer-${ownerId}`, status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: ownerId,
      authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    await database.insert(players).values(ids.map((id, index) => ({ id, memberName: `Newcomer${id}`, memberNameNormalized: `newcomer${id}`,
      nickname: `Newcomer${id}`, nicknameNormalized: `newcomer${id}`, tagLine: "TEST", tagLineNormalized: "test",
      currentTier: tiers[index % 5], peakTier: tiers[index % 5] })));
    assert.deepEqual(await database.select({ playerId: mmrPlayerProfiles.playerId }).from(mmrPlayerProfiles)
      .where(inArray(mmrPlayerProfiles.playerId, ids)), []);
    assert.deepEqual(await database.select({ playerId: matchParticipants.playerId }).from(matchParticipants)
      .where(inArray(matchParticipants.playerId, ids)), []);
    const initialRatings = await provider.load(database, ids);
    for (const [index, playerId] of ids.entries()) {
      const rating = initialRatings.ratings.get(playerId);
      assert.ok(rating?.v1);
      assert.equal(rating.overall, null);
      assert.equal(rating.confidence, null);
      assert.equal(rating.v1.currentTier, tiers[index % 5]);
      assert.equal(rating.v1.peakTier, tiers[index % 5]);
      assert.equal(rating.v1.internalGames, 0);
      assert.equal(rating.v1.season, null);
      assert.equal(rating.v1.mmr.confidence, 0);
    }
    const created = await service.createDraft(context(), { title: "Registered-tier newcomers",
      participants: ids.map((playerId, index) => ({ playerId, eligiblePositions: [{ position: positions[index % 5], preference: "MAIN" }] })),
    }, now);
    const draftId = String(created.body.draftId);
    const initial = await service.getDraft(viewer, draftId);
    assert.ok(initial);
    assert.equal(initial.evaluationRound, 1);
    assert.ok(initial.candidates.length > 0);
    for (const candidate of initial.candidates) {
      assert.equal(candidate.assignments.length, 10);
      for (const assignment of candidate.assignments) {
        assert.equal(assignment.rating.effectiveScore, expectedScores[ids.indexOf(assignment.playerId) % 5],
          "a newcomer retains the registered tier score even when MMR confidence is zero");
      }
    }
    assert.deepEqual(initial.participants.map((participant) => participant.rating), ids.map((id) => initialRatings.ratings.get(id)));
    const originalCandidates = await database.select().from(teamBalanceDraftCandidates).where(and(
      eq(teamBalanceDraftCandidates.draftId, draftId), eq(teamBalanceDraftCandidates.evaluationRound, 1),
    ));
    await database.update(players).set({ currentTier: "DIAMOND IV", peakTier: "DIAMOND II", updatedAt: now })
      .where(eq(players.id, ids[0]!));
    const liveRating = (await provider.load(database, [ids[0]!])).ratings.get(ids[0]!)!;
    assert.equal(liveRating.v1?.currentTier, "DIAMOND IV");
    assert.equal(liveRating.v1?.peakTier, "DIAMOND II");
    const unchanged = await service.getDraft(viewer, draftId);
    assert.deepEqual(unchanged, initial, "reading an existing draft does not mix changed registry tiers into its frozen round");
    const reevaluated = await service.reevaluateDraft(context(), draftId, initial.revision, {}, now);
    assert.equal(reevaluated.body.evaluationRound, 2);
    const refreshed = await service.getDraft(viewer, draftId);
    assert.ok(refreshed);
    assert.equal(refreshed.evaluationRound, 2);
    assert.equal(refreshed.revision, initial.revision + 1);
    assert.deepEqual(refreshed.participants.find((participant) => participant.playerId === ids[0])?.rating, liveRating);
    for (const candidate of refreshed.candidates) {
      for (const assignment of candidate.assignments) {
        assert.equal(assignment.rating.effectiveScore, assignment.playerId === ids[0] ? 70.4 : expectedScores[ids.indexOf(assignment.playerId) % 5]);
      }
    }
    assert.deepEqual(await database.select().from(teamBalanceDraftCandidates).where(and(
      eq(teamBalanceDraftCandidates.draftId, draftId), eq(teamBalanceDraftCandidates.evaluationRound, 1),
    )), originalCandidates, "reevaluation appends a new round without rewriting the original scores or assignments");
  } finally { await pool.end(); }
});

test("draft reads retain one snapshot when a real reevaluation commits between its queries", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const ids = Array.from({ length: 10 }, () => randomUUID());
  const now = new Date();
  const actor = { userAccountId: ownerId, sessionId, role: "USER", authVersion: 0 } as const;
  const viewer = { actorUserAccountId: ownerId, authorization: "OWNER" } as const;
  const provider = new MutableRatingProvider();
  const ratings = (score: number) => new Map(ids.map((id) => [id, { overall: score, confidence: 1, sampleSize: 20, positions: null }]));
  provider.snapshot = { generation: 1, ratings: ratings(50) };
  const service = new TeamBalanceService(new PostgresTeamBalanceRepository(database, provider));
  let committed = false;
  let draftId = "";
  // Keep every SQL query real. The wrapper only schedules a concurrent service
  // mutation immediately after the initial draft SELECT returns its rows.
  const observe = (executor: DatabaseExecutor): DatabaseExecutor => new Proxy(executor, {
    get(target, property, receiver) {
      if (property === "transaction") return (work: (transaction: V2Transaction) => Promise<unknown>, options: unknown) =>
        Reflect.apply(target.transaction, target, [async (transaction: V2Transaction) => {
          const setting = (await transaction.execute<{ isolation: string; readonly: string }>(sql`select current_setting('transaction_isolation') as isolation, current_setting('transaction_read_only') as readonly`)).rows[0]!;
          assert.equal(setting.isolation, "repeatable read");
          assert.equal(setting.readonly, "on");
          return work(observe(transaction) as V2Transaction);
        }, options]);
      if (property !== "select") return Reflect.get(target, property, receiver);
      return (...args: unknown[]) => {
        const builder = Reflect.apply(target.select, target, args);
        return new Proxy(builder, { get(select, key, selectReceiver) {
          if (key !== "from") return Reflect.get(select, key, selectReceiver);
          return (table: unknown) => {
            const query = Reflect.apply(select.from, select, [table]) as {
              then: (resolve: (rows: unknown) => unknown, reject: (error: unknown) => unknown) => unknown;
            };
            if (table !== teamBalanceDrafts) return query;
            // where returns this query; intercept its final await through then.
            const then = query.then.bind(query);
            query.then = (resolve: (rows: unknown) => unknown, reject: (error: unknown) => unknown) => then(async (rows: unknown) => {
              if (!committed) {
                committed = true;
                provider.snapshot = { generation: 2, ratings: ratings(90) };
                await service.reevaluateDraft(commandContext(actor, "APPROVED_ACCOUNT_MUTATION", randomUUID()), draftId, 0, {}, now);
              }
              return resolve(rows);
            }, reject);
            return query;
          };
        } });
      };
    },
  });
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: ownerId, loginId: `snapshot-${ownerId}`, loginIdNormalized: `snapshot-${ownerId}`, status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: ownerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    await database.insert(players).values(ids.map((id) => ({ id, memberName: `Snapshot${id}`, memberNameNormalized: `snapshot${id}`, nickname: `Snapshot${id}`, nicknameNormalized: `snapshot${id}`, tagLine: "TEST", tagLineNormalized: "test" })));
    const created = await service.createDraft(commandContext(actor, "APPROVED_ACCOUNT_MUTATION", randomUUID()), {
      title: "Concurrent snapshot contract",
      participants: ids.map((playerId, index) => ({ playerId, eligiblePositions: [{ position: positions[index % 5], preference: "MAIN" }] })),
    }, now);
    draftId = String(created.body.draftId);
    const snapshot = await new PostgresTeamBalanceRepository(observe(database) as V2Database).getDraft(viewer, draftId);
    assert.equal(committed, true);
    assert.equal(snapshot?.revision, 0);
    assert.equal(snapshot?.evaluationRound, 1);
    assert.equal(snapshot?.ratingGeneration, 1);
    assert.ok(snapshot?.participants.every((participant) => participant.rating?.overall === 50));
    assert.ok(snapshot?.candidates.every((candidate) => candidate.evaluationRound === 1 && candidate.assignments.every((assignment) => assignment.rating.effectiveScore === 50)));
    const fresh = await service.getDraft(viewer, draftId);
    assert.equal(fresh?.revision, 1);
    assert.equal(fresh?.evaluationRound, 2);
    assert.equal(fresh?.ratingGeneration, 2);
    assert.ok(fresh?.participants.every((participant) => participant.rating?.overall === 90));
    assert.ok(fresh?.candidates.every((candidate) => candidate.evaluationRound === 2 && candidate.assignments.every((assignment) => assignment.rating.effectiveScore === 90)));
    await assert.rejects(service.getDraft({ actorUserAccountId: randomUUID(), authorization: "OWNER" }, draftId), serviceError("NOT_FOUND"));
    assert.equal(await service.getDraft(viewer, randomUUID()), null);
  } finally { await pool.end(); }
});

test("season team candidates retain the current recruiting day until 06:00 KST", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ids: string[] = Array.from({ length: 3 }, () => randomUUID());
  const applicationIds = ids.map(() => randomUUID());
  let createdSeasonId: string | null = null;
  try {
    await applyMigrations(database);
    let seasonId = (await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, "ACTIVE")).limit(1))[0]?.id;
    if (!seasonId) {
      seasonId = randomUUID();
      createdSeasonId = seasonId;
      await database.insert(seasons).values({ id: seasonId, name: "Operating day candidates", nameNormalized: `operating-${seasonId}`, status: "ACTIVE", activatedAt: new Date() });
    }
    await database.insert(players).values(ids.map((id) => ({ id, memberName: `Day${id}`, memberNameNormalized: `day${id}`, nickname: `Day${id}`, nicknameNormalized: `day${id}`, tagLine: "TEST", tagLineNormalized: "test" })));
    await database.insert(seasonApplications).values(ids.map((playerId, index) => ({ id: applicationIds[index], seasonId: seasonId!, playerId, applyDate: `2026-10-${13 + index}`, mainPosition: "MID" as const })));
    const repository = new PostgresTeamBalanceCandidateRepository(database);
    const dates = async (now: string, days: number) => (await repository.listSeasonGroups({ origin: "ALL", days, now: new Date(now) })).groups
      .filter((group) => group.players.some((player) => ids.includes(player.playerId))).map((group) => group.applyDate).sort();
    for (const instant of ["2026-10-15T23:59:59+09:00", "2026-10-16T00:00:00+09:00", "2026-10-16T05:59:59+09:00"]) {
      assert.deepEqual(await dates(instant, 1), ["2026-10-15"]);
      assert.deepEqual(await dates(instant, 3), ["2026-10-13", "2026-10-14", "2026-10-15"]);
    }
    assert.deepEqual(await dates("2026-10-16T06:00:00+09:00", 1), []);
    assert.deepEqual(await dates("2026-10-16T06:00:00+09:00", 3), ["2026-10-14", "2026-10-15"]);
  } finally {
    await database.delete(seasonApplications).where(inArray(seasonApplications.id, applicationIds));
    await database.delete(players).where(inArray(players.id, ids));
    if (createdSeasonId) await database.delete(seasons).where(eq(seasons.id, createdSeasonId));
    await pool.end();
  }
});

test("S06 draft lifecycle is owner/admin authorized, append-only, transactional, and idempotent", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ratingProvider = new MutableRatingProvider();
  const service = new TeamBalanceService(new PostgresTeamBalanceRepository(database, ratingProvider));
  const ownerId = randomUUID();
  const ownerSessionId = randomUUID();
  const otherOwnerId = randomUUID();
  const otherOwnerSessionId = randomUUID();
  const adminId = randomUUID();
  const adminSessionId = randomUUID();
  const playerIds = Array.from({ length: 10 }, () => randomUUID());
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const ownerActor = { userAccountId: ownerId, sessionId: ownerSessionId, role: "USER", authVersion: 0 } as const;
  const otherOwnerActor = {
    userAccountId: otherOwnerId,
    sessionId: otherOwnerSessionId,
    role: "USER",
    authVersion: 0,
  } as const;
  const adminActor = { userAccountId: adminId, sessionId: adminSessionId, role: "ADMIN", authVersion: 0 } as const;
  const createBody = {
    title: "저녁 내전",
    participants: playerIds.map((playerId, index) => ({
      playerId,
      eligiblePositions: [{ position: positions[index % positions.length]!, preference: "MAIN" }],
    })),
  };

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const matchDraftForeignKey = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'competition'
          and t.relname = 'match_series'
          and c.conname = 'match_series_team_balance_draft_id_team_balance_drafts_id_fk'`,
    );
    assert.equal(matchDraftForeignKey.rowCount, 1, "S04 draft UUID seam must become an S06 foreign key");

    await database.insert(userAccounts).values([
      { id: ownerId, loginId: "s06-owner", loginIdNormalized: "s06-owner", status: "APPROVED" },
      { id: otherOwnerId, loginId: "s06-other", loginIdNormalized: "s06-other", status: "APPROVED" },
      { id: adminId, loginId: "s06-admin", loginIdNormalized: "s06-admin", status: "APPROVED", role: "ADMIN" },
    ]);
    await database.insert(authSessions).values([
      {
        id: ownerSessionId,
        tokenHash: randomBytes(32),
        userAccountId: ownerId,
        authVersion: 0,
        role: "USER",
        purpose: "ACCOUNT",
        issuedAt: now,
        expiresAt,
      },
      {
        id: otherOwnerSessionId,
        tokenHash: randomBytes(32),
        userAccountId: otherOwnerId,
        authVersion: 0,
        role: "USER",
        purpose: "ACCOUNT",
        issuedAt: now,
        expiresAt,
      },
      {
        id: adminSessionId,
        tokenHash: randomBytes(32),
        userAccountId: adminId,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: now,
        issuedAt: now,
        expiresAt,
      },
    ]);
    await database.insert(players).values(playerIds.map((id, index) => ({
      id,
      memberName: `S06 회원 ${index + 1}`,
      memberNameNormalized: `s06 회원 ${index + 1}`,
      nickname: `S06플레이어${index + 1}`,
      nicknameNormalized: `s06플레이어${index + 1}`,
      tagLine: `T${index + 1}`,
      tagLineNormalized: `t${index + 1}`,
    })));

    const createContext = commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "create-1");
    const created = await service.createDraft(createContext, createBody, now);
    assert.equal(created.status, 201);
    assert.equal(created.revision, 0);
    assert.equal(created.replayed, false);
    const draftId = String(created.body.draftId);

    const replayed = await service.createDraft(createContext, createBody, now);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.body.draftId, draftId);
    await assert.rejects(
      service.createDraft(createContext, { ...createBody, title: "다른 요청" }, now),
      serviceError("IDEMPOTENCY_MISMATCH"),
    );

    assert.equal((await database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId))).length, 1);
    assert.equal((await database.select().from(teamBalanceDraftParticipants).where(
      eq(teamBalanceDraftParticipants.draftId, draftId),
    )).length, 10);
    assert.equal((await database.select().from(teamBalanceDraftCandidates).where(
      eq(teamBalanceDraftCandidates.draftId, draftId),
    )).length, 1);
    assert.equal((await database.select().from(teamBalanceCommandReceipts).where(
      eq(teamBalanceCommandReceipts.actorUserAccountId, ownerId),
    )).length, 1);
    assert.equal((await database.select().from(teamBalanceOutbox).where(
      eq(teamBalanceOutbox.draftId, draftId),
    )).length, 1);
    assert.equal(
      (await database.select().from(auditEvents).where(and(
        eq(auditEvents.targetType, "TEAM_BALANCE_DRAFT"),
        eq(auditEvents.targetId, draftId),
      ))).length,
      1,
    );
    const ownerDrafts = await service.listDrafts(
      { actorUserAccountId: ownerId, authorization: "OWNER" },
      { page: 1, pageSize: 12 },
    );
    assert.equal(ownerDrafts.totalCount, 1);
    assert.equal(ownerDrafts.items[0]?.id, draftId);
    assert.equal(ownerDrafts.items[0]?.participantCount, 10);
    assert.equal(
      (await service.listDrafts(
        { actorUserAccountId: otherOwnerId, authorization: "OWNER" },
        { page: 1, pageSize: 12 },
      )).totalCount,
      0,
    );
    const adminDrafts = await service.listDrafts(
      { actorUserAccountId: adminId, authorization: "ADMIN" },
      { page: 1, pageSize: 12 },
    );
    assert.ok(adminDrafts.totalCount >= 1);
    assert.ok(adminDrafts.items.some((item) => item.id === draftId));
    await assert.rejects(
      database.delete(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId)),
    );
    assert.equal(
      (await database.select().from(teamBalanceDrafts).where(eq(teamBalanceDrafts.id, draftId))).length,
      1,
    );

    await assert.rejects(
      service.selectCandidate(
        commandContext(otherOwnerActor, "APPROVED_ACCOUNT_MUTATION", "cross-owner"),
        draftId,
        0,
        { candidateRank: 1 },
        now,
      ),
      serviceError("NOT_FOUND"),
    );

    const selectContext = commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "select-1");
    const selected = await service.selectCandidate(selectContext, draftId, 0, { candidateRank: 1 }, now);
    assert.equal(selected.revision, 1);
    assert.equal((await service.selectCandidate(selectContext, draftId, 0, { candidateRank: 1 }, now)).replayed, true);
    const saved = await service.saveDraft(
      commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "save-1"),
      draftId,
      1,
      {},
      now,
    );
    assert.equal(saved.revision, 2);

    ratingProvider.snapshot = {
      generation: 7,
      ratings: new Map(playerIds.map((playerId, index) => [playerId, {
        overall: 40 + index,
        confidence: 0.5,
        sampleSize: 10,
        positions: null,
      }])),
    };
    const reevaluated = await service.reevaluateDraft(
      commandContext(adminActor, "ADMIN_MUTATION", "admin-reevaluate-1"),
      draftId,
      2,
      {},
      now,
    );
    assert.equal(reevaluated.revision, 3);
    assert.equal(reevaluated.body.evaluationRound, 2);

    const draft = await service.getDraft({ actorUserAccountId: adminId, authorization: "ADMIN" }, draftId);
    assert.ok(draft);
    assert.equal(draft.status, "EVALUATED");
    assert.equal(draft.evaluationRound, 2);
    assert.equal(draft.ratingGeneration, 7);
    assert.deepEqual(draft.participants.map(participant => participant.registeredName), playerIds.map((_, index) => `S06 회원 ${index + 1}`));
    assert.deepEqual(draft.participants.map(participant => participant.displayName), playerIds.map((_, index) => `S06플레이어${index + 1}`));
    assert.ok(draft.selectedCandidateSignature);
    assert.equal(draft.candidates.length, 1);
    assert.deepEqual(
      draft.candidates.map((candidate) => candidate.criterion),
      ["V1_AI_GLOBAL"],
    );
    assert.equal((await database.select().from(teamBalanceDraftCandidates).where(
      eq(teamBalanceDraftCandidates.draftId, draftId),
    )).length, 2);
    assert.equal((await database.select().from(teamBalanceOutbox).where(
      eq(teamBalanceOutbox.draftId, draftId),
    )).length, 4);
    assert.equal(
      (await database.select().from(auditEvents).where(and(
        eq(auditEvents.targetType, "TEAM_BALANCE_DRAFT"),
        eq(auditEvents.targetId, draftId),
      ))).length,
      4,
    );
    assert.equal((await database.select().from(teamBalanceCommandReceipts).where(
      inArray(teamBalanceCommandReceipts.actorUserAccountId, [ownerId, adminId]),
    )).length, 4);

    assert.throws(
      () => service.archiveDraft(
        commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "owner-archive-forbidden"),
        draftId,
        3,
        {},
        now,
      ),
      serviceError("FORBIDDEN"),
    );
    const archived = await service.archiveDraft(
      commandContext(adminActor, "ADMIN_MUTATION", "admin-archive-1"),
      draftId,
      3,
      {},
      now,
    );
    assert.equal(archived.revision, 4);
    assert.equal(
      (await service.listDrafts(
        { actorUserAccountId: ownerId, authorization: "OWNER" },
        { page: 1, pageSize: 12 },
      )).totalCount,
      0,
    );
    await assert.rejects(
      service.getDraft({ actorUserAccountId: ownerId, authorization: "OWNER" }, draftId),
      serviceError("NOT_FOUND"),
    );
    assert.equal(
      (await service.getDraft({ actorUserAccountId: adminId, authorization: "ADMIN" }, draftId))?.status,
      "ARCHIVED",
    );
    await assert.rejects(
      new TeamBalanceRecommendationService(
        new PostgresTeamBalanceRecommendationRepository(database),
      ).getRecommendation(
        { actorUserAccountId: ownerId, authorization: "OWNER" },
        draftId,
        "BLUE",
      ),
      serviceError("NOT_FOUND"),
    );
    const restored = await service.restoreDraft(
      commandContext(adminActor, "ADMIN_MUTATION", "admin-restore-1"),
      draftId,
      4,
      {},
      now,
    );
    assert.equal(restored.revision, 5);
    assert.equal(
      (await service.listDrafts(
        { actorUserAccountId: ownerId, authorization: "OWNER" },
        { page: 1, pageSize: 12 },
      )).totalCount,
      1,
    );
    const openSubmissionId = randomUUID();
    await database.insert(matchSubmissions).values({
      id: openSubmissionId,
      publicCode: `MR2${randomBytes(8).toString("hex").toUpperCase()}`,
      ownerUserAccountId: ownerId,
      seasonId: null,
      title: "검토 중인 초안 연결 접수",
      organizer: "테스트 진행자",
      seriesNumber: 1,
      playedOn: "2026-09-08",
      expectedGameCount: 2,
      teamBalanceDraftId: draftId,
      source: "WEB",
      sourceReferenceHash: randomBytes(32),
      status: "AWAITING_UPLOAD",
      createdAt: now,
      updatedAt: now,
    });
    await assert.rejects(
      service.archiveDraft(
        commandContext(adminActor, "ADMIN_MUTATION", "admin-archive-open-submission"),
        draftId,
        5,
        {},
        now,
      ),
      serviceError("INVALID_TRANSITION"),
    );
    await database.delete(matchSubmissions).where(eq(matchSubmissions.id, openSubmissionId));
    assert.equal((await database.select().from(teamBalanceOutbox).where(
      eq(teamBalanceOutbox.draftId, draftId),
    )).length, 6);
    assert.equal(
      (await database.select().from(auditEvents).where(and(
        eq(auditEvents.targetType, "TEAM_BALANCE_DRAFT"),
        eq(auditEvents.targetId, draftId),
      ))).length,
      6,
    );

    await database.update(authSessions).set({ revokedAt: now }).where(
      and(eq(authSessions.id, ownerSessionId), eq(authSessions.userAccountId, ownerId)),
    );
    await assert.rejects(
      service.selectCandidate(
        commandContext(ownerActor, "APPROVED_ACCOUNT_MUTATION", "revoked-owner"),
        draftId,
        5,
        { candidateRank: 1 },
        now,
      ),
      serviceError("SESSION_STALE"),
    );
    assert.equal((await database.select().from(teamBalanceOutbox).where(
      eq(teamBalanceOutbox.draftId, draftId),
    )).length, 6);

    const captureDraftId = await prepareTeamBalanceCaptureFixture(pool, adminId);
    assert.equal(captureDraftId, draftId);
    const captureDraft = await service.getDraft(
      { actorUserAccountId: adminId, authorization: "ADMIN" },
      captureDraftId,
    );
    assert.equal(captureDraft?.status, "SAVED");
    assert.equal(captureDraft?.selectedCandidateSource, "AUTO");
    assert.ok(captureDraft?.candidates.some((candidate) => candidate.signature === captureDraft.selectedCandidateSignature));
    const expectedRecommendationState = (await database
      .select({ seasonId: seasonProjectionStates.seasonId })
      .from(seasonProjectionStates)
      .innerJoin(seasons, eq(seasons.id, seasonProjectionStates.seasonId))
      .where(and(
        eq(seasonProjectionStates.status, "READY"),
        inArray(seasons.status, ["ACTIVE", "ENDED"]),
      ))
      .limit(1)).length > 0 ? "READY" : "NO_PROJECTION";
    const recommendation = await new TeamBalanceRecommendationService(
      new PostgresTeamBalanceRecommendationRepository(database),
    ).getRecommendation(
      { actorUserAccountId: adminId, authorization: "ADMIN" },
      captureDraftId,
      "RED",
    );
    assert.ok(recommendation);
    assert.equal(recommendation.state, expectedRecommendationState);
    assert.equal(recommendation.picks.length, 5);
  } finally {
    await pool.end();
  }
});

// These rows model pre-policy snapshots without changing append-only candidates.
test("fairness keeps legacy rounds strict and restores server-established relaxation through the draft lifecycle", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const playerIds = Array.from({ length: 10 }, () => randomUUID());
  const now = new Date();
  const actor = { userAccountId: ownerId, sessionId, role: "USER", authVersion: 0 } as const;
  const provider = new MutableRatingProvider();
  const service = new TeamBalanceService(new PostgresTeamBalanceRepository(database, provider));
  const context = (key: string) => commandContext(actor, "APPROVED_ACCOUNT_MUTATION", key);
  const roster: TeamBalancePlayer[] = playerIds.map((playerId, index) => ({
    playerId,
    eligiblePositions: [{ position: positions[index % 5]!, preference: "MAIN" }],
    rating: {
      overall: 50, confidence: 0, sampleSize: 0, positions: null,
      v1: {
        legacyPlayerId: null, currentTier: "GOLD IV", peakTier: "GOLD IV", season: null,
        internalGames: 0, internalPositionGames: {}, recentSolo: null, balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [],
      },
    },
  }));
  const layout = playerIds.map((playerId, index) => ({ playerId, team: index < 5 ? "BLUE" as const : "RED" as const, position: positions[index % 5]! }));
  const evaluated = evaluateTeamBalanceLayout(roster, layout);
  const legacyScore = { ...evaluated.score };
  delete legacyScore.fairness;
  const isFairnessFailure = (error: unknown) => error instanceof TeamBalanceDomainError && error.code === "FAIRNESS_CONSTRAINT";
  async function legacyDraft(snapshot: readonly TeamBalancePlayer[]) {
    const draftId = randomUUID();
    await database.insert(teamBalanceDrafts).values({
      id: draftId, ownerUserAccountId: ownerId, title: "이전 편성 규칙 계약", selectedCandidateSource: "AUTO",
      selectedCandidateSignature: evaluated.signature, createdByUserAccountId: ownerId, updatedByUserAccountId: ownerId,
    });
    await database.insert(teamBalanceDraftParticipants).values(snapshot.map((player, ordinal) => ({
      draftId, playerId: player.playerId, ordinal, displayNameSnapshot: `참가자 ${ordinal}`,
      eligiblePositionsJson: player.eligiblePositions, ratingSnapshotJson: player.rating!,
    })));
    await database.insert(teamBalanceDraftCandidates).values({
      id: randomUUID(), draftId, evaluationRound: 1, source: "AUTO", rank: 1, signature: evaluated.signature,
      assignmentsJson: evaluated.assignments, scoreJson: legacyScore, createdByUserAccountId: ownerId,
    });
    return draftId;
  }
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: ownerId, loginId: `fair-${ownerId}`, loginIdNormalized: `fair-${ownerId}`, status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: ownerId,
      authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    await database.insert(players).values(playerIds.map((id, index) => ({
      id, memberName: `규칙회원 ${index}`, memberNameNormalized: `fair-member-${id}`,
      nickname: `규칙회원 ${index}`, nicknameNormalized: `fair-player-${id}`, tagLine: "TEST", tagLineNormalized: "test",
    })));

    const hardTierRoster = roster.map((player, index) => index === 8 ? {
      ...player, rating: { ...player.rating!, v1: { ...player.rating!.v1!, currentTier: "DIAMOND IV" } },
    } : player);
    const hardTierDraft = await legacyDraft(hardTierRoster);
    const roleRoster = roster.map((player, index) => index === 0 ? {
      ...player, eligiblePositions: [{ position: "MID" as const, preference: "MAIN" as const }],
    } : player);
    const roleDraft = await legacyDraft(roleRoster);
    for (const draftId of [hardTierDraft, roleDraft]) {
      await assert.rejects(service.selectCandidate(context(`legacy-auto-${draftId}`), draftId, 0, { candidateRank: 1 }, now), isFairnessFailure);
      await assert.rejects(service.selectCandidate(context(`legacy-manual-${draftId}`), draftId, 0, { layout }, now), isFairnessFailure);
      await assert.rejects(service.saveDraft(context(`legacy-save-${draftId}`), draftId, 0, {}, now), isFairnessFailure);
      const after = await service.getDraft({ actorUserAccountId: ownerId, authorization: "OWNER" }, draftId);
      assert.equal(after?.revision, 0);
      assert.equal(after?.status, "EVALUATED");
      assert.deepEqual(after?.candidates[0]?.score, legacyScore, "legacy score JSON remains immutable");
      assert.equal((await database.select().from(teamBalanceOutbox).where(eq(teamBalanceOutbox.draftId, draftId))).length, 0);
      assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetId, draftId))).length, 0);
    }
    assert.equal((await database.select().from(teamBalanceCommandReceipts).where(eq(teamBalanceCommandReceipts.actorUserAccountId, ownerId))).length, 0);

    provider.snapshot = { generation: 2, ratings: new Map(hardTierRoster.map((player) => [player.playerId, player.rating!])) };
    const impossibleBody = { title: "최소 완화 편성 계약", participants: roster.map(({ playerId, eligiblePositions }) => ({ playerId, eligiblePositions })) };
    const viewer = { actorUserAccountId: ownerId, authorization: "OWNER" } as const;
    const relaxedContext = context("relaxed-create");
    const relaxed = await service.createDraft(relaxedContext, impossibleBody, now);
    const relaxedId = String(relaxed.body.draftId);
    assert.equal((await service.createDraft(relaxedContext, impossibleBody, now)).replayed, true);
    const relaxedDraft = await service.getDraft(viewer, relaxedId);
    assert.equal(relaxedDraft?.candidates[0]?.score.fairness?.constraintRelaxation?.applied, true);
    assert.equal(relaxedDraft?.candidates[0]?.score.fairness?.status, "REVIEW_REQUIRED");
    assert.ok(relaxedDraft!.candidates[0]!.score.fairness!.constraintRelaxation!.reasons.length > 0);
    for (const participant of relaxedDraft!.participants) {
      const original = hardTierRoster.find((player) => player.playerId === participant.playerId)!;
      assert.deepEqual(participant.eligiblePositions, original.eligiblePositions, "fallback does not overwrite role input");
      assert.deepEqual(participant.rating, original.rating, "fallback does not manufacture stronger player ratings");
    }
    const autoSelected = await service.selectCandidate(context("relaxed-auto"), relaxedId, 0, { candidateRank: 1 }, now);
    assert.equal(autoSelected.revision, 1);
    const savedRelaxedContext = context("relaxed-save");
    assert.equal((await service.saveDraft(savedRelaxedContext, relaxedId, 1, {}, now)).revision, 2);
    assert.equal((await service.saveDraft(savedRelaxedContext, relaxedId, 1, {}, now)).replayed, true);
    const relaxedLayout = relaxedDraft!.candidates[0]!.assignments.map(({ playerId, team, position }) => ({ playerId, team, position }));
    // The generated fallback can avoid the bottom gap by moving roles. A manual
    // return to the requested roles must retain an explicit bottom-gap warning.
    const manualLayout = layout;
    assert.equal((await service.selectCandidate(context("relaxed-manual"), relaxedId, 2, { layout: manualLayout }, now)).revision, 3);
    const manualDraft = await service.getDraft(viewer, relaxedId);
    const manual = manualDraft!.candidates.find((candidate) => candidate.signature === manualDraft!.selectedCandidateSignature)!;
    assert.equal(manual.source, "MANUAL");
    assert.equal(manual.score.fairness?.constraintRelaxation?.applied, true);
    assert.equal(manual.score.fairness?.constraintRelaxation?.roleDeviationCount, 0);
    assert.equal(manual.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 1);
    assert.equal((await service.saveDraft(context("relaxed-manual-save"), relaxedId, 3, {}, now)).revision, 4);
    assert.equal((await service.reevaluateDraft(context("relaxed-recalculate"), relaxedId, 4, {}, now)).revision, 5);
    assert.equal((await service.getDraft(viewer, relaxedId))?.evaluationRound, 2);
    assert.equal((await service.saveDraft(context("relaxed-reevaluated-save"), relaxedId, 5, {}, now)).revision, 6);

    // A legacy round can opt into the new policy only by running the server's
    // generator. Its old append-only candidate JSON is retained unchanged.
    assert.equal((await service.reevaluateDraft(context("legacy-relaxed-recalculate"), hardTierDraft, 0, {}, now)).revision, 1);
    assert.equal((await service.getDraft(viewer, hardTierDraft))?.evaluationRound, 2);
    assert.equal((await service.saveDraft(context("legacy-relaxed-save"), hardTierDraft, 1, {}, now)).revision, 2);
    assert.deepEqual((await database.select().from(teamBalanceDraftCandidates).where(and(
      eq(teamBalanceDraftCandidates.draftId, hardTierDraft), eq(teamBalanceDraftCandidates.evaluationRound, 1),
    )))[0]?.scoreJson, legacyScore);

    const validLegacyDraft = await legacyDraft(roster);
    // A changed provider does not silently replace an evaluation-round snapshot.
    const savedContext = context("valid-legacy-save");
    const saved = await service.saveDraft(savedContext, validLegacyDraft, 0, {}, now);
    assert.equal(saved.revision, 1);
    assert.equal((await service.saveDraft(savedContext, validLegacyDraft, 0, {}, now)).replayed, true);
    const preserved = await service.getDraft({ actorUserAccountId: ownerId, authorization: "OWNER" }, validLegacyDraft);
    assert.equal(preserved?.status, "SAVED");
    assert.deepEqual(preserved?.candidates[0]?.score, legacyScore);

    provider.snapshot = { generation: 3, ratings: new Map(roster.map((player) => [player.playerId, player.rating!])) };
    assert.equal((await service.reevaluateDraft(context("role-relaxed-recalculate"), roleDraft, 0, {}, now)).revision, 1);
    const roleRelaxed = await service.getDraft(viewer, roleDraft);
    assert.equal(roleRelaxed?.candidates[0]?.score.fairness?.constraintRelaxation?.applied, true);
    assert.equal(roleRelaxed?.candidates[0]?.score.fairness?.constraintRelaxation?.roleDeviationCount, 1);
    assert.deepEqual(roleRelaxed?.participants.find((participant) => participant.playerId === playerIds[0])?.eligiblePositions, roleRoster[0]!.eligiblePositions);
    assert.equal((await service.saveDraft(context("role-relaxed-save"), roleDraft, 1, {}, now)).revision, 2);

    // Relaxation belongs to one server evaluation round, not the draft forever.
    assert.equal((await service.reevaluateDraft(context("back-to-strict"), relaxedId, 6, {}, now)).revision, 7);
    const strictAgain = await service.getDraft(viewer, relaxedId);
    assert.equal(strictAgain?.evaluationRound, 3);
    assert.equal(strictAgain?.candidates[0]?.score.fairness?.constraintRelaxation, undefined);
    const wrongRoleLayout = strictAgain!.candidates[0]!.assignments.map(({ playerId, team, position }) => ({
      playerId, team, position: team === "BLUE" && position === "TOP" ? "MID" as const : team === "BLUE" && position === "MID" ? "TOP" as const : position,
    }));
    await assert.rejects(service.selectCandidate(context("strict-round-cannot-relax"), relaxedId, 7, { layout: wrongRoleLayout }, now), isFairnessFailure);
    assert.throws(() => service.selectCandidate(context("client-cannot-relax"), relaxedId, 7, { layout: wrongRoleLayout, allowConstraintRelaxation: true }, now), serviceError("INVALID_INPUT"));
    assert.throws(() => service.createDraft(context("client-cannot-relax-create"), { ...impossibleBody, allowConstraintRelaxation: true }, now), serviceError("INVALID_INPUT"));
    const malformed = relaxedLayout.map((entry, index) => index === 1 ? { ...entry, playerId: relaxedLayout[0]!.playerId } : entry);
    await assert.rejects(service.selectCandidate(context("relaxed-still-validates-roster"), roleDraft, 2, { layout: malformed }, now), serviceError("INVALID_INPUT"));

    const modern = await service.createDraft(context("modern-fairness-create"), { ...impossibleBody, title: "현재 편성 규칙 계약" }, now);
    const modernId = String(modern.body.draftId);
    const readModern = await service.getDraft({ actorUserAccountId: ownerId, authorization: "OWNER" }, modernId);
    assert.equal(readModern?.candidates[0]?.score.fairness?.status, "BALANCED");
    const manualSelected = await service.selectCandidate(context("modern-manual"), modernId, 0, {
      layout: readModern!.candidates[0]!.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })),
    }, now);
    assert.equal(manualSelected.revision, 1);
  } finally {
    await pool.end();
  }
});
