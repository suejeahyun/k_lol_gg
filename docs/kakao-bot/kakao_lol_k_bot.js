/*
 * K-LOL.GG 카카오봇 - LOL - K 방 전용
 * 기능: 전적/최근/랭킹, 내전참가 안내, 내전현황 조회
 * 주의: 구인구직 명령어(/자랭구인, /3 ㅉ, /구인현황 등)는 이 파일에서 처리하지 않음
 */

var OPENCHAT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/openchat";
var SEASON_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply/status";

var NOTICE_ROOM = "LOL - K";
var NOTICE_ROOM_ALIASES = ["LOL - K", "K-LOL 전적검색", "롤 전적검색"];
var RECRUIT_ROOM_ALIASES = ["K롤방 구인구직방", "K-LOL 구인구직 도우미", "롤톡방 구인구직 도우미", "구인구직 도우미"];

var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = "";

  String(isGroupChat);
  String(imageDB);
  String(packageName);

  try {
    text = trimText(normalizeText(String(msg || "")));

    if (text == "방이름확인") {
      replier.reply(getRoomCheckText(room, sender));
      return;
    }

    if (!isNoticeRoom(room)) {
      return;
    }

    if (isRecruitRoom(room) || isRecruitOnlyCommand(text)) {
      return;
    }

    if (text == "도움말") {
      replier.reply(getHelpNotice());
      return;
    }

    if (text == "내전참가" || text == "참가신청") {
      replier.reply(getParticipationGuideNotice());
      return;
    }

    if (isSeasonRecruitStatusCommand(text)) {
      replier.reply(fetchSeasonRecruitStatusText(room, text, sender));
      return;
    }

    if (normalizeCommandText(text) == "AI공지") {
      replier.reply("[명령어 변경 안내]\nAI공지는 내전현황으로 변경되었습니다.\n앞으로는 내전현황을 입력해주세요.");
      return;
    }

    if (isSchedulerStatusCommand(text)) {
      replier.reply(getSchedulerStatusNotice());
      return;
    }

    if (isSchedulerTestCommand(text)) {
      replier.reply(getSchedulerTestNotice(room, sender));
      return;
    }

    if (!isOpenchatCommand(text)) {
      return;
    }

    sendOpenchatCommand(text, replier);
  } catch (e) {
    replier.reply("[LOL - K 봇 처리 오류]\n" + String(e));
  }
}

function isNoticeRoom(room) {
  return isInAliases(room, NOTICE_ROOM_ALIASES);
}

function isRecruitRoom(room) {
  return isInAliases(room, RECRUIT_ROOM_ALIASES);
}

function isInAliases(room, aliases) {
  var value = trimText(String(room || ""));
  var i = 0;

  for (i = 0; i < aliases.length; i++) {
    if (value == aliases[i]) return true;
  }

  return false;
}

function isRecruitOnlyCommand(text) {
  var normalized = normalizeCommandText(text);

  if (/^\/(칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|내전구인)(?:\s+\d{1,2})?\s*$/.test(text)) return true;
  if (/^\/\d{1,2}\s*(쫑|ㅉ)\s*$/.test(text)) return true;
  if (normalized == "구인구직현황" || normalized == "/구인구직현황" || normalized == "구인현황" || normalized == "/구인현황") return true;
  if (normalized == "구인도움말" || normalized == "/구인도움말") return true;
  if (normalized == "신청초기화" || normalized == "오늘내전초기화") return true;
  if (normalized == "/내전구인구직" || normalized == "내전구인구직") return true;

  return false;
}

function isSeasonRecruitStatusCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "내전현황" || normalized == "/내전현황" || normalized == "시즌내전현황" || normalized == "/시즌내전현황";
}

function isSchedulerStatusCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "공지상태" || normalized == "/공지상태" || normalized == "자동공지상태" || normalized == "/자동공지상태";
}

function isSchedulerTestCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "공지테스트" || normalized == "/공지테스트" || normalized == "자동공지테스트" || normalized == "/자동공지테스트";
}

function isOpenchatCommand(text) {
  if (text == "랭킹") return true;
  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("최근 ") == 0) return true;
  return false;
}

