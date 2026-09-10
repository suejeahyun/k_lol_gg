import assert from "node:assert/strict";
import test from "node:test";

import {
  hashKakaoV4EventId,
  KAKAO_V4_EVENT_SCOPE,
  type RecruitingCommand,
  type RecruitingCommandResult,
} from "../src/modules/recruiting";
import { KakaoAssistantError, kakaoReadIdentity, type KakaoOpenChatStatusDto, type KakaoSeasonSnapshotDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import { KAKAO_V1_STRICT_PROTOCOL, KAKAO_V1_STRICT_RESPONSE_FORMAT } from "../src/modules/recruiting/kakao-v4/domain";
import {
  KakaoV4CommandDispatcher,
  KakaoV4DispatcherError,
  type KakaoV4AssistantPort,
  type KakaoV4DispatchContext,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";

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
      startTimeText: "21:00", gameInfo: "미입력", scheduledStartAt: null,
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

function mutationResult(command: RecruitingCommand): RecruitingCommandResult {
  const party = command.type.includes("PARTY");
  const data: RecruitingCommandResult["body"]["data"] = party ? {
    id: command.aggregateId, recruitNumber: command.type === "CREATE_PARTY" ? 8 : 7,
    type: "PARTY_NUMBER", status: command.type === "FINISH_PARTY" ? "FINISHED" : "IN_PROGRESS",
    title: "5인 파티", memberCount: command.type === "SYNC_PARTY" ? command.payload.members.length : 0,
    maximumMembers: 5, startTimeText: "09:26", gameInfo: "미입력", scheduledStartAt: null,
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
  emptyPartyStatus?: boolean;
  missingPlayer?: boolean;
  emptyRanking?: boolean;
  wholePercent?: boolean;
  v1StrictSeasonLegacyReply?: string;
  seasonNotFound?: boolean;
}> = {}) {
  const handled: RecruitingCommand[] = [];
  const resolved: unknown[] = [];
  const statusCalls: unknown[] = [];
  const staticCalls: unknown[] = [];
  const seasonCalls: Array<{ command: unknown }> = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      return mutationResult(command);
    },
    async resolveCompatTarget(input) {
      resolved.push(input);
      if (input.kind === "PARTY" && options.missingPartyTarget) return null;
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
      const body = openStatus();
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

test("party create command reserves an invisible draft number and returns the exact V1 template", async () => {
  const state = harness();
  const command: CanonicalKakaoV4Command = {
    domain: "PARTY",
    action: "CREATE",
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null,
      scheduledStartAt: null, protectedUntil: null,
    },
  };
  const result = await state.dispatcher.dispatch(context, command);
  assert.deepEqual(state.handled.map((handled) => handled.type), ["CREATE_PARTY"]);
  assert.equal(state.handled[0]?.type === "CREATE_PARTY" ? state.handled[0].payload.initialStatus : null, "DRAFT");
  assert.notEqual(result.aggregate, null);
  assert.equal(result.legacyReply, "[K-LOL.GG 구인구직 양식]\n같이 할사람~\n\n아래 양식의 모집번호는 유지해서 작성해주세요.\n\n📢 5인 파티 구인\n모집번호: #8\n\n1.\n2.\n3.\n4.\n5.\n예비 1.\n\n참여해주실 분은 태그해주세요.\n*상호배려와 존중 부탁드립니다.");
  assert.doesNotMatch(result.legacyReply, /시작시간|게임정보/u);
});

test("the exact generated V1 party form is accepted without metadata for slash and plain submissions", async () => {
  for (const prefix of ["", "/"]) {
    const state = harness();
    const generated = await state.dispatcher.dispatch(context, {
      domain: "PARTY",
      action: "CREATE",
      payload: {
        recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
        title: "5인 파티 구인", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null,
        scheduledStartAt: null, protectedUntil: null,
      },
    });
    const submittedText = `${prefix}${generated.legacyReply.replace("1.", "1. 재현")}`;
    const submittedEnvelope = { ...context.envelope, eventId: `event-dispatcher-form-${prefix ? "slash" : "plain"}`, text: submittedText };
    const classification = classifyKakaoV4Command({ profileId: "RECRUIT", text: submittedText });
    const command = canonicalizeKakaoV4Command(classification, submittedEnvelope);
    if (!command || command.domain !== "PARTY" || command.action !== "SYNC") assert.fail("generated form must canonicalize as a party snapshot");

    const saved = await state.dispatcher.dispatch({ ...context, envelope: submittedEnvelope }, command);
    assert.deepEqual(state.handled.map((handled) => handled.type), ["CREATE_PARTY", "SYNC_PARTY"]);
    if (state.handled[1]?.type !== "SYNC_PARTY") assert.fail("submitted form must activate the reserved party");
    assert.equal(state.handled[1].payload.startTimeText, undefined);
    assert.equal(state.handled[1].payload.gameInfo, undefined);
    assert.match(saved.legacyReply, /시작시간: 09:26 · 게임정보: 미입력/u);
  }
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
  assert.equal(result.legacyReply, "[파티 #8 반영]\n1/5 · 예비 0명\n시작시간: 09:26 · 게임정보: 미입력\n마감: 8ㅉ");
});

test("explicit missing party number never falls back to creating a new party", async () => {
  const state = harness({ missingPartyTarget: true });
  await assert.rejects(state.dispatcher.dispatch(context, {
    domain: "PARTY", action: "SYNC", target: { recruitDate: "2026-09-10", recruitNumber: 999 },
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: 999, partyType: "PARTY_NUMBER",
      title: "5인 파티 구인", maximumMembers: 5,
      members: [{ slotNo: 1, name: "재현", position: null, substitute: false }],
      scheduledStartAt: null, protectedUntil: null,
    },
  }), (error: unknown) => error instanceof KakaoV4DispatcherError && error.code === "NOT_FOUND");
  assert.equal(state.handled.length, 0);
});

test("party status and detail use one server status receipt and return the latest aggregate", async () => {
  const statusState = harness();
  const status = await statusState.dispatcher.dispatch(context, { domain: "PARTY", action: "STATUS" });
  assert.equal(statusState.statusCalls.length, 1);
  assert.equal((statusState.statusCalls[0] as { projection?: string }).projection, "PARTY");
  assert.equal(statusState.handled.length, 0);
  assert.match(status.legacyReply, /K-LOL\.GG 구인구직 현황/u);

  const detailState = harness();
  const detail = await detailState.dispatcher.dispatch(context, {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
  });
  assert.equal(detailState.statusCalls.length, 1);
  assert.equal((detailState.statusCalls[0] as { projection?: string }).projection, "PARTY");
  assert.match(detail.legacyReply, /시작시간: 21:00/u);
  assert.match(detail.legacyReply, /게임정보: 미입력/u);

  const missingDetailState = harness({ emptyPartyStatus: true });
  const missingDetail = await missingDetailState.dispatcher.dispatch(context, {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 77 },
  });
  assert.equal(missingDetail.legacyReply, "[K-LOL.GG 요청 실패]\n진행 중인 파티 #77을 찾지 못했습니다.");
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
  assert.deepEqual(state.handled.map((command) => command.type), ["SYNC_PARTY", "FINISH_PARTY"]);
  assert.equal(JSON.stringify(state.handled).includes("role"), false);
  assert.equal(JSON.stringify(state.handled).includes("owner"), false);
});

