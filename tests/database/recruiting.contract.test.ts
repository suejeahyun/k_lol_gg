import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import {
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
    assert.deepEqual(Object.keys(feed.parties[0]!).sort(), ["gameInfo", "id", "maximumMembers", "memberCount", "recruitNumber", "scheduledStartAt", "startTimeText", "status", "title", "type"]);
    assert.equal("members" in feed.parties[0]!, false);

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
    const createdParty = await handler.handle(createParty);
    assert.equal((await handler.handle(createParty)).replayed, true);
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, partyId)))[0]?.sourceSenderId, "sender-creator");

    const publicRead = botCommand({ type: "GET_PARTY_STATUS", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other" });
    assert.equal((await handler.handle(publicRead)).body.status, "IN_PROGRESS");
    await assert.rejects(handler.handle(botCommand({ type: "GET_PARTY_STATUS", aggregateId: partyId, expectedRevision: 0, payload: {}, senderId: "sender-other", roomId: "room-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "NOT_FOUND");
    await assert.rejects(handler.handle(botCommand({ type: "SYNC_PARTY", aggregateId: partyId, expectedRevision: 0, payload: { members: [] }, senderId: "sender-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");

    const creatorSync = botCommand({ type: "SYNC_PARTY", aggregateId: partyId, expectedRevision: 0, payload: { members: [] }, senderId: "sender-creator" });
    assert.equal((await handler.handle(creatorSync)).revision, 1);
    assert.equal((await handler.handle(creatorSync)).replayed, true);
    await assert.rejects(handler.handle(botCommand({ type: "FINISH_PARTY", aggregateId: partyId, expectedRevision: 1, payload: {}, senderId: "sender-other" })), (error: unknown) => error instanceof RecruitingApplicationError && error.code === "FORBIDDEN");
    assert.equal((await handler.handle(botCommand({ type: "FINISH_PARTY", aggregateId: partyId, expectedRevision: 1, payload: {}, senderId: "sender-other", commandSource: "COMPAT_V1" }))).body.status, "FINISHED");

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
