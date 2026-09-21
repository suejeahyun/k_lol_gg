import assert from "node:assert/strict";
import test from "node:test";

import {
  hashKakaoV4EventId,
  KAKAO_V4_EVENT_SCOPE,
  type RecruitingCommand,
  type RecruitingCommandResult,
} from "../src/modules/recruiting";
import { KakaoAssistantError, kakaoReadIdentity, type KakaoOpenChatStatusDto, type KakaoSeasonSnapshotDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { KAKAO_V1_STRICT_PROTOCOL, KAKAO_V1_STRICT_RESPONSE_FORMAT } from "../src/modules/recruiting/kakao-v4/domain";
import {
  KakaoV4CommandDispatcher,
  KakaoV4DispatcherError,
  formatInhouseMemberReply,
  type KakaoV4AssistantPort,
  type KakaoV4DispatchContext,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";

test("내전 빠른 명단 응답은 결과를 한 줄로 요약하고 본명과 닉네임을 표시한다", () => {
  const baseEntry = {
    status: "APPLIED" as const,
    source: "KAKAO" as const,
    suppliedRiotId: null,
    mainPosition: "ALL" as const,
    subPositions: [],
    reserve: false,
  };
  const reply = formatInhouseMemberReply({
    kind: "SEASON_APPLICATION_SNAPSHOT",
    seasonId: "season-1",
    applyDate: "2026-09-18",
    recruitNo: 1,
    entries: [
      { ...baseEntry, slotNo: 1, suppliedName: "크리티컬히트", player: { playerId: "player-1", memberName: "민서", displayName: "크리티컬히트", riotId: "크리티컬히트#KR1" } },
      { ...baseEntry, slotNo: 2, suppliedName: "원딜은죄인이다", player: { playerId: "player-2", memberName: "정민", displayName: "원딜은죄인이다", riotId: "원딜은죄인이다#KR1" } },
      { ...baseEntry, slotNo: 3, suppliedName: "계란 안에 쌀 넣으면 쌀문계란", player: { playerId: "player-3", memberName: "명환", displayName: "계란 안에 쌀 넣으면 쌀문계란", riotId: "계란 안에 쌀 넣으면 쌀문계란#KR1" } },
    ],
    appliedCount: 3,
    reserveCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    createdCount: 1,
    updatedCount: 0,
    roundMetadata: { recruitNo: 1, mode: "RIFT", capacity: 10, startTimeText: "21:00", scheduledStartAt: null, gameInfo: null, organizerText: "민서", noticeText: null, revision: 1 },
  }, { action: "ADD", recruitNumber: 1, name: "명환" });

  assert.equal(reply, "추가 완료: 명환\n\n✅ 내전수정 완료 · #1");
});

test("내전 빠른 추가 대상이 미등록이어도 이름과 접수 인원에 포함한다", () => {
  const reply = formatInhouseMemberReply({
    kind: "SEASON_APPLICATION_SNAPSHOT",
    seasonId: "season-1",
    applyDate: "2026-09-18",
    recruitNo: 1,
    entries: [{
      slotNo: 4,
      suppliedName: "신규회원",
      suppliedRiotId: null,
      status: "UNMATCHED",
      source: "KAKAO",
      mainPosition: "MID",
      subPositions: ["ADC"],
      reserve: false,
      player: null,
    }],
    appliedCount: 0,
    reserveCount: 0,
    confirmedCount: 0,
    pendingCount: 1,
    cancelledCount: 0,
    createdCount: 1,
    updatedCount: 0,
    roundMetadata: { recruitNo: 1, mode: "RIFT", capacity: 10, startTimeText: "21:00", scheduledStartAt: null, gameInfo: null, organizerText: "민서", noticeText: null, revision: 1 },
  }, { action: "ADD", recruitNumber: 1, name: "신규회원" });

  assert.match(reply, /추가 완료: 신규회원/u);
  assert.match(reply, /참가 접수는 완료됐어요/u);
  assert.match(reply, /가입했다면 사이트 등록 이름으로 수정/u);
  assert.doesNotMatch(reply, /빠른 추가|빠른 삭제|마감:/u);
});

const context: KakaoV4DispatchContext = Object.freeze({
  envelope: Object.freeze({
    profileId: "RECRUIT",
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: "event-dispatcher-00000001",
    timestamp: 1789000000,
    nonce: "33333333333333333333333333333333",
    text: "/classifier-owned-text",
  }),
  keyId: "recruit-current",
  requestDigestHex: "ab".repeat(32),
  requestId: "request-v4-dispatcher-1",
  authorization: Object.freeze({
    roomId: "00000000-0000-4000-8000-000000000001",
    roomStatus: "ACTIVE",
    capabilityProfile: "RECRUIT",
    installationId: "00000000-0000-4000-8000-000000000002",
  }),
});

function openStatus(): KakaoOpenChatStatusDto {
  return {
    kind: "OPENCHAT_STATUS",
    nextPartyRecruitNumber: 8,
    nextPartyResetSequence: 0,
    nextScrimNumber: 4,
    partiesTruncated: false,
    scrimsTruncated: false,
    parties: [{
      id: "party-7", revision: 3, recruitDate: "2026-09-10", resetSequence: 0,
      recruitNumber: 7, type: "PARTY_NUMBER", title: "5인 파티", status: "IN_PROGRESS",
      memberCount: 1, reserveCount: 0, maximumMembers: 5,
      members: [{ name: "A", position: null, slotNo: 1, substitute: false }],
      startTimeText: "21:00", gameInfo: "미입력", organizerText: "주최자", scheduledStartAt: null,
    }],
    scrims: [{
      id: "scrim-3", revision: 2, recruitDate: "2026-09-10", scrimNumber: 3,
      tournamentId: null, legacyTournamentNumber: 14, requesterTeamId: null, opponentTeamId: null,
      requesterTeamName: "별빛단", opponentTeamName: null, title: "별빛단 스크림",
      requesterLineup: null, opponentLineup: null, memo: null, seriesRuleText: "3판2선",
      status: "RECRUITING", bestOf: 3, scheduledAt: null,
    }],
  };
}

function mutationResult(
  command: RecruitingCommand,
  memberOutcome: "APPLIED" | "ALREADY_PRESENT" | "NOT_FOUND" = "APPLIED",
): RecruitingCommandResult {
  const party = command.type.includes("PARTY");
  const partyMembers = command.type === "SYNC_PARTY" || command.type === "CREATE_PARTY" ? command.payload.members : [];
  const data: RecruitingCommandResult["body"]["data"] = party ? {
    id: command.aggregateId, recruitNumber: command.type === "CREATE_PARTY" ? 8 : 7,
    type: "PARTY_NUMBER", status: command.type === "FINISH_PARTY" ? "FINISHED" : "IN_PROGRESS",
    title: "5인 파티", memberCount: partyMembers.filter((member) => !member.substitute).length,
    reserveCount: partyMembers.filter((member) => member.substitute).length,
    maximumMembers: 5, startTimeText: "09:26", gameInfo: "미입력", organizerText: "재현", scheduledStartAt: null,
    ...(command.type === "PARTY_MEMBER_ADD" || command.type === "PARTY_MEMBER_REMOVE" ? {
      action: command.type === "PARTY_MEMBER_ADD" ? "ADD" : "REMOVE",
      outcome: memberOutcome,
      name: command.payload.name,
      slotNo: memberOutcome === "APPLIED" ? 2 : null,
      substitute: memberOutcome === "APPLIED" ? false : null,
      memberCount: command.type === "PARTY_MEMBER_ADD" && memberOutcome === "APPLIED" ? 2 : 1,
      reserveCount: 0,
    } : {}),
  } : {
    id: command.aggregateId, recruitDate: "2026-09-10", scrimNumber: 3,
    status: "RECRUITING", requesterTeamName: "별빛단", bestOf: 3,
  };
  return {
    body: {
      aggregateKind: party ? "PARTY" : "SCRIM",
      aggregateId: command.aggregateId,
      revision: command.type.startsWith("CREATE_") ? 0 : 3,
      status: String(data.status),
      commandType: command.type,
      data,
    },
    revision: command.type.startsWith("CREATE_") ? 0 : 3,
    replayed: false,
  };
}

function harness(options: Readonly<{
  missingPartyTarget?: boolean;
  closedPartyTarget?: boolean;
  partySyncError?: string;
  partyFinishError?: string;
  closedAfterHandle?: boolean;
  emptyPartyStatus?: boolean;
  missingPlayer?: boolean;
  emptyRanking?: boolean;
  wholePercent?: boolean;
  v1StrictSeasonLegacyReply?: string;
  seasonNotFound?: boolean;
  statusFailure?: boolean;
  mutationReplayed?: boolean;
  memberOutcome?: "APPLIED" | "ALREADY_PRESENT" | "NOT_FOUND";
  memberError?: "AMBIGUOUS_MEMBER" | "RECRUIT_MEMBER_LIMIT_EXCEEDED";
  partyFormCode?: string;
  partyCopyAddedNames?: readonly string[];
  partyRegistrationCreated?: boolean;
  partyCopyChanged?: boolean;
}> = {}) {
  const handled: RecruitingCommand[] = [];
  const resolved: unknown[] = [];
  const statusCalls: unknown[] = [];
  const staticCalls: unknown[] = [];
  const seasonCalls: Array<{ command: unknown }> = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      if (options.partySyncError && command.type === "SYNC_PARTY") throw new Error(options.partySyncError);
      if (options.partyFinishError && command.type === "FINISH_PARTY") throw Object.assign(new Error(options.partyFinishError), { code: options.partyFinishError });
      if (options.memberError && (command.type === "PARTY_MEMBER_ADD" || command.type === "PARTY_MEMBER_REMOVE")) {
        throw Object.assign(new Error(options.memberError), { code: options.memberError });
      }
      const result = mutationResult(command, options.memberOutcome);
      const withCopyCode = options.partyFormCode && result.body.aggregateKind === "PARTY"
        ? { ...result, body: { ...result.body, data: { ...result.body.data, formCode: options.partyFormCode,
          ...(options.partyCopyAddedNames ? { copyAddedNames: [...options.partyCopyAddedNames] } : {}),
          ...(options.partyRegistrationCreated ? { registrationCreated: true } : {}),
          ...(options.partyCopyChanged === undefined ? {} : { copyChanged: options.partyCopyChanged }),
        } } } : result;
      return options.mutationReplayed ? { ...withCopyCode, replayed: true } : withCopyCode;
    },
    async resolveCompatTarget(input) {
      resolved.push(input);
      if (input.kind === "PARTY" && (options.closedPartyTarget || options.closedAfterHandle && handled.length > 0)) {
        return input.allowedPartyStatuses?.includes("FINISHED") ? { id: "party-closed", revision: 4 } : null;
      }
      if (input.kind === "PARTY" && options.missingPartyTarget) return null;
      if (input.kind === "PARTY" && input.allowedPartyStatuses?.includes("FINISHED")) return null;
      return { id: input.kind === "PARTY" ? "party-7" : "scrim-3", revision: 2 };
    },
    async resolveScrimUpsert(input) {
      const status = openStatus();
      const scrimNumber = input.requestedScrimNumber ?? status.nextScrimNumber;
      if (!scrimNumber) return null;
      return {
        scrimNumber,
        existing: status.scrims.find((scrim) => scrim.recruitDate === input.recruitDate && scrim.scrimNumber === scrimNumber) ?? null,
      };
    },
  };
  const assistant: KakaoV4AssistantPort = {
    async getOpenChatStatus(input) {
      statusCalls.push(input);
      if (options.statusFailure) throw new Error("status unavailable");
      let body = openStatus();
      const lastCommand = handled.at(-1);
      if (input.afterMutation && lastCommand && ["CREATE_PARTY", "SYNC_PARTY", "PARTY_MEMBER_ADD", "PARTY_MEMBER_REMOVE"].includes(lastCommand.type)) {
        const result = mutationResult(lastCommand, options.memberOutcome);
        const target = resolved.at(-1) as { recruitDate?: string } | undefined;
        const base = body.parties[0]!;
        const members = lastCommand.type === "SYNC_PARTY" || lastCommand.type === "CREATE_PARTY"
          ? lastCommand.payload.members
          : lastCommand.type === "PARTY_MEMBER_ADD" && options.memberOutcome !== "ALREADY_PRESENT"
            ? [...base.members, { name: lastCommand.payload.name, position: null, slotNo: 2, substitute: false }]
            : base.members;
        body = { ...body, parties: [{
          ...base, id: lastCommand.aggregateId, revision: result.revision,
          recruitDate: lastCommand.type === "CREATE_PARTY" ? lastCommand.payload.recruitDate : target?.recruitDate ?? base.recruitDate,
          recruitNumber: Number(result.body.data.recruitNumber), members,
          memberCount: members.filter((member) => !member.substitute).length,
          reserveCount: members.filter((member) => member.substitute).length,
          startTimeText: lastCommand.type === "SYNC_PARTY" ? lastCommand.payload.startTimeText ?? "09:26" : "09:26",
          gameInfo: lastCommand.type === "SYNC_PARTY" ? lastCommand.payload.gameInfo ?? "미입력" : "미입력",
          organizerText: lastCommand.type === "SYNC_PARTY" ? lastCommand.payload.organizerText ?? "재현" : "재현",
        }] };
      }
      if (options.partyFormCode) body = { ...body, parties: body.parties.map((party) => ({ ...party, formCode: options.partyFormCode })) };
      return { body: options.emptyPartyStatus ? { ...body, parties: [] } : body, replayed: false };
    },
    async recordV4StaticReply(input) {
      staticCalls.push(input);
      return { body: { kind: "KAKAO_V4_STATIC_RECEIPT", receiptVersion: 1, legacyReply: input.legacyReply }, replayed: false };
    },
    async getPlayerRecord(input) {
      if (options.missingPlayer) return {
        body: {
          kind: "PLAYER_RECORD", mode: input.mode, query: input.query, player: null,
          currentTier: null, peakTier: null, season: null, summary: null, recentMatches: [],
        },
        replayed: false,
      };
      return {
        body: {
          kind: "PLAYER_RECORD", mode: input.mode, query: input.query,
          player: { playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1" },
          currentTier: "EMERALD", peakTier: "DIAMOND",
          season: { id: "season-1", name: "가을 시즌" },
          summary: {
            totalGames: 12, participationCount: 7, wins: 5, losses: 2,
            winRate: options.wholePercent ? 50 : 71.4, mvpCount: 2, kills: 25, deaths: 8, assists: 9, kda: 4.2,
          },
          recentMatches: [{
            matchId: "match-1", title: "정기 내전", playedOn: "2026-09-09", gameNumber: 1,
            championName: "아리", team: "BLUE", position: "MID", won: true, mvp: true,
            kills: 8, deaths: 2, assists: 9,
          }],
        },
        replayed: false,
      };
    },
    async getRanking() {
      return {
        body: {
          kind: "RANKING", season: { id: "season-1", name: "가을 시즌" }, minimumParticipation: 10,
          rows: options.emptyRanking ? [] : [{
            rank: 1, playerId: "player-1", displayName: "별빛", riotId: "별빛#KR1",
            totalGames: 12, participationCount: 12, wins: 9, losses: 3,
            winRate: options.wholePercent ? 50 : 71.4, mvpCount: 2, kda: 4.2,
          }],
          truncated: false,
        },
        replayed: false,
      };
    },
    async syncSeasonSnapshot(input) {
      seasonCalls.push({ command: input.command });
      if (options.seasonNotFound) throw new KakaoAssistantError("NOT_FOUND");
      const body: KakaoSeasonSnapshotDto = {
        kind: "SEASON_APPLICATION_SNAPSHOT",
        seasonId: input.command.seasonId ?? "11111111-1111-4111-8111-111111111111",
        applyDate: input.command.applyDate,
        recruitNo: input.command.recruitNo,
        entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0,
        pendingCount: 0, cancelledCount: input.command.action === "SYNC" ? 2 : 0,
        createdCount: 0, updatedCount: 0,
        ...(options.v1StrictSeasonLegacyReply ? { v1StrictLegacyReply: options.v1StrictSeasonLegacyReply } : {}),
      };
      return { body, replayed: false };
    },
  };
  return { dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant }), handled, resolved, statusCalls, staticCalls, seasonCalls };
}

