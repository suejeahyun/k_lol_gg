import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";
import { authSessions, players, seasonApplications, seasonInhouseRounds, seasonKakaoPendingApplications, seasons, userAccounts } from "../../src/platform/db/schema";
import { kakaoSiteNotices } from "../../src/platform/db/schema/kakao-site-notices";
import { SeasonService } from "../../src/modules/seasons/application/season-service";
import { PostgresSeasonRepository } from "../../src/modules/seasons/infrastructure/postgres-season-repository";
import { recruitingOperatingDateKey } from "../../src/modules/recruiting/domain/operating-day";
import { siteNoticeConfig, type SiteNoticeRequest } from "../../src/modules/seasons/kakao-site-notices/domain";
import { enqueueSiteInhouseNotice, PostgresSiteNoticeRepository, pruneSiteNotices, SiteNoticeLeaseError, SiteNoticeReplayError } from "../../src/modules/seasons/kakao-site-notices/repository";

test("site capacity transition queue is atomic, scoped, replay-safe and offline tolerant", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "The isolated DB harness must inject TEST_DATABASE_URL");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 5 });
  const keys = ["KAKAO_SITE_NOTICE_ENABLED", "KAKAO_SITE_NOTICE_TARGET_HASH", "KAKAO_V4_IDENTITY_SECRET"];
  const saved = keys.map((key) => process.env[key]);
  process.env.KAKAO_SITE_NOTICE_ENABLED = "true";
  process.env.KAKAO_SITE_NOTICE_TARGET_HASH = "b".repeat(64);
  process.env.KAKAO_V4_IDENTITY_SECRET = "synthetic-notice-contract-identity-key";
  const config = siteNoticeConfig()!;
  // Keep enough time before expiry regardless of the wall-clock KST rollover.
  const now = new Date(`${recruitingOperatingDateKey(new Date())}T10:00:00Z`);
  const applyDate = recruitingOperatingDateKey(now);
  const seasonId = randomUUID(), roundId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), playerId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const service = new SeasonService(new PostgresSeasonRepository(database));
  const queue = new PostgresSiteNoticeRepository(database);
  const context = (key: string) => ({ actorSession: { userAccountId: userId, sessionId, role: "USER" as const, authVersion: 0 }, requestId: randomUUID(), idempotencyMaterial: Buffer.from(`notice-${suffix}:${key}`) });
  const request = (action: SiteNoticeRequest["action"], extra: Partial<SiteNoticeRequest> = {}): SiteNoticeRequest => ({ action, installationId: config.installationId,
    targetHash: config.targetHash.toString("hex"), timestamp: Math.floor(now.getTime() / 1000), nonce: randomBytes(16).toString("hex"), ...extra });
  const run = (body: SiteNoticeRequest, at = now, scope = config) => queue.execute(body, scope, "synthetic", createHash("sha256").update(JSON.stringify(body)).digest(), at);
  const currentRows = () => database.select().from(kakaoSiteNotices).where(eq(kakaoSiteNotices.roundId, roundId));
  const body = { recruitNo: 1, mainPosition: "TOP", subPositions: [] };
  try {
    await database.insert(seasons).values({ id: seasonId, name: `Notice ${suffix}`, nameNormalized: `notice ${suffix}`, status: "ACTIVE", activatedAt: now });
    await database.insert(userAccounts).values({ id: userId, loginId: `notice-${suffix}`, loginIdNormalized: `notice-${suffix}`, passwordHash: "synthetic-notice-password", status: "APPROVED" });
    const sessionNow = new Date();
    await database.insert(authSessions).values({ id: sessionId, userAccountId: userId, tokenHash: randomBytes(32), role: "USER", purpose: "ACCOUNT", authVersion: 0,
      issuedAt: sessionNow, expiresAt: new Date(sessionNow.getTime() + 3600_000) });
    await database.insert(players).values({ id: playerId, userAccountId: userId, memberName: `notice-${suffix}`, memberNameNormalized: `notice-${suffix}`,
      nickname: `notice-${suffix}`, nicknameNormalized: `notice-${suffix}`, tagLine: "QA", tagLineNormalized: "qa" });
    const [round] = await database.insert(seasonInhouseRounds).values({ id: roundId, seasonId, applyDate, recruitNo: 1, sourceRoomIdHash: config.sourceRoomIdHash,
      sourceReferenceHash: randomBytes(32), mode: "RIFT", capacity: 10 }).returning();
    assert.ok(round);
    await database.insert(seasonKakaoPendingApplications).values(Array.from({ length: 9 }, (_, index) => ({ id: randomUUID(), seasonId, applyDate,
      recruitNo: 1, slotNo: index + 1, suppliedName: `합성${index}-${suffix}`, mainPosition: "ALL" as const, subPositions: [], reserve: false,
      matchState: "UNMATCHED" as const, linkReason: index === 0 ? "UNVERIFIED" : null, sourceRoomIdHash: config.sourceRoomIdHash,
      sourceReferenceHash: randomBytes(32), sourceMode: "RIFT" })));

    await t.test("UNVERIFIED matches only one-candidate review items", async () => {
      const unverified = await service.getKakaoPendingApplications({ seasonId, matchState: "UNVERIFIED", page: 1, pageSize: 20 });
      assert.equal(unverified.totalCount, 1); assert.equal(unverified.applications[0]?.matchState, "UNVERIFIED");
      const unmatched = await service.getKakaoPendingApplications({ seasonId, matchState: "UNMATCHED", page: 1, pageSize: 20 });
      assert.equal(unmatched.totalCount, 8);
    });

    await t.test("website roster ignores legacy pending in another scope or mode", async () => {
      await database.insert(seasonKakaoPendingApplications).values([
        { id: randomUUID(), seasonId, applyDate, recruitNo: 1, slotNo: 11, suppliedName: `다른범위-${suffix}`,
          mainPosition: "ALL", subPositions: [], reserve: false, matchState: "UNMATCHED", sourceRoomIdHash: randomBytes(32),
          sourceReferenceHash: randomBytes(32), sourceMode: "RIFT" },
        { id: randomUUID(), seasonId, applyDate, recruitNo: 1, slotNo: 12, suppliedName: `다른종목-${suffix}`,
          mainPosition: "ALL", subPositions: [], reserve: false, matchState: "UNMATCHED", sourceRoomIdHash: config.sourceRoomIdHash,
          sourceReferenceHash: randomBytes(32), sourceMode: "ARAM" },
      ]);
      const hub = await service.getApplicationHub(userId, 1, now);
      assert.equal(hub.counts.applied, 9); assert.equal(hub.unlinkedCount, 9);
    });

    let revision = 0;
    await t.test("9 to 10, retry and unchanged 10 create a single notification", async () => {
      const command = context("first");
      const result = await service.upsertOwnApplication(command, 0, body, now);
      assert.match(String(result.body.notice), /10분 전/); revision = result.revision!;
      assert.equal((await service.upsertOwnApplication(command, 0, body, now)).replayed, true);
      assert.equal((await currentRows()).length, 1);
      const updated = await service.upsertOwnApplication(context("unchanged"), revision, body, now); revision = updated.revision!;
      assert.equal(updated.body.notice, null); assert.equal((await currentRows()).length, 1);
    });

    await t.test("failed application transaction rolls back its notification", async () => {
      const cancelled = await service.cancelOwnApplication(context("cancel"), revision, { recruitNo: 1 }, now); revision = cancelled.revision!;
      const failing = new SeasonService(new PostgresSeasonRepository(database, { async append() { throw new Error("synthetic audit rollback"); } }));
      await assert.rejects(failing.upsertOwnApplication(context("rollback"), revision, body, now));
      assert.equal((await currentRows()).length, 1);
      const [application] = await database.select().from(seasonApplications).where(and(eq(seasonApplications.playerId, playerId), eq(seasonApplications.seasonId, seasonId)));
      assert.equal(application?.status, "CANCELLED");
      const restored = await service.upsertOwnApplication(context("refill"), revision, body, now); revision = restored.revision!;
      const rows = await currentRows(); assert.equal(rows.length, 2); assert.equal(rows.filter((row) => row.status === "PENDING").length, 1);
      assert.equal(rows.filter((row) => row.failureCode === "SUPERSEDED").length, 1);
    });

    await t.test("another scope or target cannot claim and replay is refused", async () => {
      const different = { ...config, sourceRoomIdHash: randomBytes(32) };
      assert.equal((await run(request("POLL"), now, different) as { event: unknown }).event, null);
      assert.equal((await run(request("POLL"), now, { ...config, targetHash: randomBytes(32) }) as { event: unknown }).event, null);
      const registration = request("REGISTER"); assert.equal((await run(registration) as { registered: boolean }).registered, true);
      await assert.rejects(run(registration), SiteNoticeReplayError);
      const countBefore = (await currentRows()).length;
      await database.transaction((tx) => enqueueSiteInhouseNotice(tx, { round: { ...round, sourceRoomIdHash: randomBytes(32) }, applicationId: randomUUID(), applicationRevision: 0, now }));
      assert.equal((await currentRows()).length, countBefore);
    });

    await t.test("offline lease expires, concurrent polls claim once, ACK is idempotent", async () => {
      const polls = await Promise.all([run(request("POLL")), run(request("POLL"))]) as { event?: { id: string; leaseToken: string } | null }[];
      const claimed = polls.map((result) => result.event).filter(Boolean);
      assert.equal(claimed.length, 1);
      const first = claimed[0]!;
      assert.equal((await run(request("POLL"), new Date(now.getTime() + 60_000)) as { event: unknown }).event, null);
      const later = new Date(now.getTime() + 121_000);
      const retry = (await run(request("POLL"), later) as { event: { id: string; leaseToken: string } }).event;
      assert.equal(retry.id, first.id); assert.notEqual(retry.leaseToken, first.leaseToken);
      await assert.rejects(run(request("ACK", { eventId: first.id, leaseToken: first.leaseToken, outcome: "SENT" }), later), SiteNoticeLeaseError);
      assert.equal((await run(request("ACK", { eventId: retry.id, leaseToken: retry.leaseToken, outcome: "SENT" }), later) as { acknowledged: boolean }).acknowledged, true);
      assert.equal((await run(request("ACK", { eventId: retry.id, leaseToken: retry.leaseToken, outcome: "SENT" }), later) as { acknowledged: boolean }).acknowledged, true);
      assert.equal((await run(request("POLL"), later) as { event: unknown }).event, null);
    });

    await t.test("uncertain send is terminal; a newer 9 to 10 transition remains separate", async () => {
      const cancelled = await service.cancelOwnApplication(context("cancel-again"), revision, { recruitNo: 1 }, now); revision = cancelled.revision!;
      const restored = await service.upsertOwnApplication(context("refill-again"), revision, body, now); revision = restored.revision!;
      const event = (await run(request("POLL")) as { event: { id: string; leaseToken: string } }).event;
      assert.ok(event);
      await run(request("ACK", { eventId: event.id, leaseToken: event.leaseToken, outcome: "UNCERTAIN" }));
      assert.equal((await currentRows()).find((row) => row.id === event.id)?.failureCode, "SEND_UNCERTAIN");
      assert.equal((await run(request("POLL")) as { event: unknown }).event, null);
    });

    await t.test("expiry, failure bound and retention are enforced", async () => {
      await database.transaction((tx) => enqueueSiteInhouseNotice(tx, { round, applicationId: randomUUID(), applicationRevision: 0, now }));
      const cancelled = await service.cancelOwnApplication(context("cancel-for-scope-check"), revision, { recruitNo: 1 }, now); revision = cancelled.revision!;
      assert.equal((await run(request("POLL")) as { event: unknown }).event, null, "foreign-scope/mode pending cannot sustain a full notice");
      assert.ok((await currentRows()).some((row) => row.failureCode === "NO_LONGER_FULL"));
      const restored = await service.upsertOwnApplication(context("refill-for-expiry"), revision, body, now); revision = restored.revision!;
      await database.update(kakaoSiteNotices).set({ attempts: 20 }).where(and(eq(kakaoSiteNotices.roundId, roundId), eq(kakaoSiteNotices.status, "PENDING")));
      assert.equal((await run(request("POLL")) as { event: unknown }).event, null);
      assert.ok((await currentRows()).some((row) => row.failureCode === "ATTEMPTS_EXHAUSTED"));
      await database.transaction((tx) => enqueueSiteInhouseNotice(tx, { round, applicationId: randomUUID(), applicationRevision: 0, now }));
      const expired = new Date(now.getTime() + 86_400_000);
      assert.equal((await run(request("POLL"), expired) as { event: unknown }).event, null);
      assert.ok((await currentRows()).some((row) => row.failureCode === "EXPIRED"));
      const cleanup = await database.transaction((tx) => pruneSiteNotices(tx, new Date(now.getTime() + 32 * 86_400_000)));
      assert.ok(cleanup.siteNoticesRetired > 0, "daily job can retire rows without any phone poll");
      assert.equal((await currentRows()).length, 0);
    });
  } finally {
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});
