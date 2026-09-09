import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");
const compatibilityPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V1_COMPAT.js");
const routerPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js");

const DATE = "2026-09-09";

const V40_SCRIM_TEMPLATE = [
  "[K-LOL.GG 스크림 구인 양식]",
  "",
  `운영일: ${DATE}`,
  "번호: #자동배정",
  "",
  "일시: ",
  "방식: 3판2선",
  "",
  "우리팀: ",
  "TOP: ",
  "JUG: ",
  "MID: ",
  "ADC: ",
  "SUP: ",
  "",
  "상대팀: ",
  "TOP: ",
  "JUG: ",
  "MID: ",
  "ADC: ",
  "SUP: ",
].join("\n");

const scrimFixture = {
  id: "scrim-7",
  revision: 3,
  recruitDate: DATE,
  scrimNumber: 7,
  tournamentId: "tournament-4",
  legacyTournamentNumber: 4,
  title: "하늘단 스크림 구인",
  requesterTeamName: "하늘단",
  opponentTeamName: "꽃잎단",
  requesterLineup: { top: "하늘탑", jungle: "하늘정글", mid: "하늘미드", adc: "하늘원딜", support: "하늘서폿" },
  opponentLineup: { top: "꽃잎탑", jungle: "꽃잎정글", mid: "꽃잎미드", adc: "꽃잎원딜", support: "꽃잎서폿" },
  scheduledAt: "2026-09-09T12:00:00.000Z",
  bestOf: 3,
  seriesRuleText: "3판2선",
  status: "MATCHED",
  memo: null,
};

const V40_SCRIM_STATUS = [
  "[K-LOL.GG 스크림 현황]",
  "🔎 전체 양식: 스크림상세 번호",
  "",
  "#7 하늘단 vs 꽃잎단 / 9/9 21:00 / 3판2선 / 매칭완료",
  "└ 스크림상세 7",
].join("\n");

const V40_SCRIM_DETAIL = [
  "[K-LOL.GG 멸망전 스크림 상세]",
  "",
  "#7 하늘단 vs 꽃잎단 / 9/9 21:00 / 3판2선 / 매칭완료",
  "",
  `운영일: ${DATE}`,
  "번호: #7",
  "일시: 9/9 21:00",
  "방식: 3판2선",
  "",
  "우리팀: 하늘단",
  "TOP: 하늘탑",
  "JUG: 하늘정글",
  "MID: 하늘미드",
  "ADC: 하늘원딜",
  "SUP: 하늘서폿",
  "",
  "상대팀: 꽃잎단",
  "TOP: 꽃잎탑",
  "JUG: 꽃잎정글",
  "MID: 꽃잎미드",
  "ADC: 꽃잎원딜",
  "SUP: 꽃잎서폿",
  "",
  "수정: 이 메시지를 복사해 내용을 고친 뒤 전체 전송",
].join("\n");

const FULL_FORM = [
  "[K-LOL.GG 스크림 구인 양식]",
  "",
  `운영일: ${DATE}`,
  "번호: #7",
  "멸망전번호: 4",
  "",
  "일시: 9/9 21:00",
  "방식: 3판2선",
  "",
  "우리팀: 하늘단",
  "TOP: 하늘탑",
  "JUG: 하늘정글",
  "MID: 하늘미드",
  "ADC: 하늘원딜",
  "SUP: 하늘서폿",
  "",
  "상대팀: 꽃잎단",
  "TOP: 꽃잎탑",
  "JUG: 꽃잎정글",
  "MID: 꽃잎미드",
  "ADC: 꽃잎원딜",
  "SUP: 꽃잎서폿",
].join("\n");

const V1_FILLED_FORM = FULL_FORM.split("\n").filter((line) => line !== "멸망전번호: 4").join("\n");
const V1_UPDATED_FORM = V1_FILLED_FORM.replace("꽃잎서폿", "새꽃잎서폿");

