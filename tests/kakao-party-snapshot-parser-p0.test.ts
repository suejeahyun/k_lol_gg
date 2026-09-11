import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { parsePartyForm } from "../src/modules/recruiting/kakao-v4/party-snapshot-parser";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";

const base = [
  "[K-LOL.GG 구인구직 양식]",
  "5인 파티 구인",
  "모집번호: #12",
  "1.",
  "2.",
  "3.",
  "4.",
  "5.",
  "예비 1.",
].join("\n");

function diagnosticCodes(text: string) {
  return parsePartyForm(text).diagnostics.map((entry) => entry.code);
}

test("party parser keeps raw slot intent across Kakao punctuation variants", () => {
  const text = [
    "K-LOL.GG 구인구직 양식]",
    "５인 파티 구인",
    String.raw`모 집 번 호 \: \#１２`,
    String.raw`１ \. 소영 @태그 (21시 가능) 😊`,
    "２) ",
    "３   재현/부캐, 디코",
    "４ .",
    "５ )",
    "예비 １． duo/name, memo",
  ].join("\r\n");
  const parsed = parsePartyForm(text);

  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.rawText, text);
  assert.equal(parsed.recruitNumber, 12);
  assert.equal(parsed.submittedTitle?.maximumMembers, 5);
  assert.deepEqual(
    parsed.slots.filter((slot) => slot.kind === "NUMBERED").map((slot) => [slot.slotNo, slot.state, slot.value]),
    [
      [1, "PRESENT_VALUE", "소영 @태그 (21시 가능) 😊"],
      [2, "PRESENT_EMPTY", null],
      [3, "PRESENT_VALUE", "재현/부캐, 디코"],
      [4, "PRESENT_EMPTY", null],
      [5, "PRESENT_EMPTY", null],
    ],
  );
  assert.deepEqual(parsed.slots.filter((slot) => slot.kind === "RESERVE").map((slot) => slot.value), ["duo/name, memo"]);
});

test("metadata is order independent, multiline, and keeps absent separate from empty", () => {
  const text = base
    .replace("모집번호: #12", "》게임 정보: 자유랭크\n초대 링크는 추후\n》시작 시간: 21:00\n인원 모이면 바로 시작\n모집번호: #12")
    .replace("예비 1.", "예비 1.\n》출발 시간:");
  const parsed = parsePartyForm(text);

  assert.equal(parsed.decision, "AMBIGUOUS");
  assert.deepEqual(parsed.gameInfo, { state: "PRESENT_VALUE", value: "자유랭크\n초대 링크는 추후", line: 3 });
  assert.deepEqual(parsed.startTime, { state: "PRESENT_VALUE", value: "21:00\n인원 모이면 바로 시작", line: 5 });
  assert.ok(diagnosticCodes(text).includes("DUPLICATE_METADATA_LABEL"));

  const empty = parsePartyForm(base.replace("모집번호: #12", "게임정보:\n모집번호: #12"));
  assert.deepEqual(empty.gameInfo, { state: "PRESENT_EMPTY", value: null, line: 3 });
  assert.equal(empty.startTime.state, "ABSENT");
});

test("V1 line-party position fixtures keep canonical positions", () => {
  const parsed = parsePartyForm([
    "자랭 하실분!",
    "모집번호: #8",
    "SUP. 서폿",
    "TOP. 탑",
    "ADC. 원딜",
    "JUG. 정글",
    "MID. 미드",
    "예비 1. 예비/한명, 메모",
  ].join("\n"));
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.submittedTitle?.partyType, "FLEX_RANK");
  assert.deepEqual(
    parsed.slots.filter((slot) => slot.kind === "POSITION").map((slot) => [slot.slotNo, slot.position, slot.value]),
    [
      [5, "SUP", "서폿"], [1, "TOP", "탑"], [4, "ADC", "원딜"], [2, "JGL", "정글"], [3, "MID", "미드"],
    ],
  );
  assert.equal(parsed.slots.find((slot) => slot.kind === "RESERVE")?.value, "예비/한명, 메모");
});

