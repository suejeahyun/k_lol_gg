import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { and, eq } from "drizzle-orm";

import { KakaoAssistantError } from "../../src/modules/recruiting/kakao-assistant/domain";
import { PostgresKakaoAssistant } from "../../src/modules/recruiting/kakao-assistant/postgres-kakao-assistant";
import type { VerifiedKakaoWebhookIntent } from "../../src/modules/recruiting/infrastructure/kakao-signature";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { players } from "../../src/platform/db/schema/registry";
import { recruitParties, recruitingCommandReceipts, recruitingNonceBindings } from "../../src/platform/db/schema/recruiting";
import { seasonApplications, seasons } from "../../src/platform/db/schema/seasons";
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
