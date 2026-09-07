import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import type { AiCompletionPort, OperationsActor, OperationsCommandMetadata } from "../../src/modules/operations";
import { OperationsError, PostgresOperationsRepository } from "../../src/modules/operations/infrastructure/postgres-operations-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  loginRateLimitBuckets,
  operationsCommandReceipts,
  operationsOutbox,
  siteSettings,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function metadata(key: string, body: unknown, expectedRevision: number): OperationsCommandMetadata {
  return {
    requestId: randomUUID(),
    requestKey: key,
    expectedRevision,
    requestHashHex: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}

test("bounded maintenance deletes only expired rows and records an atomic replayable result", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const fakeAi: AiCompletionPort = {
    key: "cleanup-readiness",
    complete: async () => ({ text: "unused", inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 }),
  };
  try {
    await applyMigrations(database);
    const accountId = randomUUID();
    const sessionId = randomUUID();
    const now = new Date();
    await database.insert(userAccounts).values({
      id: accountId,
      loginId: `cleanup-${accountId}`,
      loginIdNormalized: `cleanup-${accountId}`,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    });
    await database.insert(authSessions).values({
      id: sessionId,
      tokenHash: randomBytes(32),
      userAccountId: accountId,
      authVersion: 0,
      role: "SUPER_ADMIN",
      purpose: "ADMIN",
      totpVerifiedAt: now,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
    });
    const actor: OperationsActor = {
      session: { userAccountId: accountId, sessionId, role: "SUPER_ADMIN", authVersion: 0 },
      role: "SUPER_ADMIN",
      accountStatus: "APPROVED",
    };
    const repository = new PostgresOperationsRepository(database, fakeAi);
    const currentSettings = await repository.getSiteSettings();
    const expectedSettingsRevision = currentSettings.revision + 1;
    await database
      .update(siteSettings)
      .set({ revision: expectedSettingsRevision })
      .where(eq(siteSettings.id, 1));

    const expiredAuditRequest = randomUUID();
    const retainedAuditRequest = randomUUID();
    await database.insert(auditEvents).values([
      {
        requestId: expiredAuditRequest,
        actorUserAccountId: accountId,
        action: "SYNTHETIC_EXPIRED",
        targetType: "RECOVERY_TEST",
        targetId: accountId,
        createdAt: new Date(now.getTime() - 91 * 86_400_000),
      },
      {
        requestId: retainedAuditRequest,
        actorUserAccountId: accountId,
        action: "SYNTHETIC_RETAINED",
        targetType: "RECOVERY_TEST",
        targetId: accountId,
        createdAt: now,
      },
    ]);
    const auditBody = { retentionDays: 90 };
    const auditMetadata = metadata(`recovery-audit-${randomUUID()}`, auditBody, expectedSettingsRevision);
    const auditCleanup = await repository.runAdminCleanup({
      actor,
      metadata: auditMetadata,
      kind: "audit",
      retentionDays: 90,
    });
    assert.equal(auditCleanup.body.deleted, 1);
    assert.equal((await repository.runAdminCleanup({ actor, metadata: auditMetadata, kind: "audit", retentionDays: 90 })).replayed, true);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.requestId, expiredAuditRequest))).length, 0);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.requestId, retainedAuditRequest))).length, 1);

    const expiredKey = randomBytes(32);
    const retainedKey = randomBytes(32);
    await database.insert(loginRateLimitBuckets).values([
      {
        scope: "IP_HASH",
        keyHash: expiredKey,
        windowStartedAt: new Date(now.getTime() - 120_000),
        expiresAt: new Date(now.getTime() - 60_000),
      },
      {
        scope: "IP_HASH",
        keyHash: retainedKey,
        windowStartedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ]);
    const rateMetadata = metadata(`recovery-rate-${randomUUID()}`, { retentionDays: 30 }, expectedSettingsRevision);
    const rateCleanup = await repository.runAdminCleanup({
      actor,
      metadata: rateMetadata,
      kind: "rate-limits",
      retentionDays: 30,
    });
    assert.equal(rateCleanup.body.deleted, 1);
    assert.equal((await database.select().from(loginRateLimitBuckets).where(and(eq(loginRateLimitBuckets.scope, "IP_HASH"), eq(loginRateLimitBuckets.keyHash, expiredKey)))).length, 0);
    assert.equal((await database.select().from(loginRateLimitBuckets).where(and(eq(loginRateLimitBuckets.scope, "IP_HASH"), eq(loginRateLimitBuckets.keyHash, retainedKey)))).length, 1);

    assert.equal((await database.select().from(operationsCommandReceipts).where(eq(operationsCommandReceipts.actorUserAccountId, accountId))).length, 2);
    assert.equal((await database.select().from(operationsOutbox).where(eq(operationsOutbox.aggregateType, "MAINTENANCE_RUN"))).length >= 2, true);

    const nonSuper: OperationsActor = { ...actor, role: "ADMIN", session: { ...actor.session, role: "ADMIN" } };
    await assert.rejects(
      repository.runAdminCleanup({ actor: nonSuper, metadata: metadata(`denied-${randomUUID()}`, auditBody, expectedSettingsRevision), kind: "audit", retentionDays: 90 }),
      (error: unknown) => error instanceof OperationsError && error.code === "SESSION_STALE",
    );
  } finally {
    await pool.end();
  }
});
