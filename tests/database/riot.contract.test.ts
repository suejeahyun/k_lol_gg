import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

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
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
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
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const digest = "ab".repeat(32);

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
  const now = new Date();

  try {
    await applyMigrations(database);
    await applyMigrations(database);

    const riotTables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'riot' order by table_name",
    );
    assert.deepEqual(
      riotTables.rows.map((row) => row.table_name),
      ["account_links", "command_receipts", "outbox", "rso_states", "summaries", "sync_jobs"],
    );
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='operations' and table_name='site_settings'")).rowCount, 1);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='competition' and table_name='destruction_competitions'")).rowCount, 1);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='catalog' and table_name='champions'")).rowCount, 1);
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='catalog' and table_name in ('champion_command_receipts', 'champion_outbox')")).rowCount, 0, "0014 must not pre-apply the later champion mutation ledger");

    await database.insert(userAccounts).values({
      id: ownerId,
      loginId: "s12-owner",
      loginIdNormalized: "s12-owner",
      status: "APPROVED",
    });
    await database.insert(authSessions).values({
      id: sessionId,
      tokenHash: randomBytes(32),
      userAccountId: ownerId,
      authVersion: 0,
      role: "USER",
      purpose: "ACCOUNT",
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    });
    await database.insert(players).values({
      id: playerId,
      userAccountId: ownerId,
      memberName: "S12 계약 회원",
      memberNameNormalized: "s12 계약 회원",
      nickname: "S12계약선수",
      nicknameNormalized: "s12계약선수",
      tagLine: "KR1",
      tagLineNormalized: "kr1",
    });

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
    const directDisconnected = await service.disconnect({
      context: ownerContext(actor, "direct-disconnect"),
      playerId,
      expectedRevision: Number(connected.body.revision),
    });
    assert.equal(directDisconnected.body.status, "DISCONNECTED");

    const start = await service.startRso({ context: ownerContext(actor, "rso-start"), returnTo: `/players/${playerId}?tab=riot` });
    const publicState = new URL(start.authorizationUrl).searchParams.get("state");
    assert.ok(publicState);
    rso.registerCallback("one-time-code", { gameName: "VerifiedPlayer", tagLine: "V2", puuid: "private-rso-puuid" });
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

    const disconnected = await service.disconnect({
      context: ownerContext(actor, "disconnect"),
      playerId,
      expectedRevision: Number(verified.body.revision),
    });
    assert.equal(disconnected.body.status, "DISCONNECTED");
    assert.equal((await database.select().from(riotAccountLinks))[0]?.protectedPuuid, null);
    assert.equal(await adapter.getPublicSummary(playerId), null, "a disconnected link cannot expose a stale public summary");

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
    assert.equal((await database.select().from(riotSummaries)).length, 1, "private projection remains durable but hidden after unlink");

    await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, sessionId));
    await assert.rejects(service.connectDirect({
      context: ownerContext(actor, "revoked-reconnect"),
      playerId,
      expectedRevision: Number(disconnected.body.revision),
      gameName: "ContractPlayer",
      tagLine: "KR1",
    }), (error: unknown) => error instanceof RiotApplicationError && error.code === "NOT_FOUND");
    assert.equal((await database.select().from(riotAccountLinks))[0]?.status, "DISCONNECTED");
  } finally {
    await pool.end();
  }
});
