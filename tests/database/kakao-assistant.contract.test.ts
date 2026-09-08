import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { KakaoAssistantError } from "../../src/modules/recruiting/kakao-assistant/domain";
import { PostgresKakaoAssistant } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-assistant";
import { PostgresKakaoImageReceive } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-image-receive";
import { KakaoAdminError, PostgresKakaoAdmin } from "../../src/modules/recruiting/kakao-admin/postgres-kakao-admin";
import { PostgresRecruitingAdapter } from "../../src/modules/recruiting/infrastructure/postgres-recruiting-adapter";
import { FakePrivateImageStorage } from "../../src/modules/matches/infrastructure/private-image";
import type { VerifiedKakaoWebhookIntent } from "../../src/modules/recruiting/infrastructure/kakao-signature";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { players } from "../../src/platform/db/schema/registry";
import { authSessions, userAccounts } from "../../src/platform/db/schema/auth";
import { matchSubmissionImages, matchSubmissions, privateAssets } from "../../src/platform/db/schema/matches";
import { kakaoImageSessions, kakaoInboundImages, kakaoOperationSettings, recruitParties, recruitingCommandReceipts, recruitingNonceBindings, recruitingOutbox } from "../../src/platform/db/schema/recruiting";
import { seasonApplications, seasonKakaoPendingApplications, seasons } from "../../src/platform/db/schema/seasons";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const principalId = "bot:kakao-assistant-contract";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function intent(nonce: string, body: string): VerifiedKakaoWebhookIntent {
  return {
    kind: "KAKAO_HMAC",
    keyId: "contract",
    timestampSeconds: Math.floor(Date.now() / 1_000),
    nonce,
    roomId: "room-contract",
    senderId: "operator-contract",
    bodyDigestHex: digest(body),
    requireNonceClaim: true,
    transactionRecheck: true,
  };
}

test("signed Kakao reads persist safe replay receipts and never expose private member data", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const playerId = randomUUID();
  const partyId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  try {
    await applyMigrations(database);
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
    await database.insert(recruitParties).values({
      id: partyId,
      recruitDate: "2099-01-01",
      recruitNumber: 91,
      type: "FLEX_RANK",
      status: "IN_PROGRESS",
      title: "Kakao 계약 파티",
      maximumMembers: 5,
      membersJson: [{ name: "절대 노출 금지", position: "MID", slotNo: 1, substitute: false }],
      lastActivityAt: new Date(),
    });
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
    });
    const ownParty = status.body.parties.find((party) => party.id === partyId);
    assert.ok(ownParty);
    assert.equal(ownParty.memberCount, 1);
    assert.equal("members" in ownParty, false);
    assert.equal(JSON.stringify(status.body).includes("절대 노출 금지"), false);

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
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
    });
    assert.equal(notice.body.positionCounts.MID >= 1, true);
    assert.equal(notice.body.remaining, Math.max(10 - notice.body.total, 0));
    assert.equal(JSON.stringify(notice.body).includes("비공개"), false);

    assert.equal((await database.select().from(recruitingCommandReceipts).where(eq(recruitingCommandReceipts.actorPrincipalId, principalId))).length, 3);
    assert.equal((await database.select().from(recruitingNonceBindings).where(and(
      eq(recruitingNonceBindings.actorKind, "BOT"), eq(recruitingNonceBindings.actorPrincipalId, principalId),
    ))).length, 3);
    if (createdActiveSeasonId) {
      await database.update(seasons).set({ status: "ENDED", endedAt: new Date(), revision: 1 }).where(eq(seasons.id, createdActiveSeasonId));
    }
  } finally {
    await pool.end();
  }
});

test("signed Kakao season snapshots match exact players and preserve unresolved entries for review", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID();
  const exactPlayerId = randomUUID();
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
    ]);
    const assistant = new PostgresKakaoAssistant(database);
    const command = {
      action: "SYNC" as const, seasonId, applyDate: today, recruitNo: 7,
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
    assert.equal(first.body.appliedCount, 1);
    assert.equal(first.body.reserveCount, 1);
    assert.equal(first.body.confirmedCount, 0);
    assert.equal(first.body.pendingCount, 2);
    assert.deepEqual(first.body.entries.map((entry) => entry.status), ["APPLIED", "UNMATCHED", "AMBIGUOUS", "MATCHED_RESERVE"]);
    assert.deepEqual(first.body.entries[0], {
      slotNo: 1,
      status: "APPLIED",
      source: "KAKAO",
      suppliedName: `Exact${suffix}`,
      suppliedRiotId: `Exact${suffix}#KR1`,
      mainPosition: "MID",
      subPositions: ["SUP"],
      player: { playerId: exactPlayerId, displayName: `Exact${suffix}`, riotId: `Exact${suffix}#KR1` },
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
    const createdInput = {
      actorSession, targetType: "MATCH_SUBMISSION" as const, targetReference: publicCode, expectedRevision: 0,
      requestKey: `create-${ownerId}`, bodyDigestHex: digest("create-image-session"), requestId: randomUUID(),
      scope: `me:match-submissions:${publicCode}:kakao-session:create`, roomId: "room-contract", senderId: "operator-contract", now,
    };
    const created = await service.createOwnerSession(createdInput);
    assert.equal(created.body.status, "ACTIVE");
    assert.equal((await service.createOwnerSession(createdInput)).replayed, true);
    const storedSession = (await database.select().from(kakaoImageSessions).where(eq(kakaoImageSessions.id, created.body.sessionId)))[0];
    assert.equal(storedSession?.roomIdHash.length, 32);
    assert.equal(storedSession?.senderIdHash.length, 32);
    assert.equal(JSON.stringify(storedSession).includes("room-contract"), false);

    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#dff5ff" } }).png().toBuffer();
    const sha256Hex = createHash("sha256").update(bytes).digest("hex");
    const command = { sessionId: created.body.sessionId, base64Image: bytes.toString("base64"), declaredContentType: "image/png" as const, declaredSha256Hex: sha256Hex, originalFileName: "scoreboard.png" };
    await assert.rejects(service.receive({ actorPrincipalId: principalId, intent: { ...intent("nonce-image-wrong", "wrong-room"), roomId: "another-room" }, requestKey: `image-wrong-${ownerId}`, scope: "kakao:image-receive", requestId: randomUUID(), command, now }), (error) => error instanceof KakaoAssistantError && error.code === "NOT_FOUND");
    const receivedInput = { actorPrincipalId: principalId, intent: intent("nonce-image-valid", "valid-image"), requestKey: `image-valid-${ownerId}`, scope: "kakao:image-receive", requestId: randomUUID(), command, now };
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
