var OPENCHAT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/openchat";
var NOTICE_API_BASE_URL = "https://k-lol-gg.vercel.app/api/kakao/scheduled-notice";
var RECRUIT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply";
var SEASON_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply/status";
var PARTY_RECRUIT_CREATE_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/create";
var PARTY_RECRUIT_SYNC_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/sync";
var PARTY_RECRUIT_FINISH_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/finish";
var PARTY_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/status";

var NOTICE_ROOM = "LOL - K";
var RECRUIT_SOURCE_ROOM = "K롤방 구인구직방";

/*
 * 카카오봇 환경에 따라 room 값이 실제 오픈채팅방 이름이 아니라
 * 봇 프로필명/대화 상대명으로 들어오는 경우가 있습니다.
 * 정확한 LOL - K 방에서는 구인구직 명령어를 차단하고,
 * 구인구직방/구인구직 봇 별칭에서는 구인구직 명령어를 처리합니다.
 */
var NOTICE_ROOM_ALIASES = ["LOL - K", "K-LOL 전적검색", "롤 전적검색"];
var RECRUIT_ROOM_ALIASES = ["K롤방 구인구직방", "K-LOL 구인구직 도우미", "롤톡방 구인구직 도우미", "구인구직 도우미"];

var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";

var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH";
var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH";

var lastRecruitHash = "";
var lastPartyRecruitHash = "";


function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = "";

  String(isGroupChat);
  String(imageDB);
  String(packageName);

  try {
    text = normalizeRecruitBotText(String(msg || ""));
    text = trimText(text);

    if (isSchedulerStatusCommand(text)) {
      replier.reply(getSchedulerStatusNotice());
      return;
    }


    if (isSchedulerTestCommand(text)) {
      replier.reply(getSchedulerTestNotice());
      return;
    }

    if (isSchedulerRoomTestCommand(text)) {
      sendSchedulerRoomTest(replier);
      return;
    }

    if (text == "방이름확인") {
      replier.reply(
        "[방 이름 확인]\n" +
        "실제 수신 room: " + room + "\n" +
        "보낸 사람: " + sender + "\n" +
        "표시/등록 room: " + RECRUIT_SOURCE_ROOM + "\n" +
        "NOTICE_ROOM: " + NOTICE_ROOM + "\n" +
        "공지방 인식: " + String(isNoticeRoom(room)) + "\n" +
        "구인구직방 인식: " + String(isRecruitRoom(room))
      );
      return;
    }

    if (isNoticeRoom(room)) {
      handleNoticeRoomCommand(text, sender, replier);
      return;
    }

    if (isRecruitRoom(room)) {
      handleRecruitRoomCommand(text, sender, replier);
      return;
    }

    /*
     * room 값이 예상과 다르게 들어오는 경우를 위한 안전 라우팅입니다.
     * 단, 실제 LOL - K 이름으로 들어온 방에서는 위에서 이미 notice 전용 처리되므로
     * /1 ㅉ 같은 구인구직 명령어가 동작하지 않습니다.
     */
    if (isRecruitOnlyCommandOrMessage(text)) {
      handleRecruitRoomCommand(text, sender, replier);
      return;
    }

    if (isNoticeOnlyCommand(text)) {
      handleNoticeRoomCommand(text, sender, replier);
      return;
    }

    return;
  } catch (e) {
    replier.reply("[봇 처리 오류]\n" + String(e));
  }
}

function isSameRoomName(room, target) {
  return trimText(String(room || "")) == trimText(String(target || ""));
}

function isInRoomAliases(room, aliases) {
  var i = 0;
  var value = trimText(String(room || ""));

  for (i = 0; i < aliases.length; i++) {
    if (value == aliases[i]) {
      return true;
    }
  }

  return false;
}

function isNoticeRoom(room) {
  return isSameRoomName(room, NOTICE_ROOM) || isInRoomAliases(room, NOTICE_ROOM_ALIASES);
}

function isRecruitRoom(room) {
  return isSameRoomName(room, RECRUIT_SOURCE_ROOM) || isInRoomAliases(room, RECRUIT_ROOM_ALIASES);
}

function isRecruitOnlyCommandOrMessage(text) {
  if (text == "신청초기화") return true;
  if (normalizeCommandText(text) == "오늘내전초기화") return true;
  if (isSeasonRecruitTemplateCommand(text)) return true;
  if (isPartyRecruitHelpCommand(text)) return true;
  if (isPartyRecruitStatusCommand(text)) return true;
  if (isPartyRecruitCreateCommand(text)) return true;
  if (isPartyRecruitFinishCommand(text)) return true;
  if (isPartyRecruitFormMessage(text)) return true;
  if (isPartyRecruitFormWithoutNumber(text)) return true;
  if (isRecruitMessage(text)) return true;
  return false;
}

