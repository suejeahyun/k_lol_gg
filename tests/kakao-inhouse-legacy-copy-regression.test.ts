import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { getKakaoV4InhouseInputErrors } from "../src/modules/recruiting/kakao-v4/inhouse-snapshot-parser";
import { planInhouseCopyEdits, type InhouseCopyRow } from "../src/modules/recruiting/kakao-assistant/inhouse-copy-form";
import type { KakaoSeasonSnapshotDto, KakaoSeasonSnapshotParticipant } from "../src/modules/recruiting/kakao-assistant/domain";
import { inhouseCopyFormReply, inhouseSaveReply, v1StrictSeasonReply } from "../src/modules/recruiting/kakao-v4/v1-strict-replies";

const legacyForm = ["[내전 #4] 1/10명", "》모드: 협곡", "》시작: 모이면 시작", "",
  "1. 가상참가갑", ...Array.from({ length: 9 }, (_, index) => `${index + 2}.`), "", "예비 1.", "",
  "양식코드: ABCDE-FGHJK"].join("\n");
function parse(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), {
    profileId: "FEATURES", installationId: `install-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}`,
    eventId: "legacy-copy-regression", timestamp: Date.parse("2026-09-22T12:00:00Z") / 1000, nonce: "c".repeat(32), text,
  });
}
const original: InhouseCopyRow = { id: "synthetic-entry-a", kind: "PENDING", slotNo: 1, name: "가상참가갑",
  reserve: false, pending: true, mainPosition: "MID", subPositions: ["SUP"] };
function participant(row: InhouseCopyRow, nameOnly = false): KakaoSeasonSnapshotParticipant {
  return { slotNo: row.slotNo, name: row.name, riotId: null, mainPosition: nameOnly ? "ALL" : row.mainPosition,
    subPositions: nameOnly ? [] : row.subPositions, reserve: row.reserve, ...(nameOnly ? { nameOnly: true } : {}) };
}

test("guarded old name-only rows reach snapshot validation while new forms still require lanes", () => {
  const command = parse(legacyForm.replace("\n2.\n", "\n2. 가상참가을/top,mid\n"));
  if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail("expected guarded legacy copy");
  assert.equal(command.participants[0]?.nameOnly, true);
  assert.equal(command.participants[1]?.nameOnly, undefined);
  assert.equal(command.participants[1]?.mainPosition, "TOP");
  assert.equal(parse(legacyForm.replace("[내전 #4] 1/10명", "[내전 #4] 협곡 · 1/10명")), null);
  assert.equal(parse(legacyForm.replace("양식코드: ABCDE-FGHJK", "")), null);
  const badNewLane = legacyForm.replace("\n2.\n", "\n2. 가상참가을/top,wrong\n");
  assert.equal(parse(badNewLane), null);
  const errors = getKakaoV4InhouseInputErrors(badNewLane).join("\n");
  assert.match(errors, /2번은 협곡 라인이 필요/u);
  assert.doesNotMatch(errors, /1번은 협곡 라인이 필요/u);
});

test("legacy copies preserve current lanes and protected rows and do not resurrect removed entries", () => {
  const concurrent = { ...original, id: "synthetic-entry-b", slotNo: 2, name: "가상참가을" };
  const submitted = [participant(original, true), participant({ ...original, slotNo: 2, name: "가상참가병", mainPosition: "TOP" })];
  for (const protectedReason of [undefined, "SITE", "REVIEWED"] as const) {
    const latest = { ...original, mainPosition: "JGL" as const, subPositions: ["TOP" as const], protectedReason };
    const result = planInhouseCopyEdits({ original: [original], current: [latest, concurrent], submitted,
      observedSlotNos: [1, 2], capacity: 10 });
    assert.deepEqual(result.rows?.map((row) => [row.slotNo, row.name, row.mainPosition]), [
      [1, original.name, "JGL"], [2, concurrent.name, "MID"], [3, "가상참가병", "TOP"],
    ]);
  }
  const removed = planInhouseCopyEdits({ original: [original], current: [concurrent], submitted,
    observedSlotNos: [1, 2], capacity: 10 });
  assert.deepEqual(removed.rows?.map((row) => row.name), ["가상참가병", concurrent.name]);
  const replacement = { ...concurrent, slotNo: 1 };
  const stale = planInhouseCopyEdits({ original: [original], current: [replacement], submitted: [participant(original, true)],
    observedSlotNos: [1], capacity: 10 });
  assert.deepEqual(stale.rows, [replacement]);
});

