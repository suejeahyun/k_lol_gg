import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
  hashKakaoV4EventId,
  hashRecruitingRequestKey,
  recruitingCommandScope,
  sealRecruitingCommand,
  RecruitingApplicationError,
  RecruitingCommandHandler,
  type RecruitingCommand,
} from "../../src/modules/recruiting";
import { PostgresRecruitingAdapter } from "../../src/modules/recruiting/infrastructure/postgres-recruiting-adapter";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  auditEvents,
  authSessions,
  recruitParties,
  recruitingCommandReceipts,
  recruitingNonceBindings,
  recruitingOutbox,
  scrimRecruits,
  kakaoRoomMembers,
  kakaoRooms,
  userAccounts,
} from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

const bodyDigestHex = "ab".repeat(32);

function accountCreateCommand(input: Readonly<{
  accountId: string;
  sessionId: string;
  aggregateId: string;
  requestKey: string;
  title?: string;
}>) {
  const payload = {
    recruitDate: "2026-09-07",
    resetSequence: 0,
    recruitNumber: 1,
    partyType: "FLEX_RANK" as const,
    title: input.title ?? "저녁 자유 랭크",
    maximumMembers: 5,
    members: [{ name: "계약 참가자", position: "TOP" as const, slotNo: 1, substitute: false }],
    scheduledStartAt: null,
    protectedUntil: null,
  };
  return sealRecruitingCommand({
    type: "CREATE_PARTY",
    aggregateId: input.aggregateId,
    metadata: {
      actor: {
        kind: "ACCOUNT",
        principalId: input.accountId,
        sessionActor: { userAccountId: input.accountId, sessionId: input.sessionId, role: "USER", authVersion: 0 },
        authorizationIntent: { kind: "APPROVED_ACCOUNT", transactionRecheck: true },
      },
      requestId: randomUUID(),
      expectedRevision: 0,
      issuedAt: new Date().toISOString(),
      idempotency: {
        scope: recruitingCommandScope("ACCOUNT", "CREATE_PARTY"),
        keyHash: hashRecruitingRequestKey(input.requestKey),
        requestFingerprint: new Uint8Array(32),
        bodyDigestHex,
      },
    },
    payload,
  } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>);
}

test("S09 PostgreSQL adapter commits aggregate, receipt, audit and outbox atomically with owner/session checks", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const accountId = randomUUID();
  const sessionId = randomUUID();
  const partyId = randomUUID();
  const adapter = new PostgresRecruitingAdapter(database);
  const handler = new RecruitingCommandHandler({
    unitOfWork: adapter,
    repository: adapter,
    authorization: adapter,
    receipts: adapter,
    audit: adapter.auditPort(),
    outbox: adapter.outboxPort(),
    clock: { now: () => new Date(), receiptExpiresAt: (now) => new Date(now.getTime() + 86_400_000) },
  });

  try {
    await applyMigrations(database);
    await applyMigrations(database);
    const now = new Date();
    await database.insert(userAccounts).values({ id: accountId, loginId: "s09-owner", loginIdNormalized: "s09-owner", status: "APPROVED" });
    await database.insert(authSessions).values({
      id: sessionId,
      tokenHash: randomBytes(32),
      userAccountId: accountId,
      authVersion: 0,
      role: "USER",
      purpose: "ACCOUNT",
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
    });

    const command = accountCreateCommand({ accountId, sessionId, aggregateId: partyId, requestKey: "s09-contract-create-0001" });
    const created = await handler.handle(command);
    assert.equal(created.replayed, false);
    assert.equal(created.revision, 0);
    const replay = await handler.handle(command);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.body, created.body);

    const rows = await database.select().from(recruitParties).where(eq(recruitParties.id, partyId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.ownerUserAccountId, accountId);
    assert.equal((await database.select().from(recruitingCommandReceipts)).length, 1);
    assert.equal((await database.select().from(recruitingOutbox)).length, 1);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "RECRUIT_PARTY"))).length, 1);
    const feed = await adapter.listPublicFeed();
    assert.equal(feed.parties.length, 1);
    assert.deepEqual(Object.keys(feed.parties[0]!).sort(), ["gameInfo", "id", "maximumMembers", "memberCount", "members", "organizerText", "recruitNumber", "scheduledStartAt", "startTimeText", "status", "title", "type"]);
    assert.deepEqual(feed.parties[0]!.members, [{ name: "계약 참가자", position: "TOP", slotNo: 1, substitute: false }]);

    const changed = accountCreateCommand({ accountId, sessionId, aggregateId: partyId, requestKey: "s09-contract-create-0001", title: "다른 본문" });
    await assert.rejects(handler.handle(changed), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "IDEMPOTENCY_MISMATCH");
    assert.equal((await database.select().from(recruitParties)).length, 1);

    await database.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, sessionId));
    const blocked = accountCreateCommand({ accountId, sessionId, aggregateId: randomUUID(), requestKey: "s09-contract-revoked-0002" });
    await assert.rejects(handler.handle(blocked), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "SESSION_STALE");
    assert.equal((await database.select().from(recruitParties)).length, 1);
  } finally {
    await pool.end();
  }
});

