import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { RecruitingCommandHandler } from "../../src/modules/recruiting/application/command-handler";
import { PostgresRecruitingAdapter } from "../../src/modules/recruiting/infrastructure/postgres-recruiting-adapter";
import { issueKakaoRecruitFormSnapshot, loadKakaoRecruitFormSnapshot } from "../../src/modules/recruiting/infrastructure/kakao-form-snapshots";
import { partyCopySnapshot } from "../../src/modules/recruiting/application/party-copy-snapshot";
import { recruitingOperatingDateKey } from "../../src/modules/recruiting/domain/operating-day";
import { KakaoV4CommandService } from "../../src/modules/recruiting/kakao-v4/application";
import { KakaoV4CommandDispatcher } from "../../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope } from "../../src/modules/recruiting/kakao-v4/domain";

import { KakaoAssistantError } from "../../src/modules/recruiting/kakao-assistant/domain";
import { PostgresKakaoAssistant } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-assistant";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { parseRecruitFormReference } from "../../src/modules/recruiting/domain/kakao-recruit-reference";
import { kakaoRecruitCodes, kakaoRecruitFormSnapshots } from "../../src/platform/db/schema/kakao-recruit-form-snapshots";
import { recruitParties } from "../../src/platform/db/schema/recruiting";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("ADR0011 lists more than twenty parties without snapshots and reads scoped active/draft details directly", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 2 });
  const roomId = `room-adr0011-${randomUUID()}`;
  const date = "2098-11-28";
  const now = new Date(`${date}T12:00:00+09:00`);
  const resetSequence = Math.floor(Math.random() * 1_000_000_000);
  const scopeHash = createHash("sha256").update(roomId).digest();
  let request = 0;
  const input = (target?: { recruitDate: string; recruitNumber: number }, scope = roomId) => {
    const requestKey = `adr0011-${roomId}-${++request}`;
    return { actorPrincipalId: `bot:${roomId}`, requestKey, scope: "BOT:KAKAO:PARTY:READ", projection: "PARTY" as const,
      partyTarget: target, now,
      intent: { kind: "KAKAO_HMAC" as const, keyId: "contract", timestampSeconds: Math.floor(Date.now() / 1000),
        nonce: requestKey, roomId: scope, senderId: "synthetic-sender", bodyDigestHex: createHash("sha256").update(requestKey).digest("hex"),
        requireNonceClaim: true as const, transactionRecheck: true as const } };
  };
  try {
    await applyMigrations(database);
    await database.insert(recruitParties).values(Array.from({ length: 24 }, (_, index) => ({
      id: randomUUID(), recruitDate: date, resetSequence, recruitNumber: index + 1, type: "PARTY_NUMBER" as const,
      status: index === 23 ? "DRAFT" as const : "IN_PROGRESS" as const, title: "합성 5인 파티", maximumMembers: 5,
      membersJson: index === 23 ? [] : [{ name: "합성 참가자", position: null, slotNo: 1, substitute: false }],
      startTimeText: "미정", gameInfo: "미입력", sourceRoomId: roomId, lastActivityAt: now,
    })));
    const assistant = new PostgresKakaoAssistant(database);
    const snapshotCount = async () => (await database.select().from(kakaoRecruitFormSnapshots)
      .innerJoin(kakaoRecruitCodes, eq(kakaoRecruitCodes.code, kakaoRecruitFormSnapshots.code)).where(eq(kakaoRecruitCodes.scopeHash, scopeHash))).length;
    const list = await assistant.getOpenChatStatus(input());
    assert.deepEqual(list.body.parties.map((party) => party.recruitNumber), Array.from({ length: 23 }, (_, index) => index + 1));
    assert.equal(list.body.partiesTruncated, false);
    assert.equal(list.body.parties.some((party) => party.formCode), false);
    assert.equal(await snapshotCount(), 0);
    const detailInput = input({ recruitDate: date, recruitNumber: 23 });
    const detail = await assistant.getOpenChatStatus(detailInput);
    assert.equal(detail.body.parties.length, 1);
    assert.equal(detail.body.parties[0]?.recruitNumber, 23);
    assert.equal(parseRecruitFormReference(detail.body.parties[0]?.formCode)?.version, 1);
    assert.equal((await assistant.getOpenChatStatus(detailInput)).replayed, true);
    assert.equal(await snapshotCount(), 1);
    const draft = await assistant.getOpenChatStatus(input({ recruitDate: date, recruitNumber: 24 }));
    assert.equal(draft.body.parties[0]?.status, "DRAFT");
    assert.ok(draft.body.parties[0]?.formCode);
    assert.equal((await assistant.getOpenChatStatus(input({ recruitDate: date, recruitNumber: 23 }, "other-scope"))).body.parties.length, 0);
    assert.equal((await assistant.getOpenChatStatus(input({ recruitDate: "2098-11-27", recruitNumber: 23 }))).body.parties.length, 0);
    assert.equal(await snapshotCount(), 2);
    await database.insert(recruitParties).values({ id: randomUUID(), recruitDate: date, resetSequence: resetSequence + 1,
      recruitNumber: 23, type: "PARTY_NUMBER", status: "IN_PROGRESS", title: "합성 중복 식별자", maximumMembers: 5,
      sourceRoomId: roomId, membersJson: [], lastActivityAt: now });
    await assert.rejects(assistant.getOpenChatStatus(input({ recruitDate: date, recruitNumber: 23 })),
      (error) => error instanceof KakaoAssistantError && error.code === "CONFLICT");
    assert.equal(await snapshotCount(), 2);
  } finally { await pool.end(); }
});

