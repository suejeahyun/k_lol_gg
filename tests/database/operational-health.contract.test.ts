import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { readOperationalHealth } from "../../src/modules/operations/infrastructure/postgres-operational-health";
import { siteNoticeConfig } from "../../src/modules/seasons/kakao-site-notices/domain";
import { createPgPool } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import * as schema from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("admin diagnostics aggregate only current notice scope and fixed operational evidence in a bounded read-only transaction", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const pool = createPgPool(connectionString, { max: 1 });
  const queries: string[] = [];
  let recording = false;
  const database = drizzle(pool, { schema, logger: { logQuery(query) { if (recording) queries.push(query); } } });
  const now = new Date("2099-09-22T12:00:00+09:00");
  const minuteAgo = new Date(now.getTime() - 60_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const ids = { season: randomUUID(), round: randomUUID(), account: randomUUID(), player: randomUUID(), link: randomUUID() };
  const suffix = randomUUID().slice(0, 8);
  const environment = { KAKAO_SITE_NOTICE_ENABLED: "true", KAKAO_V4_IDENTITY_SECRET: `synthetic-identity-${"i".repeat(40)}`,
    KAKAO_V4_WEBHOOK_SECRET_CURRENT: `synthetic-webhook-${"w".repeat(40)}`, KAKAO_SITE_NOTICE_TARGET_HASH: randomBytes(32).toString("hex") };
  const config = siteNoticeConfig(environment)!;
  const outboxIds = [randomUUID(), randomUUID(), randomUUID()];
  const runIds = [randomUUID(), randomUUID(), randomUUID()];
  const nonceIds = [randomUUID(), randomUUID()];
  try {
    await applyMigrations(database);
    const before = await readOperationalHealth(database, environment, now);
    await database.insert(schema.seasons).values({ id: ids.season, name: `diagnostic-${suffix}`, nameNormalized: `diagnostic-${suffix}` });
    await database.insert(schema.seasonInhouseRounds).values({ id: ids.round, seasonId: ids.season, applyDate: "2099-09-22", recruitNo: 1,
      sourceRoomIdHash: config.sourceRoomIdHash, sourceReferenceHash: randomBytes(32), mode: "RIFT" });
    await database.insert(schema.userAccounts).values({ id: ids.account, loginId: `diagnostic-${suffix}`, loginIdNormalized: `diagnostic-${suffix}` });
    await database.insert(schema.players).values({ id: ids.player, userAccountId: ids.account, memberName: `private-member-${suffix}`, memberNameNormalized: `private-member-${suffix}`,
      nickname: `private-nick-${suffix}`, nicknameNormalized: `private-nick-${suffix}`, tagLine: "QA", tagLineNormalized: "qa" });
    await database.insert(schema.riotAccountLinks).values({ id: ids.link, playerId: ids.player, ownerUserAccountId: ids.account,
      gameName: "PrivateQA", tagLine: "QA", normalizedKey: `privateqa-${suffix}`, protectedPuuid: "synthetic-private-identity", method: "DIRECT_OWNER", linkedAt: now });
    await database.insert(schema.riotSyncJobs).values([
      { id: randomUUID(), linkId: ids.link, requestedBy: "OWNER", status: "QUEUED", requestedAt: hourAgo, availableAt: hourAgo },
      { id: randomUUID(), linkId: ids.link, requestedBy: "OWNER", status: "FAILED", requestedAt: hourAgo, availableAt: hourAgo, completedAt: minuteAgo, failureCode: "SYNTHETIC_PRIVATE_FAILURE" },
      { id: randomUUID(), linkId: ids.link, requestedBy: "OWNER", status: "PARTIAL", requestedAt: hourAgo, availableAt: hourAgo, completedAt: minuteAgo, failureCode: "SYNTHETIC_PRIVATE_FAILURE" },
      { id: randomUUID(), linkId: ids.link, requestedBy: "OWNER", status: "FAILED", requestedAt: hourAgo, availableAt: hourAgo, completedAt: new Date(now.getTime() - 2 * 86_400_000), failureCode: "SYNTHETIC_OLD_FAILURE" },
    ]);
    await database.insert(schema.matchRecalculationOutbox).values(outboxIds.map((id, index) => ({
      id, aggregateId: randomUUID(), aggregateType: "MATCH_SERIES", eventType: "MATCH_CHANGED", action: "CREATED", dedupeKey: `diagnostic:${id}`, matchRevision: 0,
      inputDigest: randomBytes(32), payloadJson: { privatePayload: "must-not-leak" }, status: (["PENDING", "FAILED", "DELIVERED"] as const)[index],
      availableAt: hourAgo, createdAt: hourAgo, lastErrorCode: index === 1 ? "PRIVATE_FAILURE" : null, deliveredAt: index === 2 ? minuteAgo : null,
    })));
    await database.insert(schema.maintenanceRuns).values(runIds.map((id, index) => ({
      id, jobName: ["kakao-daily-close", "storage-probe", "riot-api-probe"][index]!, requestId: randomUUID(), status: "SUCCEEDED" as const,
      countsJson: { realStorage: index, unapprovedMetric: 99 }, startedAt: hourAgo, completedAt: minuteAgo,
    })));
    await database.insert(schema.kakaoSiteNotices).values([
      ...["PENDING", "FAILED", "DELIVERED", "PENDING"].map((status, index) => ({ id: randomUUID(), eventKey: `diagnostic:${suffix}:${index}`,
        roundId: ids.round, sourceRoomIdHash: config.sourceRoomIdHash, targetHash: config.targetHash, status,
        availableAt: hourAgo, createdAt: hourAgo, expiresAt: index === 3 ? minuteAgo : new Date(now.getTime() + 3_600_000), deliveredAt: status === "DELIVERED" ? minuteAgo : null })),
      { id: randomUUID(), eventKey: `diagnostic:${suffix}:other-target`, roundId: ids.round, sourceRoomIdHash: config.sourceRoomIdHash,
        targetHash: randomBytes(32), status: "FAILED", availableAt: hourAgo, createdAt: hourAgo, expiresAt: new Date(now.getTime() + 3_600_000) },
      { id: randomUUID(), eventKey: `diagnostic:${suffix}:other-room`, roundId: ids.round, sourceRoomIdHash: randomBytes(32),
        targetHash: config.targetHash, status: "FAILED", availableAt: hourAgo, createdAt: hourAgo, expiresAt: new Date(now.getTime() + 3_600_000) },
    ]);
    await database.insert(schema.recruitingNonceBindings).values(nonceIds.map((id, index) => ({ id, actorKind: "BOT", actorPrincipalId: index ? `site-notice:other-${suffix}` : `site-notice:${config.installationId}`,
      nonceHash: randomBytes(32), bindingHash: randomBytes(32), keyId: "synthetic-private-key", createdAt: index ? now : minuteAgo, expiresAt: new Date(now.getTime() + 600_000) })));
    recording = true;
    const actual = await readOperationalHealth(database, environment, now);
    recording = false;
    assert.equal(actual.statistics.pending, before.statistics.pending + 1);
    assert.equal(actual.statistics.failed, before.statistics.failed + 1);
    assert.equal(actual.statistics.lastConsumedAt, minuteAgo.toISOString());
    assert.equal(actual.riot.pending, before.riot.pending + 1);
    assert.equal(actual.riot.failed, before.riot.failed + 2, "only the recent FAILED/PARTIAL runs count");
    assert.equal(actual.riot.lastCompletedAt, minuteAgo.toISOString());
    assert.equal(actual.dailyClose?.status, "SUCCEEDED");
    assert.equal(actual.storage?.realStorage, true);
    assert.equal(actual.riot.apiProbe?.status, "SUCCEEDED");
    assert.deepEqual(actual.siteNotices, { enabled: true, configured: true, pending: 1, failed: 1, expiredPending: 1,
      oldestPendingAt: hourAgo.toISOString(), lastAuthenticatedAt: minuteAgo.toISOString(), lastAcknowledgedAt: minuteAgo.toISOString() });
    assert.match(queries.join("\n"), /read only/iu);
    assert.ok(queries.length <= 12, "one fixed transaction, no record-by-record lookups");
    assert.doesNotMatch(queries.join("\n"), /\b(insert|update|delete)\b/iu);
    const serialized = JSON.stringify(actual);
    for (const privateValue of [...Object.values(ids), config.targetHash.toString("hex"), config.installationId, "must-not-leak", "synthetic-private", "unapprovedMetric", "PRIVATE_FAILURE", suffix]) {
      assert.ok(!serialized.includes(privateValue), "private identifiers or free-form fields must not cross the UI boundary");
    }
    assert.deepEqual(Object.keys(actual).sort(), ["checkedAt", "dailyClose", "riot", "siteNotices", "statistics", "storage"]);
    assert.deepEqual(Object.keys(actual.storage!).sort(), ["completedAt", "realStorage", "startedAt", "status"]);
    const disabled = await readOperationalHealth(database, { ...environment, KAKAO_SITE_NOTICE_ENABLED: "false" }, now);
    assert.equal(disabled.siteNotices.enabled, false);
    assert.equal(disabled.siteNotices.pending, 0);
    assert.equal(disabled.siteNotices.lastAuthenticatedAt, null);
  } finally {
    recording = false;
    await database.delete(schema.recruitingNonceBindings).where(inArray(schema.recruitingNonceBindings.id, nonceIds));
    await database.delete(schema.kakaoSiteNotices).where(eq(schema.kakaoSiteNotices.roundId, ids.round));
    await database.delete(schema.maintenanceRuns).where(inArray(schema.maintenanceRuns.id, runIds));
    await database.delete(schema.matchRecalculationOutbox).where(inArray(schema.matchRecalculationOutbox.id, outboxIds));
    await database.delete(schema.riotSyncJobs).where(eq(schema.riotSyncJobs.linkId, ids.link));
    await database.delete(schema.riotAccountLinks).where(eq(schema.riotAccountLinks.id, ids.link));
    await database.delete(schema.players).where(eq(schema.players.id, ids.player));
    await database.delete(schema.userAccounts).where(eq(schema.userAccounts.id, ids.account));
    await database.delete(schema.seasonInhouseRounds).where(eq(schema.seasonInhouseRounds.id, ids.round));
    await database.delete(schema.seasons).where(eq(schema.seasons.id, ids.season));
    await pool.end();
  }
});
