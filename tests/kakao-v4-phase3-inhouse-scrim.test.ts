import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { RecruitingCommand, RecruitingCommandResult } from "../src/modules/recruiting";
import type { KakaoOpenChatStatusDto, KakaoSeasonSnapshotDto } from "../src/modules/recruiting/kakao-assistant/domain";
import { KakaoV4CommandError, KakaoV4CommandService } from "../src/modules/recruiting/kakao-v4/application";
import {
  KakaoV4CommandDispatcher,
  type KakaoV4AssistantPort,
  type KakaoV4RecruitingPort,
} from "../src/modules/recruiting/kakao-v4/dispatcher";
import type { KakaoV4CommandEnvelope, KakaoV4ProfileId } from "../src/modules/recruiting/kakao-v4/domain";

const contract = JSON.parse(await readFile(new URL("./fixtures/kakao-v4-v1-compatibility-contract.json", import.meta.url), "utf8")) as {
  inhouse: { modeSelectorReply: string; riftTemplate: string; aramTemplate: string; multiRoundStatusReply: string };
  scrim: { initialTemplate: string; emptyStatusReply: string; statusReply: string; detailReply: string; newFormReply: string };
};

const timestamp = Date.parse("2026-09-09T12:00:00.000Z") / 1_000;
const roomId = "00000000-0000-4000-8000-000000000001";
const installationId = "install-11111111111111111111111111111111";

const scrimFixture: KakaoOpenChatStatusDto["scrims"][number] = {
  id: "scrim-7",
  revision: 3,
  recruitDate: "2026-09-09",
  scrimNumber: 7,
  tournamentId: "11111111-1111-4111-8111-111111111111",
  legacyTournamentNumber: 4,
  requesterTeamId: null,
  opponentTeamId: null,
  title: "하늘단 스크림 구인",
  requesterTeamName: "하늘단",
  opponentTeamName: "꽃잎단",
  requesterLineup: { top: "하늘탑", jungle: "하늘정글", mid: "하늘미드", adc: "하늘원딜", support: "하늘서폿" },
  opponentLineup: { top: "꽃잎탑", jungle: "꽃잎정글", mid: "꽃잎미드", adc: "꽃잎원딜", support: "꽃잎서폿" },
  memo: null,
  seriesRuleText: "3판2선",
  status: "MATCHED",
  bestOf: 3,
  scheduledAt: "2026-09-09T12:00:00.000Z",
};

function envelope(profileId: KakaoV4ProfileId, text: string, sequence: number): KakaoV4CommandEnvelope {
  return Object.freeze({
    profileId,
    installationId,
    senderId: "sender-user-22222222222222222222222222222222",
    eventId: `event-phase3-${String(sequence).padStart(8, "0")}`,
    timestamp,
    nonce: String(sequence).padStart(32, "0"),
    text,
  });
}

function openStatus(scrims: KakaoOpenChatStatusDto["scrims"] = [], nextScrimNumber: number | null = 7): KakaoOpenChatStatusDto {
  return {
    kind: "OPENCHAT_STATUS",
    nextPartyRecruitNumber: 1,
    nextPartyResetSequence: 0,
    nextScrimNumber,
    partiesTruncated: false,
    scrimsTruncated: false,
    parties: [],
    scrims,
  };
}

