import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { Pool } from "pg";

import { eq } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import {
  FakeRiotGateway,
  FakeRiotIdentityProtector,
  FakeRsoAdapter,
  RiotApplicationError,
  RiotApplicationService,
  type RiotCommandContext,
} from "../../src/modules/riot";
import { PostgresRiotAdapter } from "../../src/modules/riot/infrastructure/postgres-riot-adapter";
import { PostgresPublicRiotQueryRepository } from "../../src/modules/riot/infrastructure/postgres-public-riot-query";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations, defaultMigrationsFolder } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  players,
  riotAccountLinks,
  riotCommandReceipts,
  riotOutbox,
  riotRsoStates,
  riotSummaries,
  riotSyncJobs,
  riotMatchArchive,
  riotAnalyticsProgress,
  riotRankHistory,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { normalizeRiotMatch, normalizeRiotTimeline } from "../../src/modules/riot/domain/riot-match-normalizer";
import { analyticsMatch, analyticsPuuid, analyticsTimeline } from "../fixtures/riot-analytics";

const digest = "ab".repeat(32);

test("0045 fresh, populated 0044 upgrade and replay preserve existing Riot links and summaries", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const admin = new Pool({ connectionString, max: 1 });
  const temporaryRoot = resolve(".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(join(temporaryRoot, "riot-analytics-migration-"));
  const journal = JSON.parse(await readFile(join(defaultMigrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((entry) => entry.tag === "0045_simple_reptil");
  assert.ok(index > 0);
  try {
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }));
    for (const entry of journal.entries.slice(0, index)) await copyFile(join(defaultMigrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    for (const upgrade of [false, true]) {
      const databaseName = `klol_v2_test_riot_${randomBytes(8).toString("hex")}`;
      assert.match(databaseName, /^klol_v2_test_riot_[a-f0-9]{16}$/u);
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const url = new URL(connectionString); url.pathname = `/${databaseName}`;
      assertSafeTestDatabase({ connectionString: url.toString(), nodeEnv: "test", testMode: "true" });
      const { database, pool } = createDatabaseHandle(url.toString(), { max: 1 });
      const ownerId = randomUUID(), playerId = randomUUID(), linkId = randomUUID();
      try {
        if (upgrade) {
          await applyMigrations(database, folder);
          await database.insert(userAccounts).values({ id: ownerId, loginId: "upgrade-analytics", loginIdNormalized: "upgrade-analytics", status: "APPROVED" });
          await database.insert(players).values({ id: playerId, userAccountId: ownerId, memberName: "합성 이관", memberNameNormalized: "합성 이관", nickname: "UpgradeStats", nicknameNormalized: "upgradestats", tagLine: "TEST", tagLineNormalized: "test" });
          await database.insert(riotAccountLinks).values({ id: linkId, revision: 1, playerId, ownerUserAccountId: ownerId, gameName: "UpgradeStats", tagLine: "TEST", normalizedKey: "upgradestats#test", protectedPuuid: "synthetic-encrypted", method: "ADMIN", status: "CONNECTED", linkedAt: new Date() });
          await database.insert(riotSummaries).values({ playerId, linkId, gameName: "UpgradeStats", tagLine: "TEST", soloTier: "GOLD", soloRank: "II", leaguePoints: 42, wins: 7, losses: 3, lastSyncedAt: new Date() });
        }
        await applyMigrations(database); await applyMigrations(database);
        assert.equal(Number((await pool.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count), journal.entries.length);
        assert.equal(Number((await pool.query("select count(*) from information_schema.tables where table_schema='riot' and table_name in ('match_archive','analytics_progress','rank_history')")).rows[0].count), 3);
        if (upgrade) {
          assert.equal((await database.select().from(riotSummaries))[0]?.leaguePoints, 42);
          assert.equal((await database.select().from(riotAccountLinks))[0]?.revision, 1);
        }
      } finally { await pool.end(); await admin.query(`DROP DATABASE "${databaseName}"`); }
    }
  } finally {
    await admin.end();
    const location = relative(temporaryRoot, resolve(folder));
    assert.ok(location.startsWith("riot-analytics-migration-") && !location.includes(".."));
    await rm(folder, { recursive: true, force: true });
  }
});

test("Riot analytics archive deduplicates, pages without upstream access, retains daily observations and hides changed connections", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adapter = new PostgresRiotAdapter(database, { featureEnabled: true, jobVerifier: { verifyAndConsume: async () => true } });
  const query = new PostgresPublicRiotQueryRepository(database);
  const ownerId = randomUUID(), playerId = randomUUID(), linkId = randomUUID(), now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const loadCollectionState = () => adapter.dependencies.unitOfWork.transaction(async (tx) => {
    const link = await adapter.dependencies.repository.loadLinkForUpdate(tx, linkId);
    assert.ok(link);
    return adapter.dependencies.repository.loadAnalyticsCollectionState!(tx, link);
  });
  try {
    await applyMigrations(database);
    const key = `analytics-${ownerId}`;
    await database.insert(userAccounts).values({ id: ownerId, loginId: key, loginIdNormalized: key, status: "APPROVED" });
    await database.insert(players).values({ id: playerId, userAccountId: ownerId, memberName: "합성 분석", memberNameNormalized: "합성 분석", nickname: "SyntheticStats", nicknameNormalized: "syntheticstats", tagLine: "TEST", tagLineNormalized: "test" });
    await database.insert(riotAccountLinks).values({ id: linkId, revision: 1, playerId, ownerUserAccountId: ownerId, gameName: "SyntheticStats", tagLine: "TEST", normalizedKey: "syntheticstats#test", protectedPuuid: "synthetic-encrypted-only", method: "ADMIN", status: "CONNECTED", linkedAt: new Date(now.getTime() - 1_000) });
    const matches = Array.from({ length: 45 }, (_, index) => normalizeRiotMatch(analyticsMatch(`KR_${1000 + index}`, now.getTime() - index * 3_600_000), `KR_${1000 + index}`, analyticsPuuid)!);
    const first = matches[0]!;
    matches[0] = { ...first, timeline: normalizeRiotTimeline(analyticsTimeline(first.matchId), first), timelineStatus: "AVAILABLE" };
    const projection = { playerId, gameName: "SyntheticStats", tagLine: "TEST", soloTier: "GOLD", soloRank: "II", leaguePoints: 25, wins: 20, losses: 10, syncedAt: now,
      analytics: { matches, historyBefore: Math.floor(now.getTime() / 1_000) - 45 * 3_600, historyComplete: false, partial: false, recentPageComplete: true } };
    await adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, {
      ...projection, analytics: { ...projection.analytics, matches: [], recentPageComplete: false, partial: true },
    }); });
    assert.equal((await database.select().from(riotAnalyticsProgress).where(eq(riotAnalyticsProgress.linkId, linkId)))[0]?.updatedAt.getTime(), 0,
      "an initial partial collection cannot claim a completed recent-page observation");
    assert.equal((await loadCollectionState()).lastCollectedAt, undefined);
    assert.equal(await query.getPublicAnalytics(playerId), null, "the private epoch sentinel is never exposed as a public 1970 update");
    await adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, projection); });
    assert.equal((await loadCollectionState()).lastCollectedAt?.toISOString(), now.toISOString());
    const partialAt = new Date(now.getTime() + 500);
    await adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, {
      ...projection, syncedAt: partialAt, leaguePoints: 30,
      analytics: { ...projection.analytics, matches: [{ ...first, timeline: null, timelineStatus: "PENDING" }], recentPageComplete: false, partial: true },
    }); });
    assert.equal((await database.select().from(riotAnalyticsProgress).where(eq(riotAnalyticsProgress.linkId, linkId)))[0]?.updatedAt.toISOString(), now.toISOString(),
      "a partial refresh preserves the last fully observed recent-page watermark");
    assert.equal((await loadCollectionState()).lastCollectedAt?.toISOString(), now.toISOString());
    assert.equal((await database.select().from(riotMatchArchive).where(eq(riotMatchArchive.linkId, linkId))).length, 45);
    assert.equal((await database.select().from(riotRankHistory).where(eq(riotRankHistory.linkId, linkId))).length, 1);
    const page = await query.getPublicAnalytics(playerId);
    assert.ok(page); assert.equal(page.matches.length, 40); assert.equal(page.coverage.collectedGames, 45); assert.ok(page.nextCursor);
    assert.equal(page.updatedAt, partialAt.toISOString(), "public freshness still reflects newly persisted partial match data");
    assert.equal(page.matches[0]!.timeline, null); assert.equal(page.matches[0]!.timelineDeferred, true);
    assert.equal((await query.getPublicMatch(playerId, first.matchId))?.timeline?.frames.length, 3, "a stale partial refresh cannot erase a collected timeline");
    assert.equal(page.rankHistory[0]!.leaguePoints, 30); assert.equal(page.rankHistory[0]!.recordedAt, partialAt.toISOString());
    const secondPage = await query.getPublicAnalytics(playerId, page.nextCursor);
    assert.ok(secondPage); assert.equal(secondPage.matches.length, 5); assert.equal(secondPage.nextCursor, null);
    assert.equal(new Set([...page.matches, ...secondPage.matches].map((match) => match.matchId)).size, 45);
    assert.doesNotMatch(JSON.stringify(page), /puuid|ownerUserAccountId|synthetic-encrypted/iu);
    assert.equal(await query.getPublicAnalytics(playerId, "invalid"), null);
    const nextLinkedAt = new Date(now.getTime() + 1_000);
    await database.update(riotAccountLinks).set({ revision: 2, linkedAt: nextLinkedAt }).where(eq(riotAccountLinks.id, linkId));
    assert.equal(await query.getPublicAnalytics(playerId), null);
    assert.equal(await query.getPublicMatch(playerId, first.matchId), null);
    assert.equal(await adapter.getPublicSummary(playerId), null);
    assert.equal((await query.getPublicProfileState(playerId)).kind, "PENDING_SYNC");
    await adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, {
      ...projection, syncedAt: nextLinkedAt, analytics: { ...projection.analytics, matches: [], recentPageComplete: false, partial: true },
    }); });
    assert.equal((await database.select().from(riotAnalyticsProgress).where(eq(riotAnalyticsProgress.linkId, linkId)))[0]?.updatedAt.getTime(), 0,
      "a changed connection cannot inherit its previous revision's completed observation");
    assert.equal((await loadCollectionState()).lastCollectedAt, undefined);
    assert.equal(await query.getPublicAnalytics(playerId), null);
    await adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, { ...projection, syncedAt: nextLinkedAt, analytics: { ...projection.analytics, matches: [first] } }); });
    assert.equal((await loadCollectionState()).lastCollectedAt?.toISOString(), nextLinkedAt.toISOString());
    assert.equal((await query.getPublicAnalytics(playerId))?.coverage.collectedGames, 1);
    assert.equal((await database.select().from(riotMatchArchive).where(eq(riotMatchArchive.linkId, linkId))).length, 1, "old connection generations are retired on the next projection");
    await assert.rejects(adapter.dependencies.unitOfWork.transaction(async (tx) => { await adapter.dependencies.repository.saveProjection(tx, { ...projection, syncedAt: nextLinkedAt, leaguePoints: 999 }); throw new Error("synthetic-rollback"); }), /synthetic-rollback/u);
    assert.equal((await query.getPublicAnalytics(playerId))?.rankHistory[0]?.leaguePoints, 25);
    await database.update(players).set({ nickname: "ChangedStats", nicknameNormalized: "changedstats" }).where(eq(players.id, playerId));
    assert.equal(await query.getPublicAnalytics(playerId), null); assert.equal(await query.getPublicMatch(playerId, first.matchId), null);
    assert.equal(await adapter.getPublicSummary(playerId), null);
    assert.equal((await query.getPublicProfileState(playerId)).kind, "UNLINKED");
    assert.equal((await database.select().from(riotAnalyticsProgress).where(eq(riotAnalyticsProgress.linkId, linkId)))[0]?.linkRevision, 2);
  } finally { await pool.end(); }
});