test("player record, recent matches, and ranking preserve exact V1-visible fields", async () => {
  const state = harness();
  const featuresContext: KakaoV4DispatchContext = {
    ...context,
    envelope: { ...context.envelope, profileId: "FEATURES" },
    authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
  };
  const record = await state.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RECORD", query: "별빛#KR1" });
  assert.equal(record.legacyReply, "[별빛#KR1 전적]\n\n시즌: 가을 시즌\n티어: EMERALD / DIAMOND\n참여: 7회 / 12세트\n전적: 5승 2패 (71.4%)\nKDA: 4.20 (25/8/9)\nMVP: 2회\n\n최근: 승 아리 8/2/9\n\nhttps://k-lol-gg.vercel.app/players/player-1");

  const recent = await state.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RECENT", query: "별빛#KR1" });
  assert.equal(recent.legacyReply, "[별빛#KR1 최근 경기]\n\n1. 승 | 아리 | 8/2/9\n\nhttps://k-lol-gg.vercel.app/players/player-1");

  const ranking = await state.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RANKING" });
  assert.equal(ranking.legacyReply, "🏆 K-LOL.GG 랭킹 TOP 5\n기준: 내전 참여 10회 이상\n\n1. 별빛#KR1 | 승률 71.4% | 참여 12회 | 12세트 | KDA 4.20");
});