async function createHarness({ scrims = [] } = {}) {
  const [compatibility, router] = await Promise.all([
    readFile(compatibilityPath, "utf8"),
    readFile(routerPath, "utf8"),
  ]);
  const replies = [];
  const recruitCalls = [];
  const values = new Map();
  const liveScrims = structuredClone(scrims);
  const context = vm.createContext({
    console,
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
    },
    java: {
      text: {
        SimpleDateFormat: function SimpleDateFormat() {
          this.setTimeZone = () => {};
          this.format = () => DATE;
        },
      },
      util: {
        Date: function JavaDate() {},
        TimeZone: { getTimeZone() { return {}; } },
      },
    },
    KLOL_V2_KAKAO: {
      identityForChat() {
        return { roomId: `room-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}` };
      },
      contextFromChat(room, sender, options = {}) { return { room, sender, ...options }; },
      newUuid() { return "123e4567-e89b-42d3-a456-426614174000"; },
      publicBaseUrl() { return "https://example.invalid"; },
      userMessage(result) { return result?.ok ? "[K-LOL.GG]\n요청을 처리했습니다." : "[K-LOL.GG 요청 실패]\n테스트 실패"; },
      openchatStatus() {
        return {
          ok: true,
          body: {
            nextPartyRecruitNumber: 1,
            nextPartyResetSequence: 0,
            nextScrimNumber: 7,
            parties: [],
            scrims: structuredClone(liveScrims),
          },
        };
      },
      recruit(command) {
        recruitCalls.push(structuredClone(command));
        const payload = command.payload || {};
        const existingIndex = liveScrims.findIndex((scrim) =>
          scrim.id === command.aggregateId || Number(scrim.scrimNumber) === Number(payload.scrimNumber));
        const current = existingIndex >= 0 ? liveScrims[existingIndex] : null;
        const next = {
          ...(current || scrimFixture),
          id: current?.id || command.aggregateId,
          revision: Number(current?.revision || 0) + 1,
          recruitDate: payload.recruitDate || current?.recruitDate || DATE,
          scrimNumber: Number(payload.scrimNumber || current?.scrimNumber || 7),
          tournamentId: payload.tournamentId || current?.tournamentId || "tournament-4",
          legacyTournamentNumber: payload.legacyTournamentNumber || current?.legacyTournamentNumber || 4,
          title: payload.title || current?.title || "하늘단 스크림 구인",
          requesterTeamName: payload.requesterTeamName ?? current?.requesterTeamName ?? "하늘단",
          opponentTeamName: payload.opponentTeamName ?? current?.opponentTeamName ?? null,
          requesterLineup: payload.requesterLineup ?? current?.requesterLineup ?? null,
          opponentLineup: payload.opponentLineup ?? current?.opponentLineup ?? null,
          scheduledAt: payload.scheduledAt ?? current?.scheduledAt ?? null,
          bestOf: Number(payload.bestOf || current?.bestOf || 3),
          seriesRuleText: payload.seriesRuleText ?? current?.seriesRuleText ?? null,
          status: payload.opponentTeamName || payload.opponentLineup ? "MATCHED" : (current?.status || "RECRUITING"),
        };
        if (existingIndex >= 0) liveScrims[existingIndex] = next;
        else liveScrims.push(next);
        return {
          ok: true,
          body: {
            aggregateKind: "SCRIM",
            aggregateId: next.id,
            revision: next.revision,
            status: next.status,
            commandType: command.type,
            data: structuredClone(next),
          },
        };
      },
      operationForm() { throw new Error("unexpected operation-form request"); },
      seasonApplications() { throw new Error("unexpected season request"); },
      imageReceive() { throw new Error("unexpected image request"); },
      playerRecord() { throw new Error("unexpected player-record request"); },
      recentMatches() { throw new Error("unexpected recent-match request"); },
      ranking() { throw new Error("unexpected ranking request"); },
      scheduledNotice() { throw new Error("unexpected scheduled-notice request"); },
      sha256Base64BytesHex() { return "a".repeat(64); },
    },
  });
  new vm.Script(`${compatibility}\n${router}`, { filename: "KLOL_V41_V40_SCRIM_GOLDEN_TEST.js" }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message) => context.response(
    "K롤방 구인구직방",
    message,
    "관리자. 99 재현 M(M)",
    true,
    replier,
    null,
    "com.xfl.msgbot",
  );
  return { replies, recruitCalls, respond };
}

