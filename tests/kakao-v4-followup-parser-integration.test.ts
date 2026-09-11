import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";

function envelope(profileId: KakaoV4ProfileId, text: string): KakaoV4CommandEnvelope {
  return {
    profileId,
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-followup-${profileId.toLowerCase()}`,
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "2".repeat(32),
    text,
  };
}

function canonical(profileId: KakaoV4ProfileId, text: string) {
  const input = envelope(profileId, text);
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId, text }), input);
}

test("structural operation candidates with one empty value reach exact missingFields", () => {
  const cases = [
    {
      type: "friends",
      text: "지인 이름:\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네",
      missing: "지인 이름",
    },
    {
      type: "suggestions",
      text: "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유:\n건의 내용: 모바일 개선",
      missing: "건의 사유",
    },
    {
      type: "meetups",
      text: "주최자 이름 및 닉네임: 홍길동/테스터\n일자: 2026-09-12\n장소:\n참여자 명단: 참가자A",
      missing: "장소",
    },
    {
      type: "leaves",
      text: "이름 및 닉네임: 홍길동/테스터\n외출기간: 2026-09-11 ~ 2026-09-12\n외출사유:\n외출범위: 소통방",
      missing: "외출사유",
    },
  ] as const;

  for (const fixture of cases) {
    const classification = classifyKakaoV4Command({ profileId: "FEATURES", text: fixture.text });
    assert.equal(classification.kind, "COMMAND", fixture.type);
    if (classification.kind === "COMMAND") {
      assert.equal(classification.command, "OPERATIONS_FORM_SUBMIT", fixture.type);
      assert.equal(classification.parameters.formType, fixture.type);
    }
    const command = canonical("FEATURES", fixture.text);
    assert.equal(command?.domain, "OPERATIONS", fixture.type);
    assert.equal(command?.action, "INVALID_FORM", fixture.type);
    if (command?.domain === "OPERATIONS" && command.action === "INVALID_FORM") {
      assert.deepEqual(command.missingFields, [fixture.missing], fixture.type);
    }
  }
});

test("colonless prose and label-only lists remain UNKNOWN", () => {
  for (const text of [
    "지인 이름, 지인 닉네임, 이용기간, 디스코드 닉네임 변경 항목을 읽었습니다.",
    "지인 이름\n지인 닉네임\n이용기간\n디스코드 닉네임 변경",
    "건의 사유를 적고 건의 내용은 나중에 이야기하겠습니다.",
    "외출기간은 나중에 정하고 외출범위도 의논할게요.",
  ]) {
    assert.equal(classifyKakaoV4Command({ profileId: "FEATURES", text }).kind, "UNKNOWN", text);
  }
});

test("party members are canonical by primary/reserve and slot number, independent of row order", () => {
  const ordered = [
    "5인 파티 구인",
    "모집번호: #12",
    "1. 첫째 @태그",
    "2.",
    "3. 셋째 (MID) 🎮",
    "4.",
    "5. 다섯째",
    "예비 1. 예비/부캐, 22시 가능",
  ].join("\n");
  const shuffled = [
    "예비 1. 예비/부캐, 22시 가능",
    "5. 다섯째",
    "모집번호: #12",
    "2.",
    "5인 파티 구인",
    "3. 셋째 (MID) 🎮",
    "1. 첫째 @태그",
    "4.",
  ].join("\n");

  const first = canonical("RECRUIT", ordered);
  const second = canonical("RECRUIT", shuffled);
  assert.equal(first?.domain, "PARTY");
  assert.equal(first?.action, "SYNC");
  assert.equal(second?.domain, "PARTY");
  assert.equal(second?.action, "SYNC");
  if (first?.domain !== "PARTY" || first.action !== "SYNC" || second?.domain !== "PARTY" || second.action !== "SYNC") return;
  const expected = [
    { slotNo: 1, name: "첫째 @태그", position: null, substitute: false },
    { slotNo: 3, name: "셋째 (MID) 🎮", position: null, substitute: false },
    { slotNo: 5, name: "다섯째", position: null, substitute: false },
    { slotNo: 1, name: "예비/부캐, 22시 가능", position: null, substitute: true },
  ];
  assert.deepEqual(first.payload.members, expected);
  assert.deepEqual(second.payload.members, expected);
});