test("player and ranking boundary replies preserve V1 wording and percent formatting", async () => {
  const featuresContext: KakaoV4DispatchContext = {
    ...context,
    envelope: { ...context.envelope, profileId: "FEATURES" },
    authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
  };
  const whole = harness({ wholePercent: true });
  const record = await whole.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RECORD", query: "별빛#KR1" });
  const ranking = await whole.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RANKING" });
  assert.match(record.legacyReply, /전적: 5승 2패 \(50%\)/u);
  assert.match(ranking.legacyReply, /승률 50%/u);

  const missing = harness({ missingPlayer: true, emptyRanking: true });
  const missingPlayer = await missing.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RECORD", query: "없는사람#KR1" });
  const emptyRanking = await missing.dispatcher.dispatch(featuresContext, { domain: "PLAYER", action: "RANKING" });
  assert.equal(missingPlayer.legacyReply, "[플레이어 전적]\n\n일치하는 플레이어를 찾지 못했습니다.");
  assert.match(emptyRanking.legacyReply, /표시할 랭킹 기록이 없습니다\./u);
});

test("V4 event key is shared by recruiting and assistant durable receipts", () => {
  const direct = hashKakaoV4EventId(context.envelope.eventId);
  const assistant = kakaoReadIdentity({
    principalId: `bot:kakao:v4:${context.envelope.installationId}`,
    scope: KAKAO_V4_EVENT_SCOPE,
    requestKey: context.envelope.eventId,
    bodyDigestHex: context.requestDigestHex,
  });
  assert.deepEqual(Buffer.from(assistant.keyHash), Buffer.from(direct));
});

test("party create reserves an invisible draft and returns all blank slots with its copy reference", async () => {
  const state = harness();
  const command: CanonicalKakaoV4Command = {
    domain: "PARTY",
    action: "CREATE",
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null, organizerText: null,
      scheduledStartAt: null, protectedUntil: null,
    },
  };
  const result = await state.dispatcher.dispatch(context, command);
  assert.deepEqual(state.handled.map((handled) => handled.type), ["CREATE_PARTY"]);
  assert.equal(state.handled[0]?.type === "CREATE_PARTY" ? state.handled[0].payload.initialStatus : null, "DRAFT");
  assert.notEqual(result.aggregate, null);
  assert.match(result.legacyReply, /^\[K-LOL\.GG 구인상세 #8\]\n\n#8 · 5인 파티 · 0\/5/u);
  assert.match(result.legacyReply, /저장기준 : 2026-09-10 \/ P[a-f0-9]{32}-R0/u);
  assert.match(result.legacyReply, /^1\.\n2\.\n3\.\n4\.\n5\.\n예비 1\./mu);
});

test("the exact generated V1 party form activates with only organizer populated and applies metadata defaults", async () => {
  for (const prefix of ["", "/"]) {
    const state = harness();
    const generated = await state.dispatcher.dispatch(context, {
      domain: "PARTY",
      action: "CREATE",
      payload: {
        recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
        title: "5인 파티 구인", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null, organizerText: null,
        scheduledStartAt: null, protectedUntil: null,
      },
    });
    const submittedText = `${prefix}${generated.legacyReply}`
      .replace("》주최자 :", "》주최자 : 재현");
    const submittedEnvelope = { ...context.envelope, eventId: `event-dispatcher-form-${prefix ? "slash" : "plain"}`, text: submittedText };
    const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text: submittedText });
    const command = canonicalizeKakaoV4Command(classification, submittedEnvelope);
    if (!command || command.domain !== "PARTY" || command.action !== "SYNC") assert.fail("generated form must canonicalize as a party snapshot");

    const saved = await state.dispatcher.dispatch({ ...context, envelope: submittedEnvelope }, command);
    assert.deepEqual(state.handled.map((handled) => handled.type), ["CREATE_PARTY", "SYNC_PARTY"]);
    if (state.handled[1]?.type !== "SYNC_PARTY") assert.fail("submitted form must activate the reserved party");
    assert.equal(state.handled[1].payload.startTimeState, "PRESENT_EMPTY");
    assert.equal(state.handled[1].payload.gameInfoState, "PRESENT_EMPTY");
    assert.equal(state.handled[1].payload.organizerText, "재현");
    assert.deepEqual(state.handled[1].payload.members, []);
    assert.match(saved.legacyReply, /📋 현재 구인/u);
    assert.doesNotMatch(saved.legacyReply, /주최자/u);
  }
});