test("duplicate, merged, missing, and multiple-number structures are diagnosed without last-wins parsing", () => {
  const duplicate = parsePartyForm(base.replace("2.\n", "2. 첫값\n2. 두번째값\n"));
  assert.equal(duplicate.decision, "AMBIGUOUS");
  assert.ok(duplicate.diagnostics.some((entry) => entry.code === "DUPLICATE_SLOT" && entry.key === "primary:2"));
  assert.equal(duplicate.slots.filter((slot) => slot.kind === "NUMBERED" && slot.slotNo === 2).length, 2);

  const merged = parsePartyForm(base.replace("1.\n2.", "1. 첫값 2. 둘째값\n2."));
  assert.equal(merged.decision, "AMBIGUOUS");
  assert.ok(diagnosticCodes(merged.normalizedText).includes("MERGED_SLOT_ROWS"));

  const missing = parsePartyForm(base.replace("\n4.", ""));
  assert.equal(missing.decision, "AMBIGUOUS");
  assert.ok(missing.slots.some((slot) => slot.kind === "NUMBERED" && slot.slotNo === 4 && slot.state === "ABSENT"));

  const multipleNumbers = parsePartyForm(base.replace("모집번호: #12", "모집번호: #12\n모집번호: #13"));
  assert.equal(multipleNumbers.decision, "AMBIGUOUS");
  assert.deepEqual(multipleNumbers.recruitNumbers, [12, 13]);
  assert.ok(diagnosticCodes(multipleNumbers.normalizedText).includes("MULTIPLE_RECRUIT_NUMBERS"));

  const mergedNumbers = parsePartyForm(base.replace("모집번호: #12", "모집번호: #12 #13"));
  assert.equal(mergedNumbers.decision, "AMBIGUOUS");
  assert.deepEqual(mergedNumbers.recruitNumbers, [12, 13]);
});

test("recoverable, rejected, and ordinary text decisions remain distinct", () => {
  assert.equal(parsePartyForm(base.replace("모집번호: #12\n", "")).decision, "RECOVERABLE");
  assert.equal(parsePartyForm(`${base}\n100. 범위초과`).decision, "REJECT");
  assert.equal(parsePartyForm("오늘 20:00에 2명 모여요.\n1. 가능하면 연락주세요").decision, "IGNORE");
  assert.equal(classifyKakaoV4Command({ profileId: "RECRUIT", text: "오늘 20:00에 2명 모여요." }).kind, "UNKNOWN");
});

test("only EXACT party forms become SYNC while parsed title and slot states reach canonical payload", () => {
  const exact = base.replace("1.", "1. 재현/부캐, 메모");
  const envelope: KakaoV4CommandEnvelope = {
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-party-parser-p0-exact",
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "1".repeat(32),
    text: exact,
  };
  const classification = classifyKakaoV4Command({ profileId: envelope.profileId, text: exact });
  assert.equal(classification.kind, "SNAPSHOT");
  const canonical = canonicalizeKakaoV4Command(classification, envelope);
  assert.equal(canonical?.domain, "PARTY");
  assert.equal(canonical?.action, "SYNC");
  if (canonical?.domain !== "PARTY" || canonical.action !== "SYNC") return;
  assert.equal(canonical.payload.parsedForm?.decision, "EXACT");
  assert.equal(canonical.payload.parsedForm?.submittedTitle?.partyType, "PARTY_NUMBER");
  assert.equal(canonical.payload.parsedForm?.submittedTitle?.maximumMembers, 5);
  assert.deepEqual(canonical.payload.members, [{ slotNo: 1, name: "재현/부캐, 메모", position: null, substitute: false }]);

  const ambiguousText = exact.replace("2.\n", "2. 한명\n2. 다른명\n");
  const ambiguous = classifyKakaoV4Command({ profileId: "RECRUIT", text: ambiguousText });
  assert.equal(ambiguous.kind, "UNKNOWN");
  if (ambiguous.kind === "UNKNOWN") assert.equal(ambiguous.partyForm?.decision, "AMBIGUOUS");
  assert.equal(canonicalizeKakaoV4Command(ambiguous, { ...envelope, text: ambiguousText }), null);
});
