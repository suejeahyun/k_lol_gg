import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import type { RecruitingCommand } from "../src/modules/recruiting/application/commands";
import type { KakaoSeasonSnapshotCommand } from "../src/modules/recruiting/kakao-assistant/domain";
import { KakaoV4CommandDispatcher, type KakaoV4DispatchContext } from "../src/modules/recruiting/kakao-v4/dispatcher";

function envelope(profileId: KakaoV4ProfileId, text: string, timestamp = 1_789_304_400): KakaoV4CommandEnvelope {
  return Object.freeze({
    profileId,
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-all-mode-chat-surface-0001",
    timestamp,
    nonce: "33333333333333333333333333333333",
    text,
  });
}

test("내전과 스크림 빠른 추가·삭제는 슬래시, 모바일 공백과 제한된 오타를 허용한다", () => {
  const cases = [
    ["FEATURES", "내전상세 3 추가 재현", "INHOUSE_MEMBER_ADD", "ADD_MEMBER"],
    ["FEATURES", "/내전 상세 #3 삭제 김 별", "INHOUSE_MEMBER_REMOVE", "REMOVE_MEMBER"],
    ["FEATURES", "／내전명단　＃３　추기　재현", "INHOUSE_MEMBER_ADD", "ADD_MEMBER"],
    ["RECRUIT", "스크림상세 4 참가 재현", "SCRIM_MEMBER_ADD", "ADD_MEMBER"],
    ["RECRUIT", "/스크림 명단 #4 제외 김 별", "SCRIM_MEMBER_REMOVE", "REMOVE_MEMBER"],
    ["RECRUIT", "스크림상세 4 삭재 재현", "SCRIM_MEMBER_REMOVE", "REMOVE_MEMBER"],
  ] as const;

  for (const [profileId, text, commandId, action] of cases) {
    const input = envelope(profileId, text);
    const classified = classifyKakaoV4Command(input);
    assert.equal(classified.kind, "COMMAND", text);
    if (classified.kind !== "COMMAND") continue;
    assert.equal(classified.command, commandId, text);
    assert.equal(classified.parameters.name, text.includes("김 별") ? "김 별" : "재현", text);
    const canonical = canonicalizeKakaoV4Command(classified, input);
    assert.equal(canonical?.action, action, text);
  }
});

test("협곡 내전 빠른 추가는 이름만 또는 티어·라인 전체 입력을 모두 허용한다", () => {
  for (const [text, mainPosition, subPositions] of [
    ["내전상세 6 추가 재현", "ALL", []],
    ["내전상세 6 추가 민혁/mid/ad", "MID", ["ADC"]],
    ["내전상세 6 추가 민혁/mid,ad", "MID", ["ADC"]],
    ["내전상세 6 추가 민혁/MID/AD,SUP", "MID", ["ADC", "SUP"]],
    ["내전상세 6 추가 민혁/mid,AD,ad,mid,SUP", "MID", ["ADC", "SUP"]],
    ["내전상세 6 추가 민혁/mid,all", "MID", ["TOP", "JGL", "ADC", "SUP"]],
    ["내전상세 6 추가 민혁/mid/all", "MID", ["TOP", "JGL", "ADC", "SUP"]],
    ["/내전상세 #6 추가 재현/m/m/ALL", "ALL", []],
    ["내전 상세 6 추가 재현/M/M/Mid/Top", "MID", ["TOP"]],
    ["내전명단 6 추가 재현/M/M/MID/TOP,SUP", "MID", ["TOP", "SUP"]],
  ] as const) {
    const input = envelope("FEATURES", text);
    const classified = classifyKakaoV4Command(input);
    assert.equal(classified.kind, "COMMAND", text);
    const canonical = canonicalizeKakaoV4Command(classified, input);
    if (!canonical || canonical.domain !== "SEASON" || canonical.action !== "ADD_MEMBER") assert.fail(text);
    assert.equal(canonical.name, text.includes("민혁") ? "민혁" : "재현", text);
    assert.equal(canonical.mainPosition ?? "ALL", mainPosition, text);
    assert.deepEqual(canonical.subPositions ?? [], subPositions, text);
  }
});

test("빠른 추가·삭제는 명확한 번호와 한 명의 안전한 이름만 허용한다", () => {
  for (const [profileId, text] of [
    ["FEATURES", "내전상세 0 추가 재현"],
    ["FEATURES", "내전상세 3 추가 재현/민서"],
    ["FEATURES", "내전상세 3 추가 민혁/all,mid"],
    ["FEATURES", "내전상세 3 추가 민혁/mid,unknown"],
    ["FEATURES", "내전상세 3 삭제 민혁/mid"],
    ["FEATURES", "내전상세 3 추가 재현\n민서"],
    ["RECRUIT", "스크림상세 100 삭제 재현"],
    ["RECRUIT", "스크림상세 4 추가 재현, 민서"],
  ] as const) {
    assert.equal(classifyKakaoV4Command({ profileId, text }).kind, "UNKNOWN", text);
  }
});

