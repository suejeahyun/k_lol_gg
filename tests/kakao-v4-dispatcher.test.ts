import assert from "node:assert/strict";
import test from "node:test";

import {
  hashKakaoV4EventId,
  KAKAO_V4_EVENT_SCOPE,
  type RecruitingCommand,
  type RecruitingCommandResult,
} from "../src/modules/recruiting";
import { kakaoReadIdentity, type KakaoOpenChatStatusDto, type KakaoSeasonSnapshotDto } from "../src/modules/recruiting/kakao-assistant/domain";
import type { CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
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

function harness() {
  const handled: RecruitingCommand[] = [];
  const resolved: unknown[] = [];
  const statusCalls: unknown[] = [];
  const seasonCalls: Array<{ command: unknown }> = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      return mutationResult(command);
    },
    async resolveCompatTarget(input) {
      resolved.push(input);
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
      return { body: openStatus(), replayed: false };
    },
    async syncSeasonSnapshot(input) {
      seasonCalls.push({ command: input.command });
      const body: KakaoSeasonSnapshotDto = {
        kind: "SEASON_APPLICATION_SNAPSHOT",
        seasonId: input.command.seasonId ?? "11111111-1111-4111-8111-111111111111",
        applyDate: input.command.applyDate,
        recruitNo: input.command.recruitNo,
        entries: [], appliedCount: 0, reserveCount: 0, confirmedCount: 0,
        pendingCount: 0, cancelledCount: input.command.action === "SYNC" ? 2 : 0,
        createdCount: 0, updatedCount: 0,
      };
      return { body, replayed: false };
    },
  };
  return { dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant }), handled, resolved, statusCalls, seasonCalls };
}

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

test("party create command returns an unsaved template without an application mutation", async () => {
  const state = harness();
  const command: CanonicalKakaoV4Command = {
    domain: "PARTY",
    action: "CREATE",
    payload: {
      recruitDate: "2026-09-10", preferredRecruitNumber: null, partyType: "PARTY_NUMBER",
      title: "5인 파티", maximumMembers: 5, members: [], startTimeText: null, gameInfo: null,
      scheduledStartAt: null, protectedUntil: null,
    },
  };
  const result = await state.dispatcher.dispatch(context, command);
  assert.equal(state.handled.length, 0);
  assert.equal(result.aggregate, null);
  assert.match(result.legacyReply, /모집번호: #자동배정/u);
  assert.match(result.legacyReply, /전체 전송하면 파티가 저장/u);
  assert.doesNotMatch(result.legacyReply, /시작시간|게임정보/u);
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
  assert.match(result.legacyReply, /파티 #8 등록/u);
  assert.match(result.legacyReply, /모집번호: #8/u);
});

test("party status and detail use one server status receipt and return the latest aggregate", async () => {
  const statusState = harness();
  const status = await statusState.dispatcher.dispatch(context, { domain: "PARTY", action: "STATUS" });
  assert.equal(statusState.statusCalls.length, 1);
  assert.equal(statusState.handled.length, 0);
  assert.match(status.legacyReply, /현재 구인 현황/u);

  const detailState = harness();
  const detail = await detailState.dispatcher.dispatch(context, {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-10", recruitNumber: 7 },
  });
  assert.equal(detailState.statusCalls.length, 1);
  assert.match(detail.legacyReply, /시작시간: 21:00/u);
  assert.match(detail.legacyReply, /게임정보: 미입력/u);
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

test("scrim deprecated lifecycle commands never call the recruiting mutation port", async () => {
  for (const action of ["DEPRECATED_JOIN", "DEPRECATED_CONFIRM", "DEPRECATED_CANCEL", "DEPRECATED_FINISH"] as const) {
    const state = harness();
    const result = await state.dispatcher.dispatch(context, { domain: "SCRIM", action });
    assert.equal(state.handled.length, 0);
    assert.equal(state.statusCalls.length, 1);
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
