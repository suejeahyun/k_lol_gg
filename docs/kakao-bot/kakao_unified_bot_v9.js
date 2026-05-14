/*
 * K-LOL.GG Kakao Unified Bot v7
 * 목적:
 * - 현재 카카오봇 환경에서 room 값이 실제 방명이 아니라 보낸 사람명으로 들어오는 문제 대응
 * - LOL-K 기능 + 구인구직방 기능을 한 파일로 통합
 * - 방 분리는 불가능하므로 "명령어 기준"으로 기능을 분리
 *
 * 주의:
 * - 이 파일 하나만 카카오봇에 켜세요.
 * - 기존 kakao_lol_k_bot_v3.js / kakao_recruit_room_bot_v3.js / kakao-bot-updated.js는 모두 꺼야 합니다.
 */

/* =========================
 * API 설정
 * ========================= */

var BASE_URL = "https://k-lol-gg.vercel.app";

var OPENCHAT_API_URL = BASE_URL + "/api/kakao/openchat";
var NOTICE_API_BASE_URL = BASE_URL + "/api/kakao/scheduled-notice";

var RECRUIT_API_URL = BASE_URL + "/api/kakao/recruit/season-apply";
var SEASON_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/recruit/season-apply/status";

var PARTY_RECRUIT_CREATE_API_URL = BASE_URL + "/api/kakao/party-recruits/create";
var PARTY_RECRUIT_SYNC_API_URL = BASE_URL + "/api/kakao/party-recruits/sync";
var PARTY_RECRUIT_FINISH_API_URL = BASE_URL + "/api/kakao/party-recruits/finish";
var PARTY_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/party-recruits/status";

/*
 * 서버 환경변수 KAKAO_RECRUIT_SECRET 값과 동일해야 합니다.
 * 이 값은 GitHub에 올리지 않는 것이 원칙입니다.
 * 카카오봇 앱 안에서만 사용하세요.
 */
var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";

/*
 * 서버에 KAKAO_OPENCHAT_SECRET을 설정했다면 같은 값을 입력하세요.
 * 설정하지 않았다면 빈 문자열로 둡니다.
 */
var KAKAO_OPENCHAT_SECRET = "";

var NOTICE_ROOM_LABEL = "LOL - K";
var RECRUIT_ROOM_LABEL = "K롤방 구인구직방";

var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_UNIFIED_V7";
var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_UNIFIED_V7";

var lastRecruitHash = "";
var lastPartyRecruitHash = "";

/* =========================
 * 카카오봇 진입점
 * ========================= */

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = "";

  String(isGroupChat);
  String(imageDB);
  String(packageName);

  try {
    text = trimText(normalizeText(String(msg || "")));

    if (text == "") {
      return;
    }

    if (text == "방이름확인") {
      replier.reply(getRoomDebugNotice(room, sender));
      return;
    }

    if (text == "API상태확인") {
      replier.reply(getApiStatusNotice(room, sender));
      return;
    }

    /*
     * 1순위: 시즌내전 신청 양식 자동 등록
     * - 협곡내전 양식도 1.~5. 번호 줄을 포함하므로
     *   번호 없는 파티 양식 무응답 처리보다 먼저 검사해야 합니다.
     */
    if (isSeasonApplyFormMessage(text)) {
      handleSeasonApplyMessage(RECRUIT_ROOM_LABEL, text, sender, replier);
      return;
    }

    /*
     * 2순위: 무응답 처리해야 하는 케이스
     * - 번호 없는 파티 양식은 서버에 보내지 않음
     */
    if (isPartyRecruitFormWithoutNumber(text)) {
      return;
    }

    /*
     * 3순위: LOL-K 성격 명령어
     */
    if (isLolKCommand(text)) {
      handleLolKCommand(text, room, sender, replier);
      return;
    }

    /*
     * 4순위: 구인구직 성격 명령어
     */
    if (isRecruitCommand(text)) {
      handleRecruitCommand(text, room, sender, replier);
      return;
    }

    /*
     * 그 외 일반 대화는 무응답
     */
    return;
  } catch (err) {
    replier.reply("[봇 처리 오류]\n" + String(err));
  }
}

response.__kakaoBotEntryPoint = true;

