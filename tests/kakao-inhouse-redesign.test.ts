import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { getKakaoV4InhouseInputErrors } from "../src/modules/recruiting/kakao-v4/inhouse-snapshot-parser";
import { inhouseCopyFormReply, inhouseMemberLinkNotice, inhouseSaveReply, v1StrictSeasonReply } from "../src/modules/recruiting/kakao-v4/v1-strict-replies";
import { KakaoV4CommandDispatcher } from "../src/modules/recruiting/kakao-v4/dispatcher";
import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { planInhouseCopyEdits, type InhouseCopyRow } from "../src/modules/recruiting/kakao-assistant/inhouse-copy-form";
import type { KakaoSeasonSnapshotDto, KakaoSeasonSnapshotParticipant } from "../src/modules/recruiting/kakao-assistant/domain";
import { assertInhouseSeatAvailable, reachedInhouseCapacity } from "../src/modules/seasons/domain/inhouse-enrollment";

function snapshot(): KakaoSeasonSnapshotDto {
  return { kind: "SEASON_APPLICATION_SNAPSHOT", seasonId: "sample-season", applyDate: "2026-09-21", recruitNo: 1,
    entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 0, cancelledCount: 0,
    formCode: "ABCDE-FGHJK", roundMetadata: { recruitNo: 1, mode: "RIFT", capacity: 10,
      startTimeText: null, scheduledStartAt: null, noticeText: null, revision: 0, status: "DRAFT" } };
}
function envelope(text: string) {
  return { profileId: "FEATURES" as const, installationId: `install-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}`,
    eventId: "redesign-input", timestamp: Date.parse("2026-09-21T12:00:00Z") / 1000, nonce: "c".repeat(32), text };
}
function parse(text: string) {
  return canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "FEATURES", text }), envelope(text));
}