function fetchSeasonRecruitStatusText(room, text, sender) {
  var body = "";
  var data = null;
  var resultText = "";

  try {
    body = "{";
    body = body + "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body = body + "\"room\":\"" + escapeJson(room) + "\",";
    body = body + "\"sender\":\"" + escapeJson(sender) + "\",";
    body = body + "\"message\":\"" + escapeJson(text) + "\"";
    body = body + "}";

    resultText = httpPostText(SEASON_RECRUIT_STATUS_API_URL, body, 20000);
    data = safeJsonParse(resultText);

    if (!data || !data.ok) {
      return "[내전현황]\n현황을 불러오지 못했습니다.\n" + trimLong(resultText, 500);
    }

    if (data.empty) {
      return "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
    }

    return String(data.reply || "[내전현황]\n현황 응답이 비어 있습니다.");
  } catch (e) {
    return "[내전현황 API 오류]\n" + String(e);
  }
}

function sendOpenchatCommand(text, replier) {
  var body = "";
  var resultText = "";
  var data = null;

  try {
    body = "{\"message\":\"" + escapeJson(text) + "\"}";
    resultText = httpPostText(OPENCHAT_API_URL, body, 15000);
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      return;
    }

    replier.reply("[전적/명령어 서버 응답 확인 필요]\n" + trimLong(resultText, 700));
  } catch (e) {
    replier.reply("[전적/명령어 처리 오류]\n" + String(e));
  }
}

function getRoomCheckText(room, sender) {
  return [
    "[방 이름 확인]",
    "실제 수신 room: " + room,
    "보낸 사람: " + sender,
    "공지방 인식: " + String(isNoticeRoom(room)),
    "구인구직방 인식: " + String(isRecruitRoom(room)),
    "NOTICE_ROOM: " + NOTICE_ROOM,
  ].join("\n");
}

function getSchedulerStatusNotice() {
  return [
    "[K-LOL.GG LOL - K 봇 상태]",
    "담당 방: LOL - K",
    "명령어: 도움말 / 내전현황 / 내전참가 / 참가신청 / 전적 / 최근 / 랭킹",
    "구인구직 명령어: 이 방에서는 무시",
    "변경사항: AI공지 명령어는 내전현황으로 대체",
  ].join("\n");
}

function getSchedulerTestNotice(room, sender) {
  return [
    "[K-LOL.GG 수동 공지 테스트]",
    "1) 내전현황 미리보기",
    fetchSeasonRecruitStatusText(room, "내전현황", sender),
    "",
    "2) 참가 방법 안내",
    getParticipationGuideNotice(),
  ].join("\n");
}

function getParticipationGuideNotice() {
  return [
    "[K-LOL.GG 내전 참가 방법 안내]",
    "오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.",
    "",
    "1. K-LOL.GG 접속",
    "https://k-lol-gg.vercel.app",
    "2. 로그인",
    "3. 시즌내전 참가하기 클릭",
    "4. 주 포지션 / 부 포지션 선택",
    "5. 참가 신청 완료",
    "",
    "참가 신청 기준으로 팀 밸런스가 진행됩니다.",
  ].join("\n");
}

function getHelpNotice() {
  return [
    "[K-LOL.GG LOL - K 도움말]",
    "",
    "- 도움말: 명령어 확인",
    "- 방이름확인: 현재 방 인식 확인",
    "- 내전현황: 오늘 시즌내전 신청 현황 조회",
    "- 내전참가 / 참가신청: 참가 방법 안내",
    "- 전적 닉네임#태그: 전적 조회",
    "- 최근 닉네임#태그: 최근 경기 조회",
    "- 랭킹: 랭킹 조회",
    "- 공지상태: 봇 상태 확인",
    "",
    "구인구직 명령어는 K롤방 구인구직방 전용입니다.",
  ].join("\n");
}

function httpPostText(url, body, timeoutMs) {
  var response = org.jsoup.Jsoup.connect(url)
    .ignoreContentType(true)
    .ignoreHttpErrors(true)
    .header("Content-Type", "application/json; charset=utf-8")
    .timeout(timeoutMs)
    .requestBody(body)
    .method(org.jsoup.Connection.Method.POST)
    .execute();

  if (response.statusCode() < 200 || response.statusCode() >= 300) {
    return "{\"ok\":false,\"reply\":\"HTTP " + response.statusCode() + "\",\"raw\":\"" + escapeJson(response.body()) + "\"}";
  }

  return response.body();
}

function safeJsonParse(text) {
  try { return JSON.parse(String(text || "")); } catch (e) { return null; }
}

function trimText(text) {
  return String(text || "").replace(/^\s+/, "").replace(/\s+$/, "");
}

function normalizeCommandText(text) {
  return trimText(normalizeText(String(text || ""))).replace(/\s+/g, "");
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/／/g, "/")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9")
    .replace(/\n{3,}/g, "\n\n");
}

function escapeJson(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function trimLong(text, maxLength) {
  text = String(text || "");
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

response.__kakaoBotEntryPoint = true;
