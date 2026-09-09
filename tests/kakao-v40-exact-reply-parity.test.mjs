import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const integrationDirectory = resolve(import.meta.dirname, "../integrations/messengerbot-r");
const compatibilityPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V1_COMPAT.js");
const routerPath = resolve(integrationDirectory, "KLOL_KAKAO_BOT_V41_V2_ROUTER.js");

const V40_RECRUIT_HELP = [
  "[K-LOL.GG 구인 도움말]",
  "",
  "1. 파티",
  "생성: 5인파티",
  "현황: 구인현황",
  "종료: 번호ㅉ",
  "",
  "2. 내전",
  "생성: 내전구인",
  "현황: 내전현황",
  "매일 오전 6시 자동 종료",
  "",
  "3. 스크림",
  "생성: 스크림구인",
  "현황: 스크림현황",
  "매일 오전 6시 자동 종료",
  "",
  "공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송",
].join("\n");

const V40_FIVE_PERSON_TEMPLATE = [
  "[K-LOL.GG 구인구직 양식]",
  "같이 할사람~",
  "",
  "아래 양식의 모집번호는 유지해서 작성해주세요.",
  "",
  "📢 5인 파티 구인",
  "모집번호: #12",
  "",
  "1.",
  "2.",
  "3.",
  "4.",
  "5.",
  "예비 1.",
  "",
  "참여해주실 분은 태그해주세요.",
  "*상호배려와 존중 부탁드립니다.",
].join("\n");

const V40_STATUS_REPLY = [
  "[K-LOL.GG 구인구직 현황]",
  "🔎 전체 명단: 상세 번호",
  "",
  "[구인중]",
  "#12 · 5인 파티 · 3/5 · 21:00 · 자랭 5인큐 9시 출발",
  "참여: 재현, 민서, 주현",
  "└ 상세 12",
].join("\n");

const partyFixture = {
  id: "party-12",
  revision: 0,
  recruitDate: "2026-09-09",
  recruitNumber: 12,
  type: "PARTY_NUMBER",
  title: "5인 파티 구인",
  status: "IN_PROGRESS",
  memberCount: 3,
  reserveCount: 0,
  maximumMembers: 5,
  scheduledStartAt: null,
  startTimeText: "21:00",
  note: "자랭 5인큐 9시 출발",
  members: [
    { name: "재현", slotNo: 1, position: null, substitute: false },
    { name: "민서", slotNo: 2, position: null, substitute: false },
    { name: "주현", slotNo: 3, position: null, substitute: false },
  ],
};

async function createHarness({ parties = [] } = {}) {
  const [compatibility, router] = await Promise.all([
    readFile(compatibilityPath, "utf8"),
    readFile(routerPath, "utf8"),
  ]);
  const replies = [];
  const values = new Map();
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
      userMessage(result) { return result?.ok ? "[K-LOL.GG]\n요청을 처리했습니다." : "[K-LOL.GG 요청 실패]\n테스트 실패"; },
      openchatStatus() {
        return {
          ok: true,
          body: {
            nextPartyRecruitNumber: 12,
            nextPartyResetSequence: 0,
            nextScrimNumber: 1,
            parties: structuredClone(parties),
            scrims: [],
          },
        };
      },
      recruit(command) {
        const recruitNumber = command.payload.recruitNumber ?? 12;
        return {
          ok: true,
          body: {
            aggregateKind: "PARTY",
            aggregateId: command.aggregateId,
            revision: 0,
            status: "IN_PROGRESS",
            commandType: command.type,
            data: {
              id: command.aggregateId,
              recruitNumber,
              title: command.payload.title,
              type: command.payload.partyType,
              maximumMembers: command.payload.maximumMembers,
              memberCount: 0,
              reserveCount: 0,
              members: [],
            },
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
  new vm.Script(`${compatibility}\n${router}`, { filename: "KLOL_V41_V40_PARITY_TEST.js" }).runInContext(context);
  const replier = { reply(value) { replies.push(String(value)); } };
  const respond = (message) => context.response(
    "K롤방 구인구직방",
    message,
    "사용자",
    true,
    replier,
    null,
    "com.xfl.msgbot",
  );
  return { context, replies, respond };
}

test("V40 구인도움말 문구와 줄바꿈을 그대로 유지한다", async () => {
  const bot = await createHarness();
  bot.respond("구인도움말");
  assert.equal(bot.replies.length, 1);
  assert.equal(bot.replies[0], V40_RECRUIT_HELP);
});

test("V40 5인파티 생성 응답에 모집번호가 있는 편집 가능한 전체 양식을 유지한다", async () => {
  const bot = await createHarness();
  bot.respond("5인파티");
  assert.equal(bot.replies.length, 1);
  assert.equal(bot.replies[0], V40_FIVE_PERSON_TEMPLATE);
});

test("V40 구인현황 제목과 상세 명령 CTA를 포함한 정확한 응답을 유지한다", async () => {
  const bot = await createHarness({ parties: [partyFixture] });
  bot.respond("구인현황");
  assert.equal(bot.replies.length, 1);
  assert.equal(bot.replies[0], V40_STATUS_REPLY);
});

test("V40 bare 멸망전스크림 입력을 스크림 명령으로 분류한다", async () => {
  const bot = await createHarness();
  const parsed = bot.context.KLOL_V41_V1_COMPAT.classifyMessage("멸망전스크림", "사용자", "2026-09-09");
  assert.equal(parsed?.domain, "SCRIM");
});
