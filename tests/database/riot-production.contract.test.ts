import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { eq } from "drizzle-orm";

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
  const service = new RiotApplicationService({ ...adapter.dependencies, gateway, rso, identityProtector: protector });

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
      nickname: `Prod${ownerId.slice(0, 8)}`,
      nicknameNormalized: `prod${ownerId.slice(0, 8)}`,
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
    assert.equal((await database.select().from(riotSummaries).where(eq(riotSummaries.playerId, playerId))).length, 1);
    assert.equal((await database.select().from(jobNonceBindings).where(eq(jobNonceBindings.jobName, "riot-sync"))).length, 1);
    const accounts = await adapter.listAdmin({ tab: "accounts", action: "NONE", status: "ALL", source: "ALL", q: "", batchSize: 10, page: 1, pageSize: 25 });
    assert.equal(accounts.tab, "accounts");
    assert.ok(accounts.items.some((row) => row.playerId === playerId));
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
  } finally {
    await pool.end();
  }
});
