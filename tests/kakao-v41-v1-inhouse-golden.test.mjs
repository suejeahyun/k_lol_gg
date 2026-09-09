import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");

const V1_MODE_SELECTION = [
  "[K-LOL.GG 내전 종목 선택]",
  "지원하지 않는 종목입니다: 양식",
  "✅️협곡내전은 관리자에게 신청 후 안내에 따라 구인해주세요.✅️",
  "",
  "아래 명령어 중 하나를 입력해주세요.",
  "- /내전구인 협곡",
  "- /내전구인 칼바람",
  "- /내전구인 증바람",
  "",
  "날짜·시간 지정: /내전구인 협곡 2026-08-06 21:00",
  "모집번호·정원 지정: /내전구인 칼바람 #2 10명",
  "",
  "협곡은 티어·라인 양식으로 내전 명단에 등록됩니다.",
  "칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다.",
].join("\n");

function v1Template({ mode, date = "2026-09-09", time = "21:00", recruitNo = 1, capacity = 10, participants = [] }) {
  const lines = [
    `📢 내전하실분 #${recruitNo}`,
    ` 》${mode}`,
    ` 》${date} ${time} 시작`,
    `👥 ${participants.filter(Boolean).length}/${capacity}명`,
    "",
    "*참가 신청 양식*",
  ];
  if (mode === "협곡") {
    lines.push("이름/현티어/최고티어/주라인/부라인", "EX) 1.지후/P/E/AD/MD");
  } else {
    lines.push("이름", "EX) 1.지후");
  }
  lines.push("");
  for (let index = 0; index < capacity; index += 1) {
    lines.push(`${index + 1}.${participants[index] ? ` ${participants[index]}` : ""}`);
  }
  return lines.join("\n");
}

const V1_MULTI_ROUND_STATUS = [
  "[K-LOL.GG 내전현황]",
  "🔎 전체 명단: 내전상세 번호",
  "",
  "#1 2026-9-9 21:00 시작 (2/10)",
  "└ 내전상세 1",
  "#2 2026-9-9 21:30 시작 (1/10 / 예비 1)",
  "└ 내전상세 2",
  "",
  "상세 명령: 내전상세 1 / 내전상세 2",
].join("\n");

const V1_DETAIL = v1Template({
  mode: "협곡",
  recruitNo: 2,
  time: "21:30",
  participants: ["재현/P/E/AD/MD", "민서/D/M/MD/SUP"],
});

const V1_FILLED_FORM = v1Template({
  mode: "협곡",
  recruitNo: 2,
  participants: ["재현/P/E/AD/MD", "민서/D/M/MD/SUP"],
});

