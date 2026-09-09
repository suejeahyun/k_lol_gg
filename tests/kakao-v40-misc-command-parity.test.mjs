import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");
const compatibilityPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V1_COMPAT.js");
const routerPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js");
const baseUrl = "https://k-lol-gg.vercel.app";

const V40_GENERAL_HELP = [
  "[K-LOL.GG 일반 도움말]",
  "",
  "LOL-K 기능",
  "- 내전현황 : 현재 시즌내전 신청 현황",
  "- 내전참가 / 참가신청 : 참가 방법 안내",
  "- 전적 닉네임#태그 : 플레이어 전적 조회",
  "- 최근 닉네임#태그 : 최근 경기 조회",
  "- 랭킹 : 랭킹 조회",
  "",
  "운영 기능",
  "- /등록 : 초보자용 등록 센터",
  "- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록",
  "- /경고등록 : 관리자 경고 등록 화면 열기",
  "- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출",
  "- /경고현황 : 내정보의 경고 진행 상황 열기",
  "- /결과현황 : 사이트의 내 미완료 결과 접수 열기",
  "",
  "구인구직 명령어는 구인도움말을 입력해주세요.",
  "스크림구인은 /스크림구인, /스크림현황을 사용해주세요.",
  "",
  "참고",
  "- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.",
  "- 예) /내전현황, /전적 닉네임#태그, /구인도움말",
].join("\n");

const V40_RECRUIT_WEB_HELP = [
  "[K-LOL.GG 구인도우미]",
  "",
  "현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.",
  "",
  `${baseUrl}/recruit-helper`,
  "",
  "구인현황 바로가기:",
  `${baseUrl}/recruit`,
].join("\n");

const V40_REGISTRATION_HUB = [
  "[K-LOL.GG 쉬운 등록 센터]",
  "처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다.",
  `▶ ${baseUrl}/start`,
  "",
  "① 내전 결과 등록",
  "경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다.",
  `▶ ${baseUrl}/matches/submit`,
  "",
  "② 주의·경고·벤 등록 (관리자)",
  "대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다.",
  `▶ ${baseUrl}/admin/discipline/new`,
  "※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다.",
  "",
  "③ 경고 차감 사진 제출",
  "본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다.",
  `▶ ${baseUrl}/discipline/evidence`,
  "※ 본인 계정 로그인이 필요합니다.",
  "",
  "등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다.",
].join("\n");

const V40_MANAGED_REPLIES = new Map([
  ["내전등록", [
    "[K-LOL.GG 내전 결과 등록]",
    "가장 쉬운 등록 방법을 안내합니다.",
    "",
    "1. 아래 링크를 엽니다.",
    "2. 세트 수·회차·팀 밸런스를 확인합니다.",
    "3. 결과 사진 2~3장을 한 번에 올리고 제출합니다.",
    "",
    `▶ ${baseUrl}/matches/submit`,
    "",
    "로그인하면 진행 중인 제출을 자동으로 찾아 이어서 할 수 있습니다.",
  ].join("\n")],
  ["경고등록", [
    "[K-LOL.GG 관리자 경고 등록]",
    "관리자 화면에서 대상 검색 → 종류 선택 → 사유·사진 등록 순서로 진행합니다.",
    "",
    `▶ ${baseUrl}/admin/discipline/new`,
    "",
    "※ 관리자 로그인과 2차 인증이 필요하며, 완료 후 이 화면으로 돌아옵니다.",
  ].join("\n")],
  ["인증", [
    "[K-LOL.GG 경고 차감 사진 제출]",
    "사이트에 로그인하면 본인의 진행 과제만 자동으로 표시됩니다.",
    "로그인 계정 기준으로 남은 사진을 한 번에 제출할 수 있습니다.",
    "",
    `▶ ${baseUrl}/discipline/evidence`,
  ].join("\n")],
  ["경고현황", [
    "[K-LOL.GG 내 경고 현황]",
    "내정보에서 경고 상태와 남은 사진 수를 확인하세요.",
    "",
    `▶ ${baseUrl}/account#discipline`,
  ].join("\n")],
  ["결과현황", [
    "[K-LOL.GG 내전 결과 제출 현황]",
    "사이트에 로그인하면 진행 중인 내 제출을 자동으로 확인할 수 있습니다.",
    "",
    `▶ ${baseUrl}/matches/submit`,
  ].join("\n")],
]);

const V40_RECORD_REPLY = [
  "[별빛#KR1 전적]",
  "",
  "시즌: 가을 시즌",
  "티어: EMERALD / DIAMOND",
  "참여: 7회 / 12세트",
  "전적: 5승 2패 (71.4%)",
  "KDA: 4.20 (25/8/9)",
  "MVP: 2회",
  "",
  "최근: 승 아리 8/2/9",
  "",
  `${baseUrl}/players/player-1`,
].join("\n");

