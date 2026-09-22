import { inhouseCopyFormReply, inhouseSaveReply, v1StrictSeasonReply } from "../../src/modules/recruiting/kakao-v4/v1-strict-replies";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/platform/db/schema/index";
import sharp from "sharp";

import { KakaoAssistantError, type KakaoSeasonSnapshotCommand, type KakaoSeasonSnapshotDto } from "../../src/modules/recruiting/kakao-assistant/domain";
import { PostgresKakaoAssistant } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-assistant";
import { canonicalizeKakaoV4Command } from "../../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../../src/modules/recruiting/kakao-v4/classifier";
import { PostgresKakaoImageReceive } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-image-receive";
import { recruitingOperatingDateKey } from "../../src/modules/recruiting/domain/operating-day";
import { hashKakaoV4EventId, kakaoV4EventRequestFingerprint, KAKAO_V4_EVENT_SCOPE } from "../../src/modules/recruiting";
import { KakaoAdminError, PostgresKakaoAdmin } from "../../src/modules/recruiting/kakao-admin/postgres-kakao-admin";
import { PostgresRecruitingAdapter } from "../../src/modules/recruiting/infrastructure/postgres-recruiting-adapter";
import { FakePrivateImageStorage } from "../../src/modules/matches/infrastructure/private-image";
import type { VerifiedKakaoWebhookIntent } from "../../src/modules/recruiting/infrastructure/kakao-signature";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { players } from "../../src/platform/db/schema/registry";
import { authSessions, userAccounts } from "../../src/platform/db/schema/auth";
import { auditEvents } from "../../src/platform/db/schema/audit";
import { matchSubmissionImages, matchSubmissions, privateAssets } from "../../src/platform/db/schema/matches";
import { kakaoImageSessions, kakaoInboundImages, kakaoOperationSettings, recruitParties, recruitingCommandReceipts, recruitingNonceBindings, recruitingOutbox, scrimRecruits } from "../../src/platform/db/schema/recruiting";
import { seasonApplications, seasonInhouseRounds, seasonKakaoPendingApplications, seasons } from "../../src/platform/db/schema/seasons";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const principalId = "bot:kakao-assistant-contract";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function intent(nonce: string, body: string, roomId = "room-contract", senderId = "operator-contract"): VerifiedKakaoWebhookIntent {
  return {
    kind: "KAKAO_HMAC",
    keyId: "contract",
    timestampSeconds: Math.floor(Date.now() / 1_000),
    nonce,
    roomId,
    senderId,
    bodyDigestHex: digest(body),
    requireNonceClaim: true,
    transactionRecheck: true,
  };
}

test("signed Kakao reads persist safe replay receipts and isolate recruit members to the bound room", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const playerId = randomUUID();
  const partyId = randomUUID();
  const foreignPartyId = randomUUID();
  const nextOperatingDayPartyId = randomUUID();
  const draftPartyId = randomUUID();
  const scrimId = randomUUID();
  const foreignScrimId = randomUUID();
  const nextOperatingDayScrimId = randomUUID();
  const draftScrimId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  try {
    await applyMigrations(database);
    const statusBeforeBoundary = new Date("2026-09-12T05:59:59.000+09:00");
    const statusAfterBoundary = new Date("2026-09-12T06:01:00.000+09:00");
    const operatingDate = recruitingOperatingDateKey(statusBeforeBoundary);
    const nextOperatingDate = recruitingOperatingDateKey(statusAfterBoundary);
    await database.insert(players).values({
      id: playerId,
      memberName: `비공개-${suffix}`,
      memberNameNormalized: `비공개-${suffix}`,
      nickname: `Kakao${suffix}`,
      nicknameNormalized: `kakao${suffix}`,
      tagLine: "QA",
      tagLineNormalized: "qa",
      currentTier: "GOLD",
    });
    await database.insert(recruitParties).values([
      {
        id: partyId,
        recruitDate: operatingDate,
        recruitNumber: 91,
        type: "FLEX_RANK",
        status: "IN_PROGRESS",
        title: "Kakao 계약 파티",
        maximumMembers: 5,
        membersJson: [{ name: "같은 방 참가자", position: "MID", slotNo: 1, substitute: false }],
        sourceRoomId: "room-contract",
        lastActivityAt: new Date(),
      },
      {
        id: foreignPartyId,
        recruitDate: operatingDate,
        recruitNumber: 92,
        type: "FLEX_RANK",
        status: "IN_PROGRESS",
        title: "다른 방 계약 파티",
        maximumMembers: 5,
        membersJson: [{ name: "다른 방 비공개", position: "TOP", slotNo: 1, substitute: false }],
        sourceRoomId: "room-other",
        lastActivityAt: new Date(),
      },
      {
        id: nextOperatingDayPartyId,
        recruitDate: nextOperatingDate,
        recruitNumber: 93,
        type: "FLEX_RANK",
        status: "IN_PROGRESS",
        title: "이전 운영일 파티",
        maximumMembers: 5,
        membersJson: [{ name: "이전 운영일 참가자", position: "SUP", slotNo: 1, substitute: false }],
        sourceRoomId: "room-contract",
        lastActivityAt: new Date(),
      },
      {
        id: draftPartyId,
        recruitDate: operatingDate,
        recruitNumber: 80,
        type: "PARTY_NUMBER",
        status: "DRAFT",
        title: "비공개 파티 초안",
        maximumMembers: 5,
        membersJson: [],
        sourceRoomId: "room-contract",
        lastActivityAt: new Date(),
      },
    ]);
    await database.insert(scrimRecruits).values([
      {
        id: scrimId,
        recruitDate: operatingDate,
        scrimNumber: 81,
        legacyTournamentNumber: 1,
        requesterTeamName: "현재 운영일 팀",
        status: "RECRUITING",
        sourceRoomId: "room-contract",
      },
      {
        id: foreignScrimId,
        recruitDate: operatingDate,
        scrimNumber: 83,
        legacyTournamentNumber: 1,
        requesterTeamName: "다른 방 팀",
        status: "RECRUITING",
        sourceRoomId: "room-other",
      },
      {
        id: nextOperatingDayScrimId,
        recruitDate: nextOperatingDate,
        scrimNumber: 82,
        legacyTournamentNumber: 1,
        requesterTeamName: "다음 운영일 팀",
        status: "MATCHED",
        sourceRoomId: "room-contract",
      },
      {
        id: draftScrimId,
        recruitDate: operatingDate,
        scrimNumber: 80,
        requesterTeamName: null,
        status: "RECRUITING",
        isDraft: true,
        sourceRoomId: "room-contract",
      },
    ]);
    const assistant = new PostgresKakaoAssistant(database);
    const searchInput = {
      actorPrincipalId: principalId,
      intent: intent("nonce-search-0001", "search-one"),
      requestKey: "search-request-key",
      scope: "BOT:KAKAO:SEARCH_PLAYER",
      query: `Kakao${suffix}`,
    };
    const first = await assistant.searchPlayers(searchInput);
    assert.equal(first.replayed, false);
    assert.equal(first.body.items.length, 1);
    assert.deepEqual(Object.keys(first.body.items[0]!).sort(), ["displayName", "mainPosition", "playerId", "riotId", "tier"]);
    assert.equal(JSON.stringify(first.body).includes("비공개"), false);
    assert.equal((await assistant.searchPlayers(searchInput)).replayed, true);

    await assert.rejects(assistant.getOpenChatStatus({
      actorPrincipalId: principalId,
      intent: searchInput.intent,
      requestKey: "different-key",
      scope: "BOT:KAKAO:OPENCHAT:STATUS",
    }), (error) => error instanceof KakaoAssistantError && error.code === "NONCE_CONFLICT");
    await assert.rejects(assistant.searchPlayers({
      ...searchInput,
      intent: intent("nonce-search-0002", "different-body"),
      query: "different",
    }), (error) => error instanceof KakaoAssistantError && error.code === "IDEMPOTENCY_MISMATCH");

    const status = await assistant.getOpenChatStatus({
      actorPrincipalId: principalId,
      intent: intent("nonce-status-0001", "status"),
      requestKey: "status-request-key",
      scope: "BOT:KAKAO:OPENCHAT:STATUS",
      now: statusBeforeBoundary,
    });
    const ownParty = status.body.parties.find((party) => party.id === partyId);
    assert.ok(ownParty);
    assert.equal(ownParty.memberCount, 1);
    assert.equal(ownParty.members.length, 1);
    assert.equal(ownParty.members[0]?.name, "같은 방 참가자");
    // Recruit numbers are reserved globally per operating day/reset sequence,
    // even though room listings remain isolated, so foreign room #92 makes #93 next.
    assert.equal(status.body.nextPartyRecruitNumber, 93);
    assert.equal(status.body.parties.some((party) => party.id === foreignPartyId), false);
    assert.equal(status.body.parties.some((party) => party.id === nextOperatingDayPartyId), false);
    assert.equal(status.body.parties.some((party) => party.id === draftPartyId), false);
    assert.equal(status.body.scrims.some((scrim) => scrim.id === scrimId), true);
    assert.equal(status.body.scrims.some((scrim) => scrim.id === foreignScrimId), false);
    assert.equal(status.body.scrims.some((scrim) => scrim.id === nextOperatingDayScrimId), false);
    assert.equal(status.body.scrims.some((scrim) => scrim.id === draftScrimId), false);
    assert.equal(status.body.nextScrimNumber, 84);
    assert.equal(JSON.stringify(status.body).includes("다른 방 비공개"), false);
    assert.equal(JSON.stringify(status.body).includes("이전 운영일 참가자"), false);

    const nextStatus = await assistant.getOpenChatStatus({
      actorPrincipalId: principalId,
      intent: intent("nonce-status-0002", "status-after-boundary"),
      requestKey: "status-after-boundary-key",
      scope: "BOT:KAKAO:OPENCHAT:STATUS",
      now: statusAfterBoundary,
    });
    assert.equal(nextStatus.body.parties.some((party) => party.id === partyId), false);
    assert.equal(nextStatus.body.parties.some((party) => party.id === nextOperatingDayPartyId), true);
    assert.equal(nextStatus.body.nextPartyRecruitNumber, 94);
    assert.equal(nextStatus.body.scrims.some((scrim) => scrim.id === scrimId), false);
    assert.equal(nextStatus.body.scrims.some((scrim) => scrim.id === nextOperatingDayScrimId), true);
    assert.equal(nextStatus.body.nextScrimNumber, 83);

    const postMutationEventId = "event-post-mutation-status-0001";
    const postMutationIntent = intent("nonce-post-mutation-status-01", "post-mutation-status");
    const mutationReceiptId = randomUUID();
    await database.insert(recruitingCommandReceipts).values({
      id: mutationReceiptId,
      actorPrincipalId: principalId,
      scope: KAKAO_V4_EVENT_SCOPE,
      keyHash: hashKakaoV4EventId(postMutationEventId),
      requestHash: kakaoV4EventRequestFingerprint({ principalId, bodyDigestHex: postMutationIntent.bodyDigestHex }),
      bodyDigestHex: postMutationIntent.bodyDigestHex,
      responseStatus: 200,
      responseJson: { aggregateKind: "PARTY", aggregateId: partyId, status: "IN_PROGRESS" },
      responseRevision: 1,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const postMutationStatus = await assistant.getOpenChatStatus({
      actorPrincipalId: principalId,
      intent: postMutationIntent,
      requestKey: postMutationEventId,
      scope: KAKAO_V4_EVENT_SCOPE,
      projection: "PARTY",
      now: statusBeforeBoundary,
      afterMutation: true,
    });
    assert.equal(postMutationStatus.body.parties.some((party) => party.id === partyId), true);
    assert.equal(postMutationStatus.replayed, false);
    const preservedMutationReceipt = (await database.select().from(recruitingCommandReceipts)
      .where(eq(recruitingCommandReceipts.id, mutationReceiptId)).limit(1))[0];
    assert.equal(preservedMutationReceipt?.responseRevision, 1);

    let createdActiveSeasonId: string | null = null;
    let activeSeason = (await database.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, "ACTIVE")).limit(1))[0];
    if (!activeSeason) {
      const id = randomUUID();
      await database.insert(seasons).values({
        id,
        name: `Kakao assistant ${suffix}`,
        nameNormalized: `kakao assistant ${suffix}`,
        status: "ACTIVE",
        activatedAt: new Date(),
      });
      activeSeason = { id };
      createdActiveSeasonId = id;
    }
    const noticeNow = new Date();
    const today = recruitingOperatingDateKey(noticeNow);
    await database.insert(seasonApplications).values({
      id: randomUUID(), seasonId: activeSeason.id, playerId, applyDate: today,
      recruitNo: 17, mainPosition: "MID", status: "APPLIED", source: "SITE",
    });
    const notice = await assistant.getScheduledNotice({
      actorPrincipalId: principalId,
      intent: intent("nonce-notice-0001", "notice"),
      requestKey: "notice-request-key",
      scope: "BOT:KAKAO:SCHEDULED_NOTICE",
      slot: "21",
      now: noticeNow,
    });
    assert.equal(notice.body.positionCounts.MID >= 1, true);
    assert.equal(notice.body.remaining, Math.max(10 - notice.body.total, 0));
    assert.equal(JSON.stringify(notice.body).includes("비공개"), false);

    assert.equal((await database.select().from(recruitingCommandReceipts).where(eq(recruitingCommandReceipts.actorPrincipalId, principalId))).length, 5);
    assert.equal((await database.select().from(recruitingNonceBindings).where(and(
      eq(recruitingNonceBindings.actorKind, "BOT"), eq(recruitingNonceBindings.actorPrincipalId, principalId),
    ))).length, 4);
    if (createdActiveSeasonId) {
      await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, createdActiveSeasonId));
    }
  } finally {
    await pool.end();
  }
});