function isNoticeOnlyCommand(text) {
  if (text == "도움말") return true;
  if (text == "내전참가" || text == "참가신청") return true;
  if (text == "AI공지") return true;
  if (isSeasonRecruitStatusCommand(text)) return true;
  if (isSchedulerStatusCommand(text)) return true;
  if (isSchedulerTestCommand(text)) return true;
  if (isSchedulerRoomTestCommand(text)) return true;
  if (text == "랭킹") return true;
  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("최근 ") == 0) return true;
  if (text.indexOf("AI공지 ") == 0) return true;
  if (text.indexOf("자동공지 ") == 0) return true;
  if (text.indexOf("공지생성 ") == 0) return true;
  return false;
}

function handleRecruitRoomCommand(text, sender, replier) {
  if (text == "신청초기화") {
      lastRecruitHash = "";
      DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
      replier.reply("[신청 인식 초기화 완료]\n같은 신청글을 다시 처리할 수 있습니다.");
      return;
    }

    if (normalizeCommandText(text) == "오늘내전초기화") {
      handleTodaySeasonApplyReset(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }

    if (isSeasonRecruitTemplateCommand(text)) {
      replier.reply(getSeasonRecruitTemplateNotice());
      return;
    }

    if (isSeasonRecruitStatusCommand(text)) {
      handleSeasonRecruitStatus(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }

    /*
     * 구인구직 파티 기능
     *
     * 핵심 정책:
     * - /자랭구인 처럼 번호 없는 생성 명령어는 서버가 모집번호를 자동 생성
     * - TOP/JUG/MID/ADC/SUP 양식 또는 1~5 번호 양식은 모집번호가 있어야 현황 반영
     * - LOL - K 방에서는 구인구직 명령어가 동작하지 않도록 방을 분리
     */

    if (isPartyRecruitFormWithoutNumber(text)) {
      return;
    }

    if (isPartyRecruitHelpCommand(text)) {
      replier.reply(getPartyRecruitHelpNotice());
      return;
    }

    if (isPartyRecruitStatusCommand(text)) {
      replier.reply(fetchPartyRecruitStatusText(false));
      return;
    }

    if (isPartyRecruitCreateCommand(text)) {
      handlePartyRecruitApi(
        PARTY_RECRUIT_CREATE_API_URL,
        RECRUIT_SOURCE_ROOM,
        text,
        sender,
        replier,
        "구인구직 생성"
      );
      return;
    }

    if (isPartyRecruitFinishCommand(text)) {
      handlePartyRecruitApi(
        PARTY_RECRUIT_FINISH_API_URL,
        RECRUIT_SOURCE_ROOM,
        text,
        sender,
        replier,
        "구인구직 마무리"
      );
      return;
    }

    if (isPartyRecruitFormMessage(text)) {
      handlePartyRecruitSync(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }

  if (text == "도움말") {
    replier.reply(getRecruitRoomHelpNotice());
    return;
  }

  if (isRecruitMessage(text)) {
    handleRecruitMessage(RECRUIT_SOURCE_ROOM, text, sender, replier);
    return;
  }
}

function handleNoticeRoomCommand(text, sender, replier) {
  var noticeText = "";

  if (
    isPartyRecruitHelpCommand(text) ||
    isPartyRecruitStatusCommand(text) ||
    isPartyRecruitCreateCommand(text) ||
    isPartyRecruitFinishCommand(text) ||
    isPartyRecruitFormMessage(text)
  ) {
    return;
  }

  if (text == "도움말") {
    replier.reply(getHelpNotice());
    return;
  }

  if (text == "내전참가" || text == "참가신청") {
      replier.reply(getParticipationGuideNotice("manual"));
      return;
    }

    if (text == "AI공지" || isSeasonRecruitStatusCommand(text)) {
      noticeText = fetchSeasonRecruitStatusText(RECRUIT_SOURCE_ROOM, text, sender);

      if (noticeText == "__NO_SEASON_RECRUIT_STATUS__" || noticeText == "") {
        noticeText = "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
      }

      replier.reply(noticeText);
      return;
    }

    if (!isCommand(text)) {
      return;
    }

    sendOpenchatCommand(text, replier);
}

function sendOpenchatCommand(text, replier) {
  var body = "";
  var response = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;

  try {
    body = "{\"message\":\"" + escapeJson(text) + "\"}";

    response = org.jsoup.Jsoup.connect(OPENCHAT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .requestBody(body)
      .timeout(15000)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    statusCode = response.statusCode();
    resultText = response.body();

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[전적/명령어 서버 오류]\n" +
        "상태코드: " + statusCode + "\n" +
        "명령어: " + text + "\n" +
        "응답: " + String(resultText || "응답 없음")
      );
      return;
    }

    data = JSON.parse(resultText);

    if (data && data.reply) {
      replier.reply(data.reply);
      return;
    }

    replier.reply("[서버 응답 확인 필요]\n" + resultText);
  } catch (e) {
    replier.reply("[전적/명령어 처리 오류]\n" + String(e));
  }
}

/* =========================================================
 * 시즌내전 현황 / 구인구직 양식
 * ========================================================= */

function isSeasonRecruitTemplateCommand(text) {
  text = normalizeCommandText(text);

  return text == "/내전구인구직" ||
    text == "내전구인구직";
}

function isSeasonRecruitStatusCommand(text) {
  text = normalizeCommandText(text);

  return text == "내전현황" ||
    text == "/내전현황" ||
    text == "시즌내전현황" ||
    text == "/시즌내전현황";
}

function getSeasonRecruitTemplateNotice() {
  var n = "\n";
  var now = new Date();
  var dateText = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
  var text = "";

  text = "📢 협곡내전하실분" + n;
  text = text + " 》" + dateText + n + n;
  text = text + "*참가 신청 양식*" + n;
  text = text + "이름/현티어/최고티어/주,부라인" + n;
  text = text + "EX) 1.지후/P/E/AD,MD" + n + n;
  text = text + "1." + n;
  text = text + "2." + n;
  text = text + "3." + n;
  text = text + "4." + n;
  text = text + "5." + n;
  text = text + "6." + n;
  text = text + "7." + n;
  text = text + "8." + n;
  text = text + "9." + n;
  text = text + "10.";

  return text;
}

function handleSeasonRecruitStatus(room, text, sender, replier) {
  var reply = fetchSeasonRecruitStatusText(room, text, sender);

  if (reply == "__NO_SEASON_RECRUIT_STATUS__") {
    return;
  }

  replier.reply(reply);
}

function fetchSeasonRecruitStatusText(room, text, sender) {
  var body = "";
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body = body + "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body = body + "\"room\":\"" + escapeJson(room) + "\",";
    body = body + "\"sender\":\"" + escapeJson(sender) + "\",";
    body = body + "\"message\":\"" + escapeJson(text) + "\"";
    body = body + "}";

    resultText = org.jsoup.Jsoup.connect(SEASON_RECRUIT_STATUS_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .post()
      .text();

    data = JSON.parse(resultText);

    if (!data || !data.ok) {
      return "[내전현황]\n현황을 불러오지 못했습니다.\n" + resultText;
    }

    if (data.empty) {
      return "__NO_SEASON_RECRUIT_STATUS__";
    }

    if (data.reply && String(data.reply) != "") {
      return String(data.reply);
    }

    return "[내전현황]\n현황 응답이 비어 있습니다.";
  } catch (e) {
    return "[내전현황 API 오류]\n" + String(e);
  }
}

/* =========================================================
 * 시즌내전 참가 신청 자동 등록
 * ========================================================= */

function handleRecruitMessage(room, text, sender, replier) {
  var hash = "";
  var saved = "";
  var body = "";
  var resultText = "";
  var data = null;

  try {
    text = normalizeRecruitBotText(text);
    hash = makeHash(text);

    if (lastRecruitHash == hash) {
      return;
    }

    saved = DataBase.getDataBase(RECRUIT_SAVE_KEY);

    if (saved == hash) {
      lastRecruitHash = hash;
      return;
    }

    body = "{";
    body = body + "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body = body + "\"room\":\"" + escapeJson(room) + "\",";
    body = body + "\"sender\":\"" + escapeJson(sender) + "\",";
    body = body + "\"syncRemoved\":true,";
    body = body + "\"createMissingPlayers\":true,";
    body = body + "\"message\":\"" + escapeJson(text) + "\"";
    body = body + "}";

    resultText = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .post()
      .text();

    data = JSON.parse(resultText);

    if (data && data.reply) {
      replier.reply(data.reply);
    } else {
      replier.reply("[참가 신청 등록 서버 응답 확인 필요]\n" + resultText);
    }

    lastRecruitHash = hash;
    DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
  } catch (e) {
    replier.reply("[참가 신청 등록 API 오류]\n" + String(e));
  }
}

function handleTodaySeasonApplyReset(room, text, sender, replier) {
  var body = "";
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body = body + "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body = body + "\"room\":\"" + escapeJson(room) + "\",";
    body = body + "\"sender\":\"" + escapeJson(sender) + "\",";
    body = body + "\"message\":\"" + escapeJson(text) + "\"";
    body = body + "}";

    resultText = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .post()
      .text();

    data = JSON.parse(resultText);

    if (data && data.reply) {
      replier.reply(data.reply);

      lastRecruitHash = "";
      DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
      return;
    }

    replier.reply("[오늘 내전 초기화 서버 응답 확인 필요]\n" + resultText);
  } catch (e) {
    replier.reply("[오늘 내전 초기화 API 오류]\n" + String(e));
  }
}

function isRecruitMessage(text) {
  var filledCount = 0;

  text = normalizeRecruitBotText(text);

  if (!hasRecruitSlash(text)) {
    return false;
  }

  filledCount = countFilledRecruitLines(text);

  if (filledCount < 1) {
    return false;
  }

  if (hasRecruitForm(text)) {
    return true;
  }

  if (hasRecruitWord(text)) {
    return true;
  }

  return false;
}

function hasRecruitSlash(text) {
  text = normalizeRecruitBotText(text);

  if (text.indexOf("/") >= 0) {
    return true;
  }

  return false;
}

function hasRecruitWord(text) {
  text = String(text || "");

  if (text.indexOf("내전") >= 0) return true;
  if (text.indexOf("참가") >= 0) return true;
  if (text.indexOf("신청") >= 0) return true;
  if (text.indexOf("협곡") >= 0) return true;
  if (text.indexOf("구인") >= 0) return true;
  if (text.indexOf("게임 시작") >= 0) return true;
  if (text.indexOf("현티어") >= 0) return true;
  if (text.indexOf("최고티어") >= 0) return true;

  return false;
}

function hasRecruitForm(text) {
  text = String(text || "");

  if (text.indexOf("이름/현티어/최고티어") >= 0) return true;
  if (text.indexOf("현티어") >= 0 && text.indexOf("최고티어") >= 0) return true;
  if (text.indexOf("주,부라인") >= 0) return true;
  if (text.indexOf("주/부라인") >= 0) return true;
  if (text.indexOf("주라인") >= 0 && text.indexOf("부라인") >= 0) return true;

  return false;
}

function countFilledRecruitLines(text) {
  var lines = [];
  var count = 0;
  var i = 0;
  var line = "";
  var body = "";
  var parts = [];
  var name = "";
  var currentTier = "";
  var peakTier = "";
  var positionText = "";

  text = normalizeRecruitBotText(text);
  lines = text.split("\n");

  for (i = 0; i < lines.length; i++) {
    line = trimText(String(lines[i] || ""));

    if (isRecruitExampleLine(line)) {
      continue;
    }

    if (!/^\d{1,2}\s*[.)]/.test(line)) {
      continue;
    }

    body = line.replace(/^\d{1,2}\s*[.)]\s*/, "");
    body = trimText(body);

    if (body == "") {
      continue;
    }

    if (body.indexOf("/") < 0) {
      continue;
    }

    parts = body.split("/");

    if (parts.length < 4) {
      continue;
    }

    name = trimText(String(parts[0] || ""));
    currentTier = trimText(String(parts[1] || ""));
    peakTier = trimText(String(parts[2] || ""));
    positionText = trimText(String(parts.slice(3).join("/") || ""));

    if (name == "") continue;
    if (currentTier == "") continue;
    if (peakTier == "") continue;
    if (positionText == "") continue;

    if (isBadRecruitName(name)) {
      continue;
    }

    count++;
  }

  return count;
}