/* =========================
 * 라우팅
 * ========================= */

function isLolKCommand(text) {
  var normalized = normalizeCommandText(text);

  if (text == "도움말") return true;
  if (text == "내전참가") return true;
  if (text == "참가신청") return true;
  if (text == "내전현황") return true;
  if (text == "AI공지") return true;
    if (normalized == "시즌내전현황") return true;
    if (text == "랭킹") return true;
  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("최근 ") == 0) return true;

  return false;
}

function isRecruitCommand(text) {
  if (text == "신청초기화") return true;
  if (normalizeCommandText(text) == "오늘내전초기화") return true;

  if (isSeasonRecruitTemplateCommand(text)) return true;
  if (isPartyRecruitHelpCommand(text)) return true;
  if (isPartyRecruitStatusCommand(text)) return true;
  if (isPartyRecruitCreateCommand(text)) return true;
  if (isPartyRecruitFinishCommand(text)) return true;
  if (isPartyRecruitFormMessage(text)) return true;

  return false;
}

function handleLolKCommand(text, room, sender, replier) {
  var reply = "";

  if (text == "도움말") {
    replier.reply(getUnifiedHelpNotice());
    return;
  }

  if (text == "내전참가" || text == "참가신청") {
    replier.reply(getParticipationGuideNotice("manual"));
    return;
  }

  if (isSeasonRecruitStatusCommand(text) || text == "AI공지") {
    reply = fetchSeasonRecruitStatusText(RECRUIT_ROOM_LABEL, "내전현황", sender);

    if (reply == "__NO_SEASON_RECRUIT_STATUS__" || reply == "") {
      reply = "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
    }

    replier.reply(reply);
    return;
  }

  if (text == "랭킹" || text.indexOf("전적 ") == 0 || text.indexOf("최근 ") == 0) {
    sendOpenchatCommand(text, replier);
    return;
  }
}

function handleRecruitCommand(text, room, sender, replier) {
  if (text == "신청초기화") {
    lastRecruitHash = "";
    lastPartyRecruitHash = "";
    DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
    DataBase.setDataBase(PARTY_RECRUIT_SAVE_KEY, "");
    replier.reply("[신청 인식 초기화 완료]\n같은 신청글과 구인구직 양식을 다시 처리할 수 있습니다.");
    return;
  }

  if (normalizeCommandText(text) == "오늘내전초기화") {
    handleTodaySeasonApplyReset(RECRUIT_ROOM_LABEL, text, sender, replier);
    return;
  }

  if (isSeasonRecruitTemplateCommand(text)) {
    replier.reply(getSeasonRecruitTemplateNotice());
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
      RECRUIT_ROOM_LABEL,
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
      RECRUIT_ROOM_LABEL,
      text,
      sender,
      replier,
      "구인구직 마무리"
    );
    return;
  }

  if (isPartyRecruitFormMessage(text)) {
    handlePartyRecruitSync(RECRUIT_ROOM_LABEL, text, sender, replier);
    return;
  }
}

/* =========================
 * LOL-K: 전적 / 최근 / 랭킹
 * ========================= */

function sendOpenchatCommand(text, replier) {
  var body = "";
  var conn = null;
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    if (KAKAO_OPENCHAT_SECRET != "") {
      body += ",\"secret\":\"" + escapeJson(KAKAO_OPENCHAT_SECRET) + "\"";
    }
    body += "}";

    conn = org.jsoup.Jsoup.connect(OPENCHAT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST);

    res = conn.execute();
    statusCode = res.statusCode();
    resultText = res.body();

    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[전적/명령어 서버 오류]\n" +
        "상태코드: " + statusCode + "\n" +
        "명령어: " + text + "\n" +
        "응답: " + limitText(String(resultText || "응답 없음"), 1000)
      );
      return;
    }

    replier.reply("[전적/명령어 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[전적/명령어 처리 오류]\n" + String(err));
  }
}

/* =========================
 * 시즌내전 현황
 * ========================= */

function isSeasonRecruitTemplateCommand(text) {
  text = normalizeCommandText(text);
  return text == "내전구인구직" || text == "내전구인" || text == "/내전구인구직" || text == "/내전구인";
}