test("in-house round metadata persists schedule and notice, clears on full snapshot, and isolates authoritative mode transitions by room", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const reviewerId = randomUUID();
  const sitePlayerId = randomUUID();
  const kakaoPlayerId = randomUUID();
  const reservePlayerId = randomUUID();
  const confirmedPlayerId = randomUUID();
  const roomA = `room-metadata-a-${suffix}`;
  const roomB = `room-metadata-b-${suffix}`;
  const assistant = new PostgresKakaoAssistant(database);
  let sequence = 0;
  const sync = (input: Readonly<{
    room: string;
    mode: "RIFT" | "ARAM" | "AUGMENT_ARAM";
    name: string;
    time: string;
    notice: string | null;
  }>) => {
    sequence += 1;
    return assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-meta-${suffix}-${String(sequence).padStart(4, "0")}`, `metadata-${suffix}-${sequence}`, input.room),
      requestKey: `metadata-${suffix}-${sequence}`,
      scope: "kakao:season-applications:sync",
      command: {
        action: "SYNC",
        seasonId,
        applyDate: today,
        recruitNo: 61,
        mode: input.mode,
        roundMetadata: {
          capacity: 10,
          startTimeText: input.time,
          scheduledStartAt: new Date(`${today}T${input.time}:00+09:00`).toISOString(),
          noticeText: input.notice,
        },
        participants: [{
          slotNo: 1,
          name: input.name,
          riotId: null,
          mainPosition: "ALL",
          subPositions: [],
          reserve: false,
        }],
      },
      requestId: randomUUID(),
      now,
    });
  };
  const status = (room: string) => {
    sequence += 1;
    return assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-status-${suffix}-${String(sequence).padStart(4, "0")}`, `status-${suffix}-${sequence}`, room),
      requestKey: `status-${suffix}-${sequence}`,
      scope: "kakao:season-applications:status",
      command: { action: "STATUS", seasonId, applyDate: today, recruitNo: 61, participants: [] },
      requestId: randomUUID(),
      now,
    });
  };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({
      id: reviewerId,
      loginId: `metadata-reviewer-${suffix}`,
      loginIdNormalized: `metadata-reviewer-${suffix}`,
      role: "ADMIN",
      status: "APPROVED",
    });
    await database.insert(seasons).values({
      id: seasonId,
      name: `Round metadata ${suffix}`,
      nameNormalized: `round metadata ${suffix}`,
      status: "ACTIVE",
      activatedAt: now,
    });
    await database.insert(players).values([
      {
        id: sitePlayerId,
        memberName: `사이트-${suffix}`,
        memberNameNormalized: `사이트-${suffix}`,
        nickname: `Site${suffix}`,
        nicknameNormalized: `site${suffix}`,
        tagLine: "KR1",
        tagLineNormalized: "kr1",
      },
      {
        id: kakaoPlayerId,
        memberName: `방A-${suffix}`,
        memberNameNormalized: `방a-${suffix}`,
        nickname: `RoomA${suffix}`,
        nicknameNormalized: `rooma${suffix}`,
        tagLine: "KR1",
        tagLineNormalized: "kr1",
      },
      {
        id: reservePlayerId,
        memberName: `예비-${suffix}`,
        memberNameNormalized: `예비-${suffix}`,
        nickname: `Reserve${suffix}`,
        nicknameNormalized: `reserve${suffix}`,
        tagLine: "KR1",
        tagLineNormalized: "kr1",
      },
      {
        id: confirmedPlayerId,
        memberName: `확정-${suffix}`,
        memberNameNormalized: `확정-${suffix}`,
        nickname: `Confirmed${suffix}`,
        nicknameNormalized: `confirmed${suffix}`,
        tagLine: "KR1",
        tagLineNormalized: "kr1",
      },
    ]);
    await database.insert(seasonApplications).values({
      id: randomUUID(), seasonId, playerId: sitePlayerId, applyDate: today, recruitNo: 61,
      sourceSlotNo: 2, mainPosition: "MID", status: "APPLIED", source: "SITE", createdAt: now, updatedAt: now,
    });

    const reserveRound = (action: "RESERVE" | "SYNC" | "STATUS", organizerText: string | null) => {
      sequence += 1;
      return assistant.syncSeasonSnapshot({
        actorPrincipalId: principalId,
        intent: intent(`nonce-draft-${suffix}-${String(sequence).padStart(4, "0")}`, `draft-${suffix}-${sequence}`, roomA),
        requestKey: `draft-${suffix}-${sequence}`,
        scope: "kakao:season-applications:draft-regression",
        command: action === "STATUS"
          ? { action, seasonId, applyDate: today, recruitNo: 62, participants: [] }
          : {
              action, seasonId, applyDate: today, recruitNo: 62, mode: "RIFT",
              roundMetadata: {
                capacity: 10, startTimeText: "21:00", scheduledStartAt: new Date(`${today}T21:00:00+09:00`).toISOString(),
                gameInfo: null, organizerText, noticeText: null,
              },
              participants: [],
              ...(action === "SYNC" ? { preserveSlotNos: Array.from({ length: 10 }, (_, index) => index + 1) } : {}),
            },
        requestId: randomUUID(),
        now,
      });
    };
    const reserved = await reserveRound("RESERVE", null);
    assert.equal(reserved.body.recruitNo, 62);
    assert.equal(reserved.body.roundMetadata?.recruitNo, 62);
    const hiddenDraft = await reserveRound("STATUS", null);
    assert.equal(hiddenDraft.body.roundMetadata?.status, "DRAFT", "a draft can be reopened in detail");
    assert.doesNotMatch(v1StrictSeasonReply(hiddenDraft.body, "STATUS"), /#62/u);
    const activatedDraft = await reserveRound("SYNC", "재현");
    assert.equal(activatedDraft.body.roundMetadata?.organizerText, "재현");
    assert.equal(activatedDraft.body.pendingCount, 1);
    assert.deepEqual(activatedDraft.body.entries.map((entry) => ({ slotNo: entry.slotNo, name: entry.suppliedName })), [
      { slotNo: 1, name: "재현" },
    ]);
    assert.match(activatedDraft.body.v1StrictLegacyReply ?? "", /1\. 재현/u);
    const activatedStatus = await reserveRound("STATUS", null);
    assert.equal(activatedStatus.body.roundMetadata?.recruitNo, 62);
    assert.equal(activatedStatus.body.roundMetadata?.organizerText, "재현");
    assert.match(activatedStatus.body.v1StrictLegacyReply ?? "", /^1\. 재현$/mu);
    assert.match(activatedStatus.body.v1StrictLegacyReply ?? "", /\[내전 #62\] 1\/10명/u);
    sequence += 1;
    const quickReserve = await assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-draft-${suffix}-${String(sequence).padStart(4, "0")}`, `reserve-add-${suffix}`, roomA),
      requestKey: `reserve-add-${suffix}`,
      scope: "kakao:season-applications:draft-regression",
      command: {
        action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 62,
        name: `예비-${suffix}`, mainPosition: "MID", subPositions: ["ADC"], reserve: true, participants: [],
      },
      requestId: randomUUID(),
      now,
    });
    const quickReserveEntry = quickReserve.body.entries.find((entry) => entry.suppliedName === `예비-${suffix}`);
    assert.equal(quickReserveEntry?.reserve, true);
    assert.equal(quickReserveEntry?.slotNo, 11);
    assert.equal(quickReserveEntry?.mainPosition, "MID");
    assert.deepEqual(quickReserveEntry?.subPositions, ["ADC"]);
    sequence += 1;
    const quickReserveRemoved = await assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-draft-${suffix}-${String(sequence).padStart(4, "0")}`, `reserve-remove-${suffix}`, roomA),
      requestKey: `reserve-remove-${suffix}`,
      scope: "kakao:season-applications:draft-regression",
      command: { action: "REMOVE_PARTICIPANT", seasonId, applyDate: today, recruitNo: 62, name: `예비-${suffix}`, participants: [] },
      requestId: randomUUID(),
      now,
    });
    assert.equal(quickReserveRemoved.body.entries.some((entry) => entry.suppliedName === `예비-${suffix}`), false);
    sequence += 1;
    const removedOrganizer = await assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-draft-${suffix}-${String(sequence).padStart(4, "0")}`, `draft-${suffix}-${sequence}`, roomA),
      requestKey: `draft-${suffix}-${sequence}`,
      scope: "kakao:season-applications:draft-regression",
      command: { action: "REMOVE_PARTICIPANT", seasonId, applyDate: today, recruitNo: 62, name: "재현", participants: [] },
      requestId: randomUUID(),
      now,
    });
    assert.equal(removedOrganizer.body.entries.length, 0);
    const metadataResubmission = await reserveRound("SYNC", "재현");
    assert.equal(metadataResubmission.body.entries.length, 0, "active metadata edits must not reinsert a removed organizer");

    const first = await sync({ room: roomA, mode: "RIFT", name: `방A-${suffix}`, time: "20:00", notice: "승리팀 랜덤 1인 스킨 증정" });
    assert.equal(first.body.metadataUpdated, true);
    assert.match(first.body.v1StrictLegacyReply ?? "", /신청 저장/u);
    assert.deepEqual(first.body.roundMetadata, {
      recruitNo: 61,
      mode: "RIFT",
      capacity: 10,
      startTimeText: "20:00",
      scheduledStartAt: new Date(`${today}T20:00:00+09:00`).toISOString(),
      gameInfo: null,
      organizerText: null,
      noticeText: "승리팀 랜덤 1인 스킨 증정",
      revision: 0,
      status: "IN_PROGRESS",
    });

    const metadataOnly = await sync({ room: roomA, mode: "RIFT", name: `방A-${suffix}`, time: "19:30", notice: "공지 변경" });
    assert.equal(metadataOnly.body.createdCount, 0);
    assert.equal(metadataOnly.body.updatedCount, 0);
    assert.equal(metadataOnly.body.metadataUpdated, true);
    assert.match(metadataOnly.body.v1StrictLegacyReply ?? "", /내전 #61 정보 저장/u);
    assert.match(metadataOnly.body.v1StrictLegacyReply ?? "", /시작: 19:30/u);

    const cleared = await sync({ room: roomA, mode: "RIFT", name: `방A-${suffix}`, time: "19:30", notice: null });
    assert.equal(cleared.body.metadataUpdated, true);
    assert.equal(cleared.body.roundMetadata?.noticeText, null);
    assert.doesNotMatch(cleared.body.v1StrictLegacyReply ?? "", /》공지:/u);

    const roomBResult = await sync({ room: roomB, mode: "RIFT", name: `방B-${suffix}`, time: "18:00", notice: "다른 방 공지" });
    assert.equal(roomBResult.body.roundMetadata?.startTimeText, "18:00");
    await database.insert(seasonApplications).values({
      id: randomUUID(), seasonId, playerId: reservePlayerId, applyDate: today, recruitNo: 61,
      sourceSlotNo: 3, mainPosition: "ALL", status: "RESERVE", source: "KAKAO",
      sourceReferenceHash: randomBytes(32), sourceRoomIdHash: createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${roomA}`).digest(),
      sourceMode: "RIFT", reviewedByUserAccountId: reviewerId, reviewedAt: now, createdAt: now, updatedAt: now,
    });
    const transitioned = await sync({ room: roomA, mode: "ARAM", name: `방A-${suffix}`, time: "20:30", notice: "칼바람 공지" });
    assert.equal(transitioned.body.mode, "ARAM");
    assert.equal(transitioned.body.cancelledCount >= 2, true);

    const metadataRows = await database.select().from(seasonInhouseRounds).where(and(
      eq(seasonInhouseRounds.seasonId, seasonId),
      eq(seasonInhouseRounds.applyDate, today),
      eq(seasonInhouseRounds.recruitNo, 61),
    ));
    assert.deepEqual(metadataRows.map((row) => `${row.mode}:${row.startTimeText}`).sort(), ["ARAM:20:30", "RIFT:18:00"]);
    const transitionedApplication = (await database.select().from(seasonApplications).where(and(
      eq(seasonApplications.seasonId, seasonId),
      eq(seasonApplications.playerId, kakaoPlayerId),
      eq(seasonApplications.recruitNo, 61),
    )))[0];
    assert.equal(transitionedApplication?.status, "APPLIED");
    assert.equal(transitionedApplication?.sourceMode, "ARAM");
    const transitionedReserve = (await database.select().from(seasonApplications).where(and(
      eq(seasonApplications.seasonId, seasonId),
      eq(seasonApplications.playerId, reservePlayerId),
      eq(seasonApplications.recruitNo, 61),
    )))[0];
    assert.equal(transitionedReserve?.status, "CANCELLED");

    await database.insert(seasonApplications).values({
      id: randomUUID(), seasonId, playerId: confirmedPlayerId, applyDate: today, recruitNo: 61,
      sourceSlotNo: 4, mainPosition: "ALL", status: "CONFIRMED", source: "KAKAO",
      sourceReferenceHash: randomBytes(32), sourceRoomIdHash: createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${roomA}`).digest(),
      sourceMode: "ARAM", reviewedByUserAccountId: reviewerId, reviewedAt: now, createdAt: now, updatedAt: now,
    });
    await assert.rejects(
      sync({ room: roomA, mode: "RIFT", name: `방A-${suffix}`, time: "17:00", notice: "거절되어야 하는 공지" }),
      (error) => error instanceof KakaoAssistantError && error.code === "INVALID_STATE",
    );
    const afterRejectedTransition = await database.select().from(seasonInhouseRounds).where(and(
      eq(seasonInhouseRounds.seasonId, seasonId),
      eq(seasonInhouseRounds.applyDate, today),
      eq(seasonInhouseRounds.recruitNo, 61),
      eq(seasonInhouseRounds.sourceRoomIdHash, createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${roomA}`).digest()),
    ));
    assert.deepEqual(afterRejectedTransition.map((row) => `${row.mode}:${row.startTimeText}:${row.noticeText}`), ["ARAM:20:30:칼바람 공지"]);
    const afterRejectedApplications = await database.select().from(seasonApplications).where(and(
      eq(seasonApplications.seasonId, seasonId),
      eq(seasonApplications.recruitNo, 61),
    ));
    assert.equal(afterRejectedApplications.find((row) => row.playerId === kakaoPlayerId)?.status, "APPLIED");
    assert.equal(afterRejectedApplications.find((row) => row.playerId === kakaoPlayerId)?.sourceMode, "ARAM");
    assert.equal(afterRejectedApplications.find((row) => row.playerId === confirmedPlayerId)?.status, "CONFIRMED");

    const roomAStatus = await status(roomA);
    assert.match(roomAStatus.body.legacyReply ?? "", /》모드: 칼바람/u);
    assert.match(roomAStatus.body.legacyReply ?? "", /》시작: 20:30/u);
    assert.match(roomAStatus.body.legacyReply ?? "", /칼바람 공지/u);
    assert.match(roomAStatus.body.legacyReply ?? "", /전체 복사 → 빈칸에 이름 → 전체 전송/u);
    assert.match(roomAStatus.body.legacyReply ?? "", new RegExp(`^1\\. 방A-${suffix}$`, "mu"));
    assert.match(roomAStatus.body.legacyReply ?? "", new RegExp(`사이트-${suffix}`, "u"));
    assert.doesNotMatch(roomAStatus.body.legacyReply ?? "", new RegExp(`방B-${suffix}`, "u"));
    const roomBStatus = await status(roomB);
    assert.match(roomBStatus.body.legacyReply ?? "", /》시작: 18:00/u);
    assert.match(roomBStatus.body.legacyReply ?? "", /다른 방 공지/u);
    assert.doesNotMatch(roomBStatus.body.legacyReply ?? "", new RegExp(`방A-${suffix}`, "u"));
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("authoritative Kakao season sync withdraws only same-room same-round RIFT rows and replays without writes", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const exactPlayerId = randomUUID();
  const sitePlayerId = randomUUID();
  const confirmedPlayerId = randomUUID();
  const reviewerId = randomUUID();
  const roomA = `room-authoritative-a-${suffix}`;
  const roomB = `room-authoritative-b-${suffix}`;
  const roomAHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${roomA}`).digest();
  const sync = (input: { room: string; round: number; body: string; nonce: string; key: string; participants: readonly ({ slotNo: number; name: string; riotId: string | null; mainPosition: "MID" | "TOP"; subPositions: readonly ("SUP" | "MID")[]; reserve: boolean })[] }) =>
    new PostgresKakaoAssistant(database).syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(input.nonce, input.body, input.room),
      requestKey: input.key,
      scope: "kakao:season-applications:sync",
      command: { action: "SYNC", seasonId, applyDate: today, recruitNo: input.round, mode: "RIFT", participants: input.participants },
      requestId: randomUUID(),
      now,
    });
  const exact = { slotNo: 1, name: `정확-${suffix}`, riotId: `Exact${suffix}#KR1`, mainPosition: "MID" as const, subPositions: ["SUP" as const], reserve: false };
  const pending = { slotNo: 2, name: `확인-${suffix}`, riotId: null, mainPosition: "TOP" as const, subPositions: ["MID" as const], reserve: false };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: reviewerId, loginId: `reviewer-${suffix}`, loginIdNormalized: `reviewer-${suffix}`, role: "ADMIN", status: "APPROVED" });
    await database.insert(seasons).values({ id: seasonId, name: `Authoritative ${suffix}`, nameNormalized: `authoritative ${suffix}`, status: "ACTIVE", activatedAt: now });
    await database.insert(players).values([
      { id: exactPlayerId, memberName: `정확-${suffix}`, memberNameNormalized: `정확-${suffix}`, nickname: `Exact${suffix}`, nicknameNormalized: `exact${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: sitePlayerId, memberName: `사이트-${suffix}`, memberNameNormalized: `사이트-${suffix}`, nickname: `Site${suffix}`, nicknameNormalized: `site${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: confirmedPlayerId, memberName: `확정-${suffix}`, memberNameNormalized: `확정-${suffix}`, nickname: `Confirmed${suffix}`, nicknameNormalized: `confirmed${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
    ]);
    await database.insert(seasonApplications).values([
      { id: randomUUID(), seasonId, playerId: sitePlayerId, applyDate: today, recruitNo: 41, sourceSlotNo: 2, mainPosition: "TOP", status: "APPLIED", source: "SITE", createdAt: now, updatedAt: now },
      { id: randomUUID(), seasonId, playerId: confirmedPlayerId, applyDate: today, recruitNo: 41, sourceSlotNo: 8, mainPosition: "MID", status: "CONFIRMED", source: "KAKAO", sourceReferenceHash: randomBytes(32), sourceRoomIdHash: roomAHash, sourceMode: "RIFT", reviewedByUserAccountId: reviewerId, reviewedAt: now, createdAt: now, updatedAt: now },
    ]);

    await sync({ room: roomB, round: 41, body: "room-b", nonce: "nonce-room-b-sync-0001", key: `room-b-${suffix}`, participants: [{ ...pending, slotNo: 1, name: `다른방-${suffix}` }] });
    await sync({ room: roomA, round: 42, body: "round-42", nonce: "nonce-round-42-sync-01", key: `round-42-${suffix}`, participants: [{ ...pending, slotNo: 1, name: `다른회차-${suffix}` }] });

    const firstInput = { room: roomA, round: 41, body: "two-members", nonce: "nonce-two-member-0001", key: `two-${suffix}`, participants: [exact, pending] } as const;
    const first = await sync(firstInput);
    assert.deepEqual({ created: first.body.createdCount, updated: first.body.updatedCount, cancelled: first.body.cancelledCount, pending: first.body.pendingCount }, { created: 2, updated: 0, cancelled: 0, pending: 1 });
    const beforeReplay = await database.select({ id: seasonApplications.id, revision: seasonApplications.revision }).from(seasonApplications).where(eq(seasonApplications.seasonId, seasonId));
    const replay = await sync(firstInput);
    assert.equal(replay.replayed, true);
    assert.deepEqual(await database.select({ id: seasonApplications.id, revision: seasonApplications.revision }).from(seasonApplications).where(eq(seasonApplications.seasonId, seasonId)), beforeReplay);

    const one = await sync({ room: roomA, round: 41, body: "one-member", nonce: "nonce-one-member-0001", key: `one-${suffix}`, participants: [exact] });
    assert.equal(one.body.cancelledCount, 1);
    assert.equal(one.body.pendingCount, 0);

    const restored = await sync({ room: roomA, round: 41, body: "two-members-restored", nonce: "nonce-two-restored-01", key: `restore-${suffix}`, participants: [exact, pending] });
    assert.equal(restored.body.updatedCount, 1);
    assert.equal(restored.body.pendingCount, 1);

    const emptied = await sync({ room: roomA, round: 41, body: "zero-members", nonce: "nonce-zero-member-001", key: `zero-${suffix}`, participants: [] });
    assert.equal(emptied.body.cancelledCount, 2);
    assert.equal(emptied.body.pendingCount, 0);
    assert.equal(emptied.body.entries.some((entry) => entry.source === "SITE" && entry.player?.playerId === sitePlayerId), true);
    assert.equal(emptied.body.entries.some((entry) => entry.status === "CONFIRMED" && entry.player?.playerId === confirmedPlayerId), true);

    const allPending = await database.select().from(seasonKakaoPendingApplications).where(eq(seasonKakaoPendingApplications.seasonId, seasonId));
    assert.equal(allPending.length, 3);
    assert.equal(allPending.some((row) => row.recruitNo === 41 && row.suppliedName === `확인-${suffix}` && row.status === "CANCELLED"), true);
    assert.equal(allPending.some((row) => row.recruitNo === 41 && row.suppliedName === `다른방-${suffix}` && row.status === "ACTIVE"), true);
    assert.equal(allPending.some((row) => row.recruitNo === 42 && row.suppliedName === `다른회차-${suffix}` && row.status === "ACTIVE"), true);
    const syncedAudits = await database.select().from(auditEvents).where(and(eq(auditEvents.targetType, "SEASON_RECRUIT_ROUND"), eq(auditEvents.action, "KAKAO_SEASON_SNAPSHOT_SYNCED")));
    assert.equal(syncedAudits.some((event) => event.targetId.includes(roomAHash.toString("hex")) && event.metadataJson?.cancelledCount === 2), true);
    assert.equal(JSON.stringify(syncedAudits).includes(roomA), false);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("signed Kakao season snapshots match exact players and preserve unresolved entries for review", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const exactPlayerId = randomUUID();
  const sitePlayerId = randomUUID();
  try {
    await applyMigrations(database);
    await database.insert(seasons).values({
      id: seasonId, name: `Kakao snapshot ${suffix}`, nameNormalized: `kakao snapshot ${suffix}`,
      status: "ACTIVE", activatedAt: now,
    });
    await database.insert(players).values([
      { id: exactPlayerId, memberName: `정확-${suffix}`, memberNameNormalized: `정확-${suffix}`, nickname: `Exact${suffix}`, nicknameNormalized: `exact${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: randomUUID(), memberName: `동명이-${suffix}`, memberNameNormalized: `동명이-${suffix}`, nickname: `TwinA${suffix}`, nicknameNormalized: `twina${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: randomUUID(), memberName: `동명이-${suffix}`, memberNameNormalized: `동명이-${suffix}`, nickname: `TwinB${suffix}`, nicknameNormalized: `twinb${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1" },
      { id: sitePlayerId, memberName: `사이트-${suffix}`, memberNameNormalized: `사이트-${suffix}`, nickname: `Site${suffix}`, nicknameNormalized: `site${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1", currentTier: "DIAMOND", peakTier: "MASTER" },
    ]);
    const assistant = new PostgresKakaoAssistant(database);
    const command = {
      action: "SYNC" as const, seasonId, applyDate: today, recruitNo: 7, mode: "RIFT" as const,
      reserveSectionObserved: true,
      participants: [
        { slotNo: 1, name: `정확-${suffix}`, riotId: `Exact${suffix}#KR1`, mainPosition: "MID" as const, subPositions: ["SUP" as const], reserve: false },
        { slotNo: 2, name: `없는-${suffix}`, riotId: null, mainPosition: "TOP" as const, subPositions: [], reserve: false },
        { slotNo: 3, name: `동명이-${suffix}`, riotId: null, mainPosition: "JGL" as const, subPositions: [], reserve: false },
        { slotNo: 4, name: `정확-${suffix}`, riotId: `Exact${suffix}#KR1`, mainPosition: "ADC" as const, subPositions: [], reserve: true },
      ],
    };
    const firstInput = {
      actorPrincipalId: principalId,
      intent: intent("nonce-season-sync-0001", "season-sync-one"),
      requestKey: `season-sync-${suffix}`,
      scope: "kakao:season-applications:sync",
      command,
      requestId: randomUUID(),
      now,
    };
    const first = await assistant.syncSeasonSnapshot(firstInput);
    assert.equal("legacyReply" in first.body, false);
    assert.equal(first.body.appliedCount, 1);
    assert.equal(first.body.reserveCount, 1);
    assert.equal(first.body.confirmedCount, 0);
    assert.equal(first.body.pendingCount, 2);
    assert.deepEqual(first.body.entries.map((entry) => entry.status), ["APPLIED", "UNMATCHED", "AMBIGUOUS", "MATCHED_RESERVE"]);
    assert.deepEqual(first.body.entries[0], {
      slotNo: 1,
      status: "APPLIED",
      source: "KAKAO",
      suppliedName: `정확-${suffix}`,
      suppliedRiotId: `Exact${suffix}#KR1`,
      mainPosition: "MID",
      subPositions: ["SUP"],
      reserve: false,
      player: { playerId: exactPlayerId, displayName: `Exact${suffix}`, riotId: `Exact${suffix}#KR1`, memberName: `정확-${suffix}` },
    });
    assert.equal((await assistant.syncSeasonSnapshot(firstInput)).replayed, true);
    const stored = (await database.select().from(seasonApplications).where(and(
      eq(seasonApplications.seasonId, seasonId), eq(seasonApplications.playerId, exactPlayerId),
    )))[0];
    assert.equal(stored?.source, "KAKAO");
    assert.equal(stored?.sourceSlotNo, 1);
    assert.equal((await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.status, "ACTIVE"),
    ))).length, 3);

    await database.insert(seasonApplications).values({
      id: randomUUID(), seasonId, playerId: sitePlayerId, applyDate: today, recruitNo: 8,
      mainPosition: "TOP", subPositions: ["ADC"], status: "APPLIED", source: "SITE", createdAt: now, updatedAt: now,
    });
    const allRoundsInput = {
      actorPrincipalId: principalId,
      intent: intent("nonce-season-status-all-0001", "season-status-all"),
      requestKey: `season-status-all-${suffix}`,
      scope: "kakao:season-applications:status",
      command: { action: "STATUS", seasonId, applyDate: today, recruitNo: null, participants: [] },
      requestId: randomUUID(),
      now,
    } as const;
    const allRounds = await assistant.syncSeasonSnapshot(allRoundsInput);
    const [year, month, day] = today.split("-").map(Number);
    assert.equal(allRounds.body.recruitNo, null);
    assert.deepEqual(allRounds.body.availableRecruitNos, [7, 8]);
    assert.equal(allRounds.body.entries.length, 0);
    assert.equal(allRounds.body.appliedCount, 2);
    assert.equal(allRounds.body.reserveCount, 1);
    assert.equal(allRounds.body.pendingCount, 2);
    assert.equal(allRounds.body.legacyReply, [
      "[K-LOL.GG 내전현황]",
      "🔎 전체 명단: 내전상세 번호",
      "",
      `#7 ${year}-${month}-${day} 미정 시작 (3/10 / 예비 1)`,
      "└ 내전상세 7",
      `#8 ${year}-${month}-${day} 미정 시작 (1/10)`,
      "└ 내전상세 8",
      "",
      "상세 명령: 내전상세 7 / 내전상세 8",
    ].join("\n"));
    assert.equal((await assistant.syncSeasonSnapshot(allRoundsInput)).replayed, true);

    const siteRound = await assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent("nonce-season-status-one-0001", "season-status-one"),
      requestKey: `season-status-one-${suffix}`,
      scope: "kakao:season-applications:status",
      command: { action: "STATUS", seasonId, applyDate: today, recruitNo: 8, participants: [] },
      requestId: randomUUID(),
      now,
    });
    assert.equal(siteRound.body.entries.length, 1);
    assert.equal(siteRound.body.entries[0]?.source, "SITE");
    assert.equal(siteRound.body.legacyReply, [
      "[내전 #8] 1/10명", "》모드: 협곡", "》시작: 미정", "",
      "전체 복사 → 빈칸에 이름 → 전체 전송", "",
      `1. 사이트-${suffix}`, "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.",
      "", "예비 1.", "", `양식코드: ${siteRound.body.formCode}`,
    ].join("\n"));

    await database.update(seasonApplications).set({
      source: "SITE",
      sourceSlotNo: null,
      sourceReferenceHash: null,
      mainPosition: "TOP",
    }).where(eq(seasonApplications.id, stored!.id));

    const second = await assistant.syncSeasonSnapshot({
      ...firstInput,
      requestKey: `season-sync-second-${suffix}`,
      requestId: randomUUID(),
      intent: intent("nonce-season-sync-0002", "season-sync-two"),
      command: { ...command, participants: [command.participants[0]!] },
    });
    assert.equal(second.body.cancelledCount, 3);
    assert.equal(second.body.entries.length, 1);
    assert.equal(second.body.entries[0]?.source, "SITE");
    assert.equal(second.body.entries[0]?.mainPosition, "TOP");
    assert.equal((await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.status, "CANCELLED"),
    ))).length, 3);

    const terminalRows = await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId),
      eq(seasonKakaoPendingApplications.recruitNo, 7),
    ));
    const formerlyCancelled = terminalRows.find((row) => row.slotNo === 2);
    const formerlyResolved = terminalRows.find((row) => row.slotNo === 3);
    assert.ok(formerlyCancelled && formerlyResolved);
    await database.update(seasonKakaoPendingApplications).set({
      status: "RESOLVED", cancelledAt: null, resolvedAt: new Date(),
    }).where(eq(seasonKakaoPendingApplications.id, formerlyResolved.id));

    const reactivated = await assistant.syncSeasonSnapshot({
      ...firstInput,
      requestKey: `season-sync-reactivate-${suffix}`,
      requestId: randomUUID(),
      intent: intent("nonce-season-sync-0003", "season-sync-reactivate"),
      command: { ...command, participants: [command.participants[1]!, command.participants[2]!] },
    });
    assert.deepEqual(reactivated.body.entries.map((entry) => entry.status), ["APPLIED", "UNMATCHED", "AMBIGUOUS"]);
    assert.deepEqual(reactivated.body.entries.map((entry) => entry.slotNo), [1, 2, 3]);
    assert.equal(reactivated.body.entries[0]?.source, "SITE");
    assert.equal(reactivated.body.entries[0]?.mainPosition, "TOP");
    const activeAgain = await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId),
      eq(seasonKakaoPendingApplications.status, "ACTIVE"),
    ));
    assert.deepEqual(activeAgain.map((row) => row.id).sort(), [formerlyCancelled.id, formerlyResolved.id].sort());
    assert.equal(activeAgain.every((row) => row.cancelledAt === null && row.resolvedAt === null), true);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("recoverable Kakao season rows save valid players, queue review rows, preserve omitted slots, and cancel explicit blanks", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const reviewerId = randomUUID();
  const roomId = `room-recoverable-${suffix}`;
  const roomHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${roomId}`).digest();
  const otherRoomHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0other-${roomId}`).digest();
  const playerIds = Object.fromEntries(["valid", "review", "preserve", "cancel", "site", "confirmed", "foreign", "annotatedApplied", "annotatedReserve"].map((key) => [key, randomUUID()])) as Record<string, string>;
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({
      id: reviewerId,
      loginId: `recoverable-reviewer-${suffix}`,
      loginIdNormalized: `recoverable-reviewer-${suffix}`,
      role: "ADMIN",
      status: "APPROVED",
    });
    await database.insert(seasons).values({
      id: seasonId,
      name: `Kakao recoverable ${suffix}`,
      nameNormalized: `kakao recoverable ${suffix}`,
      status: "ACTIVE",
      activatedAt: now,
    });
    await database.insert(players).values(Object.entries(playerIds).map(([key, id]) => ({
      id,
      memberName: `${key}-${suffix}`,
      memberNameNormalized: `${key}-${suffix}`.toLocaleLowerCase("ko-KR"),
      nickname: `${key}${suffix}`,
      nicknameNormalized: `${key}${suffix}`.toLocaleLowerCase("ko-KR"),
      tagLine: "KR1",
      tagLineNormalized: "kr1",
    })));
    const source = {
      seasonId,
      applyDate: today,
      recruitNo: 19,
      source: "KAKAO" as const,
      sourceReferenceHash: randomBytes(32),
      sourceRoomIdHash: roomHash,
      sourceMode: "RIFT",
      mainPosition: "TOP" as const,
      subPositions: [],
      status: "APPLIED" as const,
      createdAt: now,
      updatedAt: now,
    };
    await database.insert(seasonApplications).values([
      { ...source, id: randomUUID(), playerId: playerIds.preserve!, sourceSlotNo: 3 },
      { ...source, id: randomUUID(), playerId: playerIds.cancel!, sourceSlotNo: 4 },
      { ...source, id: randomUUID(), playerId: playerIds.annotatedApplied!, sourceSlotNo: 9 },
      {
        ...source,
        id: randomUUID(),
        playerId: playerIds.annotatedReserve!,
        sourceSlotNo: 10,
        status: "RESERVE" as const,
        reviewedByUserAccountId: reviewerId,
        reviewedAt: now,
      },
      {
        ...source,
        id: randomUUID(),
        playerId: playerIds.confirmed!,
        sourceSlotNo: 6,
        status: "CONFIRMED" as const,
        reviewedByUserAccountId: reviewerId,
        reviewedAt: now,
      },
      { ...source, id: randomUUID(), playerId: playerIds.foreign!, sourceSlotNo: 7, sourceRoomIdHash: otherRoomHash },
    ]);
    await database.insert(seasonApplications).values({
      ...source,
      id: randomUUID(),
      playerId: playerIds.site!,
      sourceSlotNo: 5,
      source: "SITE",
      sourceReferenceHash: null,
      sourceRoomIdHash: null,
      sourceMode: null,
    });

    const assistant = new PostgresKakaoAssistant(database);
    const result = await assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-recoverable-${suffix}`, `recoverable-${suffix}`, roomId),
      requestKey: `season-recoverable-${suffix}`,
      scope: "kakao:season-applications:sync",
      command: {
        action: "SYNC",
        seasonId,
        applyDate: today,
        recruitNo: 19,
        mode: "RIFT",
        participants: [
          { slotNo: 1, name: `valid-${suffix}`, riotId: null, mainPosition: "MID", subPositions: ["SUP"], reserve: false },
          { slotNo: 2, name: `review-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false, reviewRequired: true },
          { slotNo: 8, name: `valid${suffix}`, riotId: null, mainPosition: "TOP", subPositions: [], reserve: false },
          { slotNo: 9, name: `annotatedApplied-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false, reviewRequired: true },
          { slotNo: 10, name: `annotatedReserve-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: true, reviewRequired: true },
        ],
        preserveSlotNos: [3],
      },
      requestId: randomUUID(),
      now,
    });

    assert.equal(result.body.appliedCount, 4);
    assert.equal(result.body.reserveCount, 1);
    assert.equal(result.body.confirmedCount, 1);
    assert.equal(result.body.pendingCount, 2);
    const storedApplications = await database.select().from(seasonApplications).where(eq(seasonApplications.seasonId, seasonId));
    const statusFor = (key: string) => storedApplications.find((row) => row.playerId === playerIds[key])?.status;
    assert.equal(statusFor("valid"), "APPLIED");
    assert.equal(statusFor("review"), undefined);
    assert.equal(statusFor("preserve"), "APPLIED");
    assert.equal(statusFor("cancel"), "CANCELLED");
    assert.equal(statusFor("site"), "APPLIED");
    assert.equal(statusFor("confirmed"), "CONFIRMED");
    assert.equal(statusFor("foreign"), "APPLIED");
    assert.equal(statusFor("annotatedApplied"), "APPLIED");
    assert.equal(statusFor("annotatedReserve"), "RESERVE");
    const reviewRows = await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId),
      eq(seasonKakaoPendingApplications.status, "ACTIVE"),
    ));
    assert.equal(reviewRows.length, 2);
    const explicitReview = reviewRows.find((row) => row.slotNo === 2);
    const duplicateAlias = reviewRows.find((row) => row.slotNo === 8);
    assert.equal(explicitReview?.suppliedName, `review-${suffix}`);
    assert.equal(explicitReview?.mainPosition, "ALL");
    assert.equal(explicitReview?.matchState, "UNMATCHED");
    assert.equal(duplicateAlias?.suppliedName, `valid${suffix}`);
    assert.equal(duplicateAlias?.matchState, "UNMATCHED");
    assert.equal(reviewRows.some((row) => row.slotNo === 9 || row.slotNo === 10), false);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("in-house shortcuts and full snapshots enforce integrated SITE capacity while preserving confirmed decisions", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const reviewerId = randomUUID();
  const sitePlayerId = randomUUID();
  const confirmedPlayerId = randomUUID();
  const room = `room-integrated-capacity-${suffix}`;
  const roomHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${room}`).digest();
  const referenceHash = randomBytes(32);
  const assistant = new PostgresKakaoAssistant(database);
  let sequence = 0;
  const call = (command: Parameters<PostgresKakaoAssistant["syncSeasonSnapshot"]>[0]["command"]) => {
    sequence += 1;
    return assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId,
      intent: intent(`nonce-integrated-${suffix}-${String(sequence).padStart(4, "0")}`, `integrated-${suffix}-${sequence}`, room),
      requestKey: `integrated-${suffix}-${sequence}`,
      scope: "kakao:season-applications:integrated-capacity",
      command,
      requestId: randomUUID(),
      now,
    });
  };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({
      id: reviewerId, loginId: `capacity-reviewer-${suffix}`, loginIdNormalized: `capacity-reviewer-${suffix}`,
      role: "ADMIN", status: "APPROVED",
    });
    await database.insert(seasons).values({
      id: seasonId, name: `Integrated capacity ${suffix}`, nameNormalized: `integrated capacity ${suffix}`,
      status: "ACTIVE", activatedAt: now,
    });
    await database.insert(players).values([
      {
        id: sitePlayerId, memberName: `사이트-${suffix}`, memberNameNormalized: `사이트-${suffix}`,
        nickname: `Site${suffix}`, nicknameNormalized: `site${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1",
      },
      {
        id: confirmedPlayerId, memberName: `확정-${suffix}`, memberNameNormalized: `확정-${suffix}`,
        nickname: `Confirmed${suffix}`, nicknameNormalized: `confirmed${suffix}`, tagLine: "KR1", tagLineNormalized: "kr1",
      },
    ]);
    await database.insert(seasonInhouseRounds).values([
      {
        id: randomUUID(), seasonId, applyDate: today, recruitNo: 73, sourceRoomIdHash: roomHash,
        mode: "RIFT", status: "IN_PROGRESS", capacity: 3, sourceReferenceHash: referenceHash,
      },
      {
        id: randomUUID(), seasonId, applyDate: today, recruitNo: 74, sourceRoomIdHash: roomHash,
        mode: "RIFT", status: "IN_PROGRESS", capacity: 3, sourceReferenceHash: referenceHash,
      },
    ]);
    await database.insert(seasonApplications).values([
      {
        id: randomUUID(), seasonId, playerId: sitePlayerId, applyDate: today, recruitNo: 73,
        sourceSlotNo: 1, mainPosition: "ALL", status: "APPLIED", source: "SITE",
      },
      {
        id: randomUUID(), seasonId, playerId: confirmedPlayerId, applyDate: today, recruitNo: 73,
        sourceSlotNo: 2, mainPosition: "ALL", status: "CONFIRMED", source: "KAKAO",
        sourceReferenceHash: referenceHash, sourceRoomIdHash: roomHash, sourceMode: "RIFT",
        reviewedByUserAccountId: reviewerId, reviewedAt: now,
      },
      {
        id: randomUUID(), seasonId, playerId: sitePlayerId, applyDate: today, recruitNo: 74,
        sourceSlotNo: 1, mainPosition: "ALL", status: "APPLIED", source: "SITE",
      },
    ]);

    await assert.rejects(call({
      action: "REMOVE_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `확정-${suffix}`, participants: [],
    }), (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED");
    assert.equal((await database.select().from(seasonApplications).where(and(
      eq(seasonApplications.seasonId, seasonId), eq(seasonApplications.playerId, confirmedPlayerId),
      eq(seasonApplications.recruitNo, 73),
    )))[0]?.status, "CONFIRMED");

    const added = await call({
      action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `미확인-${suffix}`, mainPosition: "MID", subPositions: ["TOP", "SUP"], participants: [],
    });
    assert.equal(added.body.pendingCount, 1);
    const addedPending = (await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.recruitNo, 73),
      eq(seasonKakaoPendingApplications.status, "ACTIVE"),
    )))[0];
    assert.equal(addedPending?.slotNo, 3, "quick add skips SITE and confirmed Kakao slots");
    assert.equal(addedPending?.mainPosition, "MID");
    assert.deepEqual(addedPending?.subPositions, ["TOP", "SUP"]);
    const updated = await call({
      action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `미확인-${suffix}`, mainPosition: "ADC", subPositions: ["TOP", "JGL", "MID", "SUP"], participants: [],
    });
    assert.equal(updated.body.createdCount, 0);
    assert.equal(updated.body.updatedCount, 1);
    const updatedPending = (await database.select().from(seasonKakaoPendingApplications).where(
      eq(seasonKakaoPendingApplications.id, addedPending!.id),
    ))[0];
    assert.equal(updatedPending?.slotNo, 3, "a position update preserves the existing slot");
    assert.equal(updatedPending?.mainPosition, "ADC");
    assert.deepEqual(updatedPending?.subPositions, ["TOP", "JGL", "MID", "SUP"]);
    await assert.rejects(call({
      action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `미확인-${suffix}`, participants: [],
    }), (error: unknown) => error instanceof KakaoAssistantError && error.code === "INVALID_INPUT");
    await assert.rejects(call({
      action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `사이트-${suffix}`, mainPosition: "MID", subPositions: ["SUP"], participants: [],
    }), (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED");
    await assert.rejects(call({
      action: "ADD_PARTICIPANT", seasonId, applyDate: today, recruitNo: 73,
      name: `초과-${suffix}`, mainPosition: "ALL", participants: [],
    }), (error: unknown) => error instanceof KakaoAssistantError && error.code === "CONFLICT");

    const synchronized = await call({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 74, mode: "RIFT",
      participants: [
        { slotNo: 1, name: `첫째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
        { slotNo: 2, name: `둘째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
      ],
    });
    assert.deepEqual(synchronized.body.entries.map((entry) => entry.slotNo), [1, 2, 3]);
    assert.deepEqual((await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.recruitNo, 74),
      eq(seasonKakaoPendingApplications.status, "ACTIVE"),
    ))).map((row) => row.slotNo).sort((left, right) => left - right), [2, 3]);
    const pendingBeforeReplay = (await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.recruitNo, 74),
    ))).map((row) => ({ id: row.id, slotNo: row.slotNo, status: row.status, revision: row.revision }))
      .sort((left, right) => left.slotNo - right.slotNo);
    const semanticReplay = await call({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 74, mode: "RIFT",
      participants: [
        { slotNo: 1, name: `첫째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
        { slotNo: 2, name: `둘째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
      ],
    });
    assert.equal(semanticReplay.body.createdCount, 0);
    assert.equal(semanticReplay.body.updatedCount, 0);
    assert.equal(semanticReplay.body.cancelledCount, 0);
    assert.deepEqual((await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.recruitNo, 74),
    ))).map((row) => ({ id: row.id, slotNo: row.slotNo, status: row.status, revision: row.revision }))
      .sort((left, right) => left.slotNo - right.slotNo), pendingBeforeReplay,
    "a semantically identical form is a row-level no-op after SITE slot remapping");
    await assert.rejects(call({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 74, mode: "RIFT",
      participants: [
        { slotNo: 1, name: `첫째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
        { slotNo: 2, name: `둘째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
        { slotNo: 3, name: `셋째-${suffix}`, riotId: null, mainPosition: "ALL", subPositions: [], reserve: false },
      ],
    }), (error: unknown) => error instanceof KakaoAssistantError && error.code === "CONFLICT");
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("in-house finish preserves every roster row, hides the round, and replays without writes", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const assistant = new PostgresKakaoAssistant(database);
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const reviewerId = randomUUID();
  const room = `room-inhouse-finish-${suffix}`;
  const foreignRoom = `room-inhouse-finish-foreign-${suffix}`;
  const roomHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${room}`).digest();
  const foreignRoomHash = createHash("sha256").update(`klol-v2:kakao-season-room:v1\0${foreignRoom}`).digest();
  const targetRoundId = randomUUID();
  const draftRoundId = randomUUID();
  const foreignRoundId = randomUUID();
  const terminalRoundId = randomUUID();
  const playerIds = {
    applied: randomUUID(), reserve: randomUUID(), site: randomUUID(), confirmed: randomUUID(), foreign: randomUUID(),
  };
  const applicationIds = {
    applied: randomUUID(), reserve: randomUUID(), site: randomUUID(), confirmed: randomUUID(), foreign: randomUUID(),
  };
  const pendingIds = { target: randomUUID(), foreign: randomUUID() };
  const finishPrincipalId = `bot:kakao:v4:inhouse-finish-${suffix}`;
  const finishEventId = `event-inhouse-finish-${suffix}`;
  const finishIntent = intent(
    `nonce-inhouse-finish-${suffix}`,
    `inhouse-finish-${suffix}`,
    room,
    `sender-not-creator-${suffix}`,
  );
  const finishRequestId = randomUUID();
  const finishInput: Parameters<PostgresKakaoAssistant["syncSeasonSnapshot"]>[0] = {
    actorPrincipalId: finishPrincipalId,
    intent: finishIntent,
    requestKey: finishEventId,
    scope: KAKAO_V4_EVENT_SCOPE,
    command: { action: "FINISH", seasonId, applyDate: today, recruitNo: 86, participants: [] },
    requestId: finishRequestId,
    now,
  };

  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({
      id: reviewerId, loginId: `inhouse-finish-reviewer-${suffix}`,
      loginIdNormalized: `inhouse-finish-reviewer-${suffix}`, role: "ADMIN", status: "APPROVED",
    });
    await database.insert(seasons).values({
      id: seasonId, name: `Inhouse finish ${suffix}`, nameNormalized: `inhouse finish ${suffix}`,
      status: "ACTIVE", activatedAt: now,
    });
    await database.insert(players).values(Object.entries(playerIds).map(([key, id]) => ({
      id,
      memberName: `${key}-${suffix}`,
      memberNameNormalized: `${key}-${suffix}`,
      nickname: `${key}${suffix}`,
      nicknameNormalized: `${key}${suffix}`.toLowerCase(),
      tagLine: "KR1",
      tagLineNormalized: "kr1",
    })));
    await database.insert(seasonInhouseRounds).values([
      {
        id: targetRoundId, seasonId, applyDate: today, recruitNo: 86, sourceRoomIdHash: roomHash,
        mode: "RIFT", status: "IN_PROGRESS", capacity: 10, sourceReferenceHash: randomBytes(32), revision: 4,
      },
      {
        id: draftRoundId, seasonId, applyDate: today, recruitNo: 86, sourceRoomIdHash: roomHash,
        mode: "ARAM", status: "DRAFT", capacity: 10, sourceReferenceHash: randomBytes(32), revision: 1,
      },
      {
        id: foreignRoundId, seasonId, applyDate: today, recruitNo: 86, sourceRoomIdHash: foreignRoomHash,
        mode: "RIFT", status: "IN_PROGRESS", capacity: 10, sourceReferenceHash: randomBytes(32),
      },
      {
        id: terminalRoundId, seasonId, applyDate: today, recruitNo: 87, sourceRoomIdHash: roomHash,
        mode: "RIFT", status: "CANCELED", capacity: 10, sourceReferenceHash: randomBytes(32), revision: 2,
      },
    ]);
    await database.insert(seasonApplications).values([
      {
        id: applicationIds.applied, seasonId, playerId: playerIds.applied, applyDate: today, recruitNo: 86,
        sourceSlotNo: 1, mainPosition: "TOP", status: "APPLIED", source: "KAKAO",
        sourceReferenceHash: randomBytes(32), sourceRoomIdHash: roomHash, sourceMode: "RIFT",
      },
      {
        id: applicationIds.reserve, seasonId, playerId: playerIds.reserve, applyDate: today, recruitNo: 86,
        sourceSlotNo: 2, mainPosition: "JGL", status: "RESERVE", source: "KAKAO",
        sourceReferenceHash: randomBytes(32), sourceRoomIdHash: roomHash, sourceMode: "RIFT",
        reviewedByUserAccountId: reviewerId, reviewedAt: now,
      },
      {
        id: applicationIds.site, seasonId, playerId: playerIds.site, applyDate: today, recruitNo: 86,
        sourceSlotNo: 3, mainPosition: "MID", status: "APPLIED", source: "SITE",
      },
      {
        id: applicationIds.confirmed, seasonId, playerId: playerIds.confirmed, applyDate: today, recruitNo: 86,
        sourceSlotNo: 4, mainPosition: "ADC", status: "CONFIRMED", source: "KAKAO",
        sourceReferenceHash: randomBytes(32), sourceRoomIdHash: roomHash, sourceMode: "RIFT",
        reviewedByUserAccountId: reviewerId, reviewedAt: now,
      },
      {
        id: applicationIds.foreign, seasonId, playerId: playerIds.foreign, applyDate: today, recruitNo: 86,
        sourceSlotNo: 1, mainPosition: "SUP", status: "APPLIED", source: "KAKAO",
        sourceReferenceHash: randomBytes(32), sourceRoomIdHash: foreignRoomHash, sourceMode: "RIFT",
      },
    ]);
    await database.insert(seasonKakaoPendingApplications).values([
      {
        id: pendingIds.target, seasonId, applyDate: today, recruitNo: 86, slotNo: 5,
        suppliedName: `pending-${suffix}`, suppliedRiotId: null, mainPosition: "ALL", reserve: false,
        matchState: "UNMATCHED", status: "ACTIVE", sourceReferenceHash: randomBytes(32),
        sourceRoomIdHash: roomHash, sourceMode: "RIFT",
      },
      {
        id: pendingIds.foreign, seasonId, applyDate: today, recruitNo: 86, slotNo: 5,
        suppliedName: `foreign-pending-${suffix}`, suppliedRiotId: null, mainPosition: "ALL", reserve: false,
        matchState: "UNMATCHED", status: "ACTIVE", sourceReferenceHash: randomBytes(32),
        sourceRoomIdHash: foreignRoomHash, sourceMode: "RIFT",
      },
    ]);

    const first = await assistant.syncSeasonSnapshot(finishInput);
    assert.equal(first.replayed, false);
    assert.equal(first.body.cancelledCount, 0);
    assert.equal(first.body.metadataUpdated, true);
    assert.deepEqual(first.body.availableRecruitNos, []);
    assert.doesNotMatch(first.body.v1StrictLegacyReply ?? "", /#86/u);

    const replay = await assistant.syncSeasonSnapshot(finishInput);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, first.body);

    const rounds = new Map((await database.select().from(seasonInhouseRounds)).map((row) => [row.id, row]));
    assert.equal(rounds.get(targetRoundId)?.status, "CLOSED");
    assert.equal(rounds.get(targetRoundId)?.revision, 5);
    assert.equal(rounds.get(draftRoundId)?.status, "CANCELED");
    assert.equal(rounds.get(draftRoundId)?.revision, 2);
    assert.equal(rounds.get(foreignRoundId)?.status, "IN_PROGRESS");
    assert.equal(rounds.get(foreignRoundId)?.revision, 0);
    assert.equal(rounds.get(terminalRoundId)?.status, "CANCELED");
    assert.equal(rounds.get(terminalRoundId)?.revision, 2);

    const applications = new Map((await database.select().from(seasonApplications)).map((row) => [row.id, row]));
    assert.equal(applications.get(applicationIds.applied)?.status, "APPLIED");
    assert.equal(applications.get(applicationIds.applied)?.revision, 0);
    assert.equal(applications.get(applicationIds.applied)?.cancelledAt, null);
    assert.equal(applications.get(applicationIds.reserve)?.status, "RESERVE");
    assert.equal(applications.get(applicationIds.reserve)?.revision, 0);
    assert.equal(applications.get(applicationIds.reserve)?.reviewedByUserAccountId, reviewerId);
    assert.equal(applications.get(applicationIds.site)?.status, "APPLIED");
    assert.equal(applications.get(applicationIds.site)?.revision, 0);
    assert.equal(applications.get(applicationIds.confirmed)?.status, "CONFIRMED");
    assert.equal(applications.get(applicationIds.confirmed)?.revision, 0);
    assert.equal(applications.get(applicationIds.foreign)?.status, "APPLIED");
    assert.equal(applications.get(applicationIds.foreign)?.revision, 0);

    const pending = new Map((await database.select().from(seasonKakaoPendingApplications)).map((row) => [row.id, row]));
    assert.equal(pending.get(pendingIds.target)?.status, "ACTIVE");
    assert.equal(pending.get(pendingIds.target)?.revision, 0);
    assert.equal(pending.get(pendingIds.target)?.cancelledAt, null);
    assert.equal(pending.get(pendingIds.foreign)?.status, "ACTIVE");
    assert.equal(pending.get(pendingIds.foreign)?.revision, 0);

    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.requestId, finishRequestId))).length, 1);
    assert.equal((await database.select().from(recruitingCommandReceipts).where(and(
      eq(recruitingCommandReceipts.actorPrincipalId, finishPrincipalId),
      eq(recruitingCommandReceipts.scope, KAKAO_V4_EVENT_SCOPE),
    ))).length, 1);

    const status = await assistant.syncSeasonSnapshot({
      actorPrincipalId: finishPrincipalId,
      intent: intent(`nonce-inhouse-status-${suffix}`, `inhouse-status-${suffix}`, room),
      requestKey: `inhouse-status-${suffix}`,
      scope: "kakao:season-applications:status-after-finish",
      command: { action: "STATUS", seasonId, applyDate: today, recruitNo: null, participants: [] },
      requestId: randomUUID(),
      now,
    });
    assert.equal(status.body.availableRecruitNos?.includes(86), false);
    assert.doesNotMatch(status.body.v1StrictLegacyReply ?? "", /#86/u);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("editable inhouse forms count unlinked names, merge concurrent additions, protect SITE rows and retain closed rosters", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 5 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const room = `editable-${suffix}`;
  const assistant = new PostgresKakaoAssistant(database);
  let sequence = 0;
  const send = (command: KakaoSeasonSnapshotCommand) => {
    const key = `editable-${suffix}-${++sequence}`;
    return assistant.syncSeasonSnapshot({ actorPrincipalId: principalId, intent: intent(`nonce-${key}`, key, room),
      requestKey: key, scope: "kakao:editable-contract", command, requestId: randomUUID(), now });
  };
  const metadata = { capacity: 10, startTimeText: "21:00", scheduledStartAt: new Date(`${today}T21:00:00+09:00`).toISOString(), gameInfo: null, organizerText: null, noticeText: null };
  const row = (slotNo: number, name: string) => ({ slotNo, name, riotId: null, mainPosition: "MID" as const, subPositions: ["TOP" as const], reserve: slotNo > 10 });
  const detail = () => send({ action: "STATUS", seasonId, applyDate: today, recruitNo: 1, participants: [] });
  const sync = (body: KakaoSeasonSnapshotDto, participants: Extract<KakaoSeasonSnapshotCommand, { action: "SYNC" }>["participants"], extra = metadata) => send({
    action: "SYNC", seasonId, applyDate: today, recruitNo: 1, mode: "RIFT", participants, roundMetadata: extra,
    observedSlotNos: Array.from({ length: 20 }, (_, i) => i + 1), reserveSectionObserved: true,
    copyGuard: { operatingDate: null, saveReference: null, formCode: body.formCode },
  });
  const roster = (body: KakaoSeasonSnapshotDto) => body.entries.map((entry) => ({ ...row(entry.slotNo, entry.suppliedName), mainPosition: entry.mainPosition, subPositions: entry.subPositions, reserve: entry.reserve ?? false }));
  const legacyRoster = (body: KakaoSeasonSnapshotDto) => {
    const text = body.v1StrictLegacyReply!;
    const parsed = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), {
      profileId: "FEATURES", installationId: "install-legacy-inhouse", senderId: "sender-legacy-inhouse", eventId: "legacy-inhouse-copy",
      timestamp: Math.floor(now.getTime() / 1_000), nonce: "f".repeat(32), text,
    });
    if (parsed?.domain !== "SEASON" || parsed.action !== "SYNC") assert.fail("issued legacy copy must parse for guarded storage validation");
    assert.equal(parsed.participants.every((entry) => entry.nameOnly), true);
    return parsed.participants;
  };
  const knownName = `회원-${suffix}`;
  const duplicateName = `동명-${suffix}`;
  const playerIds = Array.from({ length: 4 }, () => randomUUID());
  try {
    await applyMigrations(database);
    await database.insert(seasons).values({ id: seasonId, name: `Editable ${suffix}`, nameNormalized: `editable ${suffix}`, status: "ACTIVE", activatedAt: now });
    await database.insert(players).values(playerIds.map((id, i) => ({ id, memberName: i === 0 ? knownName : i === 3 ? `사이트-${suffix}` : duplicateName, memberNameNormalized: i === 0 ? knownName : i === 3 ? `사이트-${suffix}` : duplicateName,
      nickname: `Editable${i}${suffix}`, nicknameNormalized: `editable${i}${suffix}`, tagLine: "QA", tagLineNormalized: "qa" })));
    const draft = await send({ action: "RESERVE", seasonId, applyDate: today, recruitNo: 1, mode: "RIFT", roundMetadata: metadata, participants: [] });
    const nine = [row(1, knownName), row(2, duplicateName), ...Array.from({ length: 7 }, (_, i) => row(i + 3, `손님${i}-${suffix}`))];
    const initial = await sync(draft.body, nine.slice(0, 8));
    assert.equal(initial.body.registrationCreated, true);
    const first = await sync(initial.body, [...legacyRoster(initial.body), nine[8]!]);
    assert.equal(first.body.createdCount, 1, "guarded name-only originals can accompany a new participant with explicit lanes");
    assert.equal(first.body.updatedCount, 0);
    assert.deepEqual(first.body.entries[0]?.subPositions, ["TOP"]);
    assert.equal(first.body.entries[0]?.mainPosition, "MID", "legacy omission must not replace saved lanes with ALL");
    assert.equal(first.body.pendingCount, 8);
    assert.equal(first.body.appliedCount, 1);
    assert.equal(first.body.entries[0]?.memberLinkStatus, undefined);
    assert.equal(first.body.entries[1]?.memberLinkStatus, "AMBIGUOUS");
    assert.equal(first.body.entries[2]?.memberLinkStatus, "UNMATCHED");
    assert.equal(first.body.rosterFilled, false);
    assert.match(inhouseSaveReply(first.body), /가입했다면 사이트 등록 이름/u);
    assert.match(inhouseSaveReply(first.body), /이름\(사이트 닉네임\)/u);
    await assert.rejects(sync(first.body, [...legacyRoster(first.body), { ...row(10, `라인누락-${suffix}`), nameOnly: true }],
      { ...metadata, startTimeText: "22:00", scheduledStartAt: new Date(`${today}T22:00:00+09:00`).toISOString() }),
    (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED" && /10번.*협곡 라인/u.test(error.publicMessage ?? ""));
    const afterMissingLane = await detail();
    assert.equal(afterMissingLane.body.saveReference, first.body.saveReference, "rejection rolls back metadata and all roster rows");
    assert.deepEqual(afterMissingLane.body.entries, first.body.entries);
    assert.equal(afterMissingLane.body.roundMetadata?.startTimeText, "21:00");
    const attempts = await Promise.allSettled([
      sync(first.body, [...nine, row(10, `마지막갑-${suffix}`)]),
      sync(first.body, [...nine, row(10, `마지막을-${suffix}`)]),
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const winner = attempts.find((result) => result.status === "fulfilled");
    assert.ok(winner && winner.status === "fulfilled");
    assert.equal(winner.value.body.rosterFilled, true);
    assert.match(inhouseSaveReply(winner.value.body), /시작 시간 10분 전 내전 디스코드방에 대기해주세요~/u);
    const full = await detail();
    assert.equal(full.body.entries.length, 10);
    const unchanged = await sync(full.body, roster(full.body));
    assert.equal(unchanged.body.rosterFilled, false);
    assert.equal(unchanged.body.updatedCount, 0);
    const renamedRoster = roster(full.body).map((entry) => entry.slotNo === 2 ? { ...entry, name: `${duplicateName}(Editable1${suffix})` } : entry);
    const renamed = await sync(full.body, renamedRoster, { ...metadata, startTimeText: "모이면", scheduledStartAt: null as unknown as string });
    assert.equal(renamed.body.entries.length, 10);
    assert.equal(renamed.body.roundMetadata?.startTimeText, "모이면");
    assert.equal(renamed.body.entries[1]?.player?.playerId, playerIds[1], "qualified exact match links roster membership without authenticating sender identity");
    await assert.rejects(sync(full.body, roster(full.body).map((entry) => entry.slotNo === 2 ? { ...entry, name: "충돌" } : entry)),
      (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED");
    const removed = await sync(renamed.body, roster(renamed.body).filter((entry) => entry.slotNo !== 9));
    assert.equal(removed.body.entries.length, 9);
    const updatedLane = await sync(removed.body, roster(removed.body).map((entry) => entry.slotNo === 1
      ? { ...entry, mainPosition: "JGL" as const, subPositions: ["SUP" as const] } : entry));
    assert.equal(updatedLane.body.entries.find((entry) => entry.slotNo === 1)?.mainPosition, "JGL");
    const stale = await sync(renamed.body, legacyRoster(renamed.body));
    assert.equal(stale.body.entries.length, 9, "an unchanged stale name does not revive a deletion");
    assert.equal(stale.body.entries.some((entry) => entry.slotNo === 9), false);
    assert.equal(stale.body.entries.find((entry) => entry.slotNo === 1)?.mainPosition, "JGL", "legacy omitted lanes preserve newer explicit lane edits");
    assert.deepEqual(stale.body.entries.find((entry) => entry.slotNo === 1)?.subPositions, ["SUP"]);
    assert.equal(stale.body.createdCount, 0);
    assert.equal(stale.body.updatedCount, 0);
    assert.match(inhouseSaveReply(stale.body), /이번 요청으로 변경된 내용은 없어요/u);
    await database.insert(seasonApplications).values({ id: randomUUID(), seasonId, playerId: playerIds[3]!, applyDate: today, recruitNo: 1,
      source: "SITE", sourceSlotNo: null, mainPosition: "TOP", subPositions: [], status: "APPLIED" });
    const mixed = await detail();
    assert.equal(mixed.body.entries.length, 10);
    const site = mixed.body.entries.find((entry) => entry.source === "SITE");
    assert.ok(site);
    assert.equal(site.protectedReason, "SITE");
    // The independent SITE participant remains protected from copied edits.
    const protectedRoster = roster(mixed.body);
    await assert.rejects(sync(mixed.body, protectedRoster.filter((entry) => entry.slotNo !== site.slotNo)),
      (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED");
    const closed = await send({ action: "FINISH", seasonId, applyDate: today, recruitNo: 1, participants: [] });
    assert.equal(closed.body.cancelledCount, 0);
    const archived = await detail();
    assert.equal(archived.body.entries.length, 10);
    assert.equal(archived.body.roundMetadata?.status, "CLOSED");
    assert.equal(archived.body.formCode, undefined);
    assert.match(inhouseCopyFormReply(archived.body), /모집 마감 · 명단 보관/u);
    assert.doesNotMatch(v1StrictSeasonReply(closed.body, "STATUS"), /\[내전 #1\]/u);
    await assert.rejects(sync(mixed.body, protectedRoster), (error: unknown) => error instanceof KakaoAssistantError && error.code === "INVALID_STATE");
    assert.equal((await database.select().from(seasonApplications).where(eq(seasonApplications.seasonId, seasonId)))[0]?.status, "APPLIED");

    // Explicit user-approved roster matching: exact active member or qualified
    // homonym joins automatically; this is not sender/account authentication.
    const secondDraft = await send({ action: "RESERVE", seasonId, applyDate: today, recruitNo: 2, mode: "RIFT", roundMetadata: metadata, participants: [] });
    const syncSecond = (body: KakaoSeasonSnapshotDto, participants: Extract<KakaoSeasonSnapshotCommand, { action: "SYNC" }>["participants"]) => send({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 2, mode: "RIFT", participants, roundMetadata: metadata,
      observedSlotNos: Array.from({ length: 20 }, (_, i) => i + 1), reserveSectionObserved: true,
      copyGuard: { operatingDate: null, saveReference: null, formCode: body.formCode },
    });
    const lateName = `나중가입-${suffix}`;
    const second = await syncSecond(secondDraft.body, [row(1, knownName), row(2, lateName), row(11, `${duplicateName}(Editable1${suffix})`)]);
    assert.equal(second.body.entries.find((entry) => entry.slotNo === 1)?.player?.playerId, playerIds[0]);
    assert.equal(second.body.entries.find((entry) => entry.slotNo === 11)?.player?.playerId, playerIds[1]);
    assert.equal(second.body.entries.find((entry) => entry.slotNo === 11)?.reserve, true);
    assert.doesNotMatch(inhouseSaveReply(second.body), /회원 연결 확인|운영진.*연결/u);
    await assert.rejects(syncSecond(second.body, [...roster(second.body), row(3, `Editable0${suffix}`)]),
      (error: unknown) => error instanceof KakaoAssistantError && error.code === "CONFLICT");
    const latePlayerId = randomUUID();
    await database.insert(players).values({ id: latePlayerId, memberName: lateName, memberNameNormalized: lateName,
      nickname: `late${suffix}`, nicknameNormalized: `late${suffix}`, tagLine: "QA", tagLineNormalized: "qa" });
    const autoLinked = await syncSecond(second.body, roster(second.body));
    assert.equal(autoLinked.body.entries.find((entry) => entry.slotNo === 2)?.player?.playerId, latePlayerId);
    assert.equal(autoLinked.body.entries.length, 3);
    assert.equal(autoLinked.body.updatedCount, 1);
    // A previously issued pending-row ID still identifies the same application
    // after automatic linking, so legitimate field edits need no account review.
    const afterLinkEdit = await syncSecond(second.body, roster(second.body).map((entry) => entry.slotNo === 2
      ? { ...entry, mainPosition: "JGL" as const } : entry));
    assert.equal(afterLinkEdit.body.entries.find((entry) => entry.slotNo === 2)?.mainPosition, "JGL");
    assert.equal(afterLinkEdit.body.entries.find((entry) => entry.slotNo === 2)?.player?.playerId, latePlayerId);
    const syncInfo = (body: KakaoSeasonSnapshotDto, gameInfo: string | null | undefined) => send({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 2, mode: "RIFT", participants: roster(body),
      roundMetadata: { ...metadata, gameInfo }, observedSlotNos: Array.from({ length: 20 }, (_, i) => i + 1), reserveSectionObserved: true,
      copyGuard: { operatingDate: null, saveReference: null, formCode: body.formCode },
    });
    const withInfo = await syncInfo(afterLinkEdit.body, "저티어 내전 / 일반내전");
    assert.equal(withInfo.body.roundMetadata?.gameInfo, "저티어 내전 / 일반내전");
    assert.match(inhouseCopyFormReply(withInfo.body), /내전 정보: 저티어 내전 \/ 일반내전/u);
    const omitted = await syncInfo(afterLinkEdit.body, undefined);
    assert.equal(omitted.body.roundMetadata?.gameInfo, "저티어 내전 / 일반내전", "old forms without a description preserve the stored value");
    await assert.rejects(syncInfo(afterLinkEdit.body, "충돌하는 정보"),
      (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED");
    const changedInfo = await syncInfo(withInfo.body, "일반내전");
    assert.equal(changedInfo.body.roundMetadata?.gameInfo, "일반내전");
    const clearedInfo = await syncInfo(changedInfo.body, null);
    assert.equal(clearedInfo.body.roundMetadata?.gameInfo, null);
    assert.equal(clearedInfo.body.entries.length, 3);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});


test("name-first in-house copies keep pending slots and merge metadata without overwriting newer edits", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const room = `room-name-first-${suffix}`;
  const assistant = new PostgresKakaoAssistant(database);
  const names = [1, 2, 3].map((index) => `합성접수${index}-${suffix}`);
  const renamed = `합성정정-${suffix}`;
  let sequence = 0;
  const send = (command: KakaoSeasonSnapshotCommand) => {
    sequence += 1;
    return assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId, intent: intent(`nonce-name-first-${suffix}-${sequence}`, `name-first-${sequence}`, room),
      requestKey: `name-first-${suffix}-${sequence}`, scope: "kakao:season-name-first-contract", command, requestId: randomUUID(), now,
    });
  };
  const metadata = (time: string | null) => ({
    capacity: 10, startTimeText: time,
    scheduledStartAt: time && /^\d{2}:\d{2}$/u.test(time) ? new Date(`${today}T${time}:00+09:00`).toISOString() : null,
    gameInfo: null, organizerText: null, noticeText: null,
  });
  const member = (name: string, slotNo: number) => ({ slotNo, name, riotId: null, mainPosition: "ALL" as const, subPositions: [], reserve: false });
  const sync = (body: KakaoSeasonSnapshotDto, time: string | null, participants: Extract<KakaoSeasonSnapshotCommand, { action: "SYNC" }>["participants"]) => send({
    action: "SYNC", seasonId, applyDate: today, recruitNo: 1, mode: "RIFT", roundMetadata: metadata(time), participants,
    observedSlotNos: Array.from({ length: 20 }, (_, index) => index + 1), reserveSectionObserved: true, copyGuard: { operatingDate: null, saveReference: null, formCode: body.formCode },
  });
  const precondition = (error: unknown) => error instanceof KakaoAssistantError && error.code === "PRECONDITION_FAILED";
  try {
    await applyMigrations(database);
    await database.insert(seasons).values({ id: seasonId, name: `Name first ${suffix}`, nameNormalized: `name first ${suffix}`, status: "ACTIVE", activatedAt: now });
    const draft = await send({ action: "RESERVE", seasonId, applyDate: today, recruitNo: 1, mode: "RIFT", roundMetadata: metadata(null), participants: [] });
    const first = await sync(draft.body, "21:00", [member(names[0]!, 1)]);
    assert.equal(first.body.appliedCount, 0, "name-only registration must not invent a linked member");
    assert.equal(first.body.pendingCount, 1);
    assert.match(first.body.v1StrictLegacyReply!, /\[내전 #1\] 1\/10명/u);
    assert.ok(first.body.v1StrictLegacyReply!.includes(`1. ${names[0]}`));
    assert.match(inhouseSaveReply(first.body), /내전등록 완료/u);
    assert.match(inhouseSaveReply(first.body), /이름 확인/u);
    assert.equal((await database.select().from(players).where(eq(players.memberName, names[0]!))).length, 0);

    const twoMembers = [member(names[0]!, 1), member(names[1]!, 2)];
    const fromOldDraft = await sync(draft.body, "21:00", twoMembers);
    assert.equal(fromOldDraft.body.entries.length, 2, "the first blank form can add a name with the already saved time");
    const changedTime = await sync(fromOldDraft.body, "21:30", twoMembers);
    assert.equal(changedTime.body.roundMetadata?.startTimeText, "21:30");
    assert.equal(changedTime.body.roundMetadata?.scheduledStartAt, metadata("21:30").scheduledStartAt);
    const threeMembers = [...twoMembers, member(names[2]!, 3)];
    const staleAdd = await sync(fromOldDraft.body, "21:00", threeMembers);
    assert.equal(staleAdd.body.entries.length, 3);
    assert.equal(staleAdd.body.roundMetadata?.startTimeText, "21:30", "an unchanged old time preserves the newer saved time");
    await assert.rejects(sync(fromOldDraft.body, "22:00", threeMembers), precondition);
    const afterConflict = await send({ action: "STATUS", seasonId, applyDate: today, recruitNo: 1, participants: [] });
    assert.equal(afterConflict.body.saveReference, staleAdd.body.saveReference, "conflicting edits roll back completely");

    const originalPending = (await database.select().from(seasonKakaoPendingApplications).where(and(
      eq(seasonKakaoPendingApplications.seasonId, seasonId), eq(seasonKakaoPendingApplications.slotNo, 2),
    )))[0]!;
    const correctedMembers = [member(names[0]!, 1), member(renamed, 2), member(names[2]!, 3)];
    const corrected = await sync(afterConflict.body, "21:30", correctedMembers);
    assert.equal(corrected.body.entries.length, 3);
    const correctedPending = (await database.select().from(seasonKakaoPendingApplications).where(eq(seasonKakaoPendingApplications.id, originalPending.id)))[0]!;
    assert.equal(correctedPending.suppliedName, renamed);
    assert.equal(correctedPending.slotNo, 2);
    assert.equal(correctedPending.status, "ACTIVE");
    await assert.rejects(sync(afterConflict.body, "21:30", [member(names[0]!, 1), member(`다른정정-${suffix}`, 2), member(names[2]!, 3)]), precondition);
    await assert.rejects(sync(corrected.body, "21:30", [...correctedMembers, member(renamed, 4)]), precondition);
    const freeTime = "저티어내전 최티E3까지 9시 시작";
    const descriptiveTime = await sync(corrected.body, freeTime, correctedMembers);
    assert.equal(descriptiveTime.body.roundMetadata?.startTimeText, freeTime);
    assert.equal(descriptiveTime.body.roundMetadata?.scheduledStartAt, null);
    assert.ok(descriptiveTime.body.v1StrictLegacyReply!.includes(`》시작: ${freeTime}`));
    assert.equal((await database.select().from(seasonApplications).where(eq(seasonApplications.seasonId, seasonId))).length, 0);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("in-house copy forms reopen a vacated reserve slot and preserve the remaining roster", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = recruitingOperatingDateKey(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const room = `room-reserve-gap-${suffix}`;
  const members = Array.from({ length: 11 }, (_, index) => ({ id: randomUUID(), name: `예비공석${index}-${suffix}` }));
  const assistant = new PostgresKakaoAssistant(database);
  let sequence = 0;
  const send = (command: KakaoSeasonSnapshotCommand) => {
    sequence += 1;
    return assistant.syncSeasonSnapshot({
      actorPrincipalId: principalId, intent: intent(`nonce-gap-${suffix}-${sequence}`, `gap-${suffix}-${sequence}`, room),
      requestKey: `gap-${suffix}-${sequence}`, scope: "kakao:season-copy-contract", command, requestId: randomUUID(), now,
    });
  };
  try {
    await applyMigrations(database);
    await database.insert(seasons).values({ id: seasonId, name: `Reserve gap ${suffix}`, nameNormalized: `reserve gap ${suffix}`, status: "ACTIVE", activatedAt: now });
    await database.insert(players).values(members.map((member, index) => ({
      id: member.id, memberName: member.name, memberNameNormalized: member.name,
      nickname: `Gap${index}${suffix}`, nicknameNormalized: `gap${index}${suffix}`, tagLine: "QA", tagLineNormalized: "qa",
    })));
    const full = await send({
      action: "SYNC", seasonId, applyDate: today, recruitNo: 1, mode: "RIFT", reserveSectionObserved: true,
      roundMetadata: { capacity: 10, startTimeText: null, scheduledStartAt: null, gameInfo: null, organizerText: null, noticeText: null },
      participants: members.map((member, index) => ({
        slotNo: index === 0 ? 1 : 10 + index, name: member.name, riotId: null,
        mainPosition: "ALL", subPositions: [], reserve: index > 0,
      })),
    });
    assert.equal(full.body.reserveCount, 10);
    const removed = await send({ action: "REMOVE_PARTICIPANT", seasonId, applyDate: today, recruitNo: 1, name: members[1]!.name, participants: [] });
    assert.equal(removed.body.reserveCount, 9);
    assert.match(inhouseCopyFormReply(removed.body), /^예비 1\.$/mu);
    assert.deepEqual(inhouseCopyFormReply(removed.body).split("\n").filter((line) => /^예비 \d+\./u.test(line))
      .map((line) => Number(/^예비 (\d+)\./u.exec(line)![1])), Array.from({ length: 10 }, (_, index) => index + 1),
    "actual detail emits the vacant first reserve before later occupied slots without duplicates");
    for (let index = 2; index <= 10; index += 1) {
      assert.ok(inhouseCopyFormReply(removed.body).includes(`예비 ${index}. ${members[index]!.name}`));
    }
    const copyText = inhouseCopyFormReply(removed.body).replace(/^예비 1\.$/mu, `예비 1. ${members[1]!.name}/all`);
    const parsed = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text: copyText }), {
      profileId: "FEATURES", installationId: "install-reserve-gap", senderId: "sender-reserve-gap", eventId: "event-reserve-gap",
      timestamp: Math.floor(now.getTime() / 1_000), nonce: "e".repeat(32), text: copyText,
    });
    if (parsed?.domain !== "SEASON" || parsed.action !== "SYNC") assert.fail("the generated reserve vacancy form must parse");
    const restored = await send({
      action: "SYNC", seasonId, applyDate: parsed.applyDate, recruitNo: parsed.recruitNumber, mode: parsed.mode,
      roundMetadata: parsed.roundMetadata, participants: parsed.participants,
      observedSlotNos: parsed.observedSlotNos, preserveSlotNos: parsed.preserveSlotNos, reserveSectionObserved: parsed.reserveSectionObserved, copyGuard: parsed.copyGuard,
    });
    assert.equal(restored.body.appliedCount, 1);
    assert.equal(restored.body.reserveCount, 10);
    assert.equal(restored.body.cancelledCount, 0);
    assert.equal(restored.body.entries.find((entry) => entry.suppliedName === members[1]!.name)?.slotNo, 11);
    for (const entry of removed.body.entries) {
      assert.deepEqual(restored.body.entries.find((current) => current.player?.playerId === entry.player?.playerId), entry);
    }
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});

test("owner-created Kakao image sessions bind sender, finalize private assets, replay, and revoke", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const ownerId = randomUUID();
  const authSessionId = randomUUID();
  const submissionId = randomUUID();
  const publicCode = `KIMG${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);
  const storage = new FakePrivateImageStorage();
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: ownerId, loginId: `kakao-image-${ownerId}`, loginIdNormalized: `kakao-image-${ownerId}`, role: "USER", status: "APPROVED" });
    await database.insert(authSessions).values({ id: authSessionId, tokenHash: randomBytes(32), userAccountId: ownerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt });
    await database.insert(matchSubmissions).values({
      id: submissionId, publicCode, ownerUserAccountId: ownerId, title: "Kakao owner bridge",
      organizer: "contract", seriesNumber: 1, playedOn: "2026-09-07", expectedGameCount: 2,
      source: "WEB", sourceReferenceHash: randomBytes(32), status: "AWAITING_UPLOAD",
    });
    const service = new PostgresKakaoImageReceive(database, storage);
    const actorSession = { userAccountId: ownerId, sessionId: authSessionId, role: "USER" as const, authVersion: 0 };
    const installationPublicId = `install-${"a".repeat(32)}`;
    const createdInput = {
      actorSession, targetType: "MATCH_SUBMISSION" as const, targetReference: publicCode, expectedRevision: 0,
      requestKey: `create-${ownerId}`, bodyDigestHex: digest("create-image-session"), requestId: randomUUID(),
      scope: `me:match-submissions:${publicCode}:kakao-session:create`, roomId: installationPublicId, senderId: "operator-contract", now,
    };
    const created = await service.createOwnerSession(createdInput);
    assert.equal(created.body.status, "ACTIVE");
    assert.equal((await service.createOwnerSession(createdInput)).replayed, true);
    const storedSession = (await database.select().from(kakaoImageSessions).where(eq(kakaoImageSessions.id, created.body.sessionId)))[0];
    assert.equal(storedSession?.roomIdHash.length, 32);
    assert.equal(storedSession?.senderIdHash.length, 32);
    assert.equal(JSON.stringify(storedSession).includes(installationPublicId), false);

    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#dff5ff" } }).png().toBuffer();
    const sha256Hex = createHash("sha256").update(bytes).digest("hex");
    const command = { sessionId: created.body.sessionId, base64Image: bytes.toString("base64"), declaredContentType: "image/png" as const, declaredSha256Hex: sha256Hex, originalFileName: "scoreboard.png" };
    await assert.rejects(service.receive({ actorPrincipalId: principalId, intent: { ...intent("nonce-image-wrong", "wrong-room"), roomId: "another-room" }, requestKey: `image-wrong-${ownerId}`, scope: "kakao:image-receive", requestId: randomUUID(), command, now }), (error) => error instanceof KakaoAssistantError && error.code === "NOT_FOUND");
    const receivedInput = { actorPrincipalId: principalId, intent: { ...intent("nonce-image-valid", "valid-image", randomUUID()), installationId: installationPublicId, localRoomFingerprint: `room-${"b".repeat(32)}` }, requestKey: `image-valid-${ownerId}`, scope: "kakao:image-receive", requestId: randomUUID(), command, now };
    const received = await service.receive(receivedInput);
    assert.equal(received.body.imageNumber, 1);
    assert.equal(received.body.completed, false);
    assert.equal((await service.receive(receivedInput)).replayed, true);
    assert.equal((await database.select().from(kakaoInboundImages).where(eq(kakaoInboundImages.status, "READY"))).length, 1);
    assert.equal((await database.select().from(privateAssets).where(and(eq(privateAssets.id, received.body.assetId), eq(privateAssets.status, "READY")))).length, 1);
    assert.equal((await database.select().from(matchSubmissionImages).where(eq(matchSubmissionImages.submissionId, submissionId))).length, 1);

    const revoked = await service.revokeOwnerSession({
      actorSession, targetType: "MATCH_SUBMISSION", targetReference: publicCode, expectedRevision: 0,
      requestKey: `revoke-${ownerId}`, bodyDigestHex: digest("revoke-image-session"), requestId: randomUUID(),
      scope: `me:match-submissions:${publicCode}:kakao-session:revoke`, sessionId: created.body.sessionId, now: new Date(now.getTime() + 1_000),
    });
    assert.equal(revoked.body.status, "CANCELLED");
  } finally { await pool.end(); }
});

