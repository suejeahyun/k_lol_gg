import assert from "node:assert/strict";
import test from "node:test";

import {
  KakaoAssistantError,
  parseManagedOperationFormBody,
  parseKakaoImageReceiveBody,
  parseKakaoImageSessionBody,
  parseKakaoImageSessionRevokeBody,
  parseOpenChatBody,
  parsePlayerSearchBody,
  parseScheduledNoticeBody,
  parseSeasonSnapshotBody,
  toKakaoPlayerSearchItem,
} from "../src/modules/recruiting/kakao-assistant/domain";

test("Kakao assistant accepts only exact bounded search and read commands", () => {
  assert.deepEqual(parsePlayerSearchBody({ query: " 전적 Ahri#KR1 " }), { command: "SEARCH_PLAYER", query: "Ahri#KR1" });
  assert.deepEqual(parseOpenChatBody({ command: "STATUS" }), { command: "STATUS" });
  assert.deepEqual(parseOpenChatBody({ command: "SEARCH_PLAYER", query: "별빛" }), { command: "SEARCH_PLAYER", query: "별빛" });
  assert.deepEqual(parseScheduledNoticeBody({}), { slot: null });
  assert.deepEqual(parseScheduledNoticeBody({ slot: 21 }), { slot: "21" });
  assert.throws(() => parsePlayerSearchBody({ query: "Ahri", memberName: "private" }), KakaoAssistantError);
  assert.throws(() => parseOpenChatBody({ command: "RESET" }), KakaoAssistantError);
  assert.throws(() => parseScheduledNoticeBody({ roomName: "untrusted-room" }), KakaoAssistantError);
});

test("Kakao season snapshots require exact bounded participant slots and positions", () => {
  const command = parseSeasonSnapshotBody({
    action: "SYNC",
    seasonId: "11111111-1111-4111-8111-111111111111",
    applyDate: "2026-09-07",
    recruitNo: 2,
    participants: [{ slotNo: 1, name: " 별빛 ", riotId: "Ahri#KR1", mainPosition: "MID", subPositions: ["SUP"], reserve: false }],
  });
  assert.equal(command.participants[0]?.name, "별빛");
  assert.deepEqual(parseSeasonSnapshotBody({
    action: "STATUS", seasonId: command.seasonId, applyDate: command.applyDate, recruitNo: 2,
  }).participants, []);
  assert.throws(() => parseSeasonSnapshotBody({ ...command, participants: [...command.participants, command.participants[0]] }), KakaoAssistantError);
  assert.throws(() => parseSeasonSnapshotBody({ ...command, participants: [{ ...command.participants[0], subPositions: ["MID"] }] }), KakaoAssistantError);
  assert.throws(() => parseSeasonSnapshotBody({ ...command, sender: "forged" }), KakaoAssistantError);
});

test("managed forms route only the explicit operation-form command", () => {
  assert.deepEqual(parseManagedOperationFormBody({
    command: "SUBMIT_OPERATION_FORM",
    formType: "suggestions",
    payload: { applicantName: "신청자" },
  }), { formType: "suggestions", payload: { applicantName: "신청자" } });
  assert.throws(() => parseManagedOperationFormBody({ command: "SEASON_APPLY", formType: "suggestions", payload: {} }), KakaoAssistantError);
  assert.throws(() => parseManagedOperationFormBody({ command: "SUBMIT_OPERATION_FORM", formType: "suggestions", payload: {}, actorUserAccountId: "forged" }), KakaoAssistantError);
});

test("Kakao image receive requires an owner-created opaque session and exact bounded fields", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(parseKakaoImageSessionBody({ roomId: "room:contract", senderId: "sender.contract" }), {
    roomId: "room:contract", senderId: "sender.contract",
  });
  assert.deepEqual(parseKakaoImageSessionRevokeBody({ sessionId }), { sessionId });
  const command = parseKakaoImageReceiveBody({
    sessionId,
    base64Image: Buffer.alloc(12, 1).toString("base64"),
    declaredContentType: "image/png",
    declaredSha256Hex: "a".repeat(64),
    originalFileName: null,
  });
  assert.equal(command.sessionId, sessionId);
  assert.equal("publicCode" in command, false);
  assert.throws(() => parseKakaoImageReceiveBody({ ...command, publicCode: "FORGED-PUBLIC-CODE" }), KakaoAssistantError);
  assert.throws(() => parseKakaoImageSessionBody({ roomId: "room", senderId: "display name" }), KakaoAssistantError);
});

test("player search DTO is an explicit public allowlist", () => {
  const dto = toKakaoPlayerSearchItem({
    id: "player-1",
    displayName: "별빛",
    riotId: "별빛#KR1",
    mainPosition: "MID",
    tier: "GOLD",
    recentMatches: 123,
    winRate: 99,
  });
  assert.deepEqual(Object.keys(dto).sort(), ["displayName", "mainPosition", "playerId", "riotId", "tier"]);
  assert.equal("recentMatches" in dto, false);
  assert.equal("winRate" in dto, false);
});