test("modern form round-trips empty metadata and all requested Rift line syntaxes", () => {
  const form = inhouseCopyFormReply(snapshot());
  assert.match(form, /^\[내전 #1\] 협곡 · 0\/10명\n양식코드:/u);
  for (const [positions, main, subs] of [
    ["top/mid", "TOP", ["MID"]], ["탑/미드", "TOP", ["MID"]], ["top,mid", "TOP", ["MID"]],
    ["TOP , all", "TOP", ["JGL", "MID", "ADC", "SUP"]], ["all", "ALL", []],
  ] as const) {
    const command = parse(form.replace("\n1.\n", `\n1. 가온/${positions}\n`));
    if (command?.domain !== "SEASON" || command.action !== "SYNC") assert.fail(positions);
    assert.equal(command.roundMetadata?.startTimeText, null);
    assert.equal(command.participants[0]?.mainPosition, main);
    assert.deepEqual(command.participants[0]?.subPositions, subs);
    assert.deepEqual(command.observedSlotNos, [1,2,3,4,5,6,7,8,9,10,11]);
  }
});

test("Rift missing lines, duplicate names and incomplete copies never become mutations", () => {
  const form = inhouseCopyFormReply(snapshot());
  for (const name of ["가온", "가온/top,", "가온/all,mid", "가온/미정", "가온/top/wrong"]) {
    const invalid = form.replace("\n1.\n", `\n1. ${name}\n`);
    assert.equal(parse(invalid), null);
    assert.ok(getKakaoV4InhouseInputErrors(invalid).some((line) => line.includes("1번")));
  }
  const duplicate = form.replace("\n1.\n", "\n1. 가온/all\n").replace("예비 1.", "예비 1. 가온/all");
  assert.equal(parse(duplicate), null);
  assert.match(getKakaoV4InhouseInputErrors(duplicate).join("\n"), /동명이인/u);
  assert.equal(parse(form.replace("\n4.\n", "\n")), null);
  for (const mode of ["ARAM", "AUGMENT_ARAM"] as const) {
    const body = snapshot();
    const command = parse(inhouseCopyFormReply({ ...body, roundMetadata: { ...body.roundMetadata!, mode } }).replace("\n1.\n", "\n1. 가온\n"));
    assert.equal(command?.domain, "SEASON");
  }
});

test("detail preserves aliases and reserve gaps and closed details cannot act as editable forms", () => {
  const body = snapshot();
  const entries = [1, 11, 13].map((slotNo) => ({ slotNo, status: "UNMATCHED" as const, source: "KAKAO" as const,
    suppliedName: `가온(${slotNo})`, suppliedRiotId: null, mainPosition: "TOP" as const,
    subPositions: ["JGL", "MID", "ADC", "SUP"] as const, reserve: slotNo > 10, player: null }));
  const detail = inhouseCopyFormReply({ ...body, entries });
  assert.match(detail, /1\. 가온\(1\)\/탑\/전체/u);
  assert.match(detail, /예비 1\. 가온\(11\)\/탑\/전체\n예비 2\.\n예비 3\. 가온\(13\)\/탑\/전체\n예비 4\./u);
  assert.equal(parse(detail)?.domain, "SEASON");
  const closed = inhouseCopyFormReply({ ...body, entries, roundMetadata: { ...body.roundMetadata!, status: "CLOSED" } });
  assert.match(closed, /모집 마감 · 명단 보관/u);
  assert.doesNotMatch(closed, /양식코드:/u);
});

test("member guidance distinguishes no match, many matches and unverified match without claiming nonmembership", () => {
  const body = snapshot();
  const entries = ["UNMATCHED", "AMBIGUOUS", "UNVERIFIED"].map((memberLinkStatus, i) => ({
    slotNo: i+1, status: "UNMATCHED" as const, source: "KAKAO" as const, suppliedName: `가상${i}`, suppliedRiotId: null,
    mainPosition: "ALL" as const, subPositions: [], player: null,
    memberLinkStatus: memberLinkStatus as "UNMATCHED" | "AMBIGUOUS" | "UNVERIFIED" }));
  const reply = inhouseMemberLinkNotice({ ...body, entries }, "https://example.invalid");
  assert.match(reply, /참가 접수는 완료/u);
  assert.match(reply, /가입했다면 사이트 등록 이름/u);
  assert.match(reply, /아직 미가입이면/u);
  assert.match(reply, /동명이인 확인: 가상1/u);
  assert.match(reply, /회원 연결 확인: 가상2/u);
  assert.match(reply, /https:\/\/example.invalid\/signup/u);
  assert.doesNotMatch(reply, /가상0.*미가입자입니다/u);
});

test("overview stays a list for one round, counts guests, and filled message uses mutation result only", () => {
  const body = snapshot();
  const status = v1StrictSeasonReply({ ...body, recruitNo: null, rounds: [{ ...body.roundMetadata!, status: "IN_PROGRESS", mainCount: 10, reserveCount: 2 }] }, "STATUS");
  assert.match(status, /협곡 · 미정 · 10\/10명 · 예비 2명\n└ 내전상세 1/u);
  assert.doesNotMatch(status, /양식코드|디스코드/u);
  assert.match(inhouseSaveReply({ ...body, registrationCreated: true, rosterFilled: true }), /내전등록 완료.*[\s\S]*시작 시간 10분 전 내전 디스코드방에 대기해주세요~/u);
  assert.doesNotMatch(inhouseSaveReply({ ...body, createdCount: 1, rosterFilled: false }), /디스코드/u);
  assert.equal(reachedInhouseCapacity(9, 10, 10), true);
  assert.equal(reachedInhouseCapacity(10, 10, 10), false);
  assert.throws(() => assertInhouseSeatAvailable({ capacity: 10, participantCount: 10, alreadyParticipating: false, reserve: false }));
  assert.doesNotThrow(() => assertInhouseSeatAvailable({ capacity: 10, participantCount: 10, alreadyParticipating: false, reserve: true }));
});

test("copy merge preserves concurrent additions, applies deletion and field edits, and protects SITE entries", () => {
  const original: InhouseCopyRow = { id: "entry-a", kind: "PENDING", slotNo: 1, name: "가온", pending: true, reserve: false, mainPosition: "TOP", subPositions: ["MID"] };
  const participant = (row: InhouseCopyRow): KakaoSeasonSnapshotParticipant => ({ ...row, riotId: null });
  const current = [original, { ...original, id: "entry-b", slotNo: 2, name: "나래" }];
  const edit = planInhouseCopyEdits({ original: [original], current, observedSlotNos: [1,2], capacity: 10,
    submitted: [participant({ ...original, name: "가온(수정)", mainPosition: "JGL" })] });
  assert.equal(edit.rows?.[0]?.name, "가온(수정)");
  assert.equal(edit.rows?.[1]?.name, "나래");
  assert.equal(planInhouseCopyEdits({ original: [original], current, observedSlotNos: [1], capacity: 10, submitted: [] }).rows?.length, 1);
  assert.match(planInhouseCopyEdits({ original: [original], current, observedSlotNos: [], capacity: 10, submitted: [] }).error ?? "", /번호 행/u);
  assert.match(planInhouseCopyEdits({ original: [original], current: [{ ...original, protectedReason: "SITE" }], observedSlotNos: [1], capacity: 10, submitted: [] }).error ?? "", /사이트/u);
  assert.ok(planInhouseCopyEdits({ original: [original], current: [{ ...original, name: "먼저수정" }], observedSlotNos: [1], capacity: 10, submitted: [participant({ ...original, name: "다르게수정" })] }).error);
});

test("line errors are actionable without calling storage; saved result survives overview read failure", async () => {
  let writes = 0;
  const dispatcher = new KakaoV4CommandDispatcher({ recruiting: {
    async handle() { throw new Error("unexpected"); }, async resolveCompatTarget() { return null; }, async resolveScrimUpsert() { return null; },
  }, assistant: { async getOpenChatStatus() { throw new Error("unexpected"); }, async recordV4StaticReply() { throw new Error("unexpected"); },
    async syncSeasonSnapshot({ command }) { if (command.action === "STATUS") throw new Error("read failure"); writes++; return { body: { ...snapshot(), registrationCreated: true }, replayed: false }; },
  } });
  const service = new KakaoV4CommandService({ async authorizeProfile() { return { roomId: "room-test", roomStatus: "ACTIVE", capabilityProfile: "FEATURES", installationId: "local-test" }; } }, dispatcher);
  const form = inhouseCopyFormReply(snapshot());
  const invalid = await service.execute(envelope(form.replace("\n1.\n", "\n1. 가온\n")), "key");
  assert.match(invalid.reply, /1번은 협곡 라인이 필요/u);
  assert.equal(writes, 0);
  const valid = await service.execute({ ...envelope(form.replace("\n1.\n", "\n1. 가온/all\n")), eventId: "valid-submit" }, "key");
  assert.match(valid.reply, /내전등록 완료/u);
  assert.match(valid.reply, /현재 목록을 불러오지 못/u);
  assert.equal(writes, 1);
});