function isBadRecruitName(name) {
  name = String(name || "");
  name = trimText(name);

  if (name == "") return true;
  if (name.indexOf("이름") >= 0) return true;
  if (name.indexOf("EX") >= 0) return true;
  if (name.indexOf("ex") >= 0) return true;
  if (name.indexOf("예시") >= 0) return true;

  return false;
}

function isRecruitExampleLine(line) {
  line = String(line || "");
  line = trimText(line);

  if (line.indexOf("EX)") >= 0) return true;
  if (line.indexOf("EX.") >= 0) return true;
  if (line.indexOf("EX ") >= 0) return true;
  if (line.indexOf("ex)") >= 0) return true;
  if (line.indexOf("ex.") >= 0) return true;
  if (line.indexOf("ex ") >= 0) return true;
  if (line.indexOf("예시") >= 0) return true;
  if (line.indexOf("양식") >= 0) return true;
  if (line.indexOf("참가 신청 양식") >= 0) return true;
  if (line.indexOf("이름/현티어/최고티어") >= 0) return true;

  return false;
}

/* =========================================================
 * 구인구직 파티 기능
 * ========================================================= */

function isPartyRecruitHelpCommand(text) {
  text = normalizeCommandText(text);
  return text == "구인구직도움말" || text == "/구인도움말" || text == "구인도움말";
}