function isSeasonRecruitStatusCommand(text) {
  text = normalizeCommandText(text);

  return text == "내전현황" ||
    text == "/내전현황" ||
    text == "시즌내전현황" ||
    text == "/시즌내전현황" ||
    text == "AI공지";
}

function fetchSeasonRecruitStatusText(roomLabel, text, sender) {
  var body = "";
  var res = null;
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";
    body += "\"sender\":\"" + escapeJson(sender) + "\",";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(SEASON_RECRUIT_STATUS_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    resultText = res.body();
    data = safeJsonParse(resultText);

    if (!data) {
      return "[내전현황 API 오류]\nJSON 응답이 아닙니다.\n" + limitText(resultText, 1000);
    }

    if (!data.ok) {
      return "[내전현황]\n현황을 불러오지 못했습니다.\n" + limitText(String(data.reply || resultText), 1000);
    }

    if (data.empty) {
      return "__NO_SEASON_RECRUIT_STATUS__";
    }

    if (data.reply && String(data.reply) != "") {
      return String(data.reply);
    }

    return "[내전현황]\n현황 응답이 비어 있습니다.";
  } catch (err) {
    return "[내전현황 API 오류]\n" + String(err);
  }
}

function getSeasonRecruitTemplateNotice() {
  var n = "\n";
  var now = new Date();
  var dateText = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());

  return "📢 협곡내전하실분" + n +
    " 》" + dateText + " 21시" + n + n +
    "*참가 신청 양식*" + n +
    "이름/현티어/최고티어/주,부라인" + n +
    "EX) 1.지후/P/E/AD,MD" + n + n +
    "1." + n +
    "2." + n +
    "3." + n +
    "4." + n +
    "5." + n +
    "6." + n +
    "7." + n +
    "8." + n +
    "9." + n +
    "10.";
}

/* =========================
 * 시즌내전 자동 등록
 * ========================= */

function isSeasonApplyFormMessage(text) {
  var filledCount = 0;

  text = normalizeText(text);

  if (!hasSeasonApplySlash(text)) {
    return false;
  }

  filledCount = countFilledSeasonApplyLines(text);

  if (filledCount < 1) {
    return false;
  }

  if (hasSeasonApplyForm(text)) {
    return true;
  }

  if (hasSeasonApplyWord(text)) {
    return true;
  }

  return false;
}

function handleSeasonApplyMessage(roomLabel, text, sender, replier) {
  var hash = "";
  var saved = "";
  var body = "";
  var res = null;
  var resultText = "";
  var data = null;

  try {
    text = normalizeText(text);
    hash = makeHash("season-apply:" + text);

    if (lastRecruitHash == hash) {
      return;
    }

    saved = DataBase.getDataBase(RECRUIT_SAVE_KEY);
    if (saved == hash) {
      lastRecruitHash = hash;
      return;
    }

    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";
    body += "\"sender\":\"" + escapeJson(sender) + "\",";
    body += "\"syncRemoved\":true,";
    body += "\"createMissingPlayers\":true,";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(25000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    resultText = res.body();
    data = safeJsonParse(resultText);

    if (data && data.ok && Number(data.pending || 0) === 0) {
      replier.reply(getSeasonApplyCompleteNotice());
    } else if (data && data.reply) {
      replier.reply(String(data.reply));
    } else {
      replier.reply("[참가 신청 등록 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1200));
    }

    lastRecruitHash = hash;
    DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
  } catch (err) {
    replier.reply("[참가 신청 등록 API 오류]\n" + String(err));
  }
}

function handleTodaySeasonApplyReset(roomLabel, text, sender, replier) {
  var body = "";
  var res = null;
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";
    body += "\"sender\":\"" + escapeJson(sender) + "\",";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    resultText = res.body();
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      lastRecruitHash = "";
      DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
      replier.reply(String(data.reply));
      return;
    }

    replier.reply("[오늘 내전 초기화 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[오늘 내전 초기화 API 오류]\n" + String(err));
  }
}

function hasSeasonApplySlash(text) {
  return String(text || "").indexOf("/") >= 0;
}

