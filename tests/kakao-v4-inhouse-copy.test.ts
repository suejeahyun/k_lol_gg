import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { parseKakaoV4InhouseParticipantRow } from "../src/modules/recruiting/kakao-v4/inhouse-snapshot-parser";
import { KakaoAssistantError, type KakaoSeasonSnapshotCommand } from "../src/modules/recruiting/kakao-assistant/domain";
import { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import { planInhouseCopyAdditions, type InhouseCopyRow } from "../src/modules/recruiting/kakao-assistant/inhouse-copy-form";

const baseForm = [
  "📢 내전하실분 #9", " 》협곡", " 》2026-09-20 21:00 시작", " 》게임정보 :",
  ` 》저장기준 : 2026-09-20 / S${"a".repeat(32)}`, "👥 1/10명", "", "*참가 신청 양식*",
  "이름", "EX) 1.지후", "", "1. 서지오", "2. 민규", ...Array.from({ length: 8 }, (_, index) => `${index + 3}.`),
  "", "예비 1. 지후", "", "라인 선택: 이름/주라인/부라인 (예: 지후/AD/MD)", "", "빈 칸에 내 이름 입력 → 메시지 전체 전송 = 저장",
].join("\n");

function parse(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), {
    profileId: "FEATURES", installationId: `install-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}`,
    eventId: "event-inhouse-copy", timestamp: Date.parse("2026-09-20T12:00:00Z") / 1_000, nonce: "c".repeat(32), text,
  });
}

test("inhouse copy accepts names-only main/reserve rows and preserves save reference separately from notices", () => {
  const command = parse(baseForm);
  if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected complete copy form");
  assert.deepEqual(command.copyGuard, { operatingDate: "2026-09-20", saveReference: `S${"a".repeat(32)}` });
  assert.deepEqual(command.participants.map(({ name, slotNo, reserve, nameOnly }) => ({ name, slotNo, reserve, nameOnly })), [
    { name: "서지오", slotNo: 1, reserve: false, nameOnly: true },
    { name: "민규", slotNo: 2, reserve: false, nameOnly: true },
    { name: "지후", slotNo: 11, reserve: true, nameOnly: true },
  ]);
  assert.equal(command.roundMetadata?.noticeText, null);
  assert.equal(command.roundMetadata?.organizerText, null);
  assert.equal(command.reserveSectionObserved, true);
});

test("inhouse copy rejects malformed/duplicate save references and marks old forms as legacy", () => {
  assert.equal(parse(baseForm.replace(/S[a-f0-9]{32}/u, "Rbroken")), null);
  assert.equal(parse(`${baseForm}\n 》저장기준 : 2026-09-20 / S${"a".repeat(32)}`), null);
  const legacy = parse(baseForm.replace(/^.*저장기준.*\n/mu, ""));
  if (legacy?.domain !== "SEASON" || legacy.action !== "SYNC") assert.fail("expected legacy copy form");
  assert.deepEqual(legacy.copyGuard, { operatingDate: null, saveReference: null });
});

test("inhouse copy still accepts optional lanes and routes malformed lane input to review", () => {
  const positioned = parseKakaoV4InhouseParticipantRow("2. 민규/MID/SUP", "RIFT");
  assert.equal(positioned.matched && positioned.valid && positioned.participant?.mainPosition, "MID");
  const malformed = parseKakaoV4InhouseParticipantRow("2. 민규/MID/unknown", "RIFT");
  assert.equal(malformed.matched && !malformed.valid && malformed.participant?.reviewRequired, true);
});

