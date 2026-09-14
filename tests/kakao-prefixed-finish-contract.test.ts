import assert from "node:assert/strict";
import test from "node:test";

import type { RecruitingCommand, RecruitingCommandResult } from "../src/modules/recruiting";
import { KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import { canonicalizeKakaoV4Command, type CanonicalKakaoV4Command } from "../src/modules/recruiting/kakao-v4/canonical-command";
import { classifyKakaoV4Command } from "../src/modules/recruiting/kakao-v4/classifier";
import {
  KakaoV4CommandDispatcher,
  type KakaoV4AssistantPort,
  type KakaoV4DispatchContext,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";
import type { KakaoSeasonSnapshotDto } from "../src/modules/recruiting/kakao-assistant/domain";

const OPERATING_TIMESTAMP = Date.parse("2026-09-14T12:00:00+09:00") / 1_000;
const OPERATING_DATE = "2026-09-14";
const INSTALLATION_ID = "install-11111111111111111111111111111111";
const ROOM_ID = "00000000-0000-4000-8000-000000000001";

function envelope(profileId: KakaoV4ProfileId, text: string, eventId: string, senderId = "sender-owner-22222222222222222222222222222222"): KakaoV4CommandEnvelope {
  return Object.freeze({
    profileId,
    installationId: INSTALLATION_ID,
    senderId,
    eventId,
    timestamp: OPERATING_TIMESTAMP,
    nonce: "33333333333333333333333333333333",
    text,
  });
}

function dispatchContext(profileId: KakaoV4ProfileId, text: string, eventId: string): KakaoV4DispatchContext {
  return Object.freeze({
    envelope: envelope(profileId, text, eventId, "sender-other-44444444444444444444444444444444"),
    keyId: `${profileId.toLowerCase()}-current`,
    requestDigestHex: "ab".repeat(32),
    requestId: `${eventId}-request`,
    authorization: Object.freeze({
      roomId: ROOM_ID,
      roomStatus: "ACTIVE" as const,
      capabilityProfile: profileId,
      installationId: "00000000-0000-4000-8000-000000000002",
    }),
  });
}

type FutureFinishCommand =
  | Readonly<{ domain: "SEASON"; action: "FINISH"; seasonId: null; applyDate: string; recruitNumber: number }>
  | Readonly<{ domain: "SCRIM"; action: "FINISH"; target: Readonly<{ recruitDate: string; recruitNumber: number }> }>;

function asCanonical(command: FutureFinishCommand) {
  return command as unknown as CanonicalKakaoV4Command;
}

test("내전/스크림 번호ㅉ 명령은 slash 유무와 관계없이 현재 운영일 FINISH로 canonicalize된다", () => {
  for (const [profileId, text, expectedCommand, expectedCanonical] of [
    ["FEATURES", "내전 1ㅉ", "INHOUSE_FINISH", { domain: "SEASON", action: "FINISH", seasonId: null, applyDate: OPERATING_DATE, recruitNumber: 1 }],
    ["FEATURES", "/내전 1ㅉ", "INHOUSE_FINISH", { domain: "SEASON", action: "FINISH", seasonId: null, applyDate: OPERATING_DATE, recruitNumber: 1 }],
    ["RECRUIT", "스크림 1ㅉ", "SCRIM_FINISH", { domain: "SCRIM", action: "FINISH", target: { recruitDate: OPERATING_DATE, recruitNumber: 1 } }],
    ["RECRUIT", "/스크림 1ㅉ", "SCRIM_FINISH", { domain: "SCRIM", action: "FINISH", target: { recruitDate: OPERATING_DATE, recruitNumber: 1 } }],
  ] as const) {
    const input = envelope(profileId, text, `event-prefixed-finish-${profileId.toLowerCase()}-${text.startsWith("/") ? "slash" : "plain"}`);
    const classified = classifyKakaoV4Command(input);
    assert.equal(classified.kind, "COMMAND", text);
    if (classified.kind !== "COMMAND") continue;
    assert.equal(classified.command, expectedCommand, text);
    assert.deepEqual(canonicalizeKakaoV4Command(classified, input), expectedCanonical, text);
  }
});

function latestOpenStatus(scrimClosed: boolean) {
  return {
    kind: "OPENCHAT_STATUS" as const,
    nextPartyRecruitNumber: null,
    nextPartyResetSequence: 0,
    nextScrimNumber: 2,
    partiesTruncated: false,
    scrimsTruncated: false,
    parties: [],
    scrims: scrimClosed ? [] : [{
      id: "scrim-1",
      revision: 2,
      recruitDate: OPERATING_DATE,
      scrimNumber: 1,
      tournamentId: null,
      legacyTournamentNumber: null,
      requesterTeamId: null,
      opponentTeamId: null,
      requesterTeamName: "우리팀",
      opponentTeamName: null,
      title: "우리팀 스크림",
      requesterLineup: null,
      opponentLineup: null,
      memo: null,
      seriesRuleText: "3판2선",
      status: "RECRUITING" as const,
      bestOf: 3,
      scheduledAt: null,
    }],
  };
}

function finishHarness(options: Readonly<{ replayed?: boolean }> = {}) {
  const handled: RecruitingCommand[] = [];
  const resolved: unknown[] = [];
  const statusCalls: unknown[] = [];
  const seasonCalls: unknown[] = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      return {
        body: {
          aggregateKind: "SCRIM",
          aggregateId: command.aggregateId,
          revision: 3,
          status: "COMPLETED",
          commandType: command.type,
          data: {
            id: command.aggregateId,
            recruitDate: OPERATING_DATE,
            scrimNumber: 1,
            status: "COMPLETED",
            requesterTeamName: "우리팀",
            bestOf: 3,
          },
        },
        revision: 3,
        replayed: options.replayed ?? false,
      } as RecruitingCommandResult;
    },
    async resolveCompatTarget(input) {
      resolved.push(input);
      return { id: "scrim-1", revision: 2 };
    },
    async resolveScrimUpsert() {
      return null;
    },
  };
  const assistant: KakaoV4AssistantPort = {
    async getOpenChatStatus(input) {
      statusCalls.push(input);
      return { body: latestOpenStatus(handled.some((command) => command.type === "FINISH_SCRIM")), replayed: false };
    },
    async syncSeasonSnapshot(input) {
      seasonCalls.push(input);
      const action = (input.command as unknown as { action: string }).action;
      const body: KakaoSeasonSnapshotDto = {
        kind: "SEASON_APPLICATION_SNAPSHOT",
        seasonId: "11111111-1111-4111-8111-111111111111",
        applyDate: OPERATING_DATE,
        recruitNo: action === "STATUS" ? null : 1,
        entries: [],
        appliedCount: 0,
        reserveCount: 0,
        confirmedCount: 0,
        pendingCount: 0,
        cancelledCount: action === "FINISH" ? 1 : 0,
        createdCount: 0,
        updatedCount: 0,
        ...((action === "STATUS" || action === "FINISH") ? { legacyReply: "[K-LOL.GG 내전현황]\n현재 진행 중인 내전이 없습니다." } : {}),
      };
      return { body, replayed: action === "FINISH" && Boolean(options.replayed) };
    },
  };
  return {
    dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant }),
    handled,
    resolved,
    statusCalls,
    seasonCalls,
  };
}