function harness(statusBody: KakaoOpenChatStatusDto = openStatus()) {
  const handled: RecruitingCommand[] = [];
  const statusCalls: unknown[] = [];
  const seasonCalls: Array<Parameters<KakaoV4AssistantPort["syncSeasonSnapshot"]>[0]> = [];
  const recruiting: KakaoV4RecruitingPort = {
    async handle(command) {
      handled.push(command);
      if (command.type !== "CREATE_SCRIM" && command.type !== "SYNC_SCRIM") throw new Error("unexpected recruiting command");
      const payload = command.type === "CREATE_SCRIM" && command.payload.scrimNumber === null
        ? { ...command.payload, scrimNumber: statusBody.nextScrimNumber }
        : command.payload;
      const status = payload.opponentTeamName || payload.opponentLineup ? "MATCHED" : "RECRUITING";
      const data = { id: command.aggregateId, ...payload, status };
      return {
        body: {
          aggregateKind: "SCRIM",
          aggregateId: command.aggregateId,
          revision: command.type === "CREATE_SCRIM" ? 0 : 4,
          status,
          commandType: command.type,
          data,
        },
        revision: command.type === "CREATE_SCRIM" ? 0 : 4,
        replayed: false,
      } satisfies RecruitingCommandResult;
    },
    async resolveCompatTarget() {
      return null;
    },
    async resolveScrimUpsert(input) {
      const scrimNumber = input.requestedScrimNumber ?? statusBody.nextScrimNumber;
      if (!scrimNumber) return null;
      return {
        scrimNumber,
        existing: statusBody.scrims.find((scrim) => scrim.recruitDate === input.recruitDate && scrim.scrimNumber === scrimNumber) ?? null,
      };
    },
  };
  const assistant: KakaoV4AssistantPort = {
    async getOpenChatStatus(input) {
      statusCalls.push(input);
      return { body: statusBody, replayed: false };
    },
    async syncSeasonSnapshot(input) {
      seasonCalls.push(input);
      const body: KakaoSeasonSnapshotDto = {
        kind: "SEASON_APPLICATION_SNAPSHOT",
        seasonId: input.command.seasonId ?? "22222222-2222-4222-8222-222222222222",
        applyDate: input.command.applyDate,
        recruitNo: input.command.recruitNo,
        entries: [],
        appliedCount: 0,
        reserveCount: 0,
        confirmedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        legacyReply: input.command.action === "STATUS" ? contract.inhouse.multiRoundStatusReply : `[K-LOL.GG 내전 #${input.command.recruitNo} 명단 업데이트]`,
      };
      return { body, replayed: false };
    },
  };
  const authorizer = {
    async authorizeProfile(input: { requiredCapabilityProfile: KakaoV4ProfileId }) {
      return { roomId, roomStatus: "ACTIVE" as const, capabilityProfile: input.requiredCapabilityProfile, installationId: "installation-row" };
    },
  };
  return {
    service: new KakaoV4CommandService(authorizer, new KakaoV4CommandDispatcher({ recruiting, assistant, publicOrigin: "https://example.invalid" })),
    handled,
    statusCalls,
    seasonCalls,
  };
}

async function reply(service: KakaoV4CommandService, input: KakaoV4CommandEnvelope) {
  const result = await service.execute(input, "current");
  assert.equal(result.kind, "REPLY");
  return result;
}

test("Phase 3-A: V1 내전 모드 선택과 협곡·칼바람 전체 양식을 정확히 보존한다", async () => {
  const state = harness();
  assert.equal((await reply(state.service, envelope("FEATURES", "내전구인", 1))).reply, contract.inhouse.modeSelectorReply);
  assert.equal((await reply(state.service, envelope("FEATURES", "내전구인 협곡 2026-09-09 21:30 #2 10명", 2))).reply, contract.inhouse.riftTemplate);
  assert.equal((await reply(state.service, envelope("FEATURES", "내전구인 칼바람 2026-09-09 21:30 #3 10명", 3))).reply, contract.inhouse.aramTemplate);
  assert.equal(state.seasonCalls.length, 0);
  assert.equal(state.handled.length, 0);
});

test("Phase 3-A: 내전 전체 현황과 회차 상세는 정확히 한 번 authoritative assistant를 호출한다", async () => {
  const state = harness();
  assert.equal((await reply(state.service, envelope("FEATURES", "내전현황", 4))).reply, contract.inhouse.multiRoundStatusReply);
  await reply(state.service, envelope("FEATURES", "내전상세 2", 5));
  assert.deepEqual(state.seasonCalls.map(({ command }) => ({ action: command.action, seasonId: command.seasonId, recruitNo: command.recruitNo })), [
    { action: "STATUS", seasonId: null, recruitNo: null },
    { action: "STATUS", seasonId: null, recruitNo: 2 },
  ]);
});

test("Phase 3-A: 협곡 명단 A→B→A와 0명은 각 입력당 한 번의 authoritative snapshot이다", async () => {
  const state = harness();
  const empty = contract.inhouse.riftTemplate;
  const withA = empty.replace("👥 0/10명", "👥 1/10명").replace("\n1.\n", "\n1. 재현/P/E/AD/MD\n");
  const withB = empty.replace("👥 0/10명", "👥 1/10명").replace("\n1.\n", "\n1. 민서/D/M/MD/SUP\n");
  for (const [sequence, form] of [[6, withA], [7, withB], [8, withA], [9, empty]] as const) {
    await reply(state.service, envelope("FEATURES", form, sequence));
  }
  assert.deepEqual(state.seasonCalls.map(({ command }) => command.action === "SYNC" ? command.participants.map((participant) => participant.name) : null), [
    ["재현"], ["민서"], ["재현"], [],
  ]);
  assert.ok(state.seasonCalls.every(({ command }) => command.seasonId === null));
  assert.equal(state.handled.length, 0);
});