test("Kakao admin settings and health repair require SUPER TOTP and persist receipts, audit, and outbox", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const superId = randomUUID(); const sessionId = randomUUID(); const now = new Date();
  const actor = { session: { userAccountId: superId, sessionId, role: "SUPER_ADMIN" as const, authVersion: 0 }, role: "SUPER_ADMIN" as const, accountStatus: "APPROVED" as const };
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: superId, loginId: `kakao-super-${superId}`, loginIdNormalized: `kakao-super-${superId}`, role: "SUPER_ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: superId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });
    const admin = new PostgresKakaoAdmin(database);
    const initial = await admin.getSettings();
    assert.equal(initial.revision, 0);
    const metadata = { requestId: randomUUID(), requestKey: `kakao-settings-${superId}`, requestHashHex: digest("settings-off"), expectedRevision: 0 };
    const updated = await admin.updateSettings({ actor, metadata, patch: { playerSearchEnabled: false, maxMessageLength: 2500 } });
    assert.equal(updated.body.settings.playerSearchEnabled, false);
    assert.equal(updated.revision, 1);
    assert.equal((await admin.updateSettings({ actor, metadata, patch: { playerSearchEnabled: false, maxMessageLength: 2500 } })).replayed, true);
    assert.equal(await admin.isFeatureEnabled("playerSearchEnabled"), false);
    await assert.rejects(admin.updateSettings({ actor, metadata: { ...metadata, requestId: randomUUID(), requestKey: `stale-${superId}`, expectedRevision: 0 }, patch: { playerSearchEnabled: true } }), (error) => error instanceof KakaoAdminError && error.code === "PRECONDITION_FAILED");

    const expiredSessionId = randomUUID();
    await database.insert(kakaoImageSessions).values({ id: expiredSessionId, createdByUserAccountId: superId, targetType: "MATCH_SUBMISSION", targetId: randomUUID(), roomIdHash: randomBytes(32), senderIdHash: randomBytes(32), expectedImageCount: 2, status: "ACTIVE", expiresAt: new Date(now.getTime() - 1000), createdAt: now, updatedAt: now });
    const repaired = await admin.repairExpiredSessions({ actor, metadata: { requestId: randomUUID(), requestKey: `kakao-repair-${superId}`, requestHashHex: digest("repair-expired"), expectedRevision: 1 } });
    assert.equal(repaired.body.expiredSessionCount, 1);
    assert.equal((await database.select().from(kakaoImageSessions).where(eq(kakaoImageSessions.id, expiredSessionId)))[0]?.status, "EXPIRED");
    assert.ok((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateType, "KAKAO_SETTINGS"))).length >= 2);
    assert.equal((await database.select().from(kakaoOperationSettings).where(eq(kakaoOperationSettings.id, 1)))[0]?.revision, 1);
    const status = await new PostgresRecruitingAdapter(database).getAdminStatus();
    assert.equal(status.incompleteReceiptCount, 0);
    assert.ok(status.recentRequests.some((item) => item.scope === "admin:kakao:settings:update"));
  } finally { await pool.end(); }
});

