import assert from "node:assert/strict";
import test from "node:test";

import type { RecruitingCommand, RecruitingCommandResult } from "../src/modules/recruiting";
import type { KakaoOpenChatStatusDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { partyCopyReference } from "../src/modules/recruiting/application/party-copy-reference";
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
    organizerText: null,
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
  let currentParties = parties;
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      const result = mutationResult(command);
      if (command.type === "SYNC_PARTY") {
        currentParties = [party({
          id: command.aggregateId, revision: result.revision, recruitNumber: 12, maximumMembers: 5,
          members: command.payload.members, startTimeText: "09:26", scheduledStartAt: null,
        })];
      }
      return result;
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
      return { body: statusBody(currentParties, scrims), replayed: false };
    },
    async syncSeasonSnapshot() {
      throw new Error("not used");
    },
  };
  return { dispatcher: new KakaoV4CommandDispatcher({ recruiting, assistant }), handled };
}

test("strict V1 and ordinary V4 reserve full copyable drafts and return one current form after saving", async () => {
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
  const created = strictState.handled[0]!;
  assert.equal(strictCreate.legacyReply, [
    "[K-LOL.GG 구인상세 #8]", "", "#8 · 5인 파티 · 0/5", "운영일: 2026-09-11",
    `》저장기준 : ${partyCopyReference({ id: created.aggregateId, recruitDate: "2026-09-11", revision: 0 })}`,
    "》시작시간 :", "》게임정보 :", "》주최자 :", "",
    "1.", "2.", "3.", "4.", "5.", "예비 1.", "",
    "복사 안내: 전체 복사 → 빈칸에 이름 입력 → 전체 전송으로 저장 (저장기준 유지)",
  ].join("\n"));

  const normalState = harness();
  const normalCreate = await normalState.dispatcher.dispatch(context(false, "5인파티", 2), createCommand);
  assert.match(normalCreate.legacyReply, /》시작시간 :[\s\S]*》게임정보 :[\s\S]*》주최자 :/u);
  assert.match(normalCreate.legacyReply, /^1\.\n2\.\n3\.\n4\.\n5\.\n예비 1\./mu);
  assert.match(normalCreate.legacyReply, /저장기준 : 2026-09-11 \/ P[a-f0-9]{32}-R0/u);

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
  const normalSync = await normalState.dispatcher.dispatch(context(false, "전체 양식", 4), syncCommand);
  for (const result of [strictSync, normalSync]) {
    assert.match(result.legacyReply, /^신청 내용을 저장했어요\.\n\n\[K-LOL\.GG 구인상세 #12\]/u);
    assert.match(result.legacyReply, /^#12 · 5인 파티 · 1\/5$/mu);
    assert.match(result.legacyReply, /^》시작시간 : 09:26$/mu);
    assert.match(result.legacyReply, /^1\. 재현\n2\.\n3\.\n4\.\n5\.\n예비 1\. 민서\n예비 2\./mu);
    assert.match(result.legacyReply, /저장기준 : 2026-09-11 \/ P[a-f0-9]{32}-R3/u);
    assert.doesNotMatch(result.legacyReply, /파티 #12 반영|구인구직 현황/u);
    assert.equal(result.legacyReply.match(/\[K-LOL\.GG 구인상세/gu)?.length, 1);
  }
});

test("strict V1 detail is the full copyable form without repeated command guidance", async () => {
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
    "운영일: 2026-09-11", `》저장기준 : ${partyCopyReference(target)}`,
    "》시작시간 : 9시 30분", "》게임정보 : 자랭 수준 예상 골드", "》주최자 : ", "예비: 1명", "",
    "1. 재현", "2.", "3. 민서", "4.", "5.", "예비 1. 기용", "예비 2.",
    "", "복사 안내: 전체 복사 → 빈칸에 이름 입력 → 전체 전송으로 저장 (저장기준 유지)",
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