test("public codes, server-day originals, reserve commands and cross-day fresh-service replay retain party identity", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const suffix = randomUUID().replaceAll("-", "");
  const roomId = `room-reliability-${suffix}`, scopeHash = createHash("sha256").update(roomId).digest();
  const oldId = randomUUID(), todayId = randomUUID(), legacyId = randomUUID();
  let now = new Date("2099-11-28T05:55:00+09:00");
  const adapter = new PostgresRecruitingAdapter(database), assistant = new PostgresKakaoAssistant(database);
  const handler = new RecruitingCommandHandler({ unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter,
    audit: adapter.auditPort(), outbox: adapter.outboxPort(), clock: { now: () => now, receiptExpiresAt: at => new Date(at.getTime() + 86_400_000) } });
  const dispatcher = new KakaoV4CommandDispatcher({ recruiting: {
    handle: command => handler.handle(command), resolveCompatTarget: input => adapter.resolveCompatTarget(input),
    findPartyEventReplay: input => adapter.findPartyEventReplay(input),
    resolvePartyRecruitCode: input => adapter.resolvePartyRecruitCode(input), resolveScrimUpsert: input => adapter.resolveScrimUpsert(input),
  }, assistant });
  const service = () => new KakaoV4CommandService({ authorizeProfile: async () => ({ roomId, roomStatus: "ACTIVE", capabilityProfile: "RECRUIT", installationId: `install-${suffix}` }) }, dispatcher, () => now);
  let event = 0;
  const envelope = (text: string, clientTime = now): KakaoV4CommandEnvelope => ({ profileId: "RECRUIT", installationId: `install-${suffix}`,
    senderId: `sender-user-${suffix}`, eventId: `event-reliability-${suffix}-${++event}`, nonce: randomUUID().replaceAll("-", ""), timestamp: Math.floor(clientTime.getTime() / 1_000), text });
  const execute = (input: KakaoV4CommandEnvelope) => service().execute(input, "contract", {
    requestId: randomUUID(), requestDigestHex: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
  });
  const request = (text: string, clientTime = now) => execute(envelope(text, clientTime));
  try {
    await applyMigrations(database);
    const resetSequence = Math.floor(Math.random() * 1_000_000_000);
    const members = [{ name: "합성본참가", position: null, slotNo: 2, substitute: false }];
    await database.insert(recruitParties).values([
      { id: oldId, recruitDate: "2099-11-27", recruitNumber: 2 },
      { id: todayId, recruitDate: "2099-11-28", recruitNumber: 2 },
      { id: legacyId, recruitDate: "2099-11-27", recruitNumber: 3 },
    ].map(identity => ({ ...identity, resetSequence, sourceRoomId: roomId, type: "PARTY_NUMBER" as const, status: "IN_PROGRESS" as const,
      title: "합성 모집", maximumMembers: 5, membersJson: members, startTimeText: "미정", gameInfo: "미입력", lastActivityAt: now })));
    const originals = new Map<string, string>();
    for (const id of [oldId, todayId]) {
      const row = (await database.select().from(recruitParties).where(eq(recruitParties.id, id)))[0]!;
      originals.set(id, await database.transaction(tx => issueKakaoRecruitFormSnapshot(tx, { kind: "PARTY", scopeHash, targetId: id,
        operatingDate: recruitingOperatingDateKey(now), now, state: partyCopySnapshot({ ...row, members: row.membersJson as typeof members }) })));
    }
    // A registry for another installation must not leak into the public card.
    await database.transaction(tx => issueKakaoRecruitFormSnapshot(tx, { kind: "PARTY", scopeHash: Buffer.alloc(32, 8), targetId: legacyId,
      operatingDate: recruitingOperatingDateKey(now), now, state: { synthetic: true } }));
    const beforeRegistry = await database.select().from(kakaoRecruitCodes), beforeSnapshots = await database.select().from(kakaoRecruitFormSnapshots);
    const feed = await adapter.listPublicFeed();
    const oldCard = feed.parties.find(party => party.id === oldId)!, todayCard = feed.parties.find(party => party.id === todayId)!;
    assert.equal(oldCard.recruitNumber, todayCard.recruitNumber);
    assert.notEqual(oldCard.recruitCode, todayCard.recruitCode);
    assert.equal(oldCard.recruitDate, "2099-11-27");
    assert.equal(todayCard.recruitDate, "2099-11-28");
    assert.equal(feed.parties.find(party => party.id === legacyId)!.recruitCode, null);
    assert.deepEqual(await database.select().from(kakaoRecruitCodes), beforeRegistry, "public GET does not issue a registry");
    assert.deepEqual(await database.select().from(kakaoRecruitFormSnapshots), beforeSnapshots, "public GET neither issues nor prunes originals");
    assert.equal((await adapter.resolvePartyRecruitCode({ sourceRoomId: roomId, code: oldCard.recruitCode! }))!.id, oldId);
    assert.equal((await adapter.resolvePartyRecruitCode({ sourceRoomId: roomId, code: todayCard.recruitCode! }))!.id, todayId);

    now = new Date("2099-11-28T05:56:00+09:00");
    const ahead = new Date("2099-11-28T06:00:00+09:00");
    const detail = await request(`구인상세 ${oldCard.recruitCode}`, ahead);
    assert.match(detail.reply, new RegExp(`모집코드: ${oldCard.recruitCode}`));
    assert.match(detail.reply, /명단버전: 1/);
    const base = await database.transaction(tx => loadKakaoRecruitFormSnapshot(tx, { kind: "PARTY", scopeHash, targetId: oldId,
      operatingDate: recruitingOperatingDateKey(now), now, code: originals.get(oldId)! }));
    assert.ok(base, "the original remains valid for the real server operating day despite +240 seconds client skew");
    assert.deepEqual(await database.select().from(kakaoRecruitFormSnapshots), beforeSnapshots);

    const reserveRequest = envelope("상세 2 예비 추가 합성예비1", ahead);
    await execute(reserveRequest);
    await request(`상세 ${oldCard.recruitCode} 대기 추가 합성예비2`, ahead);
    const stored = (await database.select().from(recruitParties).where(eq(recruitParties.id, oldId)))[0]!;
    assert.deepEqual(stored.membersJson, [members[0], { name: "합성예비1", position: null, slotNo: 1, substitute: true }, { name: "합성예비2", position: null, slotNo: 2, substitute: true }]);
    assert.deepEqual((await database.select().from(recruitParties).where(eq(recruitParties.id, todayId)))[0]!.membersJson, members);

    now = new Date("2099-11-28T05:59:59+09:00");
    const createRequest = envelope("5인 파티");
    const created = await execute(createRequest);
    now = new Date("2099-11-28T06:00:01+09:00");
    const replayed = await execute(createRequest);
    assert.equal(created.replayed, false);
    assert.equal(replayed.replayed, true, "a fresh service retrieves the durable receipt after the operating-day boundary");
    assert.equal(replayed.reply, created.reply);
    const createdRows = (await database.select().from(recruitParties).where(eq(recruitParties.sourceRoomId, roomId))).filter(row => row.status === "DRAFT");
    assert.equal(createdRows.length, 1);
    assert.equal(createdRows[0]!.recruitDate, "2099-11-27");

    const reserveReplay = await execute(reserveRequest);
    assert.equal(reserveReplay.replayed, true, "numeric add retry keeps the original UUID even with a new day's identical number");
    assert.match(reserveReplay.reply, new RegExp(`모집코드: ${oldCard.recruitCode}`));
    assert.deepEqual((await database.select().from(recruitParties).where(eq(recruitParties.id, todayId)))[0]!.membersJson, members);
    const replayInput = { actorPrincipalId: `bot:kakao:v4:install-${suffix}`, eventId: reserveRequest.eventId,
      bodyDigestHex: createHash("sha256").update(JSON.stringify(reserveRequest)).digest("hex"), sourceRoomId: roomId,
      commandType: "PARTY_MEMBER_ADD" as const, now };
    assert.equal(await adapter.findPartyEventReplay({ ...replayInput, actorPrincipalId: "bot:another" }), null);
    assert.equal(await adapter.findPartyEventReplay({ ...replayInput, now: new Date(now.getTime() + 2 * 86_400_000) }), null);
    await assert.rejects(adapter.findPartyEventReplay({ ...replayInput, sourceRoomId: "room-other" }), /authorized scope/);
    await assert.rejects(adapter.findPartyEventReplay({ ...replayInput, bodyDigestHex: "ff".repeat(32) }), /another signed request/);
    now = new Date("2099-11-28T05:59:59+09:00");
    const finishRequest = envelope("2ㅉ");
    await execute(finishRequest);
    now = new Date("2099-11-28T06:00:01+09:00");
    assert.equal((await execute(finishRequest)).replayed, true, "finish receipt replays despite the original being terminal");
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, todayId)))[0]!.status, "IN_PROGRESS");
    assert.equal((await database.select().from(recruitParties).where(eq(recruitParties.id, oldId)))[0]!.status, "FINISHED");
  } finally { await pool.end(); }
});