function postgresConstraint(code: string, constraint: string) {
  return (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const candidate = current as { code?: string; constraint?: string; cause?: unknown };
      if (candidate.code === code && candidate.constraint === constraint) return true;
      current = candidate.cause;
    }
    return false;
  };
}

function ownerContext(actor: TransactionSessionActor, label: string): RiotCommandContext {
  return {
    principalId: actor.userAccountId,
    requestId: randomUUID(),
    issuedAt: new Date().toISOString(),
    authorizationIntent: {
      kind: "OWNER_SESSION",
      sessionId: actor.sessionId,
      role: actor.role,
      authVersion: actor.authVersion,
      transactionRecheck: true,
    },
    idempotencyKeyMaterial: new TextEncoder().encode(`s12-pg-contract:${label}:0001`),
    bodyDigestHex: digest,
  };
}

const jobIntent = {
  kind: "SIGNED_JOB",
  jobName: "riot-sync",
  nonce: "s12_pg_job_nonce_0001",
  timestampSeconds: 1_788_770_000,
  bodyDigestHex: digest,
  signatureHex: "cd".repeat(32),
  transactionRecheck: true,
} as const;

test("S12 Riot persistence keeps owner auth, one-time RSO, jobs, receipts, audit and outbox atomic", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const gateway = new FakeRiotGateway();
  const rso = new FakeRsoAdapter("s12-pg-rso");
  const identityProtector = new FakeRiotIdentityProtector();
  const adapter = new PostgresRiotAdapter(database, {
    featureEnabled: true,
    jobVerifier: { verifyAndConsume: async () => true },
  });
  const publicQuery = new PostgresPublicRiotQueryRepository(database);
  let applicationNow = new Date();
  const service = new RiotApplicationService({
    ...adapter.dependencies,
    gateway,
    rso,
    identityProtector,
    clock: {
      now: () => new Date(applicationNow),
      receiptExpiresAt: (createdAt) => new Date(createdAt.getTime() + 24 * 60 * 60_000),
    },
  });
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const playerId = randomUUID();
  const actor = { userAccountId: ownerId, sessionId, role: "USER", authVersion: 0 } as const;
  const secondOwnerId = randomUUID();
  const secondSessionId = randomUUID();
  const secondPlayerId = randomUUID();
  const unownedPlayerId = randomUUID();
  const secondActor = { userAccountId: secondOwnerId, sessionId: secondSessionId, role: "USER", authVersion: 0 } as const;
  const now = new Date();

  try {
    await applyMigrations(database);
    await applyMigrations(database);

    const riotTables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'riot' order by table_name",
    );
    assert.deepEqual(
      riotTables.rows.map((row) => row.table_name),
      ["account_links", "analytics_progress", "command_receipts", "match_archive", "outbox", "rank_history", "rso_exchange_results", "rso_states", "summaries", "sync_jobs"],
    );
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='operations' and table_name='site_settings'")).rowCount, 1);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='competition' and table_name='destruction_competitions'")).rowCount, 1);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='catalog' and table_name='champions'")).rowCount, 1);
    const riotMigration = await readFile(new URL("../../drizzle/0014_s12_riot.sql", import.meta.url), "utf8");
    const riotLinkSafetyMigration = await readFile(new URL("../../drizzle/0035_supreme_joystick.sql", import.meta.url), "utf8");
    assert.doesNotMatch(riotMigration, /champion_(?:command_receipts|outbox)/u, "0014 must not pre-apply the later champion mutation ledger");
    assert.match(riotLinkSafetyMigration, /DO \$\$/u);
    assert.match(riotLinkSafetyMigration, /GROUP BY "normalized_key"/u);
    assert.match(riotLinkSafetyMigration, /GROUP BY "owner_user_account_id"/u);
    const riotPlayerOwnerMigration = await readFile(new URL("../../drizzle/0036_flowery_hairball.sql", import.meta.url), "utf8");
    assert.match(riotPlayerOwnerMigration, /DO \$\$/u);
    assert.match(riotPlayerOwnerMigration, /riot_links_player_owner_fk/u);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='catalog' and table_name in ('champion_command_receipts', 'champion_outbox')")).rowCount, 2, "0016 must install the champion mutation ledger");

    await database.insert(userAccounts).values([
      { id: ownerId, loginId: "s12-owner", loginIdNormalized: "s12-owner", status: "APPROVED" },
      { id: secondOwnerId, loginId: "s12-owner-2", loginIdNormalized: "s12-owner-2", status: "APPROVED" },
    ]);
    await database.insert(authSessions).values([
      { id: sessionId, tokenHash: randomBytes(32), userAccountId: ownerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 60 * 60_000) },
      { id: secondSessionId, tokenHash: randomBytes(32), userAccountId: secondOwnerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 60 * 60_000) },
    ]);
    await database.insert(players).values([
      { id: playerId, userAccountId: ownerId, memberName: "S12 계약 회원", memberNameNormalized: "s12 계약 회원", nickname: "ContractPlayer", nicknameNormalized: "contractplayer", tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: secondPlayerId, userAccountId: secondOwnerId, memberName: "S12 계약 회원 둘", memberNameNormalized: "s12 계약 회원 둘", nickname: "SecondPlayer", nicknameNormalized: "secondplayer", tagLine: "KR2", tagLineNormalized: "kr2" },
      { id: unownedPlayerId, memberName: "S12 미소유 선수", memberNameNormalized: "s12 미소유 선수", nickname: "S12미소유선수", nicknameNormalized: "s12미소유선수", tagLine: "KR1", tagLineNormalized: "kr1" },
    ]);
    await assert.rejects(
      database.insert(riotAccountLinks).values({
        id: randomUUID(), revision: 0, playerId: unownedPlayerId, ownerUserAccountId: ownerId,
        gameName: "Mismatch", tagLine: "KR1", normalizedKey: "mismatch#kr1", protectedPuuid: "test-only",
        method: "DIRECT_OWNER", status: "CONNECTED", linkedAt: now,
      }),
      postgresConstraint("23503", "riot_links_player_owner_fk"),
    );

    gateway.registerIdentity({ gameName: "ContractPlayer", tagLine: "KR1", puuid: "private-direct-puuid" });
    const connectContext = ownerContext(actor, "connect");
    const connected = await service.connectDirect({
      context: connectContext,
      playerId,
      expectedRevision: 0,
      gameName: "ContractPlayer",
      tagLine: "KR1",
    });
    assert.equal(connected.replayed, false);
    assert.equal((await service.connectDirect({
      context: connectContext,
      playerId,
      expectedRevision: 0,
      gameName: "ContractPlayer",
      tagLine: "KR1",
    })).replayed, true);
    const linkId = String(connected.body.linkId);
    const storedDirectLink = (await database.select().from(riotAccountLinks).where(eq(riotAccountLinks.id, linkId)))[0];
    assert.ok(storedDirectLink?.protectedPuuid);
    assert.notEqual(storedDirectLink.protectedPuuid, "private-direct-puuid");
    await assert.rejects(service.connectDirect({
      context: ownerContext(secondActor, "duplicate-riot-id"),
      playerId: secondPlayerId,
      expectedRevision: 0,
      gameName: "ContractPlayer",
      tagLine: "KR1",
    }), (error: unknown) => error instanceof RiotApplicationError && error.code === "INVALID_COMMAND");
    const directDisconnected = await service.disconnect({
      context: ownerContext(actor, "direct-disconnect"),
      playerId,
      expectedRevision: Number(connected.body.revision),
    });
    assert.equal(directDisconnected.body.status, "DISCONNECTED");
    gateway.registerIdentity({ gameName: "SecondPlayer", tagLine: "KR2", puuid: "private-second-puuid" });
    const reconnectedToSecondOwner = await service.connectDirect({
      context: ownerContext(secondActor, "reconnect-after-disconnect"),
      playerId: secondPlayerId,
      expectedRevision: 0,
      gameName: "SecondPlayer",
      tagLine: "KR2",
    });
    assert.equal(reconnectedToSecondOwner.body.status, "CONNECTED");

    const start = await service.startRso({ context: ownerContext(actor, "rso-start"), returnTo: `/players/${playerId}?tab=riot` });
    const publicState = new URL(start.authorizationUrl).searchParams.get("state");
    assert.ok(publicState);
    rso.registerCallback("one-time-code", { gameName: "ContractPlayer", tagLine: "KR1", puuid: "private-rso-puuid" });
    const callbackContext = ownerContext(actor, "rso-callback");
    const verified = await service.completeRso({
      context: callbackContext,
      playerId,
      expectedRevision: Number(directDisconnected.body.revision),
      publicState,
      authorizationCode: "one-time-code",
    });
    assert.equal(verified.replayed, false);
    assert.equal((await service.completeRso({
      context: callbackContext,
      playerId,
      expectedRevision: Number(directDisconnected.body.revision),
      publicState,
      authorizationCode: "one-time-code",
    })).replayed, true);
    assert.equal(rso.exchangeCalls, 1);
    const stateRow = (await database.select().from(riotRsoStates))[0];
    assert.ok(stateRow?.consumedAt);
    assert.notEqual(stateRow.stateDigest.toString("hex"), publicState);

    async function requestAndRun(
      label: string,
      configureGateway: () => void,
    ) {
      configureGateway();
      const requested = await service.requestSync({
        context: ownerContext(actor, `sync-${label}`),
        mode: "SINGLE",
        linkIds: [linkId],
        cooldownMilliseconds: 1_000,
      });
      const jobId = String((requested.body.jobIds as readonly string[])[0]);
      await adapter.dependencies.unitOfWork.transaction(async (transaction) => {
        const pending = await adapter.dependencies.repository.findPendingSyncJob(transaction, linkId, new Date(0));
        assert.equal(pending?.id, jobId);
        assert.equal(await adapter.dependencies.repository.findPendingSyncJob(transaction, linkId, new Date(applicationNow.getTime() + 1_000)), null);
      });
      const processed = await service.runNextSync({ principalId: "job:s12-contract", authorizationIntent: jobIntent });
      assert.equal(processed.status, "PROCESSED");
      applicationNow = new Date(applicationNow.getTime() + 1_000);
      return jobId;
    }

    const successJobId = await requestAndRun("success", () => gateway.registerRank("private-rso-puuid", {
      tier: "DIAMOND", rank: "II", leaguePoints: 72, wins: 30, losses: 20, partial: false,
    }));
    const partialJobId = await requestAndRun("partial", () => gateway.registerRank("private-rso-puuid", {
      tier: "DIAMOND", rank: null, leaguePoints: null, wins: 30, losses: null, partial: true,
    }));
    const failedJobId = await requestAndRun("failed", () => gateway.registerFailure("private-rso-puuid", {
      kind: "PERMANENT_FAILURE", code: "NOT_FOUND",
    }));

    const storedJobs = await database.select().from(riotSyncJobs);
    assert.deepEqual(
      new Map(storedJobs.map((job) => [job.id, job.status])),
      new Map([[successJobId, "SUCCEEDED"], [partialJobId, "PARTIAL"], [failedJobId, "FAILED"]]),
    );
    const publicSummary = await adapter.getPublicSummary(playerId);
    assert.deepEqual(Object.keys(publicSummary!).sort(), ["lastSyncedAt", "leaguePoints", "losses", "playerId", "riotId", "soloRank", "soloTier", "wins"]);
    assert.equal(JSON.stringify(publicSummary).includes("puuid"), false);
    const publicProfileState = await publicQuery.getPublicProfileState(playerId);
    assert.equal(publicProfileState.kind, "READY");
    assert.equal(JSON.stringify(publicProfileState).includes("puuid"), false);
    assert.equal(JSON.stringify(publicProfileState).includes("ownerUserAccountId"), false);

    const disconnected = await service.disconnect({
      context: ownerContext(actor, "disconnect"),
      playerId,
      expectedRevision: Number(verified.body.revision),
    });
    assert.equal(disconnected.body.status, "DISCONNECTED");
    assert.equal((await database.select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, playerId)))[0]?.protectedPuuid, null);
    assert.equal(await adapter.getPublicSummary(playerId), null, "a disconnected link cannot expose a stale public summary");
    assert.deepEqual(await publicQuery.getPublicProfileState(playerId), { kind: "UNLINKED" });

    const ledgerText = JSON.stringify({
      receipts: await database.select().from(riotCommandReceipts),
      outbox: await database.select().from(riotOutbox),
      audit: await database.select().from(auditEvents).where(eq(auditEvents.targetType, "RIOT_INTEGRATION")),
    });
    for (const forbidden of ["private-direct-puuid", "private-rso-puuid", "one-time-code", publicState]) {
      assert.equal(ledgerText.includes(forbidden), false, `durable safe ledgers must omit ${forbidden}`);
    }
    assert.ok((await database.select().from(riotCommandReceipts)).length >= 7);
    assert.ok((await database.select().from(riotOutbox)).length >= 13);
    assert.equal((await database.select().from(riotSummaries).where(eq(riotSummaries.playerId, playerId))).length, 1, "the owner's private projection remains durable but hidden after unlink");

    await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, sessionId));
    await assert.rejects(service.connectDirect({
      context: ownerContext(actor, "revoked-reconnect"),
      playerId,
      expectedRevision: Number(disconnected.body.revision),
      gameName: "ContractPlayer",
      tagLine: "KR1",
    }), (error: unknown) => error instanceof RiotApplicationError && error.code === "NOT_FOUND");
    assert.equal((await database.select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, playerId)))[0]?.status, "DISCONNECTED");
  } finally {
    await pool.end();
  }
});
