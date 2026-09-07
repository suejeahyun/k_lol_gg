import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, count, desc, eq } from "drizzle-orm";

import { SeasonService } from "../../src/modules/seasons";
import type { SeasonAuditWriter } from "../../src/modules/seasons/application/ports/season-repository";
import {
  SEASON_COMMAND_RECEIPT_TTL_MS,
  SeasonServiceError,
  kstDateKey,
} from "../../src/modules/seasons/domain/season";
import { PostgresSeasonRepository } from "../../src/modules/seasons/infrastructure/postgres-season-repository";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { auditEvents, authSessions, players, seasonApplications, seasonCommandReceipts, seasons, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const sessionActors = new Map<
  string,
  Readonly<{
    userAccountId: string;
    sessionId: string;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
    authVersion: number;
  }>
>();

function approvedAccount(loginId: string, role: "USER" | "ADMIN" | "SUPER_ADMIN" = "USER") {
  const account = {
    id: randomUUID(),
    sessionId: randomUUID(),
    authVersion: 0,
    loginId,
    loginIdNormalized: loginId.toLocaleLowerCase("ko-KR"),
    passwordHash: "$argon2id$v=19$synthetic-season-contract-hash",
    role,
    status: "APPROVED" as const,
  };
  sessionActors.set(account.id, {
    userAccountId: account.id,
    sessionId: account.sessionId,
    role: account.role,
    authVersion: account.authVersion,
  });
  return account;
}

function accountRow(actor: ReturnType<typeof approvedAccount>) {
  return {
    id: actor.id,
    authVersion: actor.authVersion,
    loginId: actor.loginId,
    loginIdNormalized: actor.loginIdNormalized,
    passwordHash: actor.passwordHash,
    role: actor.role,
    status: actor.status,
  };
}

function command(actorUserAccountId: string, label: string) {
  return {
    actorSession: sessionActors.get(actorUserAccountId) ?? {
      userAccountId: actorUserAccountId,
      sessionId: randomUUID(),
      role: "USER" as const,
      authVersion: 0,
    },
    requestId: randomUUID(),
    idempotencyMaterial: new TextEncoder().encode(`season-contract:${label}`),
  };
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof SeasonServiceError && error.code === code;
}

function postgresDetails(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  const details: { code?: string; constraint?: string } = {};
  while (current && typeof current === "object") {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code && /^\d{5}$/.test(candidate.code)) details.code = candidate.code;
    if (candidate.constraint) details.constraint = candidate.constraint;
    if (details.code && details.constraint) return details;
    current = candidate.cause;
  }
  return details;
}

function postgresError(code: string, constraint?: string) {
  return (error: unknown) => {
    const details = postgresDetails(error);
    return details.code === code && (!constraint || details.constraint?.startsWith(constraint) === true);
  };
}

