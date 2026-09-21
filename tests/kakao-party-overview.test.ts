import assert from "node:assert/strict";
import test from "node:test";

import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { parsePartyForm } from "../src/modules/recruiting/kakao-v4/party-snapshot-parser";
import { v1StrictPartyDetailReply, v1StrictPartyStatusReply, v1StrictPartyTemplate } from "../src/modules/recruiting/kakao-v4/v1-strict-party-replies";

type Party = KakaoOpenChatStatusDto["parties"][number];
function party(recruitNumber: number): Party {
  return { id: `party-${recruitNumber}`, revision: 1, recruitDate: "2026-09-22", resetSequence: 0,
    recruitNumber, type: "PARTY_NUMBER", status: "IN_PROGRESS", title: "5인 파티", maximumMembers: 5,
    members: [{ name: "합성참가자", position: null, slotNo: 1, substitute: false }],
    memberCount: 1, reserveCount: 0, startTimeText: "모바시", gameInfo: "증칼", scheduledStartAt: null };
}

test("ADR0011 overview includes all 99 numbers, bounds only summaries and keeps drafts private", () => {
  const parties = Array.from({ length: 99 }, (_, index) => ({ ...party(99 - index), title: "😀".repeat(80),
    startTimeText: "합성 긴 시간 ".repeat(20), gameInfo: "합성 긴 게임 ".repeat(60), formCode: "ABCDE-23456",
    maximumMembers: 99, reserveCount: 98, members: [party(1).members[0]!, ...Array.from({ length: 98 }, (_, reserve) => ({
      name: `합성예비${reserve + 1}`, position: null, slotNo: reserve + 1, substitute: true,
    }))] }));
  const reply = v1StrictPartyStatusReply([...parties, { ...party(100), status: "DRAFT" }]);
  assert.deepEqual([...reply.matchAll(/└ 구인상세 (\d+)/gu)].map((match) => Number(match[1])), Array.from({ length: 99 }, (_, index) => index + 1));
  assert.ok(reply.length < 12_000, `overview length ${reply.length}`);
  assert.doesNotMatch(reply, /합성참가자|양식코드|ABCDE|#100/u);
  assert.ok(reply.isWellFormed(), "summary truncation must not split Unicode surrogate pairs");
  assert.match(v1StrictPartyStatusReply([party(1)]), /모바시 · 증칼/u);
  const detail = v1StrictPartyDetailReply(parties[0]!, 99);
  assert.ok(detail.includes(parties[0]!.gameInfo), "detail retains the complete stored value");
});

test("ADR0011 blank numbered draft round-trips CRLF and an optional display separator", () => {
  const form = v1StrictPartyTemplate({ recruitNumber: 24, recruitDate: "2026-09-22", partyType: "PARTY_NUMBER",
    title: "5인 파티", maximumMembers: 5, formCode: "ABCDE-23456" });
  assert.deepEqual(form.split("\n").slice(0, 5), ["[파티 #24] 5인 파티 · 0/5명", "양식코드: ABCDE-23456", "──────────────", "시작 시간 : ", "게임 종류 : "]);
  for (const input of [form, form.replace("──────────────\n", ""), form.replaceAll("\n", "\r\n")]) {
    const parsed = parsePartyForm(input);
    assert.equal(parsed.decision, "EXACT");
    assert.equal(parsed.startTime.state, "PRESENT_EMPTY");
    assert.equal(parsed.gameInfo.state, "PRESENT_EMPTY");
    assert.equal(parsed.slots.filter((slot) => slot.state === "PRESENT_VALUE").length, 0);
    assert.equal(parsed.saveReference, "ABCDE-23456");
  }
  assert.equal(v1StrictPartyStatusReply([{ ...party(24), status: "DRAFT" }]), "📋 현재 구인\n\n현재 모집 중인 파티가 없습니다.");
});