const V40_RECENT_REPLY = [
  "[별빛#KR1 최근 경기]",
  "",
  "1. 승 | 아리 | 8/2/9",
  "",
  `${baseUrl}/players/player-1`,
].join("\n");

const V40_RANKING_REPLY = [
  "🏆 K-LOL.GG 랭킹 TOP 5",
  "기준: 내전 참여 10회 이상",
  "",
  "1. 별빛#KR1 | 승률 71.4% | 참여 12회 | 12세트 | KDA 4.20",
].join("\n");

async function createHarness() {
  const [compatibility, router] = await Promise.all([
    readFile(compatibilityPath, "utf8"),
    readFile(routerPath, "utf8"),
  ]);
  const replies = [];
  const values = new Map();
  const calls = { records: 0, recent: 0, ranking: 0, operationForms: 0 };
  const recordBody = {
    kind: "PLAYER_RECORD",
    mode: "RECORD",
    player: { playerId: "player-1", displayName: "별빛", nickname: "별빛", tag: "KR1", riotId: "별빛#KR1" },
    season: { id: "season-1", name: "가을 시즌" },
    currentTier: "EMERALD",
    peakTier: "DIAMOND",
    summary: {
      totalGames: 12, participationCount: 7, wins: 5, losses: 2,
      winRate: 71.4, kills: 25, deaths: 8, assists: 9, kda: 4.2, mvpCount: 2,
    },
    recentMatches: [{
      matchId: "match-1", title: "내전", playedOn: "2026-09-08", gameNumber: 1,
      championName: "아리", kills: 8, deaths: 2, assists: 9, team: "BLUE", position: "MID", won: true, mvp: false,
    }],
  };
  const context = vm.createContext({
    console,
    DataBase: {
      getDataBase(key) { return values.get(String(key)) ?? ""; },
      setDataBase(key, value) { values.set(String(key), String(value)); },
    },
    java: {
      text: { SimpleDateFormat: function SimpleDateFormat() { this.setTimeZone = () => {}; this.format = () => "2026-09-09"; } },
      util: { Date: function JavaDate() {}, TimeZone: { getTimeZone() { return {}; } } },
    },
    KLOL_V2_KAKAO: {
      publicBaseUrl() { return baseUrl; },
      identityForChat() { return { roomId: `room-${"a".repeat(32)}`, senderId: `sender-${"b".repeat(32)}` }; },
      contextFromChat(room, sender, options = {}) { return { room, sender, ...options }; },
      userMessage(result) { return result?.ok ? "[K-LOL.GG]\n요청을 처리했습니다." : "[K-LOL.GG 요청 실패]\n오프라인 테스트"; },
      playerRecord() { calls.records += 1; return { ok: true, body: structuredClone(recordBody) }; },
      recentMatches() { calls.recent += 1; return { ok: true, body: { ...structuredClone(recordBody), mode: "RECENT" } }; },
      ranking() {
        calls.ranking += 1;
        return { ok: true, body: {
          kind: "RANKING", season: { id: "season-1", name: "가을 시즌" }, minimumParticipation: 10,
          rows: [{ rank: 1, playerId: "player-1", displayName: "별빛", nickname: "별빛", tag: "KR1", riotId: "별빛#KR1", totalGames: 12, participationCount: 12, wins: 5, losses: 2, winRate: 71.4, kda: 4.2, mvpCount: 2 }],
          truncated: false,
        } };
      },
      operationForm() {
        calls.operationForms += 1;
        return { ok: true, body: { reply: "[K-LOL.GG 운영 양식]\nV1 서버가 만든 접수 응답" } };
      },
      openchatStatus() { throw new Error("offline test must not call openchat"); },
      recruit() { throw new Error("offline test must not mutate recruits"); },
      seasonApplications() { throw new Error("offline test must not call season applications"); },
      scheduledNotice() { throw new Error("offline test must not call scheduled notices"); },
      imageReceive() { throw new Error("offline test must not upload images"); },
      sha256Base64BytesHex() { return "a".repeat(64); },
      newUuid() { return "123e4567-e89b-42d3-a456-426614174000"; },
    },
  });
  new vm.Script(`${compatibility}\n${router}`, { filename: "KLOL_V41_MISC_PARITY_OFFLINE.js" }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message, options = {}) => context.response(
    options.room ?? "K롤방 구인구직방",
    message,
    options.sender ?? "사용자",
    true,
    replier,
    null,
    "com.xfl.msgbot",
  );
  return { calls, replies, respond };
}

test("V40 일반 도움말의 제목·항목·줄바꿈을 모든 별칭에서 그대로 유지한다", async () => {
  for (const alias of ["도움말", "/도움말", "명령어", "/명령어"]) {
    const bot = await createHarness();
    bot.respond(alias);
    assert.deepEqual(bot.replies, [V40_GENERAL_HELP], alias);
  }
});