test("season lifecycle, participation ownership, idempotency and audit contracts hold on PostgreSQL 18", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 8 });
  const repository = new PostgresSeasonRepository(database);
  const service = new SeasonService(repository);
  const failingAudit: SeasonAuditWriter = {
    async append() {
      throw new Error("synthetic audit failure");
    },
  };
  const failingService = new SeasonService(new PostgresSeasonRepository(database, failingAudit));
  const now = new Date("2026-09-01T10:00:00.000Z");
  const admin = approvedAccount(`season_admin_${randomUUID()}`, "ADMIN");
  const applicant = approvedAccount(`season_user_${randomUUID()}`);
  const otherUser = approvedAccount(`season_other_${randomUUID()}`);
  const applicantPlayerId = randomUUID();
  const otherPlayerId = randomUUID();

  try {
    await database.insert(userAccounts).values([admin, applicant, otherUser].map(accountRow));
    const sessionNow = new Date();
    await database.insert(authSessions).values(
      [admin, applicant, otherUser].map((actor) => ({
        id: actor.sessionId,
        tokenHash: randomBytes(32),
        userAccountId: actor.id,
        authVersion: actor.authVersion,
        role: actor.role,
        purpose: actor.role === "USER" ? "ACCOUNT" as const : "ADMIN" as const,
        totpVerifiedAt: actor.role === "USER" ? null : sessionNow,
        issuedAt: sessionNow,
        expiresAt: new Date(sessionNow.getTime() + 30 * 60_000),
      })),
    );
    await database.insert(players).values([
      {
        id: applicantPlayerId,
        userAccountId: applicant.id,
        memberName: "절대 공개되면 안 되는 합성 회원명",
        memberNameNormalized: "절대 공개되면 안 되는 합성 회원명",
        nickname: "SeasonSky",
        nicknameNormalized: "seasonsky",
        tagLine: "S03",
        tagLineNormalized: "s03",
      },
      {
        id: otherPlayerId,
        userAccountId: otherUser.id,
        memberName: "타인 합성 회원명",
        memberNameNormalized: "타인 합성 회원명",
        nickname: "OtherSky",
        nicknameNormalized: "othersky",
        tagLine: "S03",
        tagLineNormalized: "s03",
      },
    ]);
    const unrelatedExpiredSeasonReceiptKey = randomBytes(32);
    await database.insert(seasonCommandReceipts).values({
      id: randomUUID(),
      actorUserAccountId: applicant.id,
      scope: "seasons:unrelated-expired-retention",
      keyHash: unrelatedExpiredSeasonReceiptKey,
      requestHash: randomBytes(32),
      responseStatus: 200,
      responseJson: { message: "expired unrelated receipt" },
      createdAt: new Date(Date.now() - 48 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60_000),
    });

    let activeSeasonId = "";

    await t.test("retired lifecycle timestamps reject activated or ended history", async () => {
      await assert.rejects(
        database.insert(seasons).values({
          id: randomUUID(),
          name: `불가능한 보관 시즌 ${randomUUID()}`,
          nameNormalized: `불가능한 보관 시즌 ${randomUUID()}`,
          status: "RETIRED",
          activatedAt: now,
          retiredAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        postgresError("23514", "seasons_lifecycle_timestamps"),
      );
    });

    await t.test("concurrent activation leaves exactly one active season", async () => {
      const createBody = (name: string) => ({
        name,
        applicationsOpenAt: null,
        applicationsCloseAt: null,
        startsAt: null,
        endsAt: null,
      });
      const first = await service.createSeason(command(admin.id, "create-a"), createBody(`합성 시즌 A ${randomUUID()}`), now);
      const second = await service.createSeason(command(admin.id, "create-b"), createBody(`합성 시즌 B ${randomUUID()}`), now);
      assert.equal((await database.select({ value: count() }).from(seasonCommandReceipts).where(
        eq(seasonCommandReceipts.keyHash, unrelatedExpiredSeasonReceiptKey),
      ))[0]?.value, 1, "a season command must not globally delete unrelated expired receipts");
      const firstId = (first.body.season as { id: string }).id;
      const secondId = (second.body.season as { id: string }).id;

      const results = await Promise.allSettled([
        service.activateSeason(command(admin.id, "activate-a"), firstId, 0, {}, now),
        service.activateSeason(command(admin.id, "activate-b"), secondId, 0, {}, now),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
      const rejected = results.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected");
      assert.ok(errorCode("ACTIVE_SEASON_EXISTS")(rejected.reason));

      const activeRows = await database.select().from(seasons).where(eq(seasons.status, "ACTIVE"));
      assert.equal(activeRows.length, 1);
      activeSeasonId = activeRows[0]!.id;
    });

    await t.test("clone creates a draft and stale clone revision is rejected", async () => {
      const cloned = await service.cloneSeason(
        command(admin.id, "clone-active"),
        activeSeasonId,
        1,
        {},
        now,
      );
      assert.equal((cloned.body.season as { status: string }).status, "DRAFT");
      await assert.rejects(
        service.cloneSeason(command(admin.id, "clone-stale"), activeSeasonId, 0, {}, now),
        errorCode("PRECONDITION_FAILED"),
      );
    });

    const applyDate = kstDateKey(now);
    const kakaoApplicationId = randomUUID();
    const kakaoSnapshotHash = Buffer.alloc(32, 0x53);

    await t.test("Kakao provenance hash and position invariants are enforced by PostgreSQL", async () => {
      await database.insert(seasonApplications).values({
        id: randomUUID(),
        seasonId: activeSeasonId,
        playerId: otherPlayerId,
        applyDate,
        recruitNo: 2,
        mainPosition: "TOP",
        subPositions: ["JGL"],
        status: "APPLIED",
        source: "KAKAO",
        sourceReferenceHash: kakaoSnapshotHash,
        createdAt: now,
        updatedAt: now,
      });

      await assert.rejects(
        database.insert(seasonApplications).values({
          id: randomUUID(),
          seasonId: activeSeasonId,
          playerId: otherPlayerId,
          applyDate,
          recruitNo: 3,
          mainPosition: "MID",
          subPositions: [],
          status: "APPLIED",
          source: "SITE",
          sourceReferenceHash: kakaoSnapshotHash,
          createdAt: now,
          updatedAt: now,
        }),
        postgresError("23514", "season_applications_source_hash_consistency"),
      );
      await assert.rejects(
        database.insert(seasonApplications).values({
          id: randomUUID(),
          seasonId: activeSeasonId,
          playerId: otherPlayerId,
          applyDate,
          recruitNo: 4,
          mainPosition: "MID",
          subPositions: [],
          status: "APPLIED",
          source: "KAKAO",
          createdAt: now,
          updatedAt: now,
        }),
        postgresError("23514", "season_applications_source_hash_consistency"),
      );

      const invalidPositionRows = [
        { recruitNo: 5, mainPosition: "MID" as const, subPositions: ["SUP", "SUP"] as const },
        { recruitNo: 6, mainPosition: "MID" as const, subPositions: ["MID"] as const },
        { recruitNo: 7, mainPosition: "TOP" as const, subPositions: ["ALL", "JGL"] as const },
      ];
      for (const invalid of invalidPositionRows) {
        await assert.rejects(
          database.insert(seasonApplications).values({
            id: randomUUID(),
            seasonId: activeSeasonId,
            playerId: otherPlayerId,
            applyDate,
            recruitNo: invalid.recruitNo,
            mainPosition: invalid.mainPosition,
            subPositions: [...invalid.subPositions],
            status: "APPLIED",
            source: "SITE",
            createdAt: now,
            updatedAt: now,
          }),
          postgresError("23514", "season_applications_sub_positions_valid"),
        );
      }

      await assert.rejects(
        database.insert(seasonApplications).values({
          id: randomUUID(),
          seasonId: activeSeasonId,
          playerId: otherPlayerId,
          applyDate,
          recruitNo: 8,
          mainPosition: "MID",
          subPositions: [],
          status: "APPLIED",
          source: "SITE",
          reviewNote: "접수 상태에는 남을 수 없는 메모",
          reviewedByUserAccountId: admin.id,
          reviewedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
        postgresError("23514", "season_applications_review_consistency"),
      );
    });

    await t.test("SITE upsert reuses the same player/date/round row imported from Kakao", async () => {
      await database.insert(seasonApplications).values({
        id: kakaoApplicationId,
        seasonId: activeSeasonId,
        playerId: applicantPlayerId,
        applyDate,
        recruitNo: 1,
        mainPosition: "MID",
        subPositions: ["SUP"],
        status: "APPLIED",
        source: "KAKAO",
        sourceReferenceHash: kakaoSnapshotHash,
        createdAt: now,
        updatedAt: now,
      });

      const context = command(applicant.id, "site-upsert-replay");
      const first = await service.upsertOwnApplication(
        context,
        0,
        { mainPosition: "ADC", subPositions: ["SUP", "ADC", "SUP"] },
        now,
      );
      assert.equal(first.status, 200);
      assert.equal(first.replayed, false);
      assert.equal((first.body.application as { source: string }).source, "KAKAO");
      assert.deepEqual((first.body.application as { subPositions: string[] }).subPositions, ["SUP"]);

      const replay = await service.upsertOwnApplication(
        context,
        0,
        { mainPosition: "ADC", subPositions: ["SUP", "ADC", "SUP"] },
        now,
      );
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.body, first.body);

      await assert.rejects(
        service.upsertOwnApplication(
          context,
          1,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("IDEMPOTENCY_MISMATCH"),
      );
      await assert.rejects(
        service.upsertOwnApplication(
          command(applicant.id, "site-upsert-stale"),
          0,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("PRECONDITION_FAILED"),
      );

      const duplicateCount = await database
        .select({ value: count() })
        .from(seasonApplications)
        .where(
          and(
            eq(seasonApplications.seasonId, activeSeasonId),
            eq(seasonApplications.playerId, applicantPlayerId),
            eq(seasonApplications.applyDate, applyDate),
            eq(seasonApplications.recruitNo, 1),
          ),
        );
      assert.equal(duplicateCount[0]?.value, 1);

      const sharedSnapshotRows = await database
        .select({ id: seasonApplications.id })
        .from(seasonApplications)
        .where(eq(seasonApplications.sourceReferenceHash, kakaoSnapshotHash));
      assert.equal(sharedSnapshotRows.length, 2, "one Kakao snapshot may provenance multiple applicants");
    });

    await t.test("command receipts expire after 24 hours and an expired key is safely reusable", async () => {
      const context = command(admin.id, `receipt-expiry-${randomUUID()}`);
      const keyHash = createHash("sha256").update(context.idempotencyMaterial).digest();
      const firstName = `영수증 만료 A ${randomUUID()}`;
      const secondName = `영수증 만료 B ${randomUUID()}`;
      const fields = (name: string) => ({
        name,
        applicationsOpenAt: null,
        applicationsCloseAt: null,
        startsAt: null,
        endsAt: null,
      });

      const first = await service.createSeason(context, fields(firstName), now);
      assert.equal(first.replayed, false);
      const firstReceiptRows = await database
        .select()
        .from(seasonCommandReceipts)
        .where(
          and(
            eq(seasonCommandReceipts.actorUserAccountId, admin.id),
            eq(seasonCommandReceipts.scope, "admin:seasons:create"),
            eq(seasonCommandReceipts.keyHash, keyHash),
          ),
        )
        .orderBy(desc(seasonCommandReceipts.createdAt))
        .limit(1);
      const firstReceipt = firstReceiptRows[0];
      assert.ok(firstReceipt);
      assert.equal(firstReceipt.expiresAt.getTime() - firstReceipt.createdAt.getTime(), SEASON_COMMAND_RECEIPT_TTL_MS);

      const expiredCreatedAt = new Date(Date.now() - 2 * SEASON_COMMAND_RECEIPT_TTL_MS);
      const expiredAt = new Date(Date.now() - SEASON_COMMAND_RECEIPT_TTL_MS);
      await database
        .update(seasonCommandReceipts)
        .set({ createdAt: expiredCreatedAt, expiresAt: expiredAt })
        .where(eq(seasonCommandReceipts.id, firstReceipt.id));

      const reused = await service.createSeason(context, fields(secondName), now);
      assert.equal(reused.replayed, false);
      const replacementRows = await database
        .select()
        .from(seasonCommandReceipts)
        .where(
          and(
            eq(seasonCommandReceipts.actorUserAccountId, admin.id),
            eq(seasonCommandReceipts.scope, "admin:seasons:create"),
            eq(seasonCommandReceipts.keyHash, keyHash),
          ),
        );
      assert.equal(replacementRows.length, 1);
      assert.notEqual(replacementRows[0]!.id, firstReceipt.id);
      assert.ok(replacementRows[0]!.expiresAt > new Date());
      assert.equal(
        replacementRows[0]!.expiresAt.getTime() - replacementRows[0]!.createdAt.getTime(),
        SEASON_COMMAND_RECEIPT_TTL_MS,
      );
    });

    await t.test("season audit snapshots retain lifecycle and schedule field diffs", async () => {
      const created = await service.createSeason(
        command(admin.id, "audit-fields-create"),
        {
          name: `감사 필드 시즌 ${randomUUID()}`,
          applicationsOpenAt: "2026-09-02T09:00:00+09:00",
          applicationsCloseAt: "2026-09-03T18:00:00+09:00",
          startsAt: "2026-09-04T10:00:00+09:00",
          endsAt: "2026-09-05T22:00:00+09:00",
        },
        now,
      );
      const auditSeasonId = (created.body.season as { id: string }).id;
      await service.updateSeason(
        command(admin.id, "audit-fields-update"),
        auditSeasonId,
        0,
        {
          name: `감사 필드 수정 ${randomUUID()}`,
          applicationsOpenAt: "2026-09-02T10:00:00+09:00",
          applicationsCloseAt: "2026-09-03T19:00:00+09:00",
          startsAt: "2026-09-04T11:00:00+09:00",
          endsAt: "2026-09-05T23:00:00+09:00",
        },
        now,
      );
      await service.retireSeason(command(admin.id, "audit-fields-retire"), auditSeasonId, 1, {}, now);

      const events = await database.select().from(auditEvents).where(eq(auditEvents.targetId, auditSeasonId));
      const createdEvent = events.find((event) => event.action === "SEASON_CREATED");
      const updatedEvent = events.find((event) => event.action === "SEASON_UPDATED");
      const retiredEvent = events.find((event) => event.action === "SEASON_RETIRED");
      assert.ok(createdEvent?.afterJson);
      assert.ok(updatedEvent?.afterJson);
      assert.ok(retiredEvent?.afterJson);
      assert.equal(createdEvent.afterJson.applicationsOpenAt, "2026-09-02T00:00:00.000Z");
      assert.equal(createdEvent.afterJson.endsAt, "2026-09-05T13:00:00.000Z");
      assert.equal(updatedEvent?.beforeJson?.startsAt, "2026-09-04T01:00:00.000Z");
      assert.equal(updatedEvent.afterJson.startsAt, "2026-09-04T02:00:00.000Z");
      assert.equal(updatedEvent?.beforeJson?.revision, 0);
      assert.equal(updatedEvent.afterJson.revision, 1);
      assert.equal(retiredEvent?.beforeJson?.status, "DRAFT");
      assert.equal(retiredEvent.afterJson.status, "RETIRED");
      assert.equal(typeof retiredEvent.afterJson.retiredAt, "string");
    });

    await t.test("clone and cancellation roll back with their audit event", async () => {
      const cloneName = `감사 복제 롤백 ${randomUUID()}`;
      await assert.rejects(
        failingService.cloneSeason(
          command(admin.id, "audit-clone-rollback"),
          activeSeasonId,
          1,
          { name: cloneName },
          now,
        ),
        /synthetic audit failure/,
      );
      assert.equal(
        (
          await database
            .select({ value: count() })
            .from(seasons)
            .where(eq(seasons.nameNormalized, cloneName.toLocaleLowerCase("ko-KR")))
        )[0]?.value,
        0,
      );

      await assert.rejects(
        failingService.cancelOwnApplication(
          command(applicant.id, "audit-cancel-rollback"),
          1,
          {},
          now,
        ),
        /synthetic audit failure/,
      );
      const applicationRows = await database
        .select()
        .from(seasonApplications)
        .where(eq(seasonApplications.id, kakaoApplicationId));
      assert.equal(applicationRows[0]?.status, "APPLIED");
      assert.equal(applicationRows[0]?.revision, 1);

      const pendingReceipts = await database
        .select({ value: count() })
        .from(seasonCommandReceipts)
        .where(eq(seasonCommandReceipts.responseStatus, 202));
      assert.equal(pendingReceipts[0]?.value, 0);
    });

    await t.test("owner cancellation, resubmission and admin review honor revisions", async () => {
      const cancelled = await service.cancelOwnApplication(
        command(applicant.id, "cancel-own"),
        1,
        {},
        now,
      );
      assert.equal((cancelled.body.application as { status: string }).status, "CANCELLED");
      assert.equal(cancelled.revision, 2);

      await assert.rejects(
        async () =>
          service.cancelOwnApplication(
            command(otherUser.id, "try-target-cancel"),
            2,
            { applicationId: kakaoApplicationId },
            now,
          ),
        errorCode("INVALID_INPUT"),
      );

      const resubmitted = await service.upsertOwnApplication(
        command(applicant.id, "resubmit-own"),
        2,
        { mainPosition: "MID", subPositions: ["JGL"] },
        now,
      );
      assert.equal(resubmitted.revision, 3);

      await assert.rejects(
        failingService.reviewApplication(
          command(admin.id, "audit-review-rollback"),
          kakaoApplicationId,
          3,
          { status: "RESERVE", reviewNote: "반영되면 안 됨" },
          now,
        ),
        /synthetic audit failure/,
      );
      const afterFailedReview = await database
        .select()
        .from(seasonApplications)
        .where(eq(seasonApplications.id, kakaoApplicationId));
      assert.equal(afterFailedReview[0]?.status, "APPLIED");
      assert.equal(afterFailedReview[0]?.revision, 3);
      assert.equal(afterFailedReview[0]?.reviewNote, null);

      const reviewed = await service.reviewApplication(
        command(admin.id, "review-reserve"),
        kakaoApplicationId,
        3,
        { status: "RESERVE", reviewNote: "합성 예비 검토" },
        now,
      );
      assert.equal(reviewed.revision, 4);

      await assert.rejects(
        service.cancelOwnApplication(command(applicant.id, "cancel-reserve"), 4, {}, now),
        errorCode("INVALID_TRANSITION"),
      );

      const race = await Promise.allSettled([
        service.reviewApplication(
          command(admin.id, "review-race-confirm"),
          kakaoApplicationId,
          4,
          { status: "CONFIRMED", reviewNote: "합성 확정" },
          now,
        ),
        service.reviewApplication(
          command(admin.id, "review-race-reject"),
          kakaoApplicationId,
          4,
          { status: "REJECTED", reviewNote: "합성 거절" },
          now,
        ),
      ]);
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(race.filter((result) => result.status === "rejected").length, 1);
      const rejected = race.find((result) => result.status === "rejected");
      assert.ok(rejected?.status === "rejected");
      assert.ok(errorCode("PRECONDITION_FAILED")(rejected.reason));

      let finalRows = await database
        .select()
        .from(seasonApplications)
        .where(eq(seasonApplications.id, kakaoApplicationId));
      assert.equal(finalRows[0]?.revision, 5);
      await assert.rejects(
        service.cancelOwnApplication(command(applicant.id, "cancel-reviewed"), 5, {}, now),
        errorCode("INVALID_TRANSITION"),
      );

      if (finalRows[0]?.status !== "REJECTED") {
        const rejectedReview = await service.reviewApplication(
          command(admin.id, "normalize-rejected"),
          kakaoApplicationId,
          5,
          { status: "REJECTED", reviewNote: "거절 상태 불변식" },
          now,
        );
        assert.equal(rejectedReview.revision, 6);
        finalRows = await database
          .select()
          .from(seasonApplications)
          .where(eq(seasonApplications.id, kakaoApplicationId));
      }
      const rejectedRevision = finalRows[0]!.revision;
      assert.equal(finalRows[0]?.status, "REJECTED");
      await assert.rejects(
        service.upsertOwnApplication(
          command(applicant.id, "reapply-rejected"),
          rejectedRevision,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("APPLICATION_REVIEWED"),
      );
      await assert.rejects(
        service.cancelOwnApplication(
          command(applicant.id, "cancel-rejected"),
          rejectedRevision,
          {},
          now,
        ),
        errorCode("INVALID_TRANSITION"),
      );

      const applicationEvents = await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.targetId, kakaoApplicationId));
      const cancelEvent = applicationEvents.find((event) => event.action === "SEASON_APPLICATION_CANCELLED");
      const upsertEvent = applicationEvents.find(
        (event) =>
          event.action === "SEASON_APPLICATION_UPSERTED" &&
          event.afterJson?.mainPosition === "MID" &&
          Array.isArray(event.afterJson?.subPositions) &&
          event.afterJson.subPositions.includes("JGL"),
      );
      const reviewEvent = applicationEvents.find(
        (event) => event.action === "SEASON_APPLICATION_REVIEWED" && event.afterJson?.reviewNote != null,
      );
      assert.equal(cancelEvent?.beforeJson?.status, "APPLIED");
      assert.equal(cancelEvent?.afterJson?.status, "CANCELLED");
      assert.equal(typeof cancelEvent?.afterJson?.cancelledAt, "string");
      assert.equal(upsertEvent?.afterJson?.source, "KAKAO");
      assert.deepEqual(upsertEvent?.afterJson?.subPositions, ["JGL"]);
      assert.equal(reviewEvent?.afterJson?.reviewedByUserAccountId, admin.id);
      assert.equal(typeof reviewEvent?.afterJson?.reviewedAt, "string");
    });

    await t.test("public DTO excludes member, login, Discord and internal review fields", async () => {
      const hub = await service.getApplicationHub(applicant.id, now);
      const serialized = JSON.stringify(hub);
      assert.equal(serialized.includes("절대 공개되면 안 되는 합성 회원명"), false);
      assert.equal(serialized.includes(applicant.loginId), false);
      assert.equal(/memberName|loginId|discord|reviewNote/i.test(serialized), false);
      assert.equal(hub.myApplication?.id, kakaoApplicationId);
      assert.equal(hub.viewer, "APPROVED");
      assert.equal(hub.hasActivePlayer, true);
      assert.equal(hub.canApply, false, "a rejected application cannot be reapplied");
      assert.equal(hub.participantTotal, hub.participants.length);
    });

    await t.test("public status counts cover the full roster while the projection is capped at 200", async () => {
      const rosterPlayers = Array.from({ length: 201 }, (_, index) => {
        const suffix = `${index}-${randomUUID()}`;
        return {
          id: randomUUID(),
          memberName: `대규모 합성 회원 ${suffix}`,
          memberNameNormalized: `대규모 합성 회원 ${suffix}`,
          nickname: `Roster${suffix}`,
          nicknameNormalized: `roster${suffix}`,
          tagLine: "S03",
          tagLineNormalized: "s03",
        };
      });
      await database.insert(players).values(rosterPlayers);
      await database.insert(seasonApplications).values(
        rosterPlayers.map((player, index) => {
          const status = (["APPLIED", "RESERVE", "CONFIRMED"] as const)[index % 3]!;
          const reviewed = status !== "APPLIED";
          return {
            id: randomUUID(),
            seasonId: activeSeasonId,
            playerId: player.id,
            applyDate,
            recruitNo: 1,
            mainPosition: "MID" as const,
            subPositions: [],
            status,
            source: "SITE" as const,
            reviewedByUserAccountId: reviewed ? admin.id : null,
            reviewedAt: reviewed ? now : null,
            createdAt: now,
            updatedAt: now,
          };
        }),
      );

      const hub = await service.getApplicationHub(applicant.id, now);
      assert.equal(hub.participants.length, 200);
      assert.equal(hub.participantTotal, 201);
      assert.equal(hub.participantsTruncated, true);
      assert.deepEqual(hub.counts, { applied: 67, reserve: 67, confirmed: 67 });
    });

    await t.test("viewer approval and active-player capability are rechecked from the database", async () => {
      const eligible = await service.getApplicationHub(otherUser.id, now);
      assert.equal(eligible.viewer, "APPROVED");
      assert.equal(eligible.hasActivePlayer, true);
      assert.equal(eligible.canApply, true);

      const approvedWithoutPlayer = await service.getApplicationHub(admin.id, now);
      assert.equal(approvedWithoutPlayer.viewer, "APPROVED");
      assert.equal(approvedWithoutPlayer.hasActivePlayer, false);
      assert.equal(approvedWithoutPlayer.canApply, false);

      await database.update(userAccounts).set({ status: "SUSPENDED" }).where(eq(userAccounts.id, otherUser.id));
      const restricted = await service.getApplicationHub(otherUser.id, now);
      assert.equal(restricted.viewer, "RESTRICTED");
      assert.equal(restricted.hasActivePlayer, false);
      assert.equal(restricted.canApply, false);
      assert.equal(restricted.myApplication, null);
    });

    await t.test("non-approved account is rechecked inside the mutation transaction", async () => {
      await assert.rejects(
        service.upsertOwnApplication(
          command(otherUser.id, "suspended-upsert"),
          0,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("SESSION_STALE"),
      );
    });

    await t.test("ACCOUNT and ADMIN purposes cannot cross-authorize season commands", async () => {
      await assert.rejects(
        service.createSeason(
          command(applicant.id, "account-purpose-admin-command"),
          {
            name: `목적 교차 금지 ${randomUUID()}`,
            applicationsOpenAt: null,
            applicationsCloseAt: null,
            startsAt: null,
            endsAt: null,
          },
          now,
        ),
        errorCode("SESSION_STALE"),
      );
      await assert.rejects(
        service.upsertOwnApplication(
          command(admin.id, "admin-purpose-account-command"),
          0,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("SESSION_STALE"),
      );
    });

    await t.test("ADMIN and SUPER_ADMIN roles may use approved user actions only through ACCOUNT sessions", async () => {
      for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
        const accountActor = approvedAccount(`season_${role.toLocaleLowerCase()}_account_${randomUUID()}`, role);
        const playerId = randomUUID();
        const nickname = `${role}Account${randomUUID()}`;
        await database.insert(userAccounts).values(accountRow(accountActor));
        await database.insert(authSessions).values({
          id: accountActor.sessionId,
          tokenHash: randomBytes(32),
          userAccountId: accountActor.id,
          authVersion: 0,
          role,
          purpose: "ACCOUNT",
          totpVerifiedAt: null,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        });
        await database.insert(players).values({
          id: playerId,
          userAccountId: accountActor.id,
          memberName: `${role} ACCOUNT 합성 회원`,
          memberNameNormalized: `${role.toLocaleLowerCase()} account 합성 회원`,
          nickname,
          nicknameNormalized: nickname.toLocaleLowerCase("ko-KR"),
          tagLine: "S03",
          tagLineNormalized: "s03",
        });
        const result = await service.upsertOwnApplication(
          command(accountActor.id, `${role.toLocaleLowerCase()}-account-user-action`),
          0,
          { mainPosition: role === "ADMIN" ? "ADC" : "SUP", subPositions: [] },
          now,
        );
        const application = result.body.application as { status: string };
        assert.equal(application.status, "APPLIED");
        assert.equal((await database.select({ value: count() }).from(seasonApplications).where(
          eq(seasonApplications.playerId, playerId),
        ))[0]?.value, 1);
      }
    });

    await t.test("session revocation wins over a queued ACCOUNT mutation", async () => {
      const raceUser = approvedAccount(`season_revoke_race_${randomUUID()}`);
      const racePlayerId = randomUUID();
      await database.insert(userAccounts).values(accountRow(raceUser));
      await database.insert(authSessions).values({
        id: raceUser.sessionId,
        tokenHash: randomBytes(32),
        userAccountId: raceUser.id,
        authVersion: 0,
        role: "USER",
        purpose: "ACCOUNT",
        totpVerifiedAt: null,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      await database.insert(players).values({
        id: racePlayerId,
        userAccountId: raceUser.id,
        memberName: "경합 합성 회원",
        memberNameNormalized: "경합 합성 회원",
        nickname: `Race${randomUUID()}`,
        nicknameNormalized: `race${randomUUID()}`,
        tagLine: "S03",
        tagLineNormalized: "s03",
      });
      const blocker = await pool.connect();
      try {
        await blocker.query("begin");
        await blocker.query("select id from auth.user_accounts where id = $1 for update", [raceUser.id]);
        const pending = service.upsertOwnApplication(
          command(raceUser.id, "revoke-vs-application"),
          0,
          { mainPosition: "JGL", subPositions: [] },
          now,
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        await database.update(authSessions).set({ revokedAt: new Date() }).where(
          eq(authSessions.id, raceUser.sessionId),
        );
        await blocker.query("commit");
        await assert.rejects(pending, errorCode("SESSION_STALE"));
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        blocker.release();
      }
      assert.equal((await database.select({ value: count() }).from(seasonApplications).where(
        eq(seasonApplications.playerId, racePlayerId),
      ))[0]?.value, 0);
      assert.equal((await database.select({ value: count() }).from(seasonCommandReceipts).where(
        eq(seasonCommandReceipts.actorUserAccountId, raceUser.id),
      ))[0]?.value, 0);
    });

    await t.test("TOTP removal wins over a queued ADMIN mutation", async () => {
      const raceAdmin = approvedAccount(`season_totp_race_${randomUUID()}`, "ADMIN");
      await database.insert(userAccounts).values(accountRow(raceAdmin));
      await database.insert(authSessions).values({
        id: raceAdmin.sessionId,
        tokenHash: randomBytes(32),
        userAccountId: raceAdmin.id,
        authVersion: 0,
        role: "ADMIN",
        purpose: "ADMIN",
        totpVerifiedAt: new Date(),
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      });
      const blockedName = `TOTP 경합 차단 ${randomUUID()}`;
      const blocker = await pool.connect();
      try {
        await blocker.query("begin");
        await blocker.query("select id from auth.user_accounts where id = $1 for update", [raceAdmin.id]);
        const pending = service.createSeason(
          command(raceAdmin.id, "totp-vs-create"),
          {
            name: blockedName,
            applicationsOpenAt: null,
            applicationsCloseAt: null,
            startsAt: null,
            endsAt: null,
          },
          now,
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        await database.update(authSessions).set({ totpVerifiedAt: null }).where(
          eq(authSessions.id, raceAdmin.sessionId),
        );
        await blocker.query("commit");
        await assert.rejects(pending, errorCode("SESSION_STALE"));
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        blocker.release();
      }
      assert.equal((await database.select({ value: count() }).from(seasons).where(
        eq(seasons.nameNormalized, blockedName.normalize("NFKC").toLocaleLowerCase("ko-KR")),
      ))[0]?.value, 0);
    });

    await t.test("soft-deleted account is rejected again inside the mutation transaction", async () => {
      await database
        .update(userAccounts)
        .set({ status: "APPROVED", deletedAt: now })
        .where(eq(userAccounts.id, otherUser.id));
      await assert.rejects(
        service.upsertOwnApplication(
          command(otherUser.id, "soft-deleted-upsert"),
          0,
          { mainPosition: "TOP", subPositions: [] },
          now,
        ),
        errorCode("SESSION_STALE"),
      );
    });

    await t.test("reviewer history restricts hard deletion of the reviewer account", async () => {
      await database
        .delete(seasonCommandReceipts)
        .where(eq(seasonCommandReceipts.actorUserAccountId, admin.id));
      let deletionError: unknown;
      try {
        await database.delete(userAccounts).where(eq(userAccounts.id, admin.id));
      } catch (error) {
        deletionError = error;
      }
      assert.ok(deletionError, "reviewer hard deletion must fail");
      const deletionDetails = postgresDetails(deletionError);
      assert.equal(deletionDetails.code, "23001", "ON DELETE RESTRICT must report restrict_violation");
      assert.match(
        deletionDetails.constraint ?? "",
        /^season_applications_reviewed_by_user_account_id/,
      );
      const reviewerRows = await database
        .select({ id: userAccounts.id })
        .from(userAccounts)
        .where(eq(userAccounts.id, admin.id));
      assert.equal(reviewerRows.length, 1);
    });

    await t.test("audit failure rolls the season and idempotency receipt back together", async () => {
      const name = `감사 롤백 ${randomUUID()}`;
      await assert.rejects(
        failingService.createSeason(
          command(admin.id, "audit-rollback"),
          {
            name,
            applicationsOpenAt: null,
            applicationsCloseAt: null,
            startsAt: null,
            endsAt: null,
          },
          now,
        ),
        /synthetic audit failure/,
      );
      const seasonRows = await database.select().from(seasons).where(eq(seasons.nameNormalized, name.toLocaleLowerCase("ko-KR")));
      const receiptRows = await database.select().from(seasonCommandReceipts).where(eq(seasonCommandReceipts.scope, "admin:seasons:create"));
      assert.equal(seasonRows.length, 0);
      assert.equal(receiptRows.some((row) => row.responseJson.pending === true), false);
    });

    await t.test("ending and retirement preserve history instead of cascading deletion", async () => {
      const ended = await service.endSeason(command(admin.id, "end-active"), activeSeasonId, 1, {}, now);
      assert.equal((ended.body.season as { status: string }).status, "ENDED");
      await assert.rejects(
        service.retireSeason(command(admin.id, "retire-ended"), activeSeasonId, 2, {}, now),
        errorCode("INVALID_TRANSITION"),
      );
      const applicationRows = await database.select().from(seasonApplications).where(eq(seasonApplications.id, kakaoApplicationId));
      assert.equal(applicationRows.length, 1);
      const auditRows = await database.select().from(auditEvents).where(eq(auditEvents.targetId, activeSeasonId));
      assert.ok(auditRows.some((event) => event.action === "SEASON_ENDED"));
    });
  } finally {
    await pool.end();
  }
});