function hasSeasonApplyWord(text) {
  text = String(text || "");

  if (text.indexOf("내전") >= 0) return true;
  if (text.indexOf("참가") >= 0) return true;
  if (text.indexOf("신청") >= 0) return true;
  if (text.indexOf("협곡") >= 0) return true;
  if (text.indexOf("구인") >= 0) return true;
  if (text.indexOf("현티어") >= 0) return true;
  if (text.indexOf("최고티어") >= 0) return true;

  return false;
}

function hasSeasonApplyForm(text) {
  text = String(text || "");

  if (text.indexOf("이름/현티어/최고티어") >= 0) return true;
  if (text.indexOf("현티어") >= 0 && text.indexOf("최고티어") >= 0) return true;
  if (text.indexOf("주,부라인") >= 0) return true;
  if (text.indexOf("주/부라인") >= 0) return true;
  if (text.indexOf("주라인") >= 0 && text.indexOf("부라인") >= 0) return true;

  return false;
}

function countFilledSeasonApplyLines(text) {
  var lines = normalizeText(text).split("\n");
  var count = 0;
  var i = 0;
  var line = "";
  var body = "";
  var parts = [];
  var name = "";
  var currentTier = "";
  var peakTier = "";
  var positionText = "";

  for (i = 0; i < lines.length; i++) {
    line = trimText(String(lines[i] || ""));

    if (isSeasonApplyExampleLine(line)) {
      continue;
    }

    if (!/^\d{1,2}\s*[.)]/.test(line)) {
      continue;
    }

    body = trimText(line.replace(/^\d{1,2}\s*[.)]\s*/, ""));

    if (body == "") continue;
    if (body.indexOf("/") < 0) continue;

    parts = body.split("/");

    if (parts.length < 4) continue;

    name = trimText(String(parts[0] || ""));
    currentTier = trimText(String(parts[1] || ""));
    peakTier = trimText(String(parts[2] || ""));
    positionText = trimText(String(parts.slice(3).join("/") || ""));

    if (name == "") continue;
    if (currentTier == "") continue;
    if (peakTier == "") continue;
    if (positionText == "") continue;
    if (isBadSeasonApplyName(name)) continue;

    count++;
  }

  return count;
}

function isBadSeasonApplyName(name) {
  name = trimText(String(name || ""));

  if (name == "") return true;
  if (name.indexOf("이름") >= 0) return true;
  if (name.indexOf("EX") >= 0) return true;
  if (name.indexOf("ex") >= 0) return true;
  if (name.indexOf("예시") >= 0) return true;

  return false;
}