function isPartyRecruitStatusCommand(text) {
  text = normalizeCommandText(text);

  return text == "현재구인구직현황" ||
    text == "구인구직현황" ||
    text == "/구인구직현황" ||
    text == "/구인현황" ||
    text == "구인현황";
}

function isPartyRecruitCreateCommand(text) {
  text = trimText(normalizeRecruitBotText(text));

  return /^\/(칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|내전구인)(?:\s+\d{1,2})?\s*$/.test(text);
}


function isPartyRecruitFinishCommand(text) {
  text = trimText(normalizeRecruitBotText(text));

  return /^\/\d{1,2}\s*(쫑|ㅉ)\s*$/.test(text);
}

function hasPartyRecruitNumber(text) {
  text = normalizeRecruitBotText(String(text || ""));

  if (/모집번호\s*[:：]?\s*#?\s*\d{1,2}/.test(text)) {
    return true;
  }

  if (/(^|\s)#\s*\d{1,2}(\s|$)/.test(text)) {
    return true;
  }

  return false;
}

function isPartyRecruitFormWithoutNumber(text) {
  text = normalizeRecruitBotText(String(text || ""));
  text = trimText(text);

  if (text == "") {
    return false;
  }

  if (hasPartyRecruitNumber(text)) {
    return false;
  }

  if (
    text.indexOf("TOP.") >= 0 &&
    text.indexOf("JUG.") >= 0 &&
    text.indexOf("MID.") >= 0 &&
    text.indexOf("ADC.") >= 0 &&
    text.indexOf("SUP.") >= 0
  ) {
    return true;
  }

  if (
    text.indexOf("1.") >= 0 &&
    text.indexOf("2.") >= 0 &&
    text.indexOf("3.") >= 0 &&
    text.indexOf("4.") >= 0 &&
    text.indexOf("5.") >= 0
  ) {
    return true;
  }

  if (text.indexOf("자랭 하실분") >= 0) return true;
  if (text.indexOf("일반 하실분") >= 0) return true;
  if (text.indexOf("솔랭하실분") >= 0) return true;
  if (text.indexOf("솔랭 하실분") >= 0) return true;
  if (text.indexOf("칼바람 하실분") >= 0) return true;
  if (text.indexOf("기타게임 하실분") >= 0) return true;

  return false;
}

