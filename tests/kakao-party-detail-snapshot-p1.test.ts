import assert from "node:assert/strict";
import test from "node:test";

import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { parsePartyForm } from "../src/modules/recruiting/kakao-v4/party-snapshot-parser";
import { v1StrictPartyDetailReply } from "../src/modules/recruiting/kakao-v4/v1-strict-party-replies";

const party: KakaoOpenChatStatusDto["parties"][number] = {
  id: "party-12",
  revision: 4,
  recruitDate: "2026-09-11",
  resetSequence: 0,
  recruitNumber: 12,
  type: "PARTY_NUMBER",
  title: "5인 파티",
  status: "IN_PROGRESS",
  memberCount: 1,
  reserveCount: 1,
  maximumMembers: 5,
  members: [
    { name: "기존", position: null, slotNo: 1, substitute: false },
    { name: "대기/부캐, 메모", position: null, slotNo: 1, substitute: true },
  ],
  startTimeText: "21:00",
  gameInfo: "자유랭크",
  scheduledStartAt: null,
};

function envelope(text: string): KakaoV4CommandEnvelope {
  return {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-party-detail-p1",
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "4".repeat(32),
    text,
  };
}

function canonical(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope(text));
}

test("the unchanged V1 detail reply can be copied, edited, and synchronized", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  assert.match(detail, /^\[K-LOL\.GG 구인상세 #12\]$/mu);
  assert.match(detail, /^#12 · 5인 파티 · 1\/5$/mu);
  assert.match(detail, /^수정: 이 메시지를 복사해 이름을 고친 뒤 전체 전송$/mu);

  const edited = detail.replace("1. 기존", "1. 새이름 @태그 🎮");
  const parsed = parsePartyForm(edited);
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.recruitNumber, 12);
  assert.deepEqual(parsed.recruitNumbers, [12, 12]);
  assert.equal(parsed.submittedTitle?.partyType, "PARTY_NUMBER");
  assert.equal(parsed.submittedTitle?.maximumMembers, 5);

  const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text: edited });
  assert.equal(classification.kind, "SNAPSHOT");
  const command = canonical(edited);
  assert.equal(command?.domain, "PARTY");
  assert.equal(command?.action, "SYNC");
  if (command?.domain !== "PARTY" || command.action !== "SYNC") return;
  assert.deepEqual(command.payload.members, [
    { slotNo: 1, name: "새이름 @태그 🎮", position: null, substitute: false },
    { slotNo: 1, name: "대기/부캐, 메모", position: null, substitute: true },
  ]);
  assert.equal(command.payload.startTimeText, "21:00");
  assert.equal(command.payload.gameInfo, "자유랭크");
});

test("detail header and summary identity conflicts are ambiguous and never canonicalize", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  for (const text of [
    detail.replace("[K-LOL.GG 구인상세 #12]", "[K-LOL.GG 구인상세 #13]"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 5인 파티 · 1/4"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 자랭 · 1/5"),
    detail.replace("#12 · 5인 파티 · 1/5", "#12 · 5인 파티 · 1/5\n#12 · 5인 파티 · 1/5"),
  ]) {
    assert.equal(parsePartyForm(text).decision, "AMBIGUOUS", text);
    assert.equal(canonical(text), null, text);
  }
});

test("out-of-range detail identifiers and capacities are rejected", () => {
  const detail = v1StrictPartyDetailReply(party, 12);
  const invalidNumber = detail
    .replace("[K-LOL.GG 구인상세 #12]", "[K-LOL.GG 구인상세 #1000]")
    .replace("#12 · 5인 파티 · 1/5", "#1000 · 5인 파티 · 1/5");
  assert.equal(parsePartyForm(invalidNumber).decision, "REJECT");
  assert.equal(canonical(invalidNumber), null);

  const invalidCapacity = detail.replace("#12 · 5인 파티 · 1/5", "#12 · 100인 파티 · 1/100");
  assert.equal(parsePartyForm(invalidCapacity).decision, "REJECT");
  assert.equal(canonical(invalidCapacity), null);
});