test("party member statistics are bounded and count distinct parties and primary companions", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const adapter = new PostgresRecruitingAdapter(database);
  const suffix = randomBytes(4).toString("hex");
  const targetName = `통계대상${suffix}`;
  const alice = `동반자A${suffix}`;
  const bob = `동반자B${suffix}`;
  const charlie = `동반자C${suffix}`;
  const reserve = `예비${suffix}`;
  const sourceRoomId = `stats-${suffix}`;
  const today = new Date().toISOString().slice(0, 10);
  const oldDate = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const resetSequence = Number.parseInt(suffix, 16) % 1_000_000_000;
  const member = (name: string, slotNo: number, substitute = false) => ({ name, position: null, slotNo, substitute });
  const rows = [
    { status: "IN_PROGRESS" as const, membersJson: [member(targetName, 1), member(alice, 2), member(bob, 3), member(reserve, 1, true)] },
    { status: "FINISHED" as const, membersJson: [member(targetName, 1), member(alice, 2)] },
    { status: "CANCELED" as const, membersJson: [member(targetName, 1), member(bob, 2)] },
    { status: "RESET" as const, membersJson: [member(targetName, 1), member(charlie, 2)] },
    { status: "DRAFT" as const, membersJson: [member(targetName, 1), member(reserve, 2)] },
  ];

  try {
    await applyMigrations(database);
    await database.insert(recruitParties).values([
      ...rows.map((row, index) => ({
        id: randomUUID(),
        sourceRoomId,
        recruitDate: today,
        resetSequence,
        recruitNumber: index + 1,
        type: "PARTY_NUMBER" as const,
        status: row.status,
        title: `통계 계약 ${index + 1}`,
        maximumMembers: 5,
        membersJson: row.membersJson,
        lastActivityAt: new Date(),
      })),
      {
        id: randomUUID(),
        sourceRoomId,
        recruitDate: oldDate,
        resetSequence,
        recruitNumber: 6,
        type: "PARTY_NUMBER" as const,
        status: "FINISHED" as const,
        title: "집계 기간 밖 계약",
        maximumMembers: 5,
        membersJson: [member(targetName, 1), member(reserve, 2)],
        lastActivityAt: new Date(),
      },
    ]);

    const statistics = await adapter.getPartyMemberStats(targetName.toLocaleLowerCase("ko-KR"));
    assert.equal(statistics.items.length, 1);
    const result = statistics.items[0];
    assert.ok(result);
    assert.equal(result.name, targetName);
    assert.deepEqual({
      total: result.totalPartyCount,
      current: result.inProgressCount,
      finished: result.finishedCount,
      canceled: result.canceledCount,
      reset: result.resetCount,
    }, { total: 4, current: 1, finished: 1, canceled: 1, reset: 1 });
    assert.deepEqual(result.companions.slice(0, 2), [
      { name: alice, partyCount: 2 },
      { name: bob, partyCount: 2 },
    ]);
    assert.equal(result.companions.some((companion) => companion.name === reserve), false);
    await assert.rejects(adapter.getPartyMemberStats("가"), /INVALID_PARTY_MEMBER_STATS_QUERY/u);
  } finally {
    await database.delete(recruitParties).where(eq(recruitParties.sourceRoomId, sourceRoomId));
    await pool.end();
  }
});