async function createHarness({ seasonResult } = {}) {
  const [compatibility, router] = await Promise.all([
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V1_COMPAT.js"), "utf8"),
    readFile(resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js"), "utf8"),
  ]);
  const values = new Map([["KLOL_V2_ACTIVE_SEASON_ID", "123e4567-e89b-42d3-a456-426614174000"]]);
  const replies = [];
  const seasonCalls = [];
  const operationCalls = [];
  const defaultSeasonResult = {
    ok: true,
    body: {
      kind: "SEASON_APPLICATION_SNAPSHOT",
      seasonId: "123e4567-e89b-42d3-a456-426614174000",
      applyDate: "2026-09-09",
      recruitNo: 1,
      entries: [],
      appliedCount: 0,
      reserveCount: 0,
      confirmedCount: 0,
      pendingCount: 0,
      cancelledCount: 0,
    },
  };
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
          this.format = () => "2026-09-09";
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
      userMessage(result) {
        if (result?.ok) return "[K-LOL.GG]\n요청을 안전하게 처리했습니다.";
        const detail = typeof result?.body?.detail === "string" ? result.body.detail : "잠시 후 다시 시도해 주세요.";
        return `[K-LOL.GG 요청 실패]\n${detail}`;
      },
      seasonApplications(command, requestContext) {
        seasonCalls.push({ command: structuredClone(command), requestContext: structuredClone(requestContext) });
        return structuredClone(seasonResult ?? defaultSeasonResult);
      },
      openchatStatus() { throw new Error("unexpected openchat request"); },
      recruit() { throw new Error("unexpected recruit request"); },
      operationForm(formType, payload, requestContext) {
        operationCalls.push({ formType, payload: structuredClone(payload), requestContext: structuredClone(requestContext) });
        return { ok: true, body: {} };
      },
      imageReceive() { throw new Error("unexpected image request"); },
      playerRecord() { throw new Error("unexpected player-record request"); },
      recentMatches() { throw new Error("unexpected recent-match request"); },
      ranking() { throw new Error("unexpected ranking request"); },
      scheduledNotice() { throw new Error("unexpected scheduled-notice request"); },
      sha256Base64BytesHex() { return "a".repeat(64); },
    },
  });
  new vm.Script(`${compatibility}\n${router}`, { filename: "KLOL_V41_V1_INHOUSE_GOLDEN.js" }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message) => context.response("K롤방 구인구직방", message, "관리자. 99 재현 M(M)", true, replier, null, "com.xfl.msgbot");
  return { replies, respond, seasonCalls, operationCalls };
}

test("V1: 내전구인만 입력하면 종목 선택 안내를 정확히 보낸다", async () => {
  const bot = await createHarness();
  bot.respond("내전구인");
  assert.deepEqual(bot.replies, [V1_MODE_SELECTION]);
  assert.equal(bot.seasonCalls.length, 0);
});

test("V1: 협곡 내전구인은 티어·라인과 빈 칸을 포함한 전체 양식을 정확히 보낸다", async () => {
  const bot = await createHarness();
  bot.respond("내전구인 협곡 2026-09-09 21:30 #2 10명");
  assert.deepEqual(bot.replies, [v1Template({ mode: "협곡", time: "21:30", recruitNo: 2 })]);
  assert.equal(bot.seasonCalls.length, 0);
});

test("V1: 칼바람 내전구인은 이름 전용 전체 양식을 정확히 보낸다", async () => {
  const bot = await createHarness();
  bot.respond("내전구인 칼바람 2026-09-09 21:30 #3 10명");
  assert.deepEqual(bot.replies, [v1Template({ mode: "칼바람", time: "21:30", recruitNo: 3 })]);
  assert.equal(bot.seasonCalls.length, 0);
});

test("V1: 번호 없는 내전현황은 모든 회차 요약과 내전상세 명령을 정확히 보낸다", async () => {
  const bot = await createHarness({ seasonResult: { ok: true, body: { legacyReply: V1_MULTI_ROUND_STATUS } } });
  bot.respond("내전현황");
  assert.deepEqual(bot.seasonCalls.map((call) => call.command), [{
    action: "STATUS",
    seasonId: "123e4567-e89b-42d3-a456-426614174000",
    applyDate: "2026-09-09",
    recruitNo: null,
  }]);
  assert.deepEqual(bot.replies, [V1_MULTI_ROUND_STATUS]);
});

test("V1: 내전상세 번호는 참여자와 빈 칸을 포함한 편집 가능한 전체 양식을 정확히 보낸다", async () => {
  const bot = await createHarness({ seasonResult: { ok: true, body: { legacyReply: V1_DETAIL } } });
  bot.respond("내전상세 2");
  assert.deepEqual(bot.seasonCalls.map((call) => call.command), [{
    action: "STATUS",
    seasonId: "123e4567-e89b-42d3-a456-426614174000",
    applyDate: "2026-09-09",
    recruitNo: 2,
  }]);
  assert.deepEqual(bot.replies, [V1_DETAIL]);
});