test("name-only additions, replacements, moves and stale draft guesses never bypass mandatory lanes", () => {
  for (const row of [
    { ...original, slotNo: 2, name: "가상참가을" },
    { ...original, name: "가상참가을" },
    { ...original, slotNo: 11, reserve: true },
  ]) {
    const result = planInhouseCopyEdits({ original: [original], current: [original], submitted: [participant(row, true)],
      observedSlotNos: [1, row.slotNo], capacity: 10 });
    assert.match(result.error ?? "", /새로 추가하거나 바꾸는 이름이라 협곡 라인이 필요/u);
    assert.match(result.error ?? "", /기존 이름은 그대로/u);
  }
  const staleDraft = planInhouseCopyEdits({ original: [], current: [original], submitted: [participant(original, true)],
    observedSlotNos: [1], capacity: 10 });
  assert.ok(staleDraft.error, "a current name cannot prove what was in an old issued draft");
});

test("legacy compatibility retains explicit deletion, replacement protection and field conflicts", () => {
  assert.deepEqual(planInhouseCopyEdits({ original: [original], current: [original], submitted: [], observedSlotNos: [1], capacity: 10 }).rows, []);
  const changed = participant({ ...original, name: "가상참가을", mainPosition: "TOP" });
  for (const protectedReason of ["SITE", "REVIEWED"] as const) {
    for (const submitted of [[], [changed]]) {
      assert.ok(planInhouseCopyEdits({ original: [original], current: [{ ...original, protectedReason }], submitted,
        observedSlotNos: [1], capacity: 10 }).error);
    }
  }
  assert.ok(planInhouseCopyEdits({ original: [original], current: [{ ...original, name: "먼저수정" }],
    submitted: [changed], observedSlotNos: [1], capacity: 10 }).error);
});

function snapshot(): KakaoSeasonSnapshotDto {
  return { kind: "SEASON_APPLICATION_SNAPSHOT", seasonId: "synthetic-season", applyDate: "2026-09-22", recruitNo: 4,
    entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 0, cancelledCount: 0, formCode: "ABCDE-FGHJK",
    roundMetadata: { recruitNo: 4, mode: "RIFT", capacity: 10, startTimeText: "모이면 시작", scheduledStartAt: null,
      noticeText: null, revision: 1, status: "IN_PROGRESS" } };
}

test("latest formatter sorts reserve gaps, prints one start phrase and makes no-change distinct from new registration", () => {
  const body = snapshot();
  const entries = [13, 11].map((slotNo) => ({ slotNo, status: "UNMATCHED" as const, source: "KAKAO" as const,
    suppliedName: `가상예비${slotNo}`, suppliedRiotId: null, mainPosition: "TOP" as const,
    subPositions: [], reserve: true, player: null }));
  const detail = inhouseCopyFormReply({ ...body, entries });
  assert.match(detail, /예비 1\. 가상예비11\/탑\n예비 2\.\n예비 3\. 가상예비13\/탑\n예비 4\./u);
  assert.equal(parse(detail)?.domain, "SEASON");
  const status = v1StrictSeasonReply({ ...body, rounds: [{ ...body.roundMetadata!, mainCount: 0, reserveCount: 2 }] }, "STATUS");
  assert.match(status, /모이면 시작/u);
  assert.doesNotMatch(status, /시작 시작/u);
  const unchanged = inhouseSaveReply({ ...body, entries });
  assert.match(unchanged, /이번 요청으로 변경된 내용은 없어요/u);
  assert.match(unchanged, /내전상세 4에서 최신 명단/u);
  assert.doesNotMatch(unchanged, /등록 완료|수정 완료|접수는 완료|이미 같은 내용/u);
});