test("다른 sender도 같은 installation/room의 내전 번호를 마감하고 최신 내전현황을 받는다", async () => {
  const state = finishHarness({ replayed: true });
  const result = await state.dispatcher.dispatch(
    dispatchContext("FEATURES", "내전 1ㅉ", "event-inhouse-prefixed-finish-dispatch"),
    asCanonical({ domain: "SEASON", action: "FINISH", seasonId: null, applyDate: OPERATING_DATE, recruitNumber: 1 }),
  );

  assert.deepEqual(
    state.seasonCalls.map((call) => (call as { command: unknown }).command),
    [{ action: "FINISH", seasonId: null, applyDate: OPERATING_DATE, recruitNo: 1, participants: [] }],
  );
  const finishCall = state.seasonCalls[0] as { actorPrincipalId: string; intent: { senderId: string } };
  assert.equal(finishCall.actorPrincipalId, `bot:kakao:v4:${INSTALLATION_ID}`);
  assert.equal(finishCall.intent.senderId, "sender-other-44444444444444444444444444444444");
  assert.equal(result.replayed, true);
  assert.match(result.legacyReply, /내전 #1[\s\S]*마감/u);
  assert.match(result.legacyReply, /내전현황/u);
});

test("다른 sender도 같은 installation/room의 스크림 번호를 마감하고 최신 스크림현황을 받는다", async () => {
  const state = finishHarness({ replayed: true });
  const result = await state.dispatcher.dispatch(
    dispatchContext("RECRUIT", "스크림 1ㅉ", "event-scrim-prefixed-finish-dispatch"),
    asCanonical({ domain: "SCRIM", action: "FINISH", target: { recruitDate: OPERATING_DATE, recruitNumber: 1 } }),
  );

  assert.deepEqual(state.resolved, [{
    kind: "SCRIM",
    sourceRoomId: ROOM_ID,
    recruitDate: OPERATING_DATE,
    recruitNumber: 1,
    allowedScrimStatuses: ["RECRUITING", "MATCHED", "CONFIRMED"],
  }]);
  assert.equal(Object.hasOwn(state.resolved[0] as object, "sourceSenderId"), false);
  assert.equal(state.handled.length, 1);
  assert.equal(state.handled[0]?.type, "FINISH_SCRIM");
  assert.equal(state.handled[0]?.metadata.actor.principalId, `bot:kakao:v4:${INSTALLATION_ID}`);
  assert.equal(state.handled[0]?.metadata.actor.kind === "BOT" ? state.handled[0].metadata.actor.authorizationIntent.senderId : null,
    "sender-other-44444444444444444444444444444444");
  assert.equal(result.replayed, true);
  assert.deepEqual(statusProjection(state.statusCalls[0]), { projection: "SCRIM", afterMutation: true });
  assert.match(result.legacyReply, /스크림 #1[\s\S]*마감/u);
  assert.match(result.legacyReply, /스크림 현황/u);
});

function statusProjection(value: unknown) {
  const input = value as { projection?: unknown; afterMutation?: unknown };
  return { projection: input?.projection, afterMutation: input?.afterMutation };
}

test("동일 installation event replay는 내전/스크림 마감을 한 번만 실행하고 같은 응답을 반환한다", async () => {
  for (const [profileId, text, eventId] of [
    ["FEATURES", "내전 1ㅉ", "event-inhouse-prefixed-finish-replay"],
    ["RECRUIT", "스크림 1ㅉ", "event-scrim-prefixed-finish-replay"],
  ] as const) {
    const state = finishHarness();
    const service = new KakaoV4CommandService({
      async authorizeProfile() {
        return dispatchContext(profileId, text, eventId).authorization;
      },
    }, state.dispatcher);
    const input = envelope(profileId, text, eventId);
    const first = await service.execute(input, `${profileId.toLowerCase()}-current`);
    const replay = await service.execute(input, `${profileId.toLowerCase()}-current`);

    assert.equal(first.replayed, false, text);
    assert.equal(replay.replayed, true, text);
    assert.equal(replay.reply, first.reply, text);
    if (profileId === "FEATURES") {
      assert.equal(state.seasonCalls.filter((call) => (call as { command: { action: string } }).command.action === "FINISH").length, 1, text);
    } else {
      assert.equal(state.handled.filter((command) => command.type === "FINISH_SCRIM").length, 1, text);
    }
  }
});
