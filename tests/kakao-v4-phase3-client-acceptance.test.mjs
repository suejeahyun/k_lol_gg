import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const directory = resolve(import.meta.dirname, "../integrations/messengerbot-r/v4");

async function harness(profile) {
  const calls = [];
  const replies = [];
  const context = vm.createContext({
    KLOL_V4: {
      shouldIgnore() { return false; },
      localReply() { return null; },
      send(profileId, text, sender, logId, userHash) {
        calls.push({ profileId, text, sender, logId, userHash });
        return { ok: true, body: { reply: `[${profileId}] ${text}` } };
      },
      resultReply(result) { return result.body.reply; },
    },
  });
  vm.runInContext(await readFile(resolve(directory, `KLOL_KAKAO_BOT_V4_${profile}.js`), "utf8"), context);
  return {
    calls,
    replies,
    respond(text, sender = "일반 사용자") {
      context.response("QA poison room", text, sender, true, { reply(value) { replies.push(String(value)); } }, null, "qa.package", false, "qa-log", "poison-channel", "qa-user-hash");
    },
  };
}

const INHOUSE_FORM = [
  "📢 내전하실분 #2", " 》협곡", " 》2026-09-09 21:30 시작", "👥 1/10명", "",
  "*참가 신청 양식*", "이름/현티어/최고티어/주라인/부라인", "EX) 1.지후/P/E/AD/MD", "",
  "1. 재현/P/E/AD/MD", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.",
].join("\n");
const SCRIM_FORM = [
  "[K-LOL.GG 스크림 구인 양식]", "", "운영일: 2026-09-09", "번호: #7", "", "일시: 9/9 21:00", "방식: 3판2선", "",
  "우리팀: 하늘단", "TOP: 탑", "JUG: 정글", "MID: 미드", "ADC: 원딜", "SUP: 서포터", "",
  "상대팀: 꽃잎단", "TOP: 상대탑", "JUG: 상대정글", "MID: 상대미드", "ADC: 상대원딜", "SUP: 상대서포터",
].join("\n");

const cases = [
  ["FEATURES", "내전구인"],
  ["FEATURES", "내전구인 협곡 2026-09-09 21:30 #2 10명"],
  ["FEATURES", "내전구인 칼바람 2026-09-09 21:30 #3 10명"],
  ["FEATURES", "내전구인 증바람 2026-09-09 21:30 #4 10명"],
  ["FEATURES", "내전현황"],
  ["FEATURES", "내전상세 2"],
  ["FEATURES", INHOUSE_FORM],
  ["RECRUIT", "스크림구인"],
  ["RECRUIT", SCRIM_FORM],
  ["FEATURES", "지인 이름: 친구\n지인 닉네임: Friend#KR1\n이용기간: 장기\n디스코드 닉네임 변경: 네"],
  ["FEATURES", "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 모바일 개선"],
  ["FEATURES", "주최자 이름 및 닉네임: 홍길동/테스터\n일자: 2026-09-12\n장소: 서울\n참여자 명단: 재현, 민서"],
  ["FEATURES", "이름 및 닉네임: 신청자/닉\n외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: 소통방"],
  ["FEATURES", "등록"],
  ["FEATURES", "내전등록"],
  ["FEATURES", "경고등록"],
  ["FEATURES", "인증"],
  ["FEATURES", "경고현황"],
  ["FEATURES", "결과현황"],
  ["FEATURES", "사진취소"],
  ["FEATURES", "자동공지 20"],
];

for (const [index, [profile, command]] of cases.entries()) {
  test(`[P3-C${String(index + 1).padStart(2, "0")}] ${profile} entry sends one request for ${command.split("\n")[0]}`, async () => {
    const bot = await harness(profile);
    bot.respond(command);
    assert.equal(bot.calls.length, 1, "one accepted command must cause exactly one client-to-server send");
    assert.equal(bot.calls[0].profileId, profile);
    assert.equal(bot.replies.length, 1);
  });
}