test("R24 party creation shows empty metadata, all slots and the code below the title", async () => {
  for (const strict of [false, true]) {
    const state = harness({ partyFormCode: "ABCDE-23456" });
    const createContext: KakaoV4DispatchContext = strict ? { ...context, envelope: { ...context.envelope, protocol: KAKAO_V1_STRICT_PROTOCOL, responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT } } : context;
    const result = await state.dispatcher.dispatch(createContext, {
      domain: "PARTY", action: "CREATE", payload: {
        recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
        title: "5인 파티 구인", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null,
      },
    });
    assert.equal(result.legacyReply, [
      "[파티 #8] 5인 파티 · 0/5명", "양식코드: ABCDE-23456", "──────────────",
      "시작 시간 : ", "게임 종류 : ", "", "1.", "2.", "3.", "4.", "5.", "", "예비 1.",
    ].join("\n"));
    const created = state.handled[0];
    if (created?.type !== "CREATE_PARTY") assert.fail("expected a reserved draft");
    assert.equal(created.payload.startTimeText, "미정");
    assert.equal(created.payload.initialStatus, "DRAFT");
    assert.equal(created.payload.members.length, 0);
  }
});

test("R24 copying the latest party form preserves names and returns a non-editable overview", async () => {
  for (const unchanged of [false, true]) {
    const state = harness({ partyFormCode: "ABCDE-23456", partyCopyAddedNames: unchanged ? [] : ["민규"], partyCopyChanged: !unchanged });
    const detail = await state.dispatcher.dispatch(context, { domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 7 } });
    const text = unchanged ? detail.legacyReply : detail.legacyReply.replace("2.\n", "2. 민규\n");
    const submittedEnvelope = { ...context.envelope, text, eventId: `event-compact-party-${unchanged}` };
    const canonical = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), submittedEnvelope);
    if (canonical?.domain !== "PARTY" || canonical.action !== "SYNC") assert.fail("compact form must route as party sync");
    const result = await state.dispatcher.dispatch({ ...context, envelope: submittedEnvelope }, canonical);
    const saved = state.handled[0];
    if (saved?.type !== "SYNC_PARTY") assert.fail("expected one party sync");
    assert.equal(saved.payload.copyGuard?.saveReference, "ABCDE-23456");
    assert.equal(saved.payload.members[0]?.name, "A");
    assert.equal(saved.payload.members.length, unchanged ? 1 : 2);
    assert.match(result.legacyReply, unchanged ? /^이미 같은 내용으로 저장되어 있어요\.\n\n📋 현재 구인/u : /^✅ 파티수정 완료 · #7\n\n📋 현재 구인/u);
    assert.equal(result.legacyReply.match(/\[파티 #7\]/gu)?.length, 1);
    assert.doesNotMatch(result.legacyReply, /운영일|저장기준|주최자/u);
    const copiedAgain = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text: result.legacyReply }), { ...submittedEnvelope, text: result.legacyReply });
    assert.notEqual(copiedAgain?.action, "SYNC", "an overview must never be accepted as an editable roster");
  }
});

test("ADR0011 first registration names stay brief before the complete overview", async () => {
  for (const names of [["합성A", "합성B"], ["😀".repeat(80), "합성B", "합성C", "합성D"]]) {
    const state = harness({ partyFormCode: "ABCDE-23456", partyCopyAddedNames: names, partyRegistrationCreated: true });
    const result = await state.dispatcher.dispatch(context, {
      domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      payload: { recruitDate: "2026-09-10", preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
        title: "5인 파티", maximumMembers: 5,
        members: names.map((name, index) => ({ name, slotNo: index + 1, position: null, substitute: false })),
        scheduledStartAt: null, protectedUntil: null },
    });
    const firstLine = result.legacyReply.split("\n")[0]!;
    assert.match(firstLine, /^✅ 파티등록 완료 · #7 · /u);
    assert.ok(firstLine.length < 200);
    assert.ok(firstLine.isWellFormed());
    assert.match(firstLine, names.length === 2 ? /합성A, 합성B$/u : /….*, 합성B, 합성C 외 1명$/u);
    assert.match(result.legacyReply, /\n\n📋 현재 구인/u);
    assert.doesNotMatch(result.legacyReply, /양식코드/u);
  }
});

test("the reported metadata-only #11 form reaches one idempotent party activation", async () => {
  const state = harness();
  const service = new KakaoV4CommandService({
    async authorizeProfile() {
      return context.authorization;
    },
  }, state.dispatcher);
  const text = [
    "[K-LOL.GG 구인구직 양식]",
    "같이 할사람~",
    "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.",
    "",
    "📢 5인 파티 구인",
    "모집번호: #11",
    "운영일: 2026-09-13",
    "",
    "》시작시간 : test",
    "》게임정보 :test",
    "》주최자 :test",
    "",
    "위 항목을 작성해 전체 전송해주세요.",
    "비워 둔 시간과 게임 정보는 자동으로 채워집니다.",
    "활성화 후 상세 번호 추가 이름으로 참가할 수 있습니다.",
    "",
    "참여해주실 분은 태그해주세요.",
    "*상호배려와 존중 부탁드립니다.",
  ].join("\n");
  const envelope = {
    ...context.envelope,
    eventId: "event-reported-party-form-00000001",
    timestamp: Date.parse("2026-09-13T20:38:00+09:00") / 1_000,
    text,
  };

  const first = await service.execute(envelope, context.keyId);
  const replay = await service.execute(envelope, context.keyId);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.reply, first.reply);
  assert.deepEqual(state.resolved, [{
    kind: "PARTY",
    sourceRoomId: context.authorization.roomId,
    recruitDate: "2026-09-13",
    recruitNumber: 11,
    allowedPartyStatuses: ["DRAFT", "IN_PROGRESS"],
  }]);
  assert.equal(state.handled.length, 1);
  const activation = state.handled[0];
  if (activation?.type !== "SYNC_PARTY") assert.fail("reported form must dispatch one party sync");
  assert.deepEqual(activation.payload.members, []);
  assert.equal(activation.payload.startTimeText, "test");
  assert.equal(activation.payload.startTimeState, "PRESENT_VALUE");
  assert.equal(activation.payload.gameInfo, "test");
  assert.equal(activation.payload.gameInfoState, "PRESENT_VALUE");
  assert.equal(activation.payload.organizerText, "test");
  assert.equal(activation.payload.organizerState, "PRESENT_VALUE");
  assert.match(first.reply, /^✅ 파티수정 완료 · #\d+\n\n📋 현재 구인/u);
  assert.doesNotMatch(first.reply, /양식코드/u);
});

test("first completed automatic party form creates the party once", async () => {
  const state = harness();
  const result = await state.dispatcher.dispatch(context, {
    domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: null },
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5,
      members: [{ slotNo: 1, name: "재현", position: null, substitute: false }],
      scheduledStartAt: null, protectedUntil: null,
    },
  });
  assert.deepEqual(state.handled.map((command) => command.type), ["CREATE_PARTY"]);
  assert.equal(state.handled[0]?.metadata.actor.kind, "BOT");
  assert.equal(state.handled[0]?.metadata.idempotency.scope, KAKAO_V4_EVENT_SCOPE);
  assert.match(result.legacyReply, /^✅ 파티등록 완료 · #8\n\n📋 현재 구인/u);
  assert.match(result.legacyReply, /\[파티 #8\] 5인 파티 · 09:26 · 미정 · 1\/5명/u);
  assert.doesNotMatch(result.legacyReply, /양식코드|재현/u);
});

test("explicit missing party number never falls back to creating a new party", async () => {
  const state = harness({ missingPartyTarget: true });
  const result = await state.dispatcher.dispatch(context, {
    domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 999 },
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: 999, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5,
      members: [{ slotNo: 1, name: "재현", position: null, substitute: false }],
      scheduledStartAt: null, protectedUntil: null,
    },
  });
  assert.match(result.legacyReply, /저장하지 않았어요.*모집을 찾지 못했습니다/u);
  assert.doesNotMatch(result.legacyReply, /입력 형식|이미 마감/u);
  assert.equal(state.handled.length, 0);
});

