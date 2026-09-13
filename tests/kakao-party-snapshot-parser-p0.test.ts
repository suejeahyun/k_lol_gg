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

test("party parser accepts clipped headers and an adjacent wrapped slot value", () => {
  const text = [
    " /K-LOL.GG 구인구직 양식]", "📢 5인 파티 구인", String.raw`모 집 번 호 : \#15`,
    "1.붙임", "2 공백", String.raw`3\.`, "줄바꿈", "4.", "5.", String.raw`예비 1\.`, "대기자",
  ].join("\n");
  const parsed = parsePartyForm(text);
  assert.equal(parsed.decision, "EXACT");
  assert.equal(parsed.recruitNumber, 15);
  assert.deepEqual(
    parsed.slots.filter((slot) => slot.state === "PRESENT_VALUE").map((slot) => [slot.kind, slot.slotNo, slot.value]),
    [["NUMBERED", 1, "붙임"], ["NUMBERED", 2, "공백"], ["NUMBERED", 3, "줄바꿈"], ["RESERVE", 1, "대기자"]],
  );
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

test("metadata-only party activation forms accept slash and keep organizer separate from members", () => {
  for (const prefix of ["", "/"]) {
    const text = `${prefix}[K-LOL.GG 구인구직 양식]\n📢 2인 파티 구인\n모집번호: #6\n\n》시작시간 : 21:00\n》게임정보 : 자랭\n》주최자 : 재현`;
    const parsed = parsePartyForm(text);
    assert.equal(parsed.decision, "EXACT");
    assert.deepEqual(parsed.organizer, { state: "PRESENT_VALUE", value: "재현", line: 7 });
    const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
    const canonical = canonicalizeKakaoV4Command(classification, {
      profileId: "RECRUIT", installationId: "install-11111111111111111111111111111111",
      senderId: "sender-user-22222222222222222222222222222222", eventId: `event-metadata-${prefix ? "slash" : "plain"}`,
      timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000, nonce: "1".repeat(32), text,
    });
    if (!canonical || canonical.domain !== "PARTY" || canonical.action !== "SYNC") assert.fail("expected metadata activation snapshot");
    assert.deepEqual(canonical.payload.members, []);
    assert.equal(canonical.payload.organizerText, "재현");
  }
});

test("the full production party template classifies as one metadata activation snapshot", () => {
  const text = [
    "[K-LOL.GG 구인구직 양식]", "같이 할사람~", "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.", "",
    "📢 5인 파티 구인", "모집번호: #7", "운영일: 2026-09-13", "",
    "》시작시간 : 모바시", "》게임정보 : 증칼", "》주최자 : TEST", "",
    "위 항목을 작성해 전체 전송해주세요.",
    "비워 둔 시간과 게임 정보는 자동으로 채워집니다.",
    "활성화 후 상세 번호 추가 이름으로 참가할 수 있습니다.", "",
    "참여해주실 분은 태그해주세요.", "*상호배려와 존중 부탁드립니다.",
  ].join("\n");
  const parsed = parsePartyForm(text);
  const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
  const canonical = canonicalizeKakaoV4Command(classification, {
    profileId: "RECRUIT", installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222", eventId: "event-party-production-template",
    timestamp: Date.parse("2026-09-13T20:38:00.000+09:00") / 1_000, nonce: "3".repeat(32), text,
  });

  assert.equal(parsed.decision, "EXACT");
  assert.equal(classification.kind, "SNAPSHOT");
  assert.equal(classification.kind === "SNAPSHOT" ? classification.command : null, "PARTY_SNAPSHOT");
  if (!canonical || canonical.domain !== "PARTY" || canonical.action !== "SYNC") assert.fail("expected party metadata activation");
  assert.deepEqual(canonical.target, { recruitDate: "2026-09-13", recruitNumber: 7 });
  assert.deepEqual(canonical.payload.members, []);
  assert.equal(canonical.payload.startTimeText, "모바시");
  assert.equal(canonical.payload.gameInfo, "증칼");
  assert.equal(canonical.payload.organizerText, "TEST");
});

test("generated operating day wins across the 06:00 boundary while legacy forms keep fallback behavior", () => {
  const generated = `${base.replace("모집번호: #12", "모집번호: #12\n운영일: 2026-09-12")}\n》시작시간 :\n》게임정보 :\n》주최자 : 재현`;
  const afterBoundary: KakaoV4CommandEnvelope = {
    profileId: "RECRUIT", installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222", eventId: "event-party-operating-day-boundary",
    timestamp: Date.parse("2026-09-13T06:01:00.000+09:00") / 1_000, nonce: "2".repeat(32), text: generated,
  };
  const generatedCommand = canonicalizeKakaoV4Command(
    classifyKakaoV4Command({ profileId: "RECRUIT", text: generated }),
    afterBoundary,
  );
  if (!generatedCommand || generatedCommand.domain !== "PARTY" || generatedCommand.action !== "SYNC") assert.fail("expected generated party snapshot");
  assert.equal(generatedCommand.target.recruitDate, "2026-09-12");
  assert.equal(generatedCommand.payload.parsedForm?.operatingDate.value, "2026-09-12");

  const legacy = generated.replace("운영일: 2026-09-12\n", "");
  const legacyCommand = canonicalizeKakaoV4Command(
    classifyKakaoV4Command({ profileId: "RECRUIT", text: legacy }),
    { ...afterBoundary, eventId: "event-party-operating-day-legacy", text: legacy },
  );
  if (!legacyCommand || legacyCommand.domain !== "PARTY" || legacyCommand.action !== "SYNC") assert.fail("expected legacy party snapshot");
  assert.equal(legacyCommand.target.recruitDate, "2026-09-13");
  assert.equal(legacyCommand.payload.parsedForm?.operatingDate.state, "ABSENT");
});