test("S09 PostgreSQL adapter binds a BOT nonce to exactly one signed request identity", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const adapter = new PostgresRecruitingAdapter(database);
  const handler = new RecruitingCommandHandler({
    unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter,
    audit: adapter.auditPort(), outbox: adapter.outboxPort(),
    clock: { now: () => new Date(), receiptExpiresAt: (now) => new Date(now.getTime() + 86_400_000) },
  });
  const nonce = "s09_nonce_contract_123456";
  function botCommand(aggregateId: string, requestKey: string, recruitNumber: number) {
    const now = new Date();
    return sealRecruitingCommand({
      type: "CREATE_PARTY",
      aggregateId,
      metadata: {
        actor: { kind: "BOT", principalId: "bot:kakao", commandSource: "COMPAT_V1", authorizationIntent: { kind: "KAKAO_HMAC", keyId: "current", timestampSeconds: Math.floor(now.getTime()/1000), nonce, roomId: "room-1", senderId: "operator-1", bodyDigestHex, requireNonceClaim: true, transactionRecheck: true } },
        requestId: randomUUID(), expectedRevision: 0, issuedAt: new Date(Math.floor(now.getTime()/1000)*1000).toISOString(),
        idempotency: { scope: recruitingCommandScope("BOT", "CREATE_PARTY"), keyHash: hashRecruitingRequestKey(requestKey), requestFingerprint: new Uint8Array(32), bodyDigestHex },
      },
      payload: { recruitDate: "2026-09-08", resetSequence: 0, recruitNumber, partyType: "ARAM", title: `봇 모집 ${recruitNumber}`, maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null },
    } satisfies Extract<RecruitingCommand, { type: "CREATE_PARTY" }>);
  }
  try {
    await applyMigrations(database);
    const first = botCommand(randomUUID(), "s09-bot-contract-0001", 1);
    await handler.handle(first);
    await assert.rejects(handler.handle(botCommand(randomUUID(), "s09-bot-contract-0002", 2)), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");
    assert.equal((await database.select().from(recruitingNonceBindings)).length, 1);
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.recruitDate, "2026-09-08"))).length, 1);
    const storedNonce = await database.select().from(recruitingNonceBindings);
    assert.notEqual(storedNonce[0]?.nonceHash.toString("utf8"), nonce);
    assert.equal(storedNonce[0]?.bindingHash.length, createHash("sha256").digest().length);
  } finally {
    await pool.end();
  }
});