test("closed party copies and repeated finish receive a scoped closed reply without mutation", async () => {
  for (const action of ["SYNC", "FINISH"] as const) {
    const state = harness({ closedPartyTarget: true });
    const target = { recruitDate: "2026-09-10", recruitNumber: 7 };
    const command: CanonicalKakaoV4Command = action === "FINISH" ? { domain: "PARTY", action, target }
      : { domain: "PARTY", action, target, payload: {
        recruitDate: target.recruitDate, preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
        title: "5인 파티", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null,
      } };
    const result = await state.dispatcher.dispatch(context, command);
    assert.match(result.legacyReply, /이미 마감되거나 종료된 파티/u);
    assert.doesNotMatch(result.legacyReply, /입력 형식|저장했습니다/u);
    assert.equal(state.handled.length, 0);
    assert.deepEqual(state.resolved.at(-1), { kind: "PARTY", sourceRoomId: context.authorization.roomId,
      ...target, allowedPartyStatuses: ["FINISHED", "CANCELED", "RESET"] });
  }
});

test("copy edit conflicts and incomplete rows explain recovery and never report a save", async () => {
  for (const [partySyncError, expected] of [
    ["PARTY_COPY_EDIT_CONFLICT", /같은 항목을 다른 사람이 먼저 수정/u],
    ["PARTY_COPY_INCOMPLETE", /번호 행이나 예비 행이 빠졌어요/u],
    ["EMPTY_DRAFT_ACTIVATION", /첫 참가자 이름/u],
    ["RECRUIT_NOT_MUTABLE", /이미 마감되거나 종료된 파티/u],
  ] as const) {
    const state = harness({ partySyncError, closedAfterHandle: partySyncError === "RECRUIT_NOT_MUTABLE" });
    const result = await state.dispatcher.dispatch(context, {
      domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      payload: { recruitDate: "2026-09-10", preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
        title: "5인 파티", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null },
    });
    assert.match(result.legacyReply, expected);
    assert.equal(result.aggregate, null);
    assert.doesNotMatch(result.legacyReply, /신청 저장:|저장했어요|입력 형식/u);
  }
});

test("a concurrent finish gets a closed reply while an active revision race asks for a retry", async () => {
  for (const closedAfterHandle of [true, false]) {
    const state = harness({ partyFinishError: "REVISION_CONFLICT", closedAfterHandle });
    const result = await state.dispatcher.dispatch(context, { domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-10", recruitNumber: 7 } });
    assert.match(result.legacyReply, closedAfterHandle ? /이미 마감되거나 종료된/u : /모집 상태가 바뀌어 이번 요청으로는 마감하지 않았어요/u);
    assert.equal(state.handled.length, 1);
    assert.doesNotMatch(result.legacyReply, /모집을 마감했습니다|입력 형식/u);
  }
});

test("a copied form reference cannot be reused to create an automatic-number party", async () => {
  const state = harness({ partyFormCode: "ABCDE-23456" });
  const detail = await state.dispatcher.dispatch(context, { domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 7 } });
  const text = detail.legacyReply;
  const command = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), { ...context.envelope, text });
  if (command?.domain !== "PARTY" || command.action !== "SYNC") assert.fail("expected a copied party");
  const result = await state.dispatcher.dispatch(context, { ...command, target: { ...command.target, recruitNumber: null } });
  assert.match(result.legacyReply, /모집번호를 바꿀 수 없어요/u);
  assert.equal(state.handled.length, 0);
});

test("incomplete copied party forms and numberless inhouse detail return actionable guidance", async () => {
  const state = harness();
  const service = new KakaoV4CommandService({ async authorizeProfile(input) {
    return { ...context.authorization, capabilityProfile: input.requiredCapabilityProfile };
  } }, state.dispatcher);
  const text = "[파티 #7] 5인 파티 · 1/5명\n시작: 지금\n게임: 배그\n\n1. 참가자A\n2.\n3.\n5.\n예비 1.\n양식코드: ABCDE-FGHJK";
  const result = await service.execute({ ...context.envelope, text }, context.keyId);
  assert.match(result.reply, /번호 행이 빠졌어요/u);
  assert.match(result.reply, /상세 번호/u);
  const detail = await service.execute({ ...context.envelope, profileId: "FEATURES", text: "내전상세", eventId: "missing-inhouse-number" }, context.keyId);
  assert.match(detail.reply, /내전상세 2/u);
  assert.equal(state.handled.length, 0);
  assert.equal(state.seasonCalls.length, 0);
});