function isSeasonApplyExampleLine(line) {
  line = trimText(String(line || ""));

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

/* =========================
 * 구인구직 파티
 * ========================= */

function isPartyRecruitHelpCommand(text) {
  text = normalizeCommandText(text);
  return text == "구인구직도움말" || text == "구인도움말" || text == "/구인도움말";
}

function isPartyRecruitStatusCommand(text) {
  text = normalizeCommandText(text);

  return text == "현재구인구직현황" ||
    text == "구인구직현황" ||
    text == "구인구직현황" ||
    text == "구인현황" ||
    text == "/구인구직현황" ||
    text == "/구인현황";
}

function isPartyRecruitCreateCommand(text) {
  text = trimText(normalizeText(text));

  return /^\/?(칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인)(?:\s+\d{1,2})?\s*$/.test(text);
}

function isPartyRecruitFinishCommand(text) {
  text = trimText(normalizeText(text));

  return /^\/?\d{1,2}\s*(쫑|ㅉ)\s*$/.test(text);
}

function hasPartyRecruitNumber(text) {
  text = normalizeText(String(text || ""));

  if (/모집번호\s*[:：]?\s*#?\s*\d{1,2}/.test(text)) {
    return true;
  }

  if (/(^|\s)#\s*\d{1,2}(\s|$)/.test(text)) {
    return true;
  }

  return false;
}

function isPartyRecruitFormWithoutNumber(text) {
  text = trimText(normalizeText(String(text || "")));

  if (text == "") {
    return false;
  }

  if (hasPartyRecruitNumber(text)) {
    return false;
  }

  /*
   * 시즌내전 참가 신청 양식은 1.~10. 번호 줄이 있어도
   * 구인구직 파티 양식이 아닙니다.
   */
  if (hasSeasonApplyForm(text) && countFilledSeasonApplyLines(text) > 0) {
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
  if (text.indexOf("롤체 일반 하실분") >= 0) return true;
  if (text.indexOf("롤체 랭크 하실분") >= 0) return true;
  if (text.indexOf("더블업 하실분") >= 0) return true;

  return false;
}

function isPartyRecruitFormMessage(text) {
  text = normalizeText(text);

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

function handlePartyRecruitApi(apiUrl, roomLabel, text, sender, replier, label) {
  var body = "";
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;

  try {
    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";
    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";
    body += "\"sender\":\"" + escapeJson(sender) + "\",";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(apiUrl)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    statusCode = res.statusCode();
    resultText = res.body();
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply("[" + label + " 서버 오류]\n상태코드: " + statusCode + "\n" + limitText(String(resultText || "응답 없음"), 1000));
      return;
    }

    replier.reply("[" + label + " 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[" + label + " API 오류]\n" + String(err));
  }
}

function handlePartyRecruitSync(roomLabel, text, sender, replier) {
  var hash = "";
  var saved = "";

  try {
    text = normalizeText(text);
    hash = makeHash("party-sync:" + text);

    if (lastPartyRecruitHash == hash) {
      return;
    }

    saved = DataBase.getDataBase(PARTY_RECRUIT_SAVE_KEY);
    if (saved == hash) {
      lastPartyRecruitHash = hash;
      return;
    }

    handlePartyRecruitApi(
      PARTY_RECRUIT_SYNC_API_URL,
      roomLabel,
      text,
      sender,
      replier,
      "구인구직 현황 반영"
    );

    lastPartyRecruitHash = hash;
    DataBase.setDataBase(PARTY_RECRUIT_SAVE_KEY, hash);
  } catch (err) {
    replier.reply("[구인구직 현황 반영 오류]\n" + String(err));
  }
}

function fetchPartyRecruitStatusText(silentWhenEmpty) {
  var res = null;
  var resultText = "";
  var data = null;

  try {
    res = org.jsoup.Jsoup.connect(PARTY_RECRUIT_STATUS_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .timeout(15000)
      .method(org.jsoup.Connection.Method.GET)
      .execute();

    resultText = res.body();
    data = safeJsonParse(resultText);

    if (!data || !data.ok) {
      return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n" + limitText(String(resultText || ""), 1000);
    }

    if (data.empty && silentWhenEmpty) {
      return "__NO_ACTIVE_PARTY_RECRUIT__";
    }

    return String(data.reply || "");
  } catch (err) {
    return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n" + String(err);
  }
}

function getSeasonApplyCompleteNotice() {
  return "[K-LOL.GG 구인구직방 참가 자동 등록 완료]\n" +
    "내전 시작 10분전에 디스코드 내전 대기방으로 와주세요.";
}

/* =========================
 * 안내문
 * ========================= */

function getRoomDebugNotice(room, sender) {
  var n = "\n";

  return "[방 이름 확인]" + n +
    "이 파일 담당: 통합 코드 v9" + n +
    "실제 수신 room: " + String(room || "") + n +
    "보낸 사람: " + String(sender || "") + n + n +
    "현재 기기에서는 room이 방명이 아니라 보낸 사람명으로 들어올 수 있습니다." + n +
    "따라서 이 통합 코드는 방 이름이 아니라 명령어 기준으로 작동합니다." + n + n +
    "LOL-K 명령어: 내전현황, AI공지, 내전참가, 전적, 최근, 랭킹" + n +
    "구인구직 명령어: 자랭구인, 롤체일반구인, 롤체랭크구인, 더블업구인, 구인현황, 번호 ㅉ" + n +
    "시즌내전 양식: 내전구인 또는 내전구인구직";
}

function getApiStatusNotice(room, sender) {
  var n = "\n";
  var season = "";
  var party = "";

  season = fetchSeasonRecruitStatusText(RECRUIT_ROOM_LABEL, "내전현황", sender);
  if (season == "__NO_SEASON_RECRUIT_STATUS__") {
    season = "[내전현황] 현재 등록된 내전 신청 현황이 없습니다.";
  }

  party = fetchPartyRecruitStatusText(false);

  return "[K-LOL.GG API 상태 확인]" + n + n +
    "1) 내전현황 API" + n +
    limitText(season, 500) + n + n +
    "--------------------------------" + n + n +
    "2) 구인구직 현황 API" + n +
    limitText(party, 500);
}

function getParticipationGuideNotice(slot) {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 내전 참가 방법 안내]" + n;
  text += "오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다." + n + n;
  text += "1. K-LOL.GG 접속" + n;
  text += BASE_URL + n;
  text += "2. 로그인" + n;
  text += "3. 시즌내전 참가하기 클릭" + n;
  text += "4. 주 포지션 / 부 포지션 선택" + n;
  text += "5. 참가 신청 완료" + n + n;
  text += "참가 신청 기준으로 팀 밸런스가 진행됩니다." + n;
  text += "신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다.";

  return text;
}

function getPartyRecruitHelpNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 구인구직 도움말]" + n + n;
  text += "생성" + n;
  text += "- 칼바람구인" + n;
  text += "- 증바람구인" + n;
  text += "- 솔랭구인" + n;
  text += "- 자랭구인" + n;
  text += "- 일반구인" + n;
  text += "- 기타게임구인" + n;
  text += "- 롤체일반구인" + n;
  text += "- 롤체랭크구인" + n;
  text += "- 더블업구인" + n + n;
  text += "번호" + n;
  text += "- 모집번호는 매일 1번부터 서버에서 자동 생성됩니다." + n;
  text += "- 필요한 경우 자랭구인 12처럼 직접 번호 지정도 가능합니다." + n + n;
  text += "반영" + n;
  text += "- 모집번호가 포함된 양식에 이름을 채운 뒤 다시 올리면 자동 반영됩니다." + n;
  text += "- 이름을 지우고 다시 올리면 해당 자리가 비워집니다." + n;
  text += "- 모집번호 없는 양식은 봇이 무시합니다." + n + n;
  text += "현황" + n;
  text += "- 구인현황" + n;
  text += "- 구인구직현황" + n + n;
  text += "마무리" + n;
  text += "- 12 쫑" + n;
  text += "- 12 ㅉ" + n + n;
  text += "현황 보기:" + n;
  text += BASE_URL + "/recruit";

  return text;
}

function getUnifiedHelpNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 통합 카카오봇 도움말]" + n + n;
  text += "LOL-K 기능" + n;
  text += "- 내전현황 : 현재 시즌내전 신청 현황" + n;
  text += "- AI공지 : 내전현황과 동일하게 처리" + n;
  text += "- 내전참가 / 참가신청 : 참가 방법 안내" + n;
  text += "- 전적 닉네임#태그 : 플레이어 전적 조회" + n;
  text += "- 최근 닉네임#태그 : 최근 경기 조회" + n;
  text += "- 랭킹 : 랭킹 조회" + n + n;
  text += "구인구직 기능" + n;
  text += "- 자랭구인 / 일반구인 / 솔랭구인" + n;
  text += "- 칼바람구인 / 증바람구인 / 기타게임구인" + n;
  text += "- 롤체일반구인 / 롤체랭크구인 / 더블업구인" + n;
  text += "- 구인현황" + n;
  text += "- 번호 ㅉ 또는 번호 쫑" + n;
  text += "- 내전구인 또는 내전구인구직 : 시즌내전 참가 신청 양식" + n + n;
  text += "관리/점검" + n;
  text += "- 방이름확인" + n;
  text += "- API상태확인" + n;
  text += "- 신청초기화" + n;
  text += "- 오늘내전초기화" + n + n;
  text += "주의: 현재 환경은 방 이름 인식이 불안정하여 명령어 기준으로만 작동합니다.";

  return text;
}

/* =========================
 * 공통 유틸
 * ========================= */

function normalizeText(text) {
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

function trimText(text) {
  text = String(text || "");
  text = text.replace(/^\s+/, "");
  text = text.replace(/\s+$/, "");
  return text;
}

function normalizeCommandText(text) {
  text = normalizeText(String(text || ""));
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

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch (err) {
    String(err);
    return null;
  }
}

function makeHash(text) {
  var h = 0;
  var i = 0;

  text = normalizeText(String(text || ""));

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

function limitText(text, maxLength) {
  text = String(text || "");
  maxLength = Number(maxLength || 1000);

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + "\n...(이하 생략)";
}
