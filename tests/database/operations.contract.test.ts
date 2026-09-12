import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import type { AiCompletionPort, OperationsActor, OperationsCommandMetadata } from "../../src/modules/operations";
import { toPublicSiteSettingsDto } from "../../src/modules/operations";
import { OperationsError, PostgresOperationsRepository } from "../../src/modules/operations/infrastructure/postgres-operations-repository";
import { recruitingOperatingDateKey } from "../../src/modules/recruiting/domain/operating-day";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { aiRequestLedger, auditEvents, authSessions, jobNonceBindings, maintenanceRuns, operationsCommandReceipts, operationsOutbox, recruitParties, recruitingOutbox, scrimRecruits, siteSettings, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function metadata(requestKey: string, expectedRevision: number, body: unknown): OperationsCommandMetadata {
  return { requestId: randomUUID(), requestKey, expectedRevision, requestHashHex: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
}

test("S13 settings, AI ledger and signed maintenance preserve authorization and idempotency contracts", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const accountId = randomUUID();
  const adminSessionId = randomUUID();
  const accountSessionId = randomUUID();
  const now = new Date();
  const fakeAi: AiCompletionPort = {
    key: "fake-contract",
    complete: async ({ prompt, maximumCostMicros }) => {
      assert.equal(prompt, "운영 요약");
      assert.ok(maximumCostMicros >= 25);
      return { text: "안전한 요약", inputTokens: 4, outputTokens: 5, estimatedCostMicros: 25 };
    },
  };
  try {
    await applyMigrations(database);
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: accountId, loginId: "s13-super", loginIdNormalized: "s13-super", role: "SUPER_ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: accountId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) },
      { id: accountSessionId, tokenHash: randomBytes(32), userAccountId: accountId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ACCOUNT", issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) },
    ]);
    const admin: OperationsActor = { session: { userAccountId: accountId, sessionId: adminSessionId, role: "SUPER_ADMIN", authVersion: 0 }, role: "SUPER_ADMIN", accountStatus: "APPROVED" };
    const account: OperationsActor = { session: { userAccountId: accountId, sessionId: accountSessionId, role: "SUPER_ADMIN", authVersion: 0 }, role: "SUPER_ADMIN", accountStatus: "APPROVED" };
    const repository = new PostgresOperationsRepository(database, fakeAi);

    const patch = { brandName: "K-LOL 운영", features: { aiAssistant: true }, aiRequestsPerHour: 3, aiDailyCostLimitMicros: 1_000 };
    const command = metadata("s13-settings-contract-0001", 0, patch);
    const updated = await repository.updateSettings({ actor: admin, metadata: command, patch });
    assert.equal(updated.replayed, false);
    assert.equal(updated.revision, 1);
    assert.equal((await repository.updateSettings({ actor: admin, metadata: command, patch })).replayed, true);
    const publicSettings = toPublicSiteSettingsDto(await repository.getSiteSettings());
    assert.deepEqual(Object.keys(publicSettings).sort(), ["brandName", "features", "supportUrl", "tagline"]);
    assert.equal("aiAllowedRoles" in publicSettings, false);

    const changed = metadata("s13-settings-contract-0001", 0, { ...patch, brandName: "다른 본문" });
    await assert.rejects(repository.updateSettings({ actor: admin, metadata: changed, patch: { ...patch, brandName: "다른 본문" } }), (error: unknown) => error instanceof OperationsError && error.code === "IDEMPOTENCY_MISMATCH");

    const aiMetadata = metadata("s13-ai-contract-0001", 1, { prompt: "운영 요약" });
    const ai = await repository.requestAi({ actor: account, metadata: aiMetadata, prompt: "운영 요약" });
    assert.equal(ai.status, 200);
    assert.equal(ai.body.answer, "안전한 요약");
    assert.equal((await repository.requestAi({ actor: account, metadata: aiMetadata, prompt: "운영 요약" })).replayed, true);
    const ledger = await database.select().from(aiRequestLedger);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.promptHash.length, 32);
    assert.equal(JSON.stringify(ledger[0]).includes("운영 요약"), false);

    const jobInput = { jobName: "maintenance" as const, nonce: "nonce_1234567890abcdef", requestHashHex: "ab".repeat(32), requestId: randomUUID() };
    await repository.runSignedMaintenance(jobInput);
    await assert.rejects(repository.runSignedMaintenance({ ...jobInput, requestId: randomUUID() }), (error: unknown) => error instanceof OperationsError && error.code === "JOB_NONCE_REPLAYED");

    const idlePartyId = randomUUID();
    await database.insert(recruitParties).values({
      id: idlePartyId,
      ownerUserAccountId: accountId,
      recruitDate: "2026-09-06",
      resetSequence: 0,
      recruitNumber: 1,
      type: "NORMAL_GAME",
      status: "IN_PROGRESS",
      title: "일일 마감 계약 테스트",
      maximumMembers: 5,
      membersJson: [],
      lastActivityAt: new Date(Date.now() - 24 * 60 * 60_000),
    });
    const currentOperatingDate = recruitingOperatingDateKey(new Date());
    const previousOperatingDate = new Date(Date.parse(`${currentOperatingDate}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
    const staleDraftId = randomUUID();
    const currentDraftId = randomUUID();
    await database.insert(recruitParties).values([
      {
        id: staleDraftId,
        ownerUserAccountId: accountId,
        recruitDate: previousOperatingDate,
        resetSequence: 0,
        recruitNumber: 95,
        type: "PARTY_NUMBER",
        status: "DRAFT",
        title: "이전 운영일 초안",
        maximumMembers: 5,
        membersJson: [],
        lastActivityAt: new Date(),
      },
      {
        id: currentDraftId,
        ownerUserAccountId: accountId,
        recruitDate: currentOperatingDate,
        resetSequence: 0,
        recruitNumber: 96,
        type: "PARTY_NUMBER",
        status: "DRAFT",
        title: "현재 운영일 초안",
        maximumMembers: 5,
        membersJson: [],
        lastActivityAt: new Date(),
      },
    ]);
    const staleScrimIds = [randomUUID(), randomUUID(), randomUUID()];
    const currentScrimId = randomUUID();
    await database.insert(scrimRecruits).values([
      {
        id: staleScrimIds[0]!, recruitDate: previousOperatingDate, scrimNumber: 91,
        legacyTournamentNumber: 1, requesterTeamName: "이전 모집팀", status: "RECRUITING",
      },
      {
        id: staleScrimIds[1]!, recruitDate: previousOperatingDate, scrimNumber: 92,
        legacyTournamentNumber: 1, requesterTeamName: "이전 매칭팀", opponentTeamName: "상대팀", status: "MATCHED",
      },
      {
        id: staleScrimIds[2]!, recruitDate: previousOperatingDate, scrimNumber: 93,
        legacyTournamentNumber: 1, requesterTeamName: "이전 확정팀", opponentTeamName: "확정 상대팀", status: "CONFIRMED",
      },
      {
        id: currentScrimId, recruitDate: currentOperatingDate, scrimNumber: 94,
        legacyTournamentNumber: 1, requesterTeamName: "현재 운영일 팀", status: "RECRUITING",
      },
    ]);
    const closeCutoff = new Date(Date.now() - 12 * 60 * 60_000);
    const eligiblePartiesBeforeClose = await database
      .select({ id: recruitParties.id })
      .from(recruitParties)
      .where(and(
        eq(recruitParties.status, "IN_PROGRESS"),
        lte(recruitParties.lastActivityAt, closeCutoff),
        or(isNull(recruitParties.protectedUntil), lte(recruitParties.protectedUntil, new Date())),
      ));
    const eligibleDraftsBeforeClose = await database
      .select({ id: recruitParties.id })
      .from(recruitParties)
      .where(and(
        eq(recruitParties.status, "DRAFT"),
        lt(recruitParties.recruitDate, currentOperatingDate),
      ));
    const eligibleScrimsBeforeClose = await database
      .select({ id: scrimRecruits.id })
      .from(scrimRecruits)
      .where(and(
        inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
        lt(scrimRecruits.recruitDate, currentOperatingDate),
      ));
    const closeInput = { jobName: "kakao-daily-close" as const, nonce: "daily_close_1234567890", requestHashHex: "cd".repeat(32), requestId: randomUUID(), idleHours: 12, maximumClosures: 100 };
    const close = await repository.runSignedKakaoDailyClose(closeInput);
    assert.equal(close.counts.partiesClosed, eligiblePartiesBeforeClose.length);
    assert.equal(close.counts.partyDraftsReset, eligibleDraftsBeforeClose.length);
    assert.equal(close.counts.scrimsClosed, eligibleScrimsBeforeClose.length);
    const closedParty = (await database.select().from(recruitParties).where(eq(recruitParties.id, idlePartyId)))[0];
    assert.equal(closedParty?.status, "FINISHED");
    assert.equal(closedParty?.revision, 1);
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, staleDraftId)))[0]?.status, "RESET");
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, currentDraftId)))[0]?.status, "DRAFT");
    for (const scrimId of staleScrimIds) {
      const scrim = (await database.select().from(scrimRecruits).where(eq(scrimRecruits.id, scrimId)))[0];
      assert.equal(scrim?.status, "COMPLETED");
      assert.equal(scrim?.revision, 1);
    }
    assert.equal((await database.select().from(scrimRecruits).where(eq(scrimRecruits.id, currentScrimId)))[0]?.status, "RECRUITING");
    assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateId, idlePartyId))).length, 1);
    assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateId, staleDraftId))).length, 1);
    for (const scrimId of staleScrimIds) {
      assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateId, scrimId))).length, 1);
    }
    const replay = await repository.runSignedKakaoDailyClose(closeInput);
    assert.deepEqual(replay, close);
    assert.equal((await database.select().from(maintenanceRuns).where(eq(maintenanceRuns.requestId, closeInput.requestId))).length, 1);
    await assert.rejects(repository.runSignedKakaoDailyClose({ ...closeInput, requestId: randomUUID() }), (error: unknown) => error instanceof OperationsError && error.code === "JOB_NONCE_REPLAYED");
    await assert.rejects(repository.runSignedKakaoDailyClose({ ...closeInput, requestHashHex: "ef".repeat(32) }), (error: unknown) => error instanceof OperationsError && error.code === "JOB_NONCE_REPLAYED");

    const concurrentInput = {
      ...closeInput,
      nonce: "daily_close_concurrent_1234567890",
      requestHashHex: "de".repeat(32),
      requestId: randomUUID(),
    };
    const [concurrentFirst, concurrentReplay] = await Promise.all([
      repository.runSignedKakaoDailyClose(concurrentInput),
      repository.runSignedKakaoDailyClose(concurrentInput),
    ]);
    assert.deepEqual(concurrentReplay, concurrentFirst);
    assert.equal((await database.select().from(maintenanceRuns).where(eq(maintenanceRuns.requestId, concurrentInput.requestId))).length, 1);
    const dailyNonceRows = await database.select().from(jobNonceBindings).where(eq(jobNonceBindings.jobName, "kakao-daily-close"));
    assert.ok(dailyNonceRows.length >= 2);
    assert.equal(dailyNonceRows.every((row) => row.expiresAt.getTime() - row.createdAt.getTime() >= 47 * 60 * 60 * 1_000), true);

    assert.equal((await database.select().from(siteSettings).where(eq(siteSettings.id, 1)))[0]?.revision, 1);
    assert.ok((await database.select().from(operationsCommandReceipts)).length >= 2);
    assert.ok((await database.select().from(auditEvents)).length >= 3);
    assert.ok((await database.select().from(operationsOutbox)).length >= 3);

    const [logs, stats, aiRequests] = await Promise.all([
      repository.listAuditLogs({ page: 1, pageSize: 50 }),
      repository.getAuditStats(),
      repository.listAiRequests({ page: 1, pageSize: 50 }),
    ]);
    assert.ok(logs.items.length >= 3);
    assert.ok(stats.totalEvents >= 3);
    assert.ok(stats.latestEventAt);
    assert.equal(new Date(stats.latestEventAt).toISOString(), stats.latestEventAt);
    assert.equal(aiRequests.items.length, 1);
  } finally {
    await pool.end();
  }
});