test("existing party snapshots forward slot states without forwarding submitted type or capacity", async () => {
  const state = harness();
  const text = "[K-LOL.GG 구인구직 양식]\n📢 2인 파티 구인\n모집번호: #7\n\n1. 새참가자\n2.\n예비 1.";
  const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
  const command = canonicalizeKakaoV4Command(classification, { ...context.envelope, text, eventId: "event-dispatcher-db-authority-01" });
  if (!command || command.domain !== "PARTY" || command.action !== "SYNC") assert.fail("expected exact party snapshot");
  await state.dispatcher.dispatch({ ...context, envelope: { ...context.envelope, text, eventId: "event-dispatcher-db-authority-01" } }, command);
  const handled = state.handled[0];
  if (handled?.type !== "SYNC_PARTY") assert.fail("expected party sync");
  assert.equal("partyType" in handled.payload, false);
  assert.equal("title" in handled.payload, false);
  assert.equal("maximumMembers" in handled.payload, false);
  assert.deepEqual(handled.payload.slotPatches, [
    { slotNo: 1, substitute: false, state: "PRESENT_VALUE", value: "새참가자" },
    { slotNo: 2, substitute: false, state: "PRESENT_EMPTY", value: null },
    { slotNo: 1, substitute: true, state: "PRESENT_EMPTY", value: null },
  ]);
});

test("party status and detail use one server status receipt and return the latest aggregate", async () => {
  const statusState = harness();
  const status = await statusState.dispatcher.dispatch(context, { domain: "PARTY", action: "STATUS" });
  assert.equal(statusState.statusCalls.length, 1);
  assert.equal((statusState.statusCalls[0] as { projection?: string }).projection, "PARTY");
  assert.equal((statusState.statusCalls[0] as { now?: Date }).now?.toISOString(), new Date(context.envelope.timestamp * 1_000).toISOString());
  assert.equal((statusState.statusCalls[0] as { afterMutation?: boolean }).afterMutation, false);
  assert.equal(statusState.handled.length, 0);
  assert.match(status.legacyReply, /📋 현재 구인/u);

  const detailState = harness();
  const detail = await detailState.dispatcher.dispatch(context, {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
  });
  assert.equal(detailState.statusCalls.length, 1);
  assert.equal((detailState.statusCalls[0] as { projection?: string }).projection, "PARTY");
  assert.deepEqual((detailState.statusCalls[0] as { partyTarget?: unknown }).partyTarget,
    { recruitDate: "2026-09-10", recruitNumber: 7 });
  assert.match(detail.legacyReply, /》시작시간 : 21:00/u);
  assert.match(detail.legacyReply, /》게임정보 : 미입력/u);
  assert.match(detail.legacyReply, /저장기준 : 2026-09-10 \/ P[a-f0-9]{32}-R3/u);
  assert.match(detail.legacyReply, /^1\. A\n2\.\n3\.\n4\.\n5\.\n예비 1\./mu);

  const missingDetailState = harness({ emptyPartyStatus: true });
  const missingDetail = await missingDetailState.dispatcher.dispatch(context, {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 77 },
  });
  assert.equal(missingDetail.legacyReply, "[K-LOL.GG 요청 실패]\n진행 중인 파티 #77을 찾지 못했습니다.");
});

test("party member shortcut classifications canonicalize to the current operating day", () => {
  const timestamp = Date.parse("2026-09-13T05:59:59.000+09:00") / 1_000;
  for (const [text, action] of [
    ["상세 12 추가 민서", "ADD_MEMBER"],
    ["/상세 12 삭제 민서", "REMOVE_MEMBER"],
  ] as const) {
    const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text });
    const command = canonicalizeKakaoV4Command(classification, {
      ...context.envelope,
      text,
      timestamp,
      eventId: `event-member-canonical-${action.toLowerCase()}`,
    });
    assert.deepEqual(command, {
      domain: "PARTY",
      action,
      target: { recruitDate: "2026-09-12", recruitNumber: 12 },
      name: "민서",
    });
  }
});