function isPartyRecruitFormMessage(text) {
  text = normalizeRecruitBotText(text);

  if (!hasPartyRecruitNumber(text)) {
    return false;
  }

  if (/(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]?/i.test(text)) {
    return true;
  }

  if (/(^|\n)\s*\d{1,2}\s*[.)]?/.test(text)) {
    return true;
  }

  return false;
}

function handlePartyRecruitApi(apiUrl, room, text, sender, replier, label) {
  var body = "";
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body = body + "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body = body + "\"room\":\"" + escapeJson(room) + "\",";
    body = body + "\"sender\":\"" + escapeJson(sender) + "\",";
    body = body + "\"message\":\"" + escapeJson(text) + "\"";
    body = body + "}";

    resultText = org.jsoup.Jsoup.connect(apiUrl)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .post()
      .text();

    data = JSON.parse(resultText);

    if (data && data.reply) {
      replier.reply(data.reply);
      return;
    }

    replier.reply("[" + label + " 서버 응답 확인 필요]\n" + resultText);
  } catch (e) {
    replier.reply("[" + label + " API 오류]\n" + String(e));
  }
}

function handlePartyRecruitSync(room, text, sender, replier) {
  var hash = "";
  var saved = "";

  try {
    text = normalizeRecruitBotText(text);
    hash = makeHash("party-sync:" + text);

    if (lastPartyRecruitHash == hash) {
      return;
    }

    saved = DataBase.getDataBase(PARTY_RECRUIT_SAVE_KEY);
    if (saved == hash) {
      lastPartyRecruitHash = hash;
      return;
    }

    handlePartyRecruitApi(PARTY_RECRUIT_SYNC_API_URL, room, text, sender, replier, "구인구직 현황 반영");

    lastPartyRecruitHash = hash;
    DataBase.setDataBase(PARTY_RECRUIT_SAVE_KEY, hash);
  } catch (e) {
    replier.reply("[구인구직 현황 반영 오류]\n" + String(e));
  }
}

function fetchPartyRecruitStatusText(silentWhenEmpty) {
  var resultText = "";
  var data = null;

  try {
    resultText = org.jsoup.Jsoup.connect(PARTY_RECRUIT_STATUS_API_URL)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(15000)
      .get()
      .text();

    data = JSON.parse(resultText);

    if (!data || !data.ok) {
      return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.";
    }

    if (data.empty && silentWhenEmpty) {
      return "__NO_ACTIVE_PARTY_RECRUIT__";
    }

    return String(data.reply || "");
  } catch (e) {
    return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n" + String(e);
  }
}


function getPartyRecruitHelpNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 구인구직 도움말]" + n + n;
  text = text + "생성" + n;
  text = text + "- /칼바람구인" + n;
  text = text + "- /증바람구인" + n;
  text = text + "- /솔랭구인" + n;
  text = text + "- /자랭구인" + n;
  text = text + "- /일반구인" + n;
  text = text + "- /기타게임구인" + n;
  text = text + "- /내전구인" + n + n;
  text = text + "번호" + n;
  text = text + "- 모집번호는 서버에서 순차적으로 자동 생성됩니다." + n;
  text = text + "- 필요한 경우 /자랭구인 12처럼 직접 번호 지정도 가능합니다." + n + n;
  text = text + "반영" + n;
  text = text + "- 모집번호가 포함된 양식에 이름을 채운 뒤 다시 올리면 자동 반영됩니다." + n;
  text = text + "- 이름을 지우고 다시 올리면 해당 자리가 비워집니다." + n + n;
  text = text + "현황" + n;
  text = text + "- 현재 구인구직현황" + n;
  text = text + "- /구인구직현황" + n;
  text = text + "- /구인현황" + n + n;
  text = text + "마무리" + n;
  text = text + "- /12 쫑" + n;
  text = text + "- /12 ㅉ" + n + n;
  text = text + "주의" + n;
  text = text + "- 구인구직 명령어는 K롤방 구인구직방에서만 동작합니다." + n;
  text = text + "- LOL - K 방에서는 /12 ㅉ 같은 구인구직 마무리 명령어가 무시됩니다." + n;
  text = text + "- 모집번호가 없는 수정 양식은 봇이 무시합니다." + n + n;
  text = text + "현황 보기:" + n;
  text = text + "https://k-lol-gg.vercel.app/recruit";

  return text;
}

function getRecruitRoomHelpNotice() {
  return getPartyRecruitHelpNotice();
}


/* =========================================================
 * 자동 공지 점검 / 테스트
 * ========================================================= */


function isSchedulerStatusCommand(text) {
  text = normalizeCommandText(text);
  return text == "공지상태" || text == "/공지상태" || text == "자동공지상태" || text == "/자동공지상태";
}


function isSchedulerTestCommand(text) {
  text = normalizeCommandText(text);
  return text == "공지테스트" || text == "/공지테스트" || text == "자동공지테스트" || text == "/자동공지테스트";
}

function isSchedulerRoomTestCommand(text) {
  text = normalizeCommandText(text);
  return text == "공지방테스트" || text == "/공지방테스트";
}

function getSchedulerStatusNotice() {
  var now = new Date();
  var text = "";
  var n = "\n";

  text = "[K-LOL.GG 공지 상태]" + n;
  text = text + "현재 시간: " + makeDateTimeText(now) + n + n;
  text = text + "시간별 자동 공지: 비활성화" + n;
  text = text + "수동 공지 명령어: 사용 가능" + n + n;
  text = text + "LOL - K 전용" + n;
  text = text + "- AI공지" + n;
  text = text + "- 내전참가 / 참가신청" + n;
  text = text + "- 전적 닉네임#태그" + n;
  text = text + "- 최근 닉네임#태그" + n + n;
  text = text + "K롤방 구인구직방 전용" + n;
  text = text + "- /칼바람구인 / /증바람구인 / /솔랭구인" + n;
  text = text + "- /자랭구인 / /일반구인 / /기타게임구인 / /내전구인" + n;
  text = text + "- /구인현황" + n;
  text = text + "- /번호 쫑 또는 /번호 ㅉ";

  return text;
}


function getSchedulerTestNotice() {
  var n = "\n";
  var seasonNotice = "";
  var partyNotice = "";
  var text = "";

  seasonNotice = fetchSeasonRecruitStatusText(RECRUIT_SOURCE_ROOM, "AI공지", "system");
  if (seasonNotice == "__NO_SEASON_RECRUIT_STATUS__" || seasonNotice == "") {
    seasonNotice = "[내전현황]" + n + "현재 등록된 내전 신청 현황이 없습니다.";
  }

  partyNotice = fetchPartyRecruitStatusText(true);
  if (partyNotice == "__NO_ACTIVE_PARTY_RECRUIT__" || partyNotice == "") {
    partyNotice = "[K-LOL.GG 구인구직 현황]" + n + n + "현재 진행중인 구인구직 파티가 없습니다.";
  }

  text = "[K-LOL.GG 수동 공지 테스트]" + n;
  text = text + "현재 방에 수동 테스트로 출력합니다." + n + n;
  text = text + "1) 시즌내전 공지 미리보기" + n;
  text = text + seasonNotice + n + n;
  text = text + "------------------------------------" + n + n;
  text = text + "2) 구인구직 현황 미리보기" + n;
  text = text + partyNotice;

  return text;
}

function sendSchedulerRoomTest(replier) {
  var n = "\n";
  var text = "";

  text = "[자동 공지 방 테스트 안내]" + n;
  text = text + "현재 수정본은 시간별 자동 공지를 사용하지 않습니다." + n;
  text = text + "이 명령어는 현재 방에서 수동 응답 가능 여부만 확인합니다." + n + n;
  text = text + "테스트 방법" + n;
  text = text + "1. LOL - K 방에서 공지테스트 입력" + n;
  text = text + "2. K롤방 구인구직방에서 공지테스트 입력" + n;
  text = text + "3. 각 방에서 공지상태로 방 분리 설정 확인" + n + n;
  text = text + "현재 설정" + n;
  text = text + "- 시즌내전 공지방: " + NOTICE_ROOM + n;
  text = text + "- 구인구직 공지방: " + RECRUIT_SOURCE_ROOM;

  replier.reply(text);
}