test("inhouse stale forms return the latest copy without retrying the mutation, and old days show today's rounds", async () => {
  for (const applyDate of ["2026-09-20", "2026-09-19"]) {
    const calls: KakaoSeasonSnapshotCommand[] = [];
    const dispatcher = new KakaoV4CommandDispatcher({
      recruiting: {
        async handle() { assert.fail("inhouse must not mutate party state"); },
        async resolveCompatTarget() { return null; },
        async resolveScrimUpsert() { return null; },
      },
      assistant: {
        async getOpenChatStatus() { assert.fail("inhouse must not query party state"); },
        async syncSeasonSnapshot({ command }) {
          calls.push(command);
          if (command.action === "SYNC") throw new KakaoAssistantError("PRECONDITION_FAILED");
          return { body: {
            kind: "SEASON_APPLICATION_SNAPSHOT", seasonId: "season-1", applyDate: command.applyDate, recruitNo: 9,
            entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 0, cancelledCount: 0,
            v1StrictLegacyReply: baseForm,
          }, replayed: false };
        },
      },
    });
    const command = parse(baseForm);
    if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected copy form");
    const result = await dispatcher.dispatch({
      envelope: { profileId: "FEATURES", installationId: `install-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}`,
        eventId: "event-inhouse-stale", timestamp: Date.parse("2026-09-20T12:00:00Z") / 1_000, nonce: "c".repeat(32), text: baseForm },
      keyId: "current", requestId: "request-inhouse-stale", requestDigestHex: "ab".repeat(32),
      authorization: { roomId: "room-copy", roomStatus: "ACTIVE", capabilityProfile: "FEATURES", installationId: "installation-copy" },
    }, { ...command, applyDate });
    assert.deepEqual(calls.map((call) => call.action), ["SYNC", "STATUS"]);
    assert.equal(calls[1]?.applyDate, "2026-09-20");
    assert.equal(calls[1]?.recruitNo, applyDate === "2026-09-20" ? 9 : null);
    assert.match(result.legacyReply, /아직 저장되지 않았어요/u);
    assert.ok(result.legacyReply.endsWith(baseForm));
  }
});

test("compact inhouse copies retain site-linked optional lanes and separate review rows from participants", () => {
  const form = ["신청 저장: 1. 서지오", "", "[내전 #9] 1/10명", "》모드: 협곡", "》시작: 미정", "",
    "전체 복사 → 빈칸에 사이트 등록 이름 → 전체 전송", "라인 선택: 이름/주라인/부라인", "",
    "1. 서지오", "2. (회원 확인 중)", "3. 민규/MID/SUP", ...Array.from({ length: 7 }, (_, i) => `${i + 4}.`),
    "", "예비 1.", "", "회원 확인 필요 1명 · 아직 참가 확정 전", "확인 2. 가입전", "", "양식코드: ABCDE-FGHJK"].join("\n");
  const command = parse(form);
  if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected compact form");
  assert.equal(command.copyGuard?.formCode, "ABCDE-FGHJK");
  assert.equal(command.roundMetadata?.startTimeText, null);
  assert.equal(command.roundMetadata?.noticeText, null);
  assert.deepEqual(command.participants.map((row) => [row.slotNo, row.name, row.mainPosition, row.reviewRequired ?? false]), [
    [1, "서지오", "ALL", false], [2, "가입전", "ALL", true], [3, "민규", "MID", false],
  ]);
  assert.equal(parse(`${form}\n양식코드: ABCDE-FGHJK`), null);
  assert.equal(parse(form.replace("ABCDE-FGHJK", "broken")), null);
  assert.equal(parse(form.replace(/\n양식코드:.*$/u, "")), null);
  assert.equal(parse(form.replace("ABCDE-FGHJK", "")), null);
  assert.equal(parse(`${form}\n1. 다른이름`), null);
});

test("copy delta preserves latest rows, merges only pure additions, and never revives removed originals", () => {
  const row = (slotNo: number, name: string): InhouseCopyRow => ({ slotNo, name, reserve: false, pending: false, mainPosition: "MID", subPositions: ["SUP"] });
  const participant = (slotNo: number, name: string) => ({ slotNo, name, reserve: false, riotId: null, mainPosition: "ALL" as const, subPositions: [], nameOnly: true as const });
  const original = [row(1, "서지오")];
  const current = [row(2, "먼저신청")];
  assert.deepEqual(planInhouseCopyAdditions({ original, current, submitted: [participant(1, "서지오"), participant(2, "민규")] })?.map((item) => item.name), ["민규"]);
  assert.equal(planInhouseCopyAdditions({ original, current, submitted: [participant(2, "민규")] }), null);
  assert.equal(planInhouseCopyAdditions({ original, current, submitted: [participant(1, "바꾼이름")] }), null);
  assert.equal(planInhouseCopyAdditions({ original, current, submitted: [participant(2, "서지오")] }), null);
  assert.equal(planInhouseCopyAdditions({ original, current, submitted: [{ ...participant(1, "서지오"), nameOnly: undefined, mainPosition: "TOP", subPositions: [] }] }), null);
});
