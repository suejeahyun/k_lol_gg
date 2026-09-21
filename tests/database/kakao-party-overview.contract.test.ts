import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

import { KakaoAssistantError } from "../../src/modules/recruiting/kakao-assistant/domain";
import { PostgresKakaoAssistant } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-assistant";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { kakaoFormSnapshots } from "../../src/platform/db/schema/kakao-form-snapshots";
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
    const snapshotCount = async () => (await database.select().from(kakaoFormSnapshots).where(eq(kakaoFormSnapshots.scopeHash, scopeHash))).length;
    const list = await assistant.getOpenChatStatus(input());
    assert.deepEqual(list.body.parties.map((party) => party.recruitNumber), Array.from({ length: 23 }, (_, index) => index + 1));
    assert.equal(list.body.partiesTruncated, false);
    assert.equal(list.body.parties.some((party) => party.formCode), false);
    assert.equal(await snapshotCount(), 0);
    const detailInput = input({ recruitDate: date, recruitNumber: 23 });
    const detail = await assistant.getOpenChatStatus(detailInput);
    assert.equal(detail.body.parties.length, 1);
    assert.equal(detail.body.parties[0]?.recruitNumber, 23);
    assert.match(detail.body.parties[0]?.formCode ?? "", /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/u);
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