/* =========================================================
 * 수동 공지 생성
 * ========================================================= */

function getAiNotice(slot) {
  var url = "";
  var resultText = "";
  var data = null;
  var reply = "";

  try {
    url = NOTICE_API_BASE_URL + "?slot=" + encodeURIComponent(slot);

    resultText = org.jsoup.Jsoup.connect(url)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(10000)
      .get()
      .text();

    data = JSON.parse(resultText);

    if (data && data.reply) {
      reply = String(data.reply || "");
    }

    if (reply != "") {
      return reply;
    }

    if (data && data.notice) {
      reply = String(data.notice || "");
    }

    return reply;
  } catch {
    return "";
  }
}

function getFallbackNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 내전 참가 안내]" + n;
  text = text + "현재 참가자: 0명" + n;
  text = text + "10명 기준 10명이 더 필요합니다." + n;
  text = text + "포지션 현황 :" + n;
  text = text + "탑 0명" + n;
  text = text + "정글 0명" + n;
  text = text + "미드 0명" + n;
  text = text + "원딜 0명" + n;
  text = text + "서포터 0명" + n;
  text = text + "부족 포지션: 탑, 정글, 미드, 원딜, 서포터" + n;
  text = text + "참가 가능하신 분은 사이트에서 내전 참가 신청 부탁드립니다.";

  return text;
}

/* =========================================================
 * 도움말 / 안내문
 * ========================================================= */

function getParticipationGuideNotice(slot) {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 내전 참가 방법 안내]" + n;
  text = text + "오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다." + n + n;
  text = text + "1. K-LOL.GG 접속" + n;
  text = text + "https://k-lol-gg.vercel.app" + n;
  text = text + "2. 로그인" + n;
  text = text + "3. 시즌내전 참가하기 클릭" + n;
  text = text + "4. 주 포지션 / 부 포지션 선택" + n;
  text = text + "5. 참가 신청 완료" + n + n;
  text = text + "참가 신청 기준으로 팀 밸런스가 진행됩니다." + n;
  text = text + "신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다.";

  if (slot == "19") {
    text = text + n + n;
    text = text + "내전 시작 전 참가 여부를 미리 확정해주시면 팀 편성이 더 원활합니다.";
  }

  return text;
}

function getHelpNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 카카오봇 도움말]" + n + n;

  text = text + "기본 명령어" + n;
  text = text + "- 도움말 : 사용 가능한 명령어 확인" + n;
  text = text + "- 방이름확인 : 현재 카카오톡 방 이름 확인" + n;
  text = text + "- 내전참가 : 시즌내전 참가 방법 안내" + n;
  text = text + "- 참가신청 : 시즌내전 참가 방법 안내" + n;
  text = text + "- 내전현황 : 현재 시즌내전 신청 양식 조회" + n;
  text = text + "- /내전현황 : 현재 시즌내전 신청 양식 조회" + n;
  text = text + "- AI공지 : 현재 참가 현황 공지 수동 생성" + n;
  text = text + "- 랭킹 : 랭킹 확인" + n + n;

  text = text + "전적 / 기록 명령어" + n;
  text = text + "- 전적 닉네임#태그 : 플레이어 전적 조회" + n;
  text = text + "  예) 전적 pokey#KR1" + n;
  text = text + "- 최근 닉네임#태그 : 최근 경기 조회" + n;
  text = text + "  예) 최근 pokey#KR1" + n + n;

  text = text + "구인구직방 참가 신청" + n;
  text = text + "- 신청글 자동 등록 : 참가 신청 양식을 올리면 자동 등록" + n;
  text = text + "- 신청초기화 : 같은 신청글을 다시 인식할 수 있도록 중복 방지값 초기화" + n;
  text = text + "- 오늘내전초기화 : 오늘 시즌내전 참가 신청 DB 기록 삭제" + n + n;

  text = text + "참가 신청 양식 예시" + n;
  text = text + "1.정민/m/m/ad sup" + n;
  text = text + "2.주현/u/m/top mid" + n + n;

  text = text + "수동 공지 명령어" + n;
  text = text + "- AI공지 : 현재 참가 현황 공지 수동 생성" + n;
  text = text + "- 내전참가 / 참가신청 : 참가 방법 안내" + n;
  text = text + "- 공지상태 : 공지 설정 상태 확인" + n;
  text = text + "- 공지테스트 : 현재 방에서 수동 공지 미리보기" + n;
  text = text + "- 시간별 자동 공지는 비활성화됨" + n + n;

  text = text + "구인구직 파티 현황" + n;
  text = text + "- /자랭구인 : 자랭 파티 생성" + n;
  text = text + "- /일반구인 : 일반 파티 생성" + n;
  text = text + "- /솔랭구인 : 솔랭 파티 생성" + n;
  text = text + "- /칼바람구인 : 칼바람 파티 생성" + n;
  text = text + "- /기타게임구인 : 기타게임 파티 생성" + n;
  text = text + "- /구인현황 : 현재 구인구직 현황 조회" + n;
  text = text + "- /12 쫑 또는 /12 ㅉ : 해당 파티 마무리" + n;
  text = text + "- /구인도움말 : 구인구직 전용 도움말" + n + n;

  text = text + "주의" + n;
  text = text + "- 신청초기화는 DB 삭제가 아닙니다." + n;
  text = text + "- 오늘내전초기화는 오늘 날짜의 참가 신청 기록을 삭제합니다." + n;
  text = text + "- 구인구직 양식은 모집번호가 있어야 현황에 반영됩니다.";

  return text;
}

