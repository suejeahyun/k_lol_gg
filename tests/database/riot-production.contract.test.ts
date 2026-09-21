import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { eq, sql } from "drizzle-orm";

import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { signJobRequest } from "../../src/modules/operations/infrastructure/job-signature";
import {
  FakeRiotGateway,
  RiotApplicationError,
  RiotApplicationService,
  type RiotCommandContext,
} from "../../src/modules/riot";
import { RiotAesGcmIdentityProtector, parseRiotEncryptionKeyring } from "../../src/modules/riot/infrastructure/riot-identity-protector";
import { PostgresRiotJobVerifier } from "../../src/modules/riot/infrastructure/riot-job-verifier";
import { PostgresRiotAdapter } from "../../src/modules/riot/infrastructure/postgres-riot-adapter";
import { RiotRsoAdapter } from "../../src/modules/riot/infrastructure/riot-rso-adapter";
import { runPostgresRiotApiProbe } from "../../src/modules/riot/infrastructure/postgres-riot-api-probe";
import type { RiotProductionConfiguration } from "../../src/modules/riot/infrastructure/riot-runtime-policy";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  authSessions,
  jobNonceBindings,
  players,
  riotAccountLinks,
  riotRsoExchangeResults,
  riotRsoStates,
  riotSummaries,
  riotSyncJobs,
  maintenanceRuns,
  siteSettings,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const bodyDigestHex = createHash("sha256").update("{}").digest("hex");

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
    idempotencyKeyMaterial: new TextEncoder().encode(`s12-production-contract:${label}:0001`),
    bodyDigestHex,
  };
}