test("scrim status requests only the scrim projection", async () => {
  const state = harness();
  const result = await state.dispatcher.dispatch(context, { domain: "SCRIM", action: "STATUS" });
  assert.equal(state.statusCalls.length, 1);
  assert.equal((state.statusCalls[0] as { projection?: string }).projection, "SCRIM");
  assert.match(result.legacyReply, /K-LOL\.GG 스크림 현황/u);
});

test("season authoritative zero-person snapshot stays one transactional assistant call", async () => {
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
  assert.equal(state.seasonCalls.length, 1);
  assert.equal((state.seasonCalls[0]?.command as { action: string }).action, "SYNC");
  assert.match(result.legacyReply, /취소 2/u);
});

test("season SYNC exposes the legacy change reply only to explicit V1 strict clients", async () => {
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
  assert.match(normal.legacyReply, /^\[K-LOL\.GG 내전 신청 반영\]/u);
  assert.doesNotMatch(normal.legacyReply, /명단 업데이트/u);

  const strict = await state.dispatcher.dispatch({
    ...featuresContext,
    envelope: {
      ...featuresContext.envelope,
      eventId: "event-season-strict-legacy-1",
      protocol: KAKAO_V1_STRICT_PROTOCOL,
      responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
    },
  }, command);
  assert.equal(strict.legacyReply, legacyReply);
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