test("inhouse roster matching uses bounded lookups for ten members and guests", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { pool } = createDatabaseHandle(connectionString, { max: 3 });
  const queries: string[] = [];
  const database = drizzle(pool, { schema, logger: { logQuery(query) { queries.push(query); } } });
  const assistant = new PostgresKakaoAssistant(database);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const now = new Date();
  const applyDate = recruitingOperatingDateKey(now);
  let sequence = 0;
  const send = (command: KakaoSeasonSnapshotCommand) => {
    const key = `batch-${suffix}-${++sequence}`;
    return assistant.syncSeasonSnapshot({ actorPrincipalId: principalId, intent: intent(`nonce-${key}`, key, `room-${suffix}`),
      requestKey: key, scope: "kakao:batch-match-contract", command, requestId: randomUUID(), now });
  };
  const roundMetadata = { capacity: 10, startTimeText: "21:00", scheduledStartAt: null, gameInfo: null, organizerText: null, noticeText: null };
  const member = (slotNo: number, name: string) => ({ slotNo, name, riotId: null, mainPosition: "MID" as const, subPositions: [], reserve: false });
  const sync = (recruitNo: number, body: KakaoSeasonSnapshotDto, participants: Extract<KakaoSeasonSnapshotCommand, { action: "SYNC" }>["participants"]) => send({
    action: "SYNC", seasonId, applyDate, recruitNo, mode: "RIFT", participants, roundMetadata,
    observedSlotNos: Array.from({ length: 20 }, (_, index) => index + 1), reserveSectionObserved: true,
    copyGuard: { operatingDate: null, saveReference: null, formCode: body.formCode },
  });
  const measured = async (label: string, operation: () => ReturnType<typeof send>) => {
    const start = queries.length;
    const startedAt = performance.now();
    const result = await operation();
    const issued = queries.slice(start);
    const memberLookups = issued.filter((query) => /^select /u.test(query) && query.includes(' from "registry"."players" ')).length;
    const applicationLookups = issued.filter((query) => /^select /u.test(query) && query.includes(' from "competition"."season_applications" ') &&
      !query.includes(' join ') && query.includes('"player_id"')).length;
    t.diagnostic(JSON.stringify({ label, queries: issued.length, memberLookups, applicationLookups, elapsedMs: Math.round(performance.now() - startedAt) }));
    assert.equal(memberLookups, label.includes("members-unchanged") ? 0 : 1, "matching query count must not grow with roster size");
    assert.equal(applicationLookups, label.includes("members-save") ? 1 : 0, "existing memberships are checked once for the whole roster");
    return result;
  };
  try {
    await applyMigrations(database);
    await database.insert(seasons).values({ id: seasonId, name: `Batch ${suffix}`, nameNormalized: `batch ${suffix}`, status: "ACTIVE", activatedAt: now });
    const names = Array.from({ length: 10 }, (_, index) => `batch${index}-${suffix}`);
    await database.insert(players).values(names.map((name) => ({ id: randomUUID(), memberName: name, memberNameNormalized: name,
      nickname: `${name}nick`, nicknameNormalized: `${name}nick`, tagLine: "QA", tagLineNormalized: "qa" })));
    for (const [recruitNo, count, registered] of [[1, 1, true], [2, 10, true], [3, 10, false]] as const) {
      const draft = await send({ action: "RESERVE", seasonId, applyDate, recruitNo, mode: "RIFT", participants: [], roundMetadata });
      const rows = names.slice(0, count).map((name, index) => member(index + 1, registered ? name : `guest-${name}`));
      const saved = await measured(`${count}-${registered ? "members" : "guests"}-save`, () => sync(recruitNo, draft.body, rows));
      assert.equal(saved.body.entries.length, count);
      assert.equal(saved.body.appliedCount, registered ? count : 0);
      assert.equal(saved.body.pendingCount, registered ? 0 : count);
      const unchanged = await measured(`${count}-${registered ? "members" : "guests"}-unchanged`, () => sync(recruitNo, saved.body, rows));
      assert.equal(unchanged.body.updatedCount, 0);
      assert.equal(unchanged.body.entries.length, count);
    }
    const duplicateDraft = await send({ action: "RESERVE", seasonId, applyDate, recruitNo: 4, mode: "RIFT", participants: [], roundMetadata });
    await assert.rejects(sync(4, duplicateDraft.body, [member(1, names[0]!), member(2, `${names[0]}nick`)]),
      (error: unknown) => error instanceof KakaoAssistantError && error.code === "CONFLICT");
    const afterDuplicate = await send({ action: "STATUS", seasonId, applyDate, recruitNo: 4, participants: [] });
    assert.equal(afterDuplicate.body.entries.length, 0, "two aliases in one batch roll back the entire save");
    // A cancelled membership can be reused after a delete in the same save.
    const single = await sync(4, duplicateDraft.body, [member(1, names[0]!)]);
    const renamed = await sync(4, single.body, [member(2, `${names[0]}nick`)]);
    assert.equal(renamed.body.entries.length, 1);
    assert.equal(renamed.body.entries[0]?.slotNo, 2);
  } finally {
    await database.update(seasons).set({ status: "ENDED", endedAt: new Date() }).where(eq(seasons.id, seasonId)).catch(() => undefined);
    await pool.end();
  }
});