test("V1: 작성한 전체 신청 양식은 확인 단계 없이 한 번 동기화하고 서버 답변을 그대로 보낸다", async () => {
  const syncReply = "[K-LOL.GG 내전 #2 명단 업데이트]\n추가: 재현, 민서\n현재: 2/10";
  const bot = await createHarness({ seasonResult: { ok: true, body: { legacyReply: syncReply } } });
  bot.respond(V1_FILLED_FORM);
  assert.equal(bot.seasonCalls.length, 1);
  assert.equal(bot.seasonCalls[0].command.action, "SYNC");
  assert.equal(bot.seasonCalls[0].command.recruitNo, 2);
  assert.equal(bot.seasonCalls[0].command.mode, "RIFT");
  assert.deepEqual(bot.seasonCalls[0].command.participants.map(({ slotNo, name, mainPosition, subPositions }) => ({ slotNo, name, mainPosition, subPositions })), [
    { slotNo: 1, name: "재현", mainPosition: "ADC", subPositions: ["MID"] },
    { slotNo: 2, name: "민서", mainPosition: "MID", subPositions: ["SUP"] },
  ]);
  assert.deepEqual(bot.replies, [syncReply]);
});

test("V1: 같은 전체 신청 양식이 연속 수신되면 첫 반영 뒤 중복 요청과 중복 답변을 내지 않는다", async () => {
  const syncReply = "[K-LOL.GG 내전 #2 명단 업데이트]\n추가: 재현, 민서\n현재: 2/10";
  const bot = await createHarness({ seasonResult: { ok: true, body: { legacyReply: syncReply } } });
  bot.respond(V1_FILLED_FORM);
  bot.respond(V1_FILLED_FORM);
  assert.equal(bot.seasonCalls.length, 1);
  assert.deepEqual(bot.replies, [syncReply]);
});

test("V1: 빈 전체 양식은 일반·ASCII slash·전각 slash 모두 0명 authoritative sync로 처리한다", async () => {
  const empty = v1Template({ mode: "협곡", participants: [] });
  for (const message of [empty, `/${empty}`, `／${empty}`]) {
    const bot = await createHarness();
    bot.respond(message);
    assert.equal(bot.seasonCalls.length, 1, message.slice(0, 2));
    assert.deepEqual(bot.seasonCalls[0].command, {
      action: "SYNC",
      seasonId: "123e4567-e89b-42d3-a456-426614174000",
      applyDate: "2026-09-09",
      recruitNo: 1,
      mode: "RIFT",
      participants: [],
    });
  }
});

test("V1: 불완전한 빈 양식과 double·URL·중간 slash는 authoritative sync를 실행하지 않는다", async () => {
  const empty = v1Template({ mode: "협곡", participants: [] });
  const malformed = empty.split("\n").filter((line) => line !== "10.").join("\n");
  for (const message of [malformed, `//${empty}`, `https://example.invalid/${empty}`, `📢 /${empty.slice(2)}`]) {
    const bot = await createHarness();
    bot.respond(message);
    assert.equal(bot.seasonCalls.length, 0, message.slice(0, 24));
  }
});

test("외출 필수값 누락은 항목별 안내만 보내고 서버 제출을 실행하지 않는다", async () => {
  const bot = await createHarness();
  bot.respond("&lt;외출&gt;\n1. 이름 및 닉네임: 신청자/닉\n2. 외출기간:\n3. 외출사유:\n4. 외출범위:");
  assert.deepEqual(bot.replies, ["[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: 외출기간, 외출사유, 외출범위"]);
  assert.equal(bot.operationCalls.length, 0);
});

test("오류 제목이 이미 포함된 서버 상세는 K-LOL.GG 요청 실패 제목을 중복하지 않는다", async () => {
  const expected = "[K-LOL.GG 요청 실패]\n서명과 발신 설정을 확인해 주세요.";
  const bot = await createHarness({ seasonResult: { ok: false, body: { detail: expected } } });
  bot.respond("내전현황 #1");
  assert.deepEqual(bot.replies, [expected]);
});