test("내전 명령도 파티·스크림과 같은 오전 6시 운영일을 사용한다", () => {
  // 2026-09-13 05:30 KST: 운영일은 전날이다.
  const timestamp = Math.floor(new Date("2026-09-12T20:30:00.000Z").getTime() / 1_000);
  for (const [profileId, text] of [
    ["FEATURES", "내전상세 2 추가 재현"],
    ["FEATURES", "내전현황"],
    ["RECRUIT", "스크림상세 2 추가 재현"],
  ] as const) {
    const input = envelope(profileId, text, timestamp);
    const classified = classifyKakaoV4Command(input);
    assert.notEqual(classified.kind, "UNKNOWN", text);
    const canonical = canonicalizeKakaoV4Command(classified, input);
    if (canonical && "applyDate" in canonical) assert.equal(canonical.applyDate, "2026-09-12", text);
    if (canonical && "target" in canonical) assert.equal(canonical.target.recruitDate, "2026-09-12", text);
  }
});

function dispatchContext(profileId: KakaoV4ProfileId, text: string, eventId: string): KakaoV4DispatchContext {
  return Object.freeze({
    envelope: { ...envelope(profileId, text), eventId },
    keyId: `${profileId.toLowerCase()}-current`,
    requestDigestHex: "ab".repeat(32),
    requestId: `${eventId}-request`,
    authorization: {
      roomId: profileId === "RECRUIT" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002",
      roomStatus: "ACTIVE" as const,
      capabilityProfile: profileId,
      installationId: "00000000-0000-4000-8000-000000000003",
    },
  });
}