test("Phase 3-A: 스크림 양식·현황·상세 답변은 V40/V41 golden과 정확히 같다", async () => {
  const empty = harness(openStatus());
  assert.equal((await reply(empty.service, envelope("RECRUIT", "스크림구인", 10))).reply, contract.scrim.initialTemplate);
  assert.equal((await reply(empty.service, envelope("RECRUIT", "스크림현황", 11))).reply, contract.scrim.emptyStatusReply);
  const populated = harness(openStatus([scrimFixture], 8));
  assert.equal((await reply(populated.service, envelope("RECRUIT", "스크림현황", 12))).reply, contract.scrim.statusReply);
  assert.equal((await reply(populated.service, envelope("RECRUIT", "스크림상세 7", 13))).reply, contract.scrim.detailReply);
});

test("Phase 3-A: 신규 스크림은 서버 번호와 기존 단일 활성 대회 추론만 사용하고 중복 eventId를 한 번 적용한다", async () => {
  const state = harness(openStatus([], 8));
  const form = contract.scrim.initialTemplate.replace("우리팀: ", "우리팀: 하늘단");
  const input = envelope("RECRUIT", form, 14);
  const first = await reply(state.service, input);
  const replay = await reply(state.service, input);
  assert.equal(first.reply, contract.scrim.newFormReply);
  assert.equal(first.replayed, false);
  assert.equal(replay.reply, first.reply);
  assert.equal(replay.replayed, true);
  assert.equal(state.statusCalls.length, 0);
  assert.equal(state.handled.length, 1);
  const command = state.handled[0];
  assert.equal(command?.type, "CREATE_SCRIM");
  if (command?.type === "CREATE_SCRIM") {
    assert.equal(command.payload.scrimNumber, null, "자동 번호는 dispatcher가 추측하지 않고 application에 위임해야 한다");
    assert.equal(command.payload.tournamentId, null);
    assert.equal(command.payload.legacyTournamentNumber, null);
  }
  assert.equal(JSON.stringify(command).includes("role"), false);
  assert.equal(JSON.stringify(command).includes("owner"), false);
});

test("Phase 3-A: 기존 번호 전체 양식은 대회 바인딩을 보존하고 수정된 전체 양식을 반환한다", async () => {
  const state = harness(openStatus([scrimFixture], 8));
  const changed = contract.scrim.detailReply
    .split("\n")
    .slice(4, -2)
    .join("\n")
    .replace("SUP: 꽃잎서폿", "SUP: 새꽃잎서폿");
  const result = await reply(state.service, envelope("RECRUIT", `[K-LOL.GG 스크림 구인 양식]\n\n${changed}`, 15));
  assert.equal(state.statusCalls.length, 0);
  assert.equal(state.handled.length, 1);
  const command = state.handled[0];
  assert.equal(command?.type, "SYNC_SCRIM");
  if (command?.type === "SYNC_SCRIM") {
    assert.equal(command.aggregateId, scrimFixture.id);
    assert.equal(command.metadata.expectedRevision, scrimFixture.revision);
    assert.equal(command.payload.tournamentId, scrimFixture.tournamentId);
    assert.equal(command.payload.legacyTournamentNumber, scrimFixture.legacyTournamentNumber);
  }
  assert.match(result.reply, /^\[스크림 #7 반영\]\n상태: 매칭완료\n\n/u);
  assert.match(result.reply, /SUP: 새꽃잎서폿$/u);
});

test("Phase 3-A: 인식된 불완전 전체 양식은 저장하지 않고 INVALID_FORM으로 닫힌다", async () => {
  const state = harness();
  const malformed = contract.inhouse.riftTemplate.split("\n").filter((line) => line !== "10.").join("\n");
  await assert.rejects(
    () => state.service.execute(envelope("FEATURES", malformed, 16), "current"),
    (error: unknown) => error instanceof KakaoV4CommandError && error.code === "INVALID_FORM",
  );
  assert.equal(state.seasonCalls.length, 0);
  assert.equal(state.handled.length, 0);
});
