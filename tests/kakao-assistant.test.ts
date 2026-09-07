import assert from "node:assert/strict";
import test from "node:test";

import {
  KakaoAssistantError,
  parseManagedOperationFormBody,
  parseOpenChatBody,
  parsePlayerSearchBody,
  parseScheduledNoticeBody,
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

test("managed forms route only the explicit operation-form command", () => {
  assert.deepEqual(parseManagedOperationFormBody({
    command: "SUBMIT_OPERATION_FORM",
    formType: "suggestions",
    payload: { applicantName: "신청자" },
  }), { formType: "suggestions", payload: { applicantName: "신청자" } });
  assert.throws(() => parseManagedOperationFormBody({ command: "SEASON_APPLY", formType: "suggestions", payload: {} }), KakaoAssistantError);
  assert.throws(() => parseManagedOperationFormBody({ command: "SUBMIT_OPERATION_FORM", formType: "suggestions", payload: {}, actorUserAccountId: "forged" }), KakaoAssistantError);
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