/* =========================================================
 * 일반 명령어 판단
 * ========================================================= */

function isCommand(text) {
  var normalized = "";

  text = String(text || "");
  text = trimText(text);
  normalized = normalizeCommandText(text);

  if (text == "도움말") return true;
  if (text == "랭킹") return true;
  if (text == "AI공지") return true;
  if (text == "내전참가") return true;
  if (text == "참가신청") return true;
  if (text == "방이름확인") return true;
  if (text == "신청초기화") return true;

  if (normalized == "오늘내전초기화") return true;
  if (isSchedulerStatusCommand(text)) return true;
  if (isSchedulerTestCommand(text)) return true;
  if (isSchedulerRoomTestCommand(text)) return true;
  if (normalized == "내전현황") return true;
  if (normalized == "/내전현황") return true;
  if (normalized == "시즌내전현황") return true;
  if (normalized == "/시즌내전현황") return true;

  if (text.indexOf("AI공지 ") == 0) return true;
  if (text.indexOf("자동공지 ") == 0) return true;
  if (text.indexOf("공지생성 ") == 0) return true;
  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("최근 ") == 0) return true;

  if (isPartyRecruitHelpCommand(text)) return true;
  if (isPartyRecruitStatusCommand(text)) return true;
  if (isPartyRecruitCreateCommand(text)) return true;
  if (isPartyRecruitFinishCommand(text)) return true;

  return false;
}

/* =========================================================
 * 공통 유틸
 * ========================================================= */

function normalizeRecruitBotText(text) {
  text = String(text || "");

  text = text.replace(/\r/g, "\n");
  text = text.replace(/　/g, " ");
  text = text.replace(/\u00A0/g, " ");

  text = text.replace(/／/g, "/");
  text = text.replace(/，/g, ",");
  text = text.replace(/：/g, ":");
  text = text.replace(/–/g, "-");
  text = text.replace(/—/g, "-");

  text = text.replace(/０/g, "0");
  text = text.replace(/１/g, "1");
  text = text.replace(/２/g, "2");
  text = text.replace(/３/g, "3");
  text = text.replace(/４/g, "4");
  text = text.replace(/５/g, "5");
  text = text.replace(/６/g, "6");
  text = text.replace(/７/g, "7");
  text = text.replace(/８/g, "8");
  text = text.replace(/９/g, "9");

  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

function makeDateKey(date) {
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();

  if (m < 10) {
    m = "0" + m;
  }

  if (d < 10) {
    d = "0" + d;
  }

  return y + "-" + m + "-" + d;
}

function makeDateTimeText(date) {
  return makeDateKey(date) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":" + pad2(date.getSeconds());
}

function trimText(text) {
  text = String(text || "");

  text = text.replace(/^\s+/, "");
  text = text.replace(/\s+$/, "");

  return text;
}

function normalizeCommandText(text) {
  text = String(text || "");
  text = normalizeRecruitBotText(text);
  text = trimText(text);
  text = text.replace(/\s+/g, "");

  return text;
}

function escapeJson(text) {
  text = String(text || "");

  text = text.replace(/\\/g, "\\\\");
  text = text.replace(/"/g, "\\\"");
  text = text.replace(/\n/g, "\\n");
  text = text.replace(/\r/g, "\\r");
  text = text.replace(/\t/g, "\\t");

  return text;
}

function makeHash(text) {
  var h = 0;
  var i = 0;

  text = normalizeRecruitBotText(String(text || ""));

  for (i = 0; i < text.length; i++) {
    h = ((h << 5) - h) + text.charCodeAt(i);
    h = h & h;
  }

  return String(h);
}

function pad2(value) {
  value = Number(value);
  if (value < 10) return "0" + value;
  return String(value);
}

response.__kakaoBotEntryPoint = true;
