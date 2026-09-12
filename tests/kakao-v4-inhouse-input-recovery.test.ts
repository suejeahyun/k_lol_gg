import assert from "node:assert/strict";
import test from "node:test";

import { KakaoV4CommandError } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope } from "../src/modules/recruiting/kakao-v4/domain";
import { kakaoV4CommandFailureResponse } from "../src/modules/recruiting/kakao-v4/http";
import { parseKakaoV4InhouseParticipantRow } from "../src/modules/recruiting/kakao-v4/inhouse-snapshot-parser";

function form(secondName = "동휘") {
  return [
    "📢 내전하실분 #1",
    "》협곡",
    "》2026-09-11 21:00 시작",
    "👥 0/10명",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    "1.지오/G/E/AD/Mid",
    `2.${secondName}/M/M/Mid all`,
    "３．",
    String.raw`4\.`,
    "5)",
    "6.",
    "７）",
    "8.",
    String.raw`9\.`,
    "10.",
  ].join("\r\n");
}

function envelope(text: string): KakaoV4CommandEnvelope {
  return {
    profileId: "FEATURES",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-inhouse-mid-all-recovery",
    timestamp: Date.parse("2026-09-11T12:00:00.000Z") / 1_000,
    nonce: "5".repeat(32),
    text,
  };
}

test("real RIFT input recovers one missing position slash and accepts empty flexible rows", () => {
  for (const secondName of ["동휘", "김동휘"]) {
    const text = form(secondName);
    const classification = classifyKakaoV4Command({ profileId: "FEATURES", text });
    assert.equal(classification.kind, "SNAPSHOT", secondName);
    const command = canonicalizeKakaoV4Command(classification, envelope(text));
    assert.equal(command?.domain, "SEASON", secondName);
    assert.equal(command?.action, "SYNC", secondName);
    if (command?.domain !== "SEASON" || command.action !== "SYNC") continue;
    assert.deepEqual(command.participants, [
      { slotNo: 1, name: "지오", riotId: null, mainPosition: "ADC", subPositions: ["MID"], reserve: false },
      { slotNo: 2, name: secondName, riotId: null, mainPosition: "MID", subPositions: [], reserve: false },
    ]);
  }
});

test("recovery is limited to two valid position aliases and records the failed field", () => {
  const recovered = parseKakaoV4InhouseParticipantRow("2.동휘/M/M/Mid all", "RIFT");
  assert.equal(recovered.matched, true);
  if (!recovered.matched || !recovered.valid) assert.fail("expected a recovered participant row");
  assert.deepEqual(recovered.diagnostics, [{
    code: "RECOVERED_MISSING_POSITION_DELIMITER",
    field: "mainPosition/subPositions",
  }]);

  const invalid = parseKakaoV4InhouseParticipantRow("2.동휘/M/M/Mid all extra", "RIFT");
  assert.equal(invalid.matched, true);
  if (!invalid.matched || invalid.valid) assert.fail("expected invalid main position");
  assert.equal(invalid.field, "mainPosition");
});

test("legacy empty sub-position markers are accepted only in the sub-position field", () => {
  for (const marker of ["없음", "-", "미정"]) {
    const parsed = parseKakaoV4InhouseParticipantRow(`2.동휘/M/M/AD/${marker}`, "RIFT");
    assert.equal(parsed.matched, true, marker);
    if (!parsed.matched || !parsed.valid || !parsed.participant) assert.fail(`expected accepted legacy marker: ${marker}`);
    assert.equal(parsed.participant.mainPosition, "ADC", marker);
    assert.deepEqual(parsed.participant.subPositions, [], marker);

    const invalidMain = parseKakaoV4InhouseParticipantRow(`2.동휘/M/M/${marker}/MID`, "RIFT");
    assert.equal(invalidMain.matched, true, marker);
    if (!invalidMain.matched || invalidMain.valid) assert.fail(`expected rejected main marker: ${marker}`);
    assert.equal(invalidMain.field, "mainPosition", marker);
  }

  const unknown = parseKakaoV4InhouseParticipantRow("2.동휘/M/M/AD/아무데나", "RIFT");
  assert.equal(unknown.matched, true);
  if (!unknown.matched || unknown.valid) assert.fail("unknown sub-position must stay rejected");
  assert.equal(unknown.field, "subPositions");
});

test("mixed real-world rows keep valid entries, route partial rows to review, and use the last duplicate slot", () => {
  const text = [
    "📢 내전하실분 #1",
    "》협곡",
    "》2026-09-11 21:00 시작",
    "👥 6/10명",
    "*참가 신청 양식*",
    "이름/현티어/최고티어/주라인/부라인",
    "EX) 1.지후/P/E/AD/MD",
    "   1 정상/g/e/TOP, MID",
    "2. 이름만",
    "3.중복/m/m/MID/",
    "4. 중복/M/M/MID/SUP",
    "5. 확인행/d/e/아무데나/SUP",
    "6.",
    "7.",
    "9. 먼저/M/M/TOP/SUP",
    "9. 나중/M/M/ADC/",
    "10.",
  ].join("\n");
  const command = canonicalizeKakaoV4Command(
    classifyKakaoV4Command({ profileId: "FEATURES", text }),
    envelope(text),
  );
  assert.equal(command?.domain, "SEASON");
  assert.equal(command?.action, "SYNC");
  if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected a recoverable season snapshot");
  assert.deepEqual(command.participants, [
    { slotNo: 1, name: "정상", riotId: null, mainPosition: "TOP", subPositions: ["MID"], reserve: false },
    { slotNo: 2, name: "이름만", riotId: null, mainPosition: "ALL", subPositions: [], reserve: false, reviewRequired: true },
    { slotNo: 3, name: "중복", riotId: null, mainPosition: "MID", subPositions: [], reserve: false },
    { slotNo: 4, name: "중복", riotId: null, mainPosition: "MID", subPositions: ["SUP"], reserve: false, reviewRequired: true },
    { slotNo: 5, name: "확인행", riotId: null, mainPosition: "ALL", subPositions: [], reserve: false, reviewRequired: true },
    { slotNo: 9, name: "나중", riotId: null, mainPosition: "ADC", subPositions: [], reserve: false },
  ]);
  assert.deepEqual(command.preserveSlotNos, [8]);
});

test("a final empty duplicate row means cancellation while a missing numbered row is preserved", () => {
  const text = form()
    .replace("8.\r\n", "")
    .replace(String.raw`9\.`, "9. 유지/M/M/TOP/SUP\r\n9.");
  const command = canonicalizeKakaoV4Command(
    classifyKakaoV4Command({ profileId: "FEATURES", text }),
    envelope(text),
  );
  assert.equal(command?.domain, "SEASON");
  assert.equal(command?.action, "SYNC");
  if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected a recoverable season snapshot");
  assert.equal(command.participants.some((participant) => participant.slotNo === 9), false);
  assert.deepEqual(command.preserveSlotNos, [8]);
});

test("the former canonical failure maps to the exact public HTTP 400 document", async () => {
  const response = kakaoV4CommandFailureResponse(new KakaoV4CommandError("INVALID_FORM"), "trace-inhouse-mid-all");
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("content-type"), "application/problem+json; charset=utf-8");
  assert.deepEqual(await response.json(), {
    type: "urn:klol:problem:invalid-form",
    title: "V1 양식이 올바르지 않습니다.",
    status: 400,
    detail: "봇이 제공한 전체 양식의 필수 항목을 유지해 다시 보내 주세요.",
    code: "INVALID_FORM",
  });
});