test("V40 스크림구인은 자동배정 번호와 원래 줄바꿈을 가진 전체 양식을 반환한다", async () => {
  const bot = await createHarness();
  bot.respond("스크림구인");
  assert.deepEqual(bot.replies, [V40_SCRIM_TEMPLATE]);
  assert.equal(bot.recruitCalls.length, 0, "빈 양식 호출은 스크림을 저장하지 않아야 한다");
});

test("V40 스크림현황은 파티 현황과 섞지 않고 한글 상태와 상세 명령을 표시한다", async () => {
  const bot = await createHarness({ scrims: [scrimFixture] });
  bot.respond("스크림현황");
  assert.deepEqual(bot.replies, [V40_SCRIM_STATUS]);
});

test("V40 스크림현황 빈 상태 문구를 정확히 유지한다", async () => {
  const bot = await createHarness();
  bot.respond("스크림현황");
  assert.deepEqual(bot.replies, [[
    "[K-LOL.GG 스크림 현황]",
    "",
    "현재 모집중/확정된 스크림이 없습니다.",
  ].join("\n")]);
});

test("V40 스크림상세는 복사 가능한 전체 양식과 수정 안내를 그대로 반환한다", async () => {
  const bot = await createHarness({ scrims: [scrimFixture] });
  bot.respond("스크림상세 7");
  assert.deepEqual(bot.replies, [V40_SCRIM_DETAIL]);
});

test("V40 스크림 전체 양식 신규 제출은 즉시 한 번 저장하고 등록 완료만 응답한다", async () => {
  const bot = await createHarness();
  bot.respond(FULL_FORM);
  assert.equal(bot.recruitCalls.length, 1);
  assert.equal(bot.recruitCalls[0].type, "CREATE_SCRIM");
  assert.deepEqual(bot.replies, ["[K-LOL.GG 스크림 등록 완료]"]);
});

test("V40 원본 양식은 멸망전번호 없이 서버의 단일 활성 대회 자동 판별을 사용한다", async () => {
  const bot = await createHarness();
  bot.respond(V1_FILLED_FORM);
  assert.equal(bot.recruitCalls.length, 1);
  assert.equal(bot.recruitCalls[0].type, "CREATE_SCRIM");
  assert.equal(bot.recruitCalls[0].payload.tournamentId, null);
  assert.equal(bot.recruitCalls[0].payload.legacyTournamentNumber, null);
  assert.deepEqual(bot.replies, ["[K-LOL.GG 스크림 등록 완료]"]);
});

test("V40 스크림 전체 양식 수정 제출은 별도 확인 없이 같은 번호를 교체 반영한다", async () => {
  const bot = await createHarness({ scrims: [scrimFixture] });
  bot.respond(V1_UPDATED_FORM);
  assert.equal(bot.recruitCalls.length, 1, "기존 번호 전체 양식도 수정 명령으로 서버에 한 번 전달해야 한다");
  assert.equal(bot.recruitCalls[0].payload.tournamentId, scrimFixture.tournamentId);
  assert.equal(bot.recruitCalls[0].payload.legacyTournamentNumber, scrimFixture.legacyTournamentNumber);
  assert.equal(bot.replies.length, 1);
  assert.match(bot.replies[0], /^\[스크림 #7 반영\]\n상태: 매칭완료\n/u);
  assert.match(bot.replies[0], /SUP: 새꽃잎서폿/u);
});

test("V40에서 사용 중단된 참가·확정·취소·수동 종료는 원래 안내만 하고 변경하지 않는다", async () => {
  const cases = [
    ["스크림참가 7 꽃잎단", "[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요."],
    ["스크림확정 7", "[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요."],
    ["스크림취소 7", "[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다."],
    ["스크림마감 7", "[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다."],
  ];
  for (const [command, expected] of cases) {
    const bot = await createHarness({ scrims: [scrimFixture] });
    bot.respond(command);
    assert.deepEqual(bot.replies, [expected], command);
    assert.equal(bot.recruitCalls.length, 0, `${command}: 상태 변경 호출 금지`);
  }
});
