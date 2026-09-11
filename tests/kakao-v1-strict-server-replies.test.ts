import assert from "node:assert/strict";
import test from "node:test";

import type { RecruitingCommand, RecruitingCommandResult } from "../src/modules/recruiting";
import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { encodeV1StrictScrimTimeText } from "../src/modules/recruiting/domain/v1-strict-scrim-time";
import {
  KAKAO_V1_STRICT_PROTOCOL,
  KAKAO_V1_STRICT_RESPONSE_FORMAT,
} from "../src/modules/recruiting/kakao-v4/domain";
import {
  KakaoV4CommandDispatcher,
  KakaoV4DispatcherError,
  type KakaoV4AssistantPort,
  type KakaoV4DispatchContext,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";

type Party = KakaoOpenChatStatusDto["parties"][number];

function party(input: Partial<Party> & Pick<Party, "recruitNumber" | "maximumMembers" | "members">): Party {
  return {
    id: `party-${input.recruitNumber}`,
    revision: 2,
    recruitDate: "2026-09-11",
    resetSequence: 0,
    type: "PARTY_NUMBER",
    title: `${input.maximumMembers}인 파티 구인`,
    status: "IN_PROGRESS",
    memberCount: input.members.filter((member) => !member.substitute).length,
    reserveCount: input.members.filter((member) => member.substitute).length,
    startTimeText: "21:00",
    gameInfo: "미입력",
    scheduledStartAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...input,
  };
}

function statusBody(
  parties: readonly Party[],
  scrims: KakaoOpenChatStatusDto["scrims"] = [],
): KakaoOpenChatStatusDto {
  return {
    kind: "OPENCHAT_STATUS",
    nextPartyRecruitNumber: 20,
    nextPartyResetSequence: 0,
    nextScrimNumber: null,
    partiesTruncated: false,
    scrimsTruncated: false,
    parties,
    scrims,
  };
}

function context(strict: boolean, text: string, event = 1): KakaoV4DispatchContext {
  const envelopeBase = {
    profileId: "RECRUIT" as const,
    installationId: "install-11111111111111111111111111111111",
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-v1-strict-server-${event}`,
    timestamp: 1789090000,
    nonce: String(event).padStart(32, "0"),
    text,
  };
  return {
    envelope: strict
      ? {
        ...envelopeBase,
        protocol: KAKAO_V1_STRICT_PROTOCOL,
        responseFormat: KAKAO_V1_STRICT_RESPONSE_FORMAT,
      }
      : envelopeBase,
    keyId: "current",
    requestDigestHex: String(event).padStart(64, "0"),
    requestId: `request-v1-strict-${event}`,
    authorization: {
      roomId: "00000000-0000-4000-8000-000000000001",
      roomStatus: "ACTIVE",
      capabilityProfile: "RECRUIT",
      installationId: "00000000-0000-4000-8000-000000000002",
    },
  };
}

function mutationResult(command: RecruitingCommand): RecruitingCommandResult {
  return {
    body: {
      aggregateKind: "PARTY",
      aggregateId: command.aggregateId,
      revision: command.type === "CREATE_PARTY" ? 0 : 3,
      status: command.type === "FINISH_PARTY" ? "FINISHED" : "IN_PROGRESS",
      commandType: command.type,
      data: {
        id: command.aggregateId,
        recruitNumber: command.type === "CREATE_PARTY" ? 8 : 12,
        type: "PARTY_NUMBER",
        status: command.type === "FINISH_PARTY" ? "FINISHED" : "IN_PROGRESS",
        title: "5인 파티 구인",
        memberCount: command.type === "SYNC_PARTY" ? command.payload.members.filter((member) => !member.substitute).length : 0,
        reserveCount: command.type === "SYNC_PARTY" ? command.payload.members.filter((member) => member.substitute).length : 0,
        maximumMembers: 5,
        startTimeText: "09:26",
        gameInfo: "미입력",
        scheduledStartAt: null,
      },
    },
    revision: command.type === "CREATE_PARTY" ? 0 : 3,
    replayed: false,
  };
}

function harness(parties: readonly Party[] = [], scrims: KakaoOpenChatStatusDto["scrims"] = []) {
  const handled: RecruitingCommand[] = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      return mutationResult(command);
    },
    async resolveCompatTarget() {
      return { id: "party-12", revision: 2 };
    },
    async resolveScrimUpsert() {
      return null;
    },
  };
  const assistant: KakaoV4AssistantPort = {
    async getOpenChatStatus() {
      return { body: statusBody(parties, scrims), replayed: false };
    },
    async syncSeasonSnapshot() {
      throw new Error("not used");
    },
  };
  return { dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant }), handled };
}

test("strict V1 create and sync use canonical server copy while ordinary V4 remains unchanged", async () => {
  const createCommand = {
    domain: "PARTY" as const,
    action: "CREATE" as const,
    payload: {
      recruitDate: "2026-09-11",
      preferredRecruitNumber: null,
      partyType: "PARTY_NUMBER" as const,
      title: "5인 파티 구인",
      maximumMembers: 5,
      members: [],
      startTimeText: null,
      gameInfo: null,
      scheduledStartAt: null,
      protectedUntil: null,
    },
  };
  const strictState = harness();
  const strictCreate = await strictState.dispatcher.dispatch(context(true, "5인파티"), createCommand);
  assert.equal(strictCreate.legacyReply, [
    "[K-LOL.GG 구인구직 양식]", "같이 할사람~", "",
    "아래 양식의 모집번호는 유지해서 작성해주세요.", "", "📢 5인 파티 구인",
    "모집번호: #8", "", "》시작시간 :", "》게임정보 :", "",
    "1.", "2.", "3.", "4.", "5.", "예비 1.", "",
    "참여해주실 분은 태그해주세요.", "*상호배려와 존중 부탁드립니다.",
  ].join("\n"));

  const normalState = harness();
  const normalCreate = await normalState.dispatcher.dispatch(context(false, "5인파티", 2), createCommand);
  assert.doesNotMatch(normalCreate.legacyReply, /》시작시간 :|》게임정보 :/u);

  const syncCommand = {
    domain: "PARTY" as const,
    action: "SYNC" as const,
    target: { recruitDate: "2026-09-11", recruitNumber: 12 },
    payload: {
      ...createCommand.payload,
      preferredRecruitNumber: 12,
      members: [
        { slotNo: 1, name: "재현", position: null, substitute: false },
        { slotNo: 1, name: "민서", position: null, substitute: true },
      ],
      startTimeText: undefined,
      gameInfo: undefined,
    },
  };
  const strictSync = await strictState.dispatcher.dispatch(context(true, "전체 양식", 3), syncCommand);
  assert.equal(strictSync.legacyReply, "[파티 #12 반영]\n1/5 · 예비 1명\n마감: 12ㅉ");
  const normalSync = await normalState.dispatcher.dispatch(context(false, "전체 양식", 4), syncCommand);
  assert.match(normalSync.legacyReply, /시작시간: 09:26 · 게임정보: 미입력/u);
});

test("strict V1 detail is the full copyable form with edit and finish guidance", async () => {
  const target = party({
    recruitNumber: 12,
    maximumMembers: 5,
    members: [
      { name: "재현", position: null, slotNo: 1, substitute: false },
      { name: "민서", position: null, slotNo: 3, substitute: false },
      { name: "기용", position: null, slotNo: 1, substitute: true },
    ],
    startTimeText: "9시 30분",
    gameInfo: "자랭 수준 예상 골드",
  });
  const state = harness([target]);
  const result = await state.dispatcher.dispatch(context(true, "상세 12"), {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-11", recruitNumber: 12 },
  });
  assert.equal(result.legacyReply, [
    "[K-LOL.GG 구인상세 #12]", "", "#12 · 5인 파티 · 2/5",
    "시작시간: 9:30", "》게임정보 : 자랭 예상 골드", "예비: 1명", "",
    "1. 재현", "2.", "3. 민서", "4.", "5.", "예비 1. 기용", "예비 2.", "",
    "수정: 이 메시지를 복사해 이름을 고친 뒤 전체 전송", "마감: 12ㅉ",
  ].join("\n"));
});

test("strict V1 status renders recruiting, waiting, playing, and large-party groups", async () => {
  const one = (name: string, slotNo: number) => ({ name, position: null, slotNo, substitute: false } as const);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const parties = [
    party({ recruitNumber: 1, maximumMembers: 5, members: [one("재현", 1)], title: "5인 파티 구인", scheduledStartAt: future }),
    party({ recruitNumber: 2, maximumMembers: 2, members: [one("민서", 1), one("기용", 2)], title: "2인 파티 구인", scheduledStartAt: future }),
    party({ recruitNumber: 3, maximumMembers: 5, members: [one("주현", 1)], title: "일반 하실분!", type: "NORMAL_GAME", startTimeText: "모바", scheduledStartAt: null }),
    party({ recruitNumber: 4, maximumMembers: 8, members: [one("소영", 1)], title: "기타게임 하실분!", type: "OTHER_GAME", scheduledStartAt: future }),
  ];
  const result = await harness(parties).dispatcher.dispatch(context(true, "구인현황"), { domain: "PARTY", action: "STATUS" });
  assert.match(result.legacyReply, /\[구인중\][\s\S]*#1 · 5인 파티/u);
  assert.match(result.legacyReply, /\[대기중\][\s\S]*#2 · 2인 파티/u);
  assert.match(result.legacyReply, /\[진행중\][\s\S]*#3 · 일반/u);
  assert.match(result.legacyReply, /\[대형파티\][\s\S]*#4 · 기타게임/u);
  assert.ok(result.legacyReply.indexOf("[구인중]") < result.legacyReply.indexOf("[대기중]"));
  assert.ok(result.legacyReply.indexOf("[대기중]") < result.legacyReply.indexOf("[진행중]"));
  assert.ok(result.legacyReply.indexOf("[진행중]") < result.legacyReply.indexOf("[대형파티]"));
});

test("strict V1 missing detail uses the canonical not-found reply", async () => {
  const result = await harness().dispatcher.dispatch(context(true, "상세 77"), {
    domain: "PARTY", action: "DETAIL", target: { recruitDate: "2026-09-11", recruitNumber: 77 },
  });
  assert.equal(result.legacyReply, "[K-LOL.GG 구인상세]\n\n모집번호 #77 구인글을 찾지 못했습니다.");
});

test("strict V1 missing scrim detail uses the canonical success reply while ordinary V4 stays not-found", async () => {
  const target = { recruitDate: "2026-09-11", recruitNumber: 77 } as const;
  const strict = await harness().dispatcher.dispatch(context(true, "스크림상세 77", 90), {
    domain: "SCRIM", action: "DETAIL", target,
  });
  assert.equal(strict.legacyReply, "[K-LOL.GG 멸망전 스크림 상세]\n\n스크림 #77을 찾지 못했습니다.");

  await assert.rejects(
    () => harness().dispatcher.dispatch(context(false, "스크림상세 77", 91), {
      domain: "SCRIM", action: "DETAIL", target,
    }),
    (error: unknown) => error instanceof KakaoV4DispatcherError && error.code === "NOT_FOUND",
  );
});

test("strict V1 scrim status and detail preserve a free-text legacy start time", async () => {
  const scrim: KakaoOpenChatStatusDto["scrims"][number] = {
    id: "scrim-7", revision: 1, recruitDate: "2026-09-11", scrimNumber: 7,
    tournamentId: null, legacyTournamentNumber: 4, requesterTeamId: null, opponentTeamId: null,
    requesterTeamName: "하늘단", opponentTeamName: null, title: "하늘단 스크림 구인",
    requesterLineup: null, opponentLineup: null, memo: encodeV1StrictScrimTimeText("협의"),
    seriesRuleText: "3판2선", status: "RECRUITING", bestOf: 3, scheduledAt: null,
  };
  const strict = harness([], [scrim]);
  const status = await strict.dispatcher.dispatch(context(true, "스크림현황", 92), { domain: "SCRIM", action: "STATUS" });
  assert.match(status.legacyReply, /하늘단 vs 상대구함 \/ 협의 \/ 3판2선 \/ 모집중/u);
  const detail = await strict.dispatcher.dispatch(context(true, "스크림상세 7", 93), {
    domain: "SCRIM", action: "DETAIL", target: { recruitDate: "2026-09-11", recruitNumber: 7 },
  });
  assert.match(detail.legacyReply, /일시: 협의/u);

  const ordinary = await harness([], [scrim]).dispatcher.dispatch(context(false, "스크림현황", 94), { domain: "SCRIM", action: "STATUS" });
  assert.match(ordinary.legacyReply, /하늘단 vs 상대구함 \/ 미정 \/ 3판2선 \/ 모집중/u);
});