test("party member shortcut outcomes return confirmation followed by the latest full form", async () => {
  for (const scenario of [
    { action: "ADD_MEMBER" as const, outcome: "APPLIED" as const, expected: "추가 완료: 민서 · 2번" },
    { action: "ADD_MEMBER" as const, outcome: "ALREADY_PRESENT" as const, expected: "이미 명단에 있습니다: 민서" },
    { action: "REMOVE_MEMBER" as const, outcome: "APPLIED" as const, expected: "삭제 완료: 민서 · 2번" },
    { action: "REMOVE_MEMBER" as const, outcome: "NOT_FOUND" as const, expected: "명단에서 찾지 못했습니다: 민서" },
  ]) {
    const state = harness({ memberOutcome: scenario.outcome });
    const result = await state.dispatcher.dispatch(context, {
      domain: "PARTY",
      action: scenario.action,
      target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      name: "민서",
    });
    assert.equal(result.kind, "PARTY");
    assert.equal(result.action, scenario.action);
    assert.match(result.legacyReply, new RegExp(scenario.expected, "u"));
    assert.match(result.legacyReply, /현재 \d+\/5명 · 예비 0명/u);
    assert.match(result.legacyReply, /\[K-LOL\.GG 구인상세 #7\]/u);
    assert.match(result.legacyReply, /저장기준 : 2026-09-10 \/ P[a-f0-9]{32}-R3/u);
    assert.match(result.legacyReply, /^1\. A$/mu);
    assert.doesNotMatch(result.legacyReply, /구인구직 현황/u);
    assert.equal(state.statusCalls.length, 1);
    assert.equal((state.statusCalls[0] as { projection?: string }).projection, "PARTY");
    assert.equal((state.statusCalls[0] as { afterMutation?: boolean }).afterMutation, true);
    assert.deepEqual(state.resolved, [{
      kind: "PARTY",
      sourceRoomId: context.authorization.roomId,
      recruitDate: "2026-09-10",
      recruitNumber: 7,
      allowedPartyStatuses: ["IN_PROGRESS"],
    }]);
    assert.equal(state.handled.length, 1);
    const handled = state.handled[0];
    assert.equal(handled?.type, scenario.action === "ADD_MEMBER" ? "PARTY_MEMBER_ADD" : "PARTY_MEMBER_REMOVE");
    if (handled?.type !== "PARTY_MEMBER_ADD" && handled?.type !== "PARTY_MEMBER_REMOVE") assert.fail("expected member command");
    assert.deepEqual(handled.payload, { name: "민서" });
    assert.equal(handled.metadata.expectedRevision, 2);
  }
});

test("missing, ambiguous, and member-limit shortcut results stay concrete successful replies", async () => {
  const missing = harness({ missingPartyTarget: true });
  const missingResult = await missing.dispatcher.dispatch(context, {
    domain: "PARTY",
    action: "ADD_MEMBER",
    target: { recruitDate: "2026-09-10", recruitNumber: 15 },
    name: "민서",
  });
  assert.equal(missing.handled.length, 0);
  assert.equal(missingResult.aggregate, null);
  assert.match(missingResult.legacyReply, /현재 운영일의 수정 가능한 모집을 찾지 못했습니다/u);
  assert.match(missingResult.legacyReply, /📋 현재 구인/u);

  for (const scenario of [
    { action: "REMOVE_MEMBER" as const, error: "AMBIGUOUS_MEMBER" as const, expected: "동명이인이 있어 자동 삭제할 수 없습니다: 민서" },
    { action: "ADD_MEMBER" as const, error: "RECRUIT_MEMBER_LIMIT_EXCEEDED" as const, expected: "전체 한도(99명)에 도달했습니다" },
  ]) {
    const state = harness({ memberError: scenario.error });
    const result = await state.dispatcher.dispatch(context, {
      domain: "PARTY",
      action: scenario.action,
      target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      name: "민서",
    });
    assert.equal(result.aggregate, null);
    assert.equal(result.replayed, false);
    assert.match(result.legacyReply, new RegExp(scenario.expected.replace(/[()]/gu, "\\$&"), "u"));
    assert.match(result.legacyReply, /📋 현재 구인/u);
    assert.equal(state.handled.length, 1);
    assert.equal(state.statusCalls.length, 1);
  }
});

test("party mutation and latest full form keep the signed instant across the 06:00 KST boundary", async () => {
  for (const [instant, expectedDate] of [
    ["2026-09-12T05:59:59.000+09:00", "2026-09-11"],
    ["2026-09-12T06:01:00.000+09:00", "2026-09-12"],
  ] as const) {
    const text = "[K-LOL.GG 구인구직 양식]\n📢 5인 파티 구인\n모집번호: #7\n1. 재현\n2.\n3.\n4.\n5.\n예비 1.";
    const envelope = { ...context.envelope, eventId: `event-boundary-${expectedDate}`, timestamp: Date.parse(instant) / 1_000, text };
    const command = canonicalizeKakaoV4Command(classifyKakaoV4Command({ profileId: "RECRUIT", text }), envelope);
    if (!command || command.domain !== "PARTY" || command.action !== "SYNC") assert.fail("expected party sync");
    const state = harness();
    const result = await state.dispatcher.dispatch({ ...context, envelope }, command);
    assert.equal(command.target.recruitDate, expectedDate);
    assert.equal((state.statusCalls[0] as { now?: Date }).now?.toISOString(), new Date(instant).toISOString());
    assert.equal((state.statusCalls[0] as { afterMutation?: boolean }).afterMutation, true);
    assert.match(result.legacyReply, /^✅ 파티수정 완료 · #7\n\n📋 현재 구인/u);
    assert.equal((state.resolved[0] as { recruitDate: string }).recruitDate, expectedDate);
    assert.doesNotMatch(result.legacyReply, /양식코드/u);
  }
});

test("replayed sync, blank deletion, and finish disclose a failed post-mutation status refresh", async () => {
  const suffix = "현재 구인 목록을 불러오지 못했어요.\n구인현황을 입력해 주세요.";
  const commands: readonly CanonicalKakaoV4Command[] = [
    {
      domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      payload: {
        recruitDate: "2026-09-10", preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
        title: "5인 파티 구인", maximumMembers: 5,
        members: [{ slotNo: 1, name: "재현", position: null, substitute: false }],
        scheduledStartAt: null, protectedUntil: null,
      },
    },
    {
      domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
      payload: {
        recruitDate: "2026-09-10", preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
        title: "5인 파티 구인", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null,
      },
    },
    { domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-10", recruitNumber: 7 } },
  ];
  for (const [index, command] of commands.entries()) {
    const state = harness({ statusFailure: true, mutationReplayed: index === 0 });
    const result = await state.dispatcher.dispatch({
      ...context,
      envelope: { ...context.envelope, eventId: `event-status-failure-${String(index)}` },
    }, command);
    assert.equal(result.replayed, index === 0);
    if (command.action === "FINISH") {
      assert.equal(result.legacyReply.endsWith(suffix), true);
      assert.match(result.legacyReply, /파티 #7 마감 완료/u);
    } else {
      assert.equal(result.legacyReply, `✅ 파티수정 완료 · #7\n\n${suffix}`);
    }
  }
});

test("party snapshot and finish resolve latest revision without owner or role inputs", async () => {
  const state = harness();
  await state.dispatcher.dispatch(context, {
    domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: 7, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5, members: [], scheduledStartAt: null, protectedUntil: null,
    },
  });
  await state.dispatcher.dispatch({ ...context, envelope: { ...context.envelope, eventId: "event-dispatcher-00000002" } }, {
    domain: "PARTY", action: "FINISH", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
  });
  assert.equal(state.resolved.length, 2);
  assert.deepEqual(
    state.resolved.map((input) => (input as { allowedPartyStatuses?: readonly string[] }).allowedPartyStatuses),
    [["DRAFT", "IN_PROGRESS"], ["IN_PROGRESS"]],
  );
  assert.deepEqual(state.handled.map((command) => command.type), ["SYNC_PARTY", "FINISH_PARTY"]);
  assert.equal(JSON.stringify(state.handled).includes("role"), false);
  assert.equal(JSON.stringify(state.handled).includes("owner"), false);
});

test("missing current-operating-day party finish is a V1 success reply with the latest status and no mutation", async () => {
  const state = harness({ missingPartyTarget: true });
  const result = await state.dispatcher.dispatch({
    ...context,
    envelope: {
      ...context.envelope,
      protocol: KAKAO_V1_STRICT_PROTOCOL,
      responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
      eventId: "event-missing-party-finish-0001",
    },
  }, {
    domain: "PARTY",
    action: "FINISH",
    target: { recruitDate: "2026-09-10", recruitNumber: 15 },
  });

  assert.equal(result.aggregate, null);
  assert.equal(result.replayed, false);
  assert.equal(state.handled.length, 0);
  assert.deepEqual(
    state.resolved.slice(0, 2).map((input) => (input as { allowedPartyStatuses?: readonly string[] }).allowedPartyStatuses),
    [["IN_PROGRESS"], ["DRAFT"]],
  );
  assert.match(result.legacyReply, /^\[K-LOL\.GG 구인구직 마무리\]\n현재 운영일의 진행 중인 모집번호 #15를 찾지 못했습니다\.\n최신 구인현황을 확인해 주세요\./u);
  assert.match(result.legacyReply, /📋 현재 구인/u);
  assert.match(result.legacyReply, /#7/u);
});

test("scrim status requests only the scrim projection", async () => {
  const state = harness();
  const result = await state.dispatcher.dispatch(context, { domain: "SCRIM", action: "STATUS" });
  assert.equal(state.statusCalls.length, 1);
  assert.equal((state.statusCalls[0] as { projection?: string }).projection, "SCRIM");
  assert.match(result.legacyReply, /K-LOL\.GG 스크림 현황/u);
});

test("season authoritative zero-person snapshot writes once then reads the overview", async () => {
  const state = harness();
  const featuresContext: KakaoV4DispatchContext = {
    ...context,
    envelope: { ...context.envelope, profileId: "FEATURES", eventId: "event-season-000000000001" },
    authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
  };
  const result = await state.dispatcher.dispatch(featuresContext, {
    domain: "SEASON", action: "SYNC", seasonId: "11111111-1111-4111-8111-111111111111",
    applyDate: "2026-09-10", recruitNumber: 2, mode: "RIFT", participants: [],
  });
  assert.equal(state.seasonCalls.length, 2);
  assert.equal((state.seasonCalls[1]?.command as { action: string }).action, "STATUS");
  assert.equal((state.seasonCalls[0]?.command as { action: string }).action, "SYNC");
  assert.match(result.legacyReply, /내전수정 완료/u);
});

test("season SYNC exposes the latest copy reply to both ordinary and strict clients", async () => {
  const legacyReply = "[K-LOL.GG 내전 #2 명단 업데이트]\n추가: 1. 재현\n현재: 1/10";
  const state = harness({ v1StrictSeasonLegacyReply: legacyReply });
  const featuresContext: KakaoV4DispatchContext = {
    ...context,
    envelope: { ...context.envelope, profileId: "FEATURES", eventId: "event-season-normal-legacy-1" },
    authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
  };
  const command = {
    domain: "SEASON" as const,
    action: "SYNC" as const,
    seasonId: "11111111-1111-4111-8111-111111111111",
    applyDate: "2026-09-10",
    recruitNumber: 2,
    mode: "RIFT" as const,
    participants: [],
  };
  const normal = await state.dispatcher.dispatch(featuresContext, command);
  assert.ok(normal.legacyReply.endsWith(legacyReply));
  assert.match(normal.legacyReply, /명단 업데이트/u);

  const strict = await state.dispatcher.dispatch({
    ...featuresContext,
    envelope: {
      ...featuresContext.envelope,
      eventId: "event-season-strict-legacy-1",
      protocol: KAKAO_V1_STRICT_PROTOCOL,
      responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
    },
  }, command);
  assert.equal(strict.legacyReply, normal.legacyReply);
});

test("V1 strict season STATUS maps no active season to the canonical empty reply only", async () => {
  const state = harness({ seasonNotFound: true });
  const strictContext: KakaoV4DispatchContext = {
    ...context,
    envelope: {
      ...context.envelope,
      profileId: "FEATURES",
      eventId: "event-season-not-found-strict-1",
      protocol: KAKAO_V1_STRICT_PROTOCOL,
      responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
    },
    authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
  };
  const command = {
    domain: "SEASON" as const,
    action: "STATUS" as const,
    seasonId: "11111111-1111-4111-8111-111111111111",
    applyDate: "2026-09-10",
  };
  const strict = await state.dispatcher.dispatch(strictContext, command);
  assert.equal(strict.legacyReply, "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.");

  await assert.rejects(
    () => state.dispatcher.dispatch({
      ...strictContext,
      envelope: {
        profileId: "FEATURES",
        installationId: strictContext.envelope.installationId,
        senderId: strictContext.envelope.senderId,
        eventId: "event-season-not-found-normal-1",
        timestamp: strictContext.envelope.timestamp,
        nonce: "99999999999999999999999999999999",
        text: "내전현황",
      },
    }, command),
    (error: unknown) => error instanceof KakaoAssistantError && error.code === "NOT_FOUND",
  );
});

test("scrim create and snapshot each issue one recruiting mutation", async () => {
  const state = harness();
  await state.dispatcher.dispatch(context, {
    domain: "SCRIM",
    action: "CREATE",
    payload: {
      recruitDate: "2026-09-10",
      scrimNumber: 3,
      tournamentId: null,
      legacyTournamentNumber: 14,
      requesterTeamId: null,
      title: "별빛단 스크림",
      requesterTeamName: "별빛단",
      opponentTeamName: null,
      requesterLineup: null,
      opponentLineup: null,
      memo: null,
      seriesRuleText: "3판2선",
      scheduledAt: null,
      bestOf: 3,
    },
  });
  await state.dispatcher.dispatch({
    ...context,
    envelope: { ...context.envelope, eventId: "event-dispatcher-00000003", nonce: "44444444444444444444444444444444" },
    requestDigestHex: "cd".repeat(32),
    requestId: "request-v4-dispatcher-3",
  }, {
    domain: "SCRIM",
    action: "SYNC",
    target: { recruitDate: "2026-09-10", recruitNumber: 3 },
    payload: {
      recruitDate: "2026-09-10",
      scrimNumber: 3,
      tournamentId: null,
      legacyTournamentNumber: 14,
      requesterTeamId: null,
      opponentTeamId: null,
      title: "별빛단 스크림",
      requesterTeamName: "별빛단",
      opponentTeamName: "달빛단",
      requesterLineup: null,
      opponentLineup: null,
      memo: "최신 양식",
      seriesRuleText: "3판2선",
      scheduledAt: null,
      bestOf: 3,
    },
  });
  assert.deepEqual(state.handled.map((handled) => handled.type), ["CREATE_SCRIM", "SYNC_SCRIM"]);
  assert.equal(state.resolved.length, 1);
  assert.equal(state.statusCalls.length, 0);
});

test("season status and detail each return one authoritative assistant result", async () => {
  for (const command of [
    { domain: "SEASON", action: "STATUS", seasonId: "11111111-1111-4111-8111-111111111111", applyDate: "2026-09-10" },
    { domain: "SEASON", action: "DETAIL", seasonId: "11111111-1111-4111-8111-111111111111", applyDate: "2026-09-10", recruitNumber: 2 },
  ] as const) {
    const state = harness();
    const featuresContext: KakaoV4DispatchContext = {
      ...context,
      envelope: { ...context.envelope, profileId: "FEATURES", eventId: `event-season-${command.action.toLowerCase()}-0001` },
      authorization: { ...context.authorization, capabilityProfile: "FEATURES" },
    };
    const result = await state.dispatcher.dispatch(featuresContext, command);
    assert.equal(state.seasonCalls.length, 1);
    assert.equal(state.handled.length, 0);
    assert.equal(result.kind, "SEASON");
  }
});

test("scrim deprecated lifecycle commands use a static receipt without domain status queries", async () => {
  for (const action of ["DEPRECATED_JOIN", "DEPRECATED_CONFIRM", "DEPRECATED_CANCEL", "DEPRECATED_FINISH"] as const) {
    const state = harness();
    const result = await state.dispatcher.dispatch(context, { domain: "SCRIM", action });
    assert.equal(state.handled.length, 0);
    assert.equal(state.statusCalls.length, 0);
    assert.equal(state.staticCalls.length, 1);
    assert.match(result.legacyReply, /사용 안 함/u);
  }
});

test("dispatcher fails closed when command domain and static profile differ", async () => {
  const state = harness();
  await assert.rejects(
    () => state.dispatcher.dispatch(context, {
      domain: "SEASON", action: "STATUS", seasonId: "11111111-1111-4111-8111-111111111111", applyDate: "2026-09-10",
    }),
    (error: unknown) => error instanceof KakaoV4DispatcherError && error.code === "PROFILE_MISMATCH",
  );
  assert.equal(state.handled.length, 0);
  assert.equal(state.seasonCalls.length, 0);
});