async function applyPendingRiotProductionMigration(pool: import("pg").Pool) {
  const installed = await pool.query<{ installed: string | null }>(
    "select to_regclass('riot.rso_exchange_results')::text as installed",
  );
  if (installed.rows[0]?.installed) return;
  const sql = await readFile(new URL("../../drizzle/0020_s12_riot_production_adapters.sql", import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}

test("production RSO cache and signed sync job survive application retry without persisting credentials", { timeout: 30_000 }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ownerId = randomUUID();
  const sessionId = randomUUID();
  const playerId = randomUUID();
  const actor = { userAccountId: ownerId, sessionId, role: "USER", authVersion: 0 } as const;
  const now = new Date();
  const encryptionKeys = JSON.stringify({
    current: "contract-v1",
    keys: { "contract-v1": Buffer.alloc(32, 7).toString("base64url") },
  });
  const protector = new RiotAesGcmIdentityProtector(parseRiotEncryptionKeyring(encryptionKeys));
  const jobSecret = "s12-production-job-secret-placeholder";
  const gateway = new FakeRiotGateway();
  gateway.registerRank("private-rso-puuid", {
    tier: "EMERALD",
    rank: "I",
    leaguePoints: 44,
    wins: 21,
    losses: 13,
    partial: false,
  });
  let externalCalls = 0;
  const accessToken = "private-access-token-value";
  const authorizationCode = "one-time-authorization-code";
  const rso = new RiotRsoAdapter(database, protector, {
    authorizeUrl: "https://auth.riotgames.com/authorize",
    tokenUrl: "https://auth.riotgames.com/token",
    accountUrl: "https://asia.api.riotgames.com/riot/account/v1/accounts/me",
    clientId: "contract-client",
    clientSecret: "contract-client-secret-placeholder-0000",
    redirectUri: "https://klol.example/api/me/riot/rso/callback",
    stateSecret: "contract-state-secret-placeholder-000000",
    fetch: async (_input, init) => {
      externalCalls += 1;
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      if (authorization.startsWith("Basic ")) {
        return new Response(JSON.stringify({ access_token: accessToken, token_type: "Bearer" }), { status: 200 });
      }
      assert.equal(authorization, `Bearer ${accessToken}`);
      return new Response(JSON.stringify({
        puuid: "private-rso-puuid",
        gameName: "VerifiedPlayer",
        tagLine: "KR1",
      }), { status: 200 });
    },
  });
  const adapter = new PostgresRiotAdapter(database, {
    featureEnabled: true,
    jobVerifier: new PostgresRiotJobVerifier(jobSecret),
  });
  const recentSolo = { games: 2, wins: 1, kda: 3, mainPosition: "MID" as const, subPosition: null, positionConfidence: 1, averageDamage: 18000, averageVisionScore: 20 };
  const service = new RiotApplicationService({ ...adapter.dependencies, gateway: {
    resolveRiotId: (input) => gateway.resolveRiotId(input),
    fetchRank: (input) => gateway.fetchRank(input),
    fetchRecentSolo: async () => ({ kind: "SUCCESS", summary: recentSolo }),
  }, rso, identityProtector: protector });

  try {
    await applyMigrations(database);
    await applyPendingRiotProductionMigration(pool);
    await database.insert(userAccounts).values({
      id: ownerId,
      loginId: `s12-production-${ownerId}`,
      loginIdNormalized: `s12-production-${ownerId}`,
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
      memberName: "S12 production contract",
      memberNameNormalized: `s12 production ${ownerId}`,
      nickname: "VerifiedPlayer",
      nicknameNormalized: "verifiedplayer",
      tagLine: "KR1",
      tagLineNormalized: "kr1",
    });

    const started = await service.startRso({ context: ownerContext(actor, "rso-start"), returnTo: "/account/riot" });
    const stateId = String(started.body.stateId);
    const publicState = new URL(started.authorizationUrl).searchParams.get("state");
    assert.ok(publicState);
    await assert.rejects(
      service.completeRso({
        context: ownerContext(actor, "stale-final-transaction"),
        playerId,
        expectedRevision: 1,
        publicState,
        authorizationCode,
      }),
      /STALE_RIOT_REVISION/u,
    );
    assert.equal(externalCalls, 2);
    assert.equal((await database.select().from(riotAccountLinks).where(eq(riotAccountLinks.playerId, playerId))).length, 0);
    assert.equal((await database.select().from(riotRsoStates).where(eq(riotRsoStates.id, stateId)))[0]?.consumedAt, null);

    const completed = await service.completeRso({
      context: ownerContext(actor, "retry-final-transaction"),
      playerId,
      expectedRevision: 0,
      publicState,
      authorizationCode,
    });
    assert.equal(completed.body.status, "CONNECTED");
    assert.equal(externalCalls, 2, "the accepted one-time code must replay from the encrypted durable cache");
    const cached = (await database.select().from(riotRsoExchangeResults).where(eq(riotRsoExchangeResults.stateId, stateId)))[0];
    assert.ok(cached);
    assert.equal(cached.keyId, "contract-v1");
    const durableCache = JSON.stringify(cached);
    for (const secret of [authorizationCode, accessToken, "private-rso-puuid"]) {
      assert.equal(durableCache.includes(secret), false);
    }
    await assert.rejects(
      rso.exchangeOnce({ exchangeId: stateId, authorizationCode: "different-authorization-code" }),
      /RIOT_RSO_EXCHANGE_ID_REUSED/u,
    );

    const linkId = String(completed.body.linkId);
    await service.requestSync({
      context: ownerContext(actor, "request-sync"),
      mode: "SINGLE",
      linkIds: [linkId],
      cooldownMilliseconds: 1_000,
    });
    const timestampSeconds = Math.floor(Date.now() / 1_000);
    const unsigned = {
      method: "POST" as const,
      path: "/api/internal/jobs/riot-sync",
      timestampSeconds,
      nonce: `riot_sync_${randomUUID().replaceAll("-", "")}`,
      bodyDigestHex,
    };
    const jobIntent = {
      kind: "SIGNED_JOB" as const,
      jobName: "riot-sync" as const,
      nonce: unsigned.nonce,
      timestampSeconds,
      bodyDigestHex,
      signatureHex: signJobRequest(unsigned, jobSecret),
      transactionRecheck: true as const,
    };
    const processed = await service.runNextSync({ principalId: "job:riot-sync", authorizationIntent: jobIntent });
    assert.equal(processed.status, "PROCESSED");
    const summaryRows = await database.select().from(riotSummaries).where(eq(riotSummaries.playerId, playerId));
    assert.equal(summaryRows.length, 1);
    assert.deepEqual(summaryRows[0]?.recentSoloJson, recentSolo);
    assert.ok(summaryRows[0]?.recentSoloSyncedAt);
    assert.equal(JSON.stringify(summaryRows).includes("private-rso-puuid"), false);
    assert.equal((await database.select().from(jobNonceBindings).where(eq(jobNonceBindings.jobName, "riot-sync"))).length, 1);
    const accounts = await adapter.listAdmin({ tab: "accounts", action: "NONE", status: "ALL", source: "ALL", q: "", batchSize: 10, page: 1, pageSize: 25 });
    assert.equal(accounts.tab, "accounts");
    assert.equal(accounts.items.find((row) => row.playerId === playerId)?.riotId, "VerifiedPlayer#KR1");
    assert.equal(accounts.syncItems.length, 0);
    assert.equal(accounts.logItems.length, 0);
    const sync = await adapter.listAdmin({ tab: "sync", action: "NONE", status: "ALL", source: "ALL", q: "", batchSize: 10, page: 1, pageSize: 25 });
    assert.equal(sync.tab, "sync");
    assert.equal(sync.items.length, 0);
    assert.ok(sync.syncItems.some((row) => row.riotId === "VerifiedPlayer#KR1"));
    assert.equal(sync.logItems.length, 0);
    const logs = await adapter.listAdmin({ tab: "logs", action: "NONE", status: "ALL", source: "ALL", q: "", batchSize: 10, page: 1, pageSize: 25 });
    assert.equal(logs.tab, "logs");
    assert.equal(logs.items.length, 0);
    assert.equal(logs.syncItems.length, 0);
    assert.deepEqual(new Set(logs.logItems.map((row) => row.source)), new Set(["API", "SYNC", "AUDIT"]));
    const unlinkedOwnerId = randomUUID();
    const unlinkedPlayerId = randomUUID();
    await database.insert(userAccounts).values({ id: unlinkedOwnerId, loginId: `bulk-${unlinkedOwnerId}`, loginIdNormalized: `bulk-${unlinkedOwnerId}`, status: "APPROVED" });
    await database.insert(players).values({
      id: unlinkedPlayerId,
      userAccountId: unlinkedOwnerId,
      memberName: "Bulk candidate",
      memberNameNormalized: `bulk candidate ${unlinkedOwnerId}`,
      nickname: `Bulk${unlinkedOwnerId.slice(0, 8)}`,
      nicknameNormalized: `bulk${unlinkedOwnerId.slice(0, 8)}`,
      tagLine: "KR2",
      tagLineNormalized: "kr2",
    });
    const bulkPreview = await adapter.listAdmin({ tab: "accounts", action: "bulk-link", status: "UNLINKED", source: "ALL", q: "Bulk", batchSize: 10, page: 1, pageSize: 10 });
    assert.deepEqual(bulkPreview.items.map((row) => row.playerId), [unlinkedPlayerId]);
    assert.equal(bulkPreview.total, 1);
    await assert.rejects(
      service.runNextSync({ principalId: "job:riot-sync", authorizationIntent: jobIntent }),
      (error: unknown) => error instanceof RiotApplicationError && error.code === "NOT_FOUND",
    );
    const projection = { playerId, gameName: "VerifiedPlayer", tagLine: "KR1", soloTier: "DIAMOND", soloRank: "IV", leaguePoints: 10, wins: 22, losses: 13, syncedAt: new Date() };
    await adapter.dependencies.unitOfWork.transaction((transaction) => adapter.dependencies.repository.saveProjection(transaction, projection));
    const retained = (await database.select().from(riotSummaries).where(eq(riotSummaries.playerId, playerId)))[0]!;
    assert.deepEqual(retained.recentSoloJson, recentSolo, "optional upstream failure preserves the same identity's summary");
    assert.equal(retained.recentSoloSyncedAt?.getTime(), summaryRows[0]!.recentSoloSyncedAt!.getTime(), "failed optional refresh must never freshen old history");
    await database.update(riotAccountLinks).set({ gameName: "ChangedPlayer" }).where(eq(riotAccountLinks.id, linkId));
    await adapter.dependencies.unitOfWork.transaction((transaction) => adapter.dependencies.repository.saveProjection(transaction, { ...projection, gameName: "ChangedPlayer" }));
    const cleared = (await database.select().from(riotSummaries).where(eq(riotSummaries.playerId, playerId)))[0]!;
    assert.equal(cleared.recentSoloJson, null, "a new identity must never inherit the previous identity's recent matches");
    assert.equal(cleared.recentSoloSyncedAt, null);
  } finally {
    await pool.end();
  }
});

test("scheduled Riot repository excludes ineligible identities and duplicate/recent work", { timeout: 30_000 }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const ownerId = randomUUID();
  const playerId = randomUUID();
  const linkId = `00000000-0000-4000-8000-${randomUUID().slice(-12)}`;
  const now = new Date("2050-01-01T00:00:00Z");
  const before = new Date(now.getTime() - 6 * 60 * 60_000);
  const name = `Auto${ownerId.slice(0, 8)}`;
  const adapter = new PostgresRiotAdapter(database, { featureEnabled: true });
  const next = () => adapter.dependencies.unitOfWork.transaction((tx) => adapter.dependencies.repository.loadNextScheduledSyncLinkForUpdate(tx, now, before));
  const eligible = () => adapter.dependencies.unitOfWork.transaction((tx) => adapter.dependencies.repository.loadLinkForUpdate(tx, linkId));
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: ownerId, loginId: `auto-${ownerId}`, loginIdNormalized: `auto-${ownerId}`, status: "APPROVED" });
    await database.insert(players).values({ id: playerId, userAccountId: ownerId, memberName: name, memberNameNormalized: name.toLowerCase(), nickname: name, nicknameNormalized: name.toLowerCase(), tagLine: "KR1", tagLineNormalized: "kr1" });
    await database.insert(riotAccountLinks).values({ id: linkId, playerId, ownerUserAccountId: ownerId, gameName: name, tagLine: "KR1", normalizedKey: `${name.toLowerCase()}#kr1`, protectedPuuid: "opaque-test-only", method: "DIRECT_OWNER", status: "CONNECTED", linkedAt: new Date("2026-01-01T00:00:00Z") });
    assert.equal((await next())?.id, linkId);
    await database.update(players).set({ status: "INACTIVE", deactivatedAt: now }).where(eq(players.id, playerId));
    assert.equal(await eligible(), null);
    assert.notEqual((await next())?.id, linkId);
    await database.update(players).set({ status: "ACTIVE", deactivatedAt: null }).where(eq(players.id, playerId));
    await database.update(userAccounts).set({ status: "PENDING" }).where(eq(userAccounts.id, ownerId));
    assert.equal(await eligible(), null);
    assert.notEqual((await next())?.id, linkId);
    await database.update(userAccounts).set({ status: "APPROVED" }).where(eq(userAccounts.id, ownerId));
    await database.update(riotAccountLinks).set({ normalizedKey: "different#kr1" }).where(eq(riotAccountLinks.id, linkId));
    assert.equal(await eligible(), null);
    assert.notEqual((await next())?.id, linkId);
    await database.update(riotAccountLinks).set({ normalizedKey: `${name.toLowerCase()}#kr1` }).where(eq(riotAccountLinks.id, linkId));
    const jobId = randomUUID();
    await database.insert(riotSyncJobs).values({ id: jobId, linkId, requestedBy: "JOB", requestedAt: new Date(now.getTime() - 1000), availableAt: now, status: "SUCCEEDED", completedAt: now });
    assert.notEqual((await next())?.id, linkId);
    await database.update(riotSyncJobs).set({ requestedAt: before, status: "QUEUED", completedAt: null }).where(eq(riotSyncJobs.id, jobId));
    assert.notEqual((await next())?.id, linkId);
    await database.update(riotSyncJobs).set({ status: "SUCCEEDED", completedAt: now }).where(eq(riotSyncJobs.id, jobId));
    assert.ok(await eligible());
    await database.update(riotSyncJobs).set({ status: "RETRY_WAIT", failureCode: "RATE_LIMITED", availableAt: new Date(now.getTime() + 1000), completedAt: null }).where(eq(riotSyncJobs.id, jobId));
    assert.equal(await next(), null, "global provider cooldown suppresses all newly scheduled work");
    assert.equal(await adapter.dependencies.unitOfWork.transaction((tx) => adapter.dependencies.repository.loadNextClaimableSyncJobForUpdate(tx, now)), null);
    await database.update(riotSyncJobs).set({ status: "FAILED", completedAt: now }).where(eq(riotSyncJobs.id, jobId));
    assert.equal(await next(), null, "terminal 429 still holds the provider cooldown");
    assert.equal(await adapter.dependencies.unitOfWork.transaction((tx) => adapter.dependencies.repository.loadNextClaimableSyncJobForUpdate(tx, now)), null);
    await database.update(riotSyncJobs).set({ status: "CANCELLED", completedAt: now }).where(eq(riotSyncJobs.id, jobId));
  } finally {
    await database.update(riotAccountLinks).set({ status: "DISCONNECTED", protectedPuuid: null, disconnectedAt: now }).where(eq(riotAccountLinks.id, linkId));
    await pool.end();
  }
});