test("Kakao aggregate controllers block confused-deputy lifecycle mutations", { concurrency: false }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  const previousAllowedSenders = process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS;
  process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = "sender-operator";
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const adapter = new PostgresRecruitingAdapter(database);
  const handler = new RecruitingCommandHandler({
    unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter,
    audit: adapter.auditPort(), outbox: adapter.outboxPort(),
    clock: { now: () => new Date(), receiptExpiresAt: (createdAt) => new Date(createdAt.getTime() + 86_400_000) },
  });
  let sequence = 0;
  const canonicalRoomId = randomUUID();
  function botCommand<Type extends RecruitingCommand["type"]>(input: Readonly<{
    type: Type;
    aggregateId: string;
    expectedRevision: number;
    payload: Extract<RecruitingCommand, { type: Type }>["payload"];
    senderId: string;
    roomId?: string;
    commandSource?: "COMPAT_V1" | "RAW_V2";
  }>): Extract<RecruitingCommand, { type: Type }> {
    sequence += 1;
    const issuedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    return sealRecruitingCommand({
      type: input.type,
      aggregateId: input.aggregateId,
      metadata: {
        actor: {
          kind: "BOT", principalId: "bot:kakao", commandSource: input.commandSource ?? "RAW_V2",
          authorizationIntent: {
            kind: "KAKAO_HMAC", keyId: "current", timestampSeconds: Math.floor(issuedAt.getTime() / 1_000),
            nonce: `controller_nonce_${sequence}_12345678`, roomId: input.roomId ?? canonicalRoomId,
            senderId: input.senderId, bodyDigestHex, requireNonceClaim: true, transactionRecheck: true,
          },
        },
        requestId: randomUUID(), expectedRevision: input.expectedRevision, issuedAt: issuedAt.toISOString(),
        idempotency: {
          scope: recruitingCommandScope("BOT", input.type),
          keyHash: hashRecruitingRequestKey(`controller-key-${sequence}-12345678`),
          requestFingerprint: new Uint8Array(32), bodyDigestHex,
        },
      },
      payload: input.payload,
    } as Extract<RecruitingCommand, { type: Type }>);
  }

  try {
    await applyMigrations(database);
    await database.insert(kakaoRooms).values({ id: canonicalRoomId, displayName: "Controller contract", status: "ACTIVE", registrationSource: "ADMIN" });
    await database.insert(kakaoRoomMembers).values({ id: randomUUID(), roomId: canonicalRoomId, senderFingerprint: "sender-operator", role: "MANAGER" });
    await database.insert(kakaoRoomMembers).values({ id: randomUUID(), roomId: canonicalRoomId, senderFingerprint: "sender-other", role: "MEMBER" });
    const partyId = randomUUID();
    const createParty = botCommand({
      type: "CREATE_PARTY", aggregateId: partyId, expectedRevision: 0, senderId: "sender-creator",
      payload: { recruitDate: "2026-09-09", resetSequence: 90, recruitNumber: 90, partyType: "ARAM", title: "소유권 테스트", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null },
    });
    await handler.handle(createParty);
    assert.equal((await handler.handle(createParty)).replayed, true);
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, partyId)))[0]?.sourceSenderId, "sender-creator");

    const publicRead = botCommand({ type: "GET_PARTY_STATUS", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other" });
    assert.equal((await handler.handle(publicRead)).body.status, "IN_PROGRESS");
    await assert.rejects(handler.handle(botCommand({ type: "GET_PARTY_STATUS", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other", roomId: "room-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "NOT_FOUND");
    await assert.rejects(handler.handle(botCommand({ type: "SYNC_PARTY", aggregateId: partyId, expectedRevision: 0, payload: { members: [] }, senderId: "sender-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");

    const creatorSync = botCommand({ type: "SYNC_PARTY", aggregateId: partyId, expectedRevision: 0, payload: { members: [] }, senderId: "sender-creator" });
    assert.equal((await handler.handle(creatorSync)).revision, 0);
    assert.equal((await handler.handle(creatorSync)).replayed, true);
    await assert.rejects(handler.handle(botCommand({ type: "FINISH_PARTY", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");
    assert.equal((await handler.handle(botCommand({ type: "FINISH_PARTY", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other", commandSource: "COMPAT_V1" }))).body.status, "FINISHED");

    const scrimId = randomUUID();
    await handler.handle(botCommand({
      type: "CREATE_SCRIM", aggregateId: scrimId, expectedRevision: 0, senderId: "sender-creator",
      payload: { recruitDate: "2026-09-09", scrimNumber: 90, tournamentId: randomUUID(), requesterTeamId: randomUUID(), scheduledAt: null, bestOf: 3 },
    }));
    const join = botCommand({ type: "JOIN_SCRIM", aggregateId: scrimId, expectedRevision: 0, payload: { opponentTeamId: randomUUID() }, senderId: "sender-opponent" });
    assert.equal((await handler.handle(join)).body.status, "MATCHED");
    assert.equal((await database.select().from(scrimRecruits).where(eq(scrimRecruits.id, scrimId)))[0]?.opponentSenderId, "sender-opponent");
    await assert.rejects(handler.handle(botCommand({ type: "CONFIRM_SCRIM", aggregateId: scrimId, expectedRevision: 1, payload: {}, senderId: "sender-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");
    const opponentConfirm = botCommand({ type: "CONFIRM_SCRIM", aggregateId: scrimId, expectedRevision: 1, payload: {}, senderId: "sender-opponent" });
    assert.equal((await handler.handle(opponentConfirm)).body.status, "CONFIRMED");
    assert.equal((await handler.handle(opponentConfirm)).replayed, true);
    await assert.rejects(handler.handle(botCommand({ type: "COMPLETE_SCRIM", aggregateId: scrimId, expectedRevision: 2, payload: {}, senderId: "sender-creator", roomId: "room-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "NOT_FOUND");
    assert.equal((await handler.handle(botCommand({ type: "COMPLETE_SCRIM", aggregateId: scrimId, expectedRevision: 2, payload: {}, senderId: "sender-creator" }))).body.status, "COMPLETED");
  } finally {
    if (previousAllowedSenders === undefined) delete process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS;
    else process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = previousAllowedSenders;
    await pool.end();
  }
});

test("concurrent V4 party member commands serialize on the locked latest aggregate", { concurrency: false }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adapter = new PostgresRecruitingAdapter(database);
  const handler = new RecruitingCommandHandler({
    unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter,
    audit: adapter.auditPort(), outbox: adapter.outboxPort(),
    clock: { now: () => new Date(), receiptExpiresAt: (createdAt) => new Date(createdAt.getTime() + 86_400_000) },
  });
  const suffix = randomBytes(8).toString("hex");
  const partyId = randomUUID();
  const principalId = `bot:kakao:v4:member-${suffix}`;
  const roomId = `room-v4-member-${suffix}`;
  let sequence = 0;

  function v4Command<Type extends RecruitingCommand["type"]>(
    type: Type,
    payload: Extract<RecruitingCommand, { type: Type }>["payload"],
    senderId: string,
  ): Extract<RecruitingCommand, { type: Type }> {
    sequence += 1;
    const eventId = `event-member-${suffix}-${sequence}`;
    const digest = createHash("sha256").update(JSON.stringify({ type, payload, sequence })).digest("hex");
    const issuedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    return sealRecruitingCommand({
      type,
      aggregateId: partyId,
      metadata: {
        actor: {
          kind: "BOT", principalId, commandSource: "KAKAO_V4",
          authorizationIntent: {
            kind: "KAKAO_HMAC", keyId: "recruit-current", timestampSeconds: Math.floor(issuedAt.getTime() / 1_000),
            nonce: `member_nonce_${suffix}_${sequence}`, installationId: `install-${suffix}`,
            deliveryId: eventId, roomId, senderId, bodyDigestHex: digest,
            requireNonceClaim: true, transactionRecheck: true,
          },
        },
        requestId: randomUUID(), expectedRevision: 0, issuedAt: issuedAt.toISOString(),
        idempotency: {
          scope: recruitingCommandScope("BOT", type, "KAKAO_V4"),
          keyHash: hashKakaoV4EventId(eventId), requestFingerprint: new Uint8Array(32), bodyDigestHex: digest,
        },
      },
      payload,
    } as unknown as Extract<RecruitingCommand, { type: Type }>);
  }

  try {
    await applyMigrations(database);
    await handler.handle(v4Command("CREATE_PARTY", {
      recruitDate: "2026-09-13", resetSequence: 0, recruitNumber: 7,
      partyType: "PARTY_NUMBER", title: "원자적 명단 계약", maximumMembers: 2, members: [],
      startTimeText: null, gameInfo: null, organizerText: null, scheduledStartAt: null, protectedUntil: null, initialStatus: "DRAFT",
    }, `sender-${suffix}-creator`));
    const activationCommand = v4Command("SYNC_PARTY", {
      members: [],
      startTimeText: "모바시", startTimeState: "PRESENT_VALUE",
      gameInfo: "증칼", gameInfoState: "PRESENT_VALUE",
      organizerText: "TEST", organizerState: "PRESENT_VALUE",
      scheduledStartAt: null,
    }, `sender-${suffix}-activator`);
    const activated = await handler.handle(activationCommand);
    const activationReplay = await handler.handle(activationCommand);
    assert.equal(activated.body.status, "IN_PROGRESS");
    assert.equal(activated.body.data.startTimeText, "모바시");
    assert.equal(activated.body.data.gameInfo, "증칼");
    assert.equal(activated.body.data.organizerText, "TEST");
    assert.equal(activated.body.data.memberCount, 1);
    assert.equal(activationReplay.replayed, true);
    assert.deepEqual(activationReplay.body, activated.body);

    const [first, second] = await Promise.all([
      handler.handle(v4Command("PARTY_MEMBER_ADD", { name: `첫째-${suffix}` }, `sender-${suffix}-a`)),
      handler.handle(v4Command("PARTY_MEMBER_ADD", { name: `둘째-${suffix}` }, `sender-${suffix}-b`)),
    ]);
    assert.equal(first.body.data.outcome, "APPLIED");
    assert.equal(second.body.data.outcome, "APPLIED");
    assert.deepEqual([first.revision, second.revision].sort((left, right) => left - right), [2, 3]);

    const stored = (await database.select().from(recruitParties).where(eq(recruitParties.id, partyId)))[0];
    assert.ok(stored);
    assert.equal(stored.recruitDate, "2026-09-13");
    assert.equal(stored.recruitNumber, 7);
    assert.equal(stored.status, "IN_PROGRESS");
    assert.equal(stored.revision, 3);
    assert.equal(stored.startTimeText, "모바시");
    assert.equal(stored.gameInfo, "증칼");
    assert.equal(stored.organizerText, "TEST");
    const members = stored.membersJson as readonly Readonly<{ name: string; slotNo: number; substitute: boolean }>[];
    assert.deepEqual(members.map((member) => [member.slotNo, member.substitute]), [
      [1, false], [2, false], [1, true],
    ]);
    assert.equal(members[0]?.name, "TEST");
    assert.deepEqual(members.slice(1).map((member) => member.name).sort(), [`둘째-${suffix}`, `첫째-${suffix}`].sort());

    const duplicateCommand = v4Command("PARTY_MEMBER_ADD", { name: members[0]!.name }, `sender-${suffix}-c`);
    const duplicate = await handler.handle(duplicateCommand);
    assert.equal(duplicate.body.data.outcome, "ALREADY_PRESENT");
    assert.equal(duplicate.revision, 3);
    const duplicateReplay = await handler.handle(duplicateCommand);
    assert.equal(duplicateReplay.replayed, true);
    assert.deepEqual(duplicateReplay.body.data, duplicate.body.data);
    const missing = await handler.handle(v4Command("PARTY_MEMBER_REMOVE", { name: `없음-${suffix}` }, `sender-${suffix}-d`));
    assert.equal(missing.body.data.outcome, "NOT_FOUND");
    assert.equal(missing.revision, 3);

    const removed = await handler.handle(v4Command("PARTY_MEMBER_REMOVE", { name: members[0]!.name }, `sender-${suffix}-e`));
    assert.equal(removed.body.data.outcome, "APPLIED");
    assert.equal(removed.revision, 4);
    const afterRemoval = (await database.select().from(recruitParties).where(eq(recruitParties.id, partyId)))[0]!;
    assert.deepEqual(afterRemoval.membersJson, [members[1], members[2]], "remaining primary and reserve slots are preserved without promotion");
    assert.equal(afterRemoval.organizerText, "TEST", "removing the organizer participant keeps organizer metadata");
    const partyAudits = await database.select({
      action: auditEvents.action,
      metadata: auditEvents.metadataJson,
    }).from(auditEvents).where(eq(auditEvents.targetId, partyId));
    assert.equal(partyAudits.length, 5);
    const memberAuditMetadata = partyAudits
      .filter((event) => event.action === "RECRUITING_PARTY_MEMBER_ADD" || event.action === "RECRUITING_PARTY_MEMBER_REMOVE")
      .map((event) => event.metadata);
    assert.deepEqual(memberAuditMetadata.map((metadata) => metadata?.roomId), [roomId, roomId, roomId]);
    assert.deepEqual(memberAuditMetadata.map((metadata) => metadata?.senderId).sort(), [
      `sender-${suffix}-a`,
      `sender-${suffix}-b`,
      `sender-${suffix}-e`,
    ]);
    assert.equal(memberAuditMetadata.every((metadata) =>
      metadata?.actorKind === "BOT" && metadata.actorPrincipalId === principalId &&
      !("keyId" in metadata) && !("displayName" in metadata) && !("memberName" in metadata)
    ), true, "audit metadata contains only pseudonymous actor/room/sender identifiers");
    assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateId, partyId))).length, 5);
    assert.equal((await database.select().from(recruitingCommandReceipts).where(eq(recruitingCommandReceipts.actorPrincipalId, principalId))).length, 7);
  } finally {
    await pool.end();
  }
});

test("concurrent V4 scrim participant commands compose after the database row lock", { concurrency: false }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adapter = new PostgresRecruitingAdapter(database);
  const handler = new RecruitingCommandHandler({
    unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter,
    audit: adapter.auditPort(), outbox: adapter.outboxPort(),
    clock: { now: () => new Date(), receiptExpiresAt: (createdAt) => new Date(createdAt.getTime() + 86_400_000) },
  });
  const suffix = randomBytes(8).toString("hex");
  const scrimId = randomUUID();
  const principalId = `bot:kakao:v4:scrim-member-${suffix}`;
  const roomId = `room-v4-scrim-member-${suffix}`;
  let sequence = 0;
  function v4Command<Type extends RecruitingCommand["type"]>(
    type: Type,
    payload: Extract<RecruitingCommand, { type: Type }>["payload"],
    senderId: string,
  ): Extract<RecruitingCommand, { type: Type }> {
    sequence += 1;
    const eventId = `event-scrim-member-${suffix}-${sequence}`;
    const digest = createHash("sha256").update(JSON.stringify({ type, payload, sequence })).digest("hex");
    const issuedAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    return sealRecruitingCommand({
      type,
      aggregateId: scrimId,
      metadata: {
        actor: {
          kind: "BOT", principalId, commandSource: "KAKAO_V4",
          authorizationIntent: {
            kind: "KAKAO_HMAC", keyId: "recruit-current", timestampSeconds: Math.floor(issuedAt.getTime() / 1_000),
            nonce: `scrim_member_nonce_${suffix}_${sequence}`, installationId: `install-${suffix}`,
            deliveryId: eventId, roomId, senderId, bodyDigestHex: digest,
            requireNonceClaim: true, transactionRecheck: true,
          },
        },
        requestId: randomUUID(), expectedRevision: 0, issuedAt: issuedAt.toISOString(),
        idempotency: {
          scope: recruitingCommandScope("BOT", type, "KAKAO_V4"),
          keyHash: hashKakaoV4EventId(eventId), requestFingerprint: new Uint8Array(32), bodyDigestHex: digest,
        },
      },
      payload,
    } as unknown as Extract<RecruitingCommand, { type: Type }>);
  }

  try {
    await applyMigrations(database);
    await handler.handle(v4Command("CREATE_SCRIM", {
      recruitDate: new Date().toISOString().slice(0, 10), scrimNumber: 98,
      tournamentId: randomUUID(), legacyTournamentNumber: null, requesterTeamId: randomUUID(),
      requesterTeamName: "요청팀", opponentTeamName: null, requesterLineup: null, opponentLineup: null,
      title: "동시 스크림 명단", memo: null, seriesRuleText: "3판2선", organizerText: "주최자",
      scheduledAt: null, bestOf: 3,
    }, `sender-${suffix}-creator`));

    const [first, second] = await Promise.all([
      handler.handle(v4Command("ADD_SCRIM_PARTICIPANT", { name: `탑-${suffix}`, team: "REQUESTER", position: "TOP" }, `sender-${suffix}-a`)),
      handler.handle(v4Command("ADD_SCRIM_PARTICIPANT", { name: `미드-${suffix}`, team: "REQUESTER", position: "MID" }, `sender-${suffix}-b`)),
    ]);
    assert.deepEqual([first.revision, second.revision].sort((left, right) => left - right), [1, 2]);
    const stored = (await database.select().from(scrimRecruits).where(eq(scrimRecruits.id, scrimId)))[0]!;
    assert.equal(stored.revision, 2);
    assert.equal(stored.requesterLineupJson?.top, `탑-${suffix}`);
    assert.equal(stored.requesterLineupJson?.mid, `미드-${suffix}`);

    const duplicateCommand = v4Command("ADD_SCRIM_PARTICIPANT", { name: `탑-${suffix}`, team: "REQUESTER", position: "TOP" }, `sender-${suffix}-c`);
    const duplicate = await handler.handle(duplicateCommand);
    assert.equal(duplicate.body.data.outcome, "ALREADY_PRESENT");
    assert.equal(duplicate.revision, 2);
    assert.equal((await handler.handle(duplicateCommand)).replayed, true);
  } finally {
    await pool.end();
  }
});