test("내전·스크림 생성은 DRAFT 번호를 먼저 예약하고 실제 번호가 든 양식만 응답한다", async () => {
  const recruitingCalls: RecruitingCommand[] = [];
  const seasonCalls: KakaoSeasonSnapshotCommand[] = [];
  const dispatcher = new KakaoV4CommandDispatcher({
    recruiting: {
      async handle(command) {
        recruitingCalls.push(command);
        return {
          body: { aggregateKind: "SCRIM", aggregateId: command.aggregateId, revision: 0, status: "DRAFT", commandType: command.type, data: { scrimNumber: 6 } },
          revision: 0, replayed: false,
        };
      },
      async resolveCompatTarget() { return null; },
      async resolveScrimUpsert() { return null; },
    },
    assistant: {
      async getOpenChatStatus() {
        return { body: { kind: "OPENCHAT_STATUS", nextPartyRecruitNumber: null, nextPartyResetSequence: 0, nextScrimNumber: null, partiesTruncated: false, scrimsTruncated: false, parties: [], scrims: [] }, replayed: false };
      },
      async syncSeasonSnapshot(input) {
        seasonCalls.push(input.command);
        return {
          body: { kind: "SEASON_APPLICATION_SNAPSHOT", seasonId: "season-1", applyDate: input.command.applyDate, recruitNo: 7, entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 0, cancelledCount: 0 },
          replayed: false,
        };
      },
    },
  });

  const inhouseContext = dispatchContext("FEATURES", "내전구인 협곡", "event-inhouse-reserve-0001");
  const inhouseClassified = classifyKakaoV4Command(inhouseContext.envelope);
  const inhouseCommand = canonicalizeKakaoV4Command(inhouseClassified, inhouseContext.envelope);
  assert.ok(inhouseCommand);
  const inhouse = await dispatcher.dispatch(inhouseContext, inhouseCommand);
  assert.equal(seasonCalls[0]?.action, "RESERVE");
  assert.match(inhouse.legacyReply, /내전하실분 #7/u);
  assert.match(inhouse.legacyReply, /》주최자\s*:/u);
  assert.match(inhouse.legacyReply, /내전상세 7 추가 이름/u);
  assert.match(inhouse.legacyReply, /마감: 내전 7ㅉ/u);

  const scrimContext = dispatchContext("RECRUIT", "스크림구인", "event-scrim-reserve-0000001");
  const scrimClassified = classifyKakaoV4Command(scrimContext.envelope);
  const scrimCommand = canonicalizeKakaoV4Command(scrimClassified, scrimContext.envelope);
  assert.ok(scrimCommand);
  const scrim = await dispatcher.dispatch(scrimContext, scrimCommand);
  assert.equal(recruitingCalls[0]?.type, "CREATE_SCRIM");
  if (recruitingCalls[0]?.type === "CREATE_SCRIM") assert.equal(recruitingCalls[0].payload.initialStatus, "DRAFT");
  assert.match(scrim.legacyReply, /번호: #6/u);
  assert.match(scrim.legacyReply, /주최자:/u);
  assert.match(scrim.legacyReply, /스크림상세 6 추가 이름/u);
  assert.match(scrim.legacyReply, /마감: 스크림 6ㅉ/u);
});

test("내전 안내 문구는 공지가 아니며 스크림 빈 예약 양식은 활성화 명령이 되지 않는다", async () => {
  const dispatcher = new KakaoV4CommandDispatcher({
    recruiting: {
      async handle(command) {
        return { body: { aggregateKind: "SCRIM", aggregateId: command.aggregateId, revision: 0, status: "DRAFT", commandType: command.type, data: { scrimNumber: 6 } }, revision: 0, replayed: false };
      },
      async resolveCompatTarget() { return null; },
      async resolveScrimUpsert() { return null; },
    },
    assistant: {
      async getOpenChatStatus() {
        return { body: { kind: "OPENCHAT_STATUS", nextPartyRecruitNumber: null, nextPartyResetSequence: 0, nextScrimNumber: null, partiesTruncated: false, scrimsTruncated: false, parties: [], scrims: [] }, replayed: false };
      },
      async syncSeasonSnapshot(input) {
        return { body: { kind: "SEASON_APPLICATION_SNAPSHOT", seasonId: "season-1", applyDate: input.command.applyDate, recruitNo: 7, entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 0, cancelledCount: 0 }, replayed: false };
      },
    },
  });

  const inhouseContext = dispatchContext("FEATURES", "내전구인 협곡", "event-inhouse-notice-000001");
  const inhouseCreate = canonicalizeKakaoV4Command(classifyKakaoV4Command(inhouseContext.envelope), inhouseContext.envelope);
  assert.ok(inhouseCreate);
  const inhouseTemplate = (await dispatcher.dispatch(inhouseContext, inhouseCreate)).legacyReply;
  const inhouseSubmission = inhouseTemplate.replace("》주최자 :", "》주최자 : 재현");
  const inhouseEnvelope = { ...inhouseContext.envelope, eventId: "event-inhouse-notice-000002", text: inhouseSubmission };
  const inhouseSync = canonicalizeKakaoV4Command(classifyKakaoV4Command(inhouseEnvelope), inhouseEnvelope);
  if (!inhouseSync || inhouseSync.domain !== "SEASON" || inhouseSync.action !== "SYNC") assert.fail("expected inhouse snapshot");
  assert.equal(inhouseSync.roundMetadata?.noticeText, null);
  assert.equal(inhouseSync.roundMetadata?.organizerText, "재현");

  const scrimContext = dispatchContext("RECRUIT", "스크림구인", "event-scrim-empty-draft-0001");
  const scrimCreate = canonicalizeKakaoV4Command(classifyKakaoV4Command(scrimContext.envelope), scrimContext.envelope);
  assert.ok(scrimCreate);
  const scrimTemplate = (await dispatcher.dispatch(scrimContext, scrimCreate)).legacyReply;
  const emptyEnvelope = { ...scrimContext.envelope, eventId: "event-scrim-empty-draft-0002", text: scrimTemplate };
  assert.equal(canonicalizeKakaoV4Command(classifyKakaoV4Command(emptyEnvelope), emptyEnvelope), null);

  const populated = scrimTemplate.replace("주최자:", "주최자: 재현");
  const populatedEnvelope = { ...emptyEnvelope, eventId: "event-scrim-empty-draft-0003", text: populated };
  const scrimSync = canonicalizeKakaoV4Command(classifyKakaoV4Command(populatedEnvelope), populatedEnvelope);
  if (!scrimSync || scrimSync.domain !== "SCRIM" || scrimSync.action !== "UPSERT") assert.fail("expected populated scrim snapshot");
  assert.equal(scrimSync.payload.organizerText, "재현");
  assert.equal(scrimSync.payload.requesterTeamName, "재현");
});

test("내전·스크림 빠른 추가는 이름을 서버 명령으로 보내고 최신 명단을 함께 응답한다", async () => {
  const recruitingCalls: RecruitingCommand[] = [];
  const seasonCalls: KakaoSeasonSnapshotCommand[] = [];
  const dispatcher = new KakaoV4CommandDispatcher({
    recruiting: {
      async handle(command) {
        recruitingCalls.push(command);
        return {
          body: { aggregateKind: "SCRIM", aggregateId: command.aggregateId, revision: 3, status: "RECRUITING", commandType: command.type, data: { action: "ADD", outcome: "APPLIED", name: "재현" } },
          revision: 3, replayed: false,
        };
      },
      async resolveCompatTarget() { return { id: "scrim-6", revision: 2 }; },
      async resolveScrimUpsert() { return null; },
    },
    assistant: {
      async getOpenChatStatus() {
        return {
          body: {
            kind: "OPENCHAT_STATUS" as const, nextPartyRecruitNumber: null, nextPartyResetSequence: 0, nextScrimNumber: 7,
            partiesTruncated: false, scrimsTruncated: false, parties: [],
            scrims: [{
              id: "scrim-6", revision: 3, recruitDate: "2026-09-13", scrimNumber: 6,
              tournamentId: null, legacyTournamentNumber: null, requesterTeamId: null, opponentTeamId: null,
              requesterTeamName: "재현", opponentTeamName: null, title: "재현 스크림",
              requesterLineup: { top: "재현", jungle: null, mid: null, adc: null, support: null }, opponentLineup: null,
              memo: null, seriesRuleText: "3판2선", organizerText: "재현", status: "RECRUITING" as const, bestOf: 3, scheduledAt: null,
            }],
          },
          replayed: false,
        };
      },
      async syncSeasonSnapshot(input) {
        seasonCalls.push(input.command);
        return {
          body: {
            kind: "SEASON_APPLICATION_SNAPSHOT" as const, seasonId: "season-1", applyDate: input.command.applyDate,
            recruitNo: input.command.recruitNo, entries: [{
              slotNo: 1, status: "UNMATCHED" as const, source: "KAKAO" as const, suppliedName: "재현", suppliedRiotId: null,
              mainPosition: "ALL" as const, subPositions: [], player: null,
            }], appliedCount: 0, reserveCount: 0, confirmedCount: 0, pendingCount: 1, cancelledCount: 0, createdCount: 1,
            roundMetadata: { recruitNo: 3, mode: "RIFT" as const, capacity: 10, startTimeText: "21:00", scheduledStartAt: null, gameInfo: "협곡", organizerText: "재현", noticeText: null, revision: 1 },
          },
          replayed: false,
        };
      },
    },
  });

  for (const [profileId, text, eventId] of [
    ["FEATURES", "/내전상세 3 추가 재현", "event-inhouse-member-00001"],
    ["FEATURES", "/내전상세 3 추가 재현/M/M/MID/TOP", "event-inhouse-member-00002"],
    ["FEATURES", "/내전상세 3 추가 민혁/mid/ad", "event-inhouse-member-00003"],
    ["FEATURES", "/내전상세 3 추가 민혁/mid,all", "event-inhouse-member-00004"],
    ["RECRUIT", "스크림상세 6 추가 재현", "event-scrim-member-00000001"],
  ] as const) {
    const context = dispatchContext(profileId, text, eventId);
    const canonical = canonicalizeKakaoV4Command(classifyKakaoV4Command(context.envelope), context.envelope);
    assert.ok(canonical);
    const result = await dispatcher.dispatch(context, canonical);
    assert.match(result.legacyReply, text.includes("민혁") ? /추가 완료: 민혁/u : /추가 완료: 재현/u);
    assert.match(result.legacyReply, /재현/u);
  }
  assert.equal(seasonCalls[0]?.action, "ADD_PARTICIPANT");
  if (seasonCalls[0]?.action === "ADD_PARTICIPANT") assert.equal(seasonCalls[0].mainPosition, undefined);
  assert.equal(seasonCalls[1]?.action, "ADD_PARTICIPANT");
  if (seasonCalls[1]?.action === "ADD_PARTICIPANT") {
    assert.equal(seasonCalls[1].mainPosition, "MID");
    assert.deepEqual(seasonCalls[1].subPositions, ["TOP"]);
  }
  if (seasonCalls[2]?.action === "ADD_PARTICIPANT") {
    assert.equal(seasonCalls[2].mainPosition, "MID");
    assert.deepEqual(seasonCalls[2].subPositions, ["ADC"]);
  }
  if (seasonCalls[3]?.action === "ADD_PARTICIPANT") {
    assert.equal(seasonCalls[3].mainPosition, "MID");
    assert.deepEqual(seasonCalls[3].subPositions, ["TOP", "JGL", "ADC", "SUP"]);
  }
  assert.equal(recruitingCalls[0]?.type, "ADD_SCRIM_PARTICIPANT");
});