test("Riot key probe persists only safe outcomes and rejects replay, rapid retry, invalid signature and disabled flag", { timeout: 30_000 }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const jobSecret = "riot-probe-database-contract-secret-0000";
  const configuration = { apiKey: "synthetic-private-api-key", jobSecret } as RiotProductionConfiguration;
  let requests = 0;
  const dependencies = { database, configuration, fetch: async () => { requests++; return new Response("upstream-private-content", { status: 200 }); } };
  const signed = () => {
    const unsigned = { method: "POST" as const, path: "/api/internal/jobs/riot-api-probe", timestampSeconds: Math.floor(Date.now() / 1000), nonce: `probe_${randomUUID().replaceAll("-", "")}`, bodyDigestHex };
    return { ok: true as const, body: {}, requestId: randomUUID(), ...unsigned, signatureHex: signJobRequest(unsigned, jobSecret) };
  };
  let previous: Record<string, boolean> | undefined;
  try {
    await applyMigrations(database);
    previous = (await database.select().from(siteSettings).where(eq(siteSettings.id, 1)))[0]?.featuresJson;
    await database.insert(siteSettings).values({ id: 1, brandName: "Test", tagline: "Test", featuresJson: { riotIntegration: true }, aiAllowedRolesJson: [] })
      .onConflictDoUpdate({ target: siteSettings.id, set: { featuresJson: sql`${siteSettings.featuresJson} || '{"riotIntegration": true}'::jsonb` } });
    const first = signed();
    assert.equal((await runPostgresRiotApiProbe({ ...first, signatureHex: "0".repeat(64) }, dependencies)).status, 401);
    assert.equal(requests, 0);
    const result = await runPostgresRiotApiProbe(first, dependencies);
    assert.equal(result.status, 200);
    assert.equal((await runPostgresRiotApiProbe(first, dependencies)).status, 409);
    assert.equal((await runPostgresRiotApiProbe(signed(), dependencies)).status, 429);
    assert.equal(requests, 1);
    const run = (await database.select().from(maintenanceRuns).where(eq(maintenanceRuns.requestId, first.requestId)))[0]!;
    assert.equal(run.status, "SUCCEEDED");
    assert.deepEqual(run.countsJson, { requests: 1, statusEndpointAccepted: 1, providerStatus: 200 });
    assert.equal(JSON.stringify(run).includes(configuration.apiKey), false);
    await database.update(siteSettings).set({ featuresJson: { riotIntegration: false } }).where(eq(siteSettings.id, 1));
    assert.equal((await runPostgresRiotApiProbe(signed(), dependencies)).status, 403);
    assert.equal(requests, 1);
  } finally {
    if (previous) await database.update(siteSettings).set({ featuresJson: previous }).where(eq(siteSettings.id, 1));
    else await database.delete(siteSettings).where(eq(siteSettings.id, 1));
    await pool.end();
  }
});