test("V40 구인 웹 도우미와 구인 도움말을 서로 다른 응답으로 유지한다", async () => {
  for (const alias of ["구인도우미", "/구인도우미", "구인웹도우미", "/구인웹도우미", "구인매뉴얼", "/구인매뉴얼", "명령어페이지", "/명령어페이지"]) {
    const bot = await createHarness();
    bot.respond(alias);
    assert.deepEqual(bot.replies, [V40_RECRUIT_WEB_HELP], alias);
  }
});

test("V40 등록 센터의 설명과 기존 링크를 모든 별칭에서 그대로 유지한다", async () => {
  for (const alias of ["등록", "/등록", "등록도움말", "/등록도움말"]) {
    const bot = await createHarness();
    bot.respond(alias);
    assert.deepEqual(bot.replies, [V40_REGISTRATION_HUB], alias);
  }
});

test("V40 내전·경고·인증·현황 링크 응답을 그대로 유지한다", async (t) => {
  const aliases = new Map([
    ["내전등록", ["내전등록", "/내전등록", "결과등록", "/결과등록", "내전결과", "/내전결과"]],
    ["경고등록", ["경고등록", "/경고등록", "경고", "/경고"]],
    ["인증", ["인증", "/인증", "경고인증", "/경고인증"]],
    ["경고현황", ["경고현황", "/경고현황"]],
    ["결과현황", ["내전등록현황", "/내전등록현황", "결과현황", "/결과현황"]],
  ]);
  for (const [kind, commands] of aliases) {
    await t.test(kind, async () => {
      for (const command of commands) {
        const bot = await createHarness();
        bot.respond(command);
        assert.deepEqual(bot.replies, [V40_MANAGED_REPLIES.get(kind)], command);
      }
    });
  }
});

test("V40 전적·최근·랭킹의 사용자 표시 정보를 잃지 않는다", async (t) => {
  for (const [name, aliases, expected, callKey] of [
    ["전적", ["전적 별빛#KR1", "/전적 별빛#KR1"], V40_RECORD_REPLY, "records"],
    ["최근", ["최근 별빛#KR1", "/최근 별빛#KR1"], V40_RECENT_REPLY, "recent"],
    ["랭킹", ["랭킹", "/랭킹"], V40_RANKING_REPLY, "ranking"],
  ]) {
    await t.test(name, async () => {
      for (const command of aliases) {
        const bot = await createHarness();
        bot.respond(command);
        assert.equal(bot.calls[callKey], 1, command);
        assert.deepEqual(bot.replies, [expected], command);
      }
    });
  }
});

test("V40처럼 오픈채팅봇이 출력한 운영 양식은 재접수하지 않는다", async () => {
  const bot = await createHarness();
  bot.respond([
    "1. 지인 이름: 친구",
    "2. 지인 닉네임: Friend#KR1",
    "3. 이용기간: 장기",
    "4. 디스코드 닉네임 변경: 네",
  ].join("\n"), { sender: "오픈채팅봇" });
  assert.equal(bot.calls.operationForms, 0);
  assert.deepEqual(bot.replies, []);
});

test("V40 운영 양식은 서버가 만든 접수 문구를 그대로 전달한다", async () => {
  const bot = await createHarness();
  bot.respond([
    "1. 지인 이름: 친구",
    "2. 지인 닉네임: Friend#KR1",
    "3. 이용기간: 장기",
    "4. 디스코드 닉네임 변경: 네",
  ].join("\n"));
  assert.equal(bot.calls.operationForms, 1);
  assert.deepEqual(bot.replies, ["[K-LOL.GG 운영 양식]\nV1 서버가 만든 접수 응답"]);
});

test("V40 사진취소 별칭의 사이트 우선 안내 동작을 그대로 유지한다", async () => {
  for (const alias of ["사진취소", "/사진취소"]) {
    const bot = await createHarness();
    bot.respond(alias);
    assert.deepEqual(bot.replies, [V40_REGISTRATION_HUB], alias);
  }
});

test("V40 입장·퇴장·초대·서버 echo 동작을 유지한다", async () => {
  const bot = await createHarness();
  bot.respond("새 사용자가 들어왔습니다");
  assert.deepEqual(bot.replies, ["다시 오셨네요, 반가워요! 😊"]);
  bot.respond("사용자가 나갔습니다");
  bot.respond("사용자가 초대되었습니다");
  bot.respond("[K-LOL.GG 일반 도움말]", { sender: "K-LOL 구인구직 도우미" });
  assert.deepEqual(bot.replies, ["다시 오셨네요, 반가워요! 😊"]);
});
