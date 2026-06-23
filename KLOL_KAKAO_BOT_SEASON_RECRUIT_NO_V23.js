var BOT_CODE_VERSION = "KLOL_KAKAO_BOT_SEASON_RECRUIT_NO_V23_2026_06_23";
var BASE_URL = "https://k-lol-gg.vercel.app";

var OPENCHAT_API_URL = BASE_URL + "/api/kakao/openchat";
var SEARCH_PLAYER_API_URL = BASE_URL + "/api/kakao/search-player";

var RECRUIT_API_URL = BASE_URL + "/api/kakao/recruit/season-apply";
var SEASON_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/recruit/season-apply/status";

var PARTY_RECRUIT_CREATE_API_URL = BASE_URL + "/api/kakao/party-recruits/create";
var PARTY_RECRUIT_SYNC_API_URL = BASE_URL + "/api/kakao/party-recruits/sync";
var PARTY_RECRUIT_FINISH_API_URL = BASE_URL + "/api/kakao/party-recruits/finish";
var PARTY_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/party-recruits/status";
var OPERATION_FORM_API_URL = BASE_URL + "/api/kakao/operation-forms";

var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";
var KAKAO_OPENCHAT_SECRET = "KLOL-SP-7d9f2a84c1e64b8f9a63d2e0b5c8f1aa-20260515";
var KAKAO_SEARCH_PLAYER_SECRET = "KLOL-SP-7d9f2a84c1e64b8f9a63d2e0b5c8f1aa-20260515";

var RECRUIT_ROOM_LABEL = "K롤방 구인구직방";

var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_UNIFIED_V23";
var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_UNIFIED_V18";
var OPERATION_FORM_SAVE_KEY = "KLOL_OPERATION_FORM_LAST_HASH_V1";

var lastRecruitHash = "";
var lastPartyRecruitHash = "";
var lastOperationFormHash = "";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = "";
  var roomText = "";
  var senderText = "";

  try {
    text = trimText(normalizeText(String(msg || "")));
    roomText = trimText(String(room || ""));
    senderText = trimText(String(sender || ""));


    if (text == "해시테스트") {
      var hashTestText = "";
      var i = 0;

      hashTestText += "[K-LOL.GG 해시 테스트]\n\n";
      hashTestText += "room: " + roomText + "\n";
      hashTestText += "sender: " + senderText + "\n";
      hashTestText += "isGroupChat: " + String(isGroupChat) + "\n";
      hashTestText += "packageName: " + String(packageName) + "\n";
      hashTestText += "arguments.length: " + String(arguments.length) + "\n\n";

      for (i = 0; i < arguments.length; i++) {
        try {
          hashTestText += "arg[" + i + "]: " + String(arguments[i]) + "\n";
        } catch (e1) {
          hashTestText += "arg[" + i + "]: 출력 실패 - " + String(e1) + "\n";
        }
      }

      try {
        hashTestText += "\nimageDB: " + String(imageDB) + "\n";
      } catch (e2) {
        hashTestText += "\nimageDB 출력 실패 - " + String(e2) + "\n";
      }

      replier.reply(hashTestText);
      return;
    }

    if (text == "이미지DB테스트") {
      var imageDbText = "";
      var key = "";

      imageDbText += "[K-LOL.GG imageDB 테스트]\n\n";

      try {
        imageDbText += "imageDB string: " + String(imageDB) + "\n\n";

        for (key in imageDB) {
          try {
            imageDbText += key + ": " + String(imageDB[key]) + "\n";
          } catch (e3) {
            imageDbText += key + ": 출력 실패 - " + String(e3) + "\n";
          }
        }
      } catch (e4) {
        imageDbText += "imageDB 확인 실패: " + String(e4);
      }

      replier.reply(imageDbText);
      return;
    }

    if (
      text.indexOf("들어왔습니다") >= 0 ||
      text.indexOf("나갔습니다") >= 0 ||
      text.indexOf("초대되었습니다") >= 0
    ) {
      replier.reply(
        "[K-LOL.GG 입퇴장 감지 테스트]\n\n" +
          "room: " + roomText + "\n" +
          "sender: " + senderText + "\n" +
          "msg: " + text
      );
      return;
    }

    if (text == "") {
      return;
    }

    /*
     * 방 이름 인식이 불안정하므로 room 기준으로 차단하지 않습니다.
     * 명령어 기준으로만 처리합니다.
     */

    if (isSeasonApplyFormMessage(text)) {
      handleSeasonApplyMessage(roomText || RECRUIT_ROOM_LABEL, text, senderText, replier);
      return;
    }

    if (senderText.indexOf("오픈채팅봇") < 0 && isOperationFormMessage(text)) {
      handleOperationFormMessage(roomText || RECRUIT_ROOM_LABEL, text, senderText, replier);
      return;
    }

    if (isLolKCommand(text)) {
      handleLolKCommand(text, roomText, senderText, replier);
      return;
    }

    if (isPartyRecruitFormWithoutNumber(text)) {
      return;
    }

    if (isRecruitCommand(text)) {
      handleRecruitCommand(text, roomText, senderText, replier);
      return;
    }

    return;
  } catch (err) {
    replier.reply("[봇 처리 오류]\n" + String(err));
  }
}

response.__kakaoBotEntryPoint = true;

function isLolKCommand(text) {
  var normalized = normalizeCommandText(text);

  if (normalized == "봇버전" || normalized == "/봇버전") return true;


  if (normalized == "도움말" || normalized == "/도움말") return true;
  if (normalized == "명령어" || normalized == "/명령어") return true;

  if (normalized == "내전참가" || normalized == "/내전참가") return true;
  if (normalized == "참가신청" || normalized == "/참가신청") return true;

  if (isSeasonRecruitStatusCommand(text)) return true;

  if (isSeasonRecruitResetCommand(text)) return true;

  if (normalized == "랭킹" || normalized == "/랭킹") return true;

  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("/전적 ") == 0) return true;

  if (text.indexOf("최근 ") == 0) return true;
  if (text.indexOf("/최근 ") == 0) return true;

  return false;
}

function isRecruitCommand(text) {
  if (isSeasonRecruitTemplateCommand(text)) return true;
  if (isPartyRecruitWebHelperCommand(text)) return true;
  if (isPartyRecruitHelpCommand(text)) return true;
  if (isPartyRecruitStatusCommand(text)) return true;
  if (isPartyRecruitCreateCommand(text)) return true;
  if (isPartyRecruitFinishCommand(text)) return true;
  if (isPartyRecruitFormMessage(text)) return true;

  return false;
}

function handleLolKCommand(text, room, sender, replier) {
  var reply = "";
  var normalized = normalizeCommandText(text);

  if (normalized == "봇버전" || normalized == "/봇버전") {
    replier.reply("[K-LOL.GG 카카오봇 코드 버전]\n" + BOT_CODE_VERSION);
    return;
  }


  if (
    normalized == "도움말" ||
    normalized == "/도움말" ||
    normalized == "명령어" ||
    normalized == "/명령어"
  ) {
    replier.reply(getUnifiedHelpNotice());
    return;
  }

  if (
    normalized == "내전참가" ||
    normalized == "/내전참가" ||
    normalized == "참가신청" ||
    normalized == "/참가신청"
  ) {
    replier.reply(getParticipationGuideNotice());
    return;
  }

  if (isSeasonRecruitStatusCommand(text)) {
    reply = fetchSeasonRecruitStatusText(RECRUIT_ROOM_LABEL, text, sender);

    if (reply == "__NO_SEASON_RECRUIT_STATUS__" || reply == "") {
      reply = "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
    }

    replier.reply(reply);
    return;
  }

  if (isSeasonRecruitResetCommand(text)) {
    sendSeasonApplyResetCommand(text, room, sender, replier);
    return;
  }

  if (text.indexOf("/전적 ") == 0) {
    sendSearchPlayerCommand(text.replace(/^\/전적\s+/, "전적 "), replier);
    return;
  }

  if (text.indexOf("전적 ") == 0) {
    sendSearchPlayerCommand(text, replier);
    return;
  }

  if (text.indexOf("/최근 ") == 0) {
    sendOpenchatCommand(text.replace(/^\/최근\s+/, "최근 "), replier);
    return;
  }

  if (text.indexOf("최근 ") == 0) {
    sendOpenchatCommand(text, replier);
    return;
  }

  if (normalized == "랭킹" || normalized == "/랭킹") {
    sendOpenchatCommand("랭킹", replier);
    return;
  }
}

function handleRecruitCommand(text, room, sender, replier) {
  if (isSeasonRecruitTemplateCommand(text)) {
    replier.reply(getSeasonRecruitTemplateNotice(text));
    return;
  }

  if (isPartyRecruitWebHelperCommand(text)) {
    replier.reply(getPartyRecruitWebHelperNotice());
    return;
  }

  if (isPartyRecruitHelpCommand(text)) {
    replier.reply(getPartyRecruitHelpNotice());
    return;
  }

  if (isPartyRecruitStatusCommand(text)) {
    replier.reply(fetchPartyRecruitStatusText(false, text));
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

function extractBotReplyText(data) {
  var outputs = null;
  var output = null;
  var text = "";

  if (!data) {
    return "";
  }

  if (data.reply) {
    return String(data.reply);
  }

  if (data.text) {
    return String(data.text);
  }

  if (data.message) {
    return String(data.message);
  }

  if (data.template && data.template.outputs) {
    outputs = data.template.outputs;
  } else if (data.outputs) {
    outputs = data.outputs;
  }

  if (outputs && outputs.length && outputs.length > 0) {
    output = outputs[0];

    if (output.simpleText && output.simpleText.text) {
      return String(output.simpleText.text);
    }

    if (output.textCard && output.textCard.text) {
      text = String(output.textCard.text);
      if (output.textCard.title) {
        text = String(output.textCard.title) + "\n" + text;
      }
      return text;
    }

    if (output.basicCard && output.basicCard.description) {
      text = String(output.basicCard.description);
      if (output.basicCard.title) {
        text = String(output.basicCard.title) + "\n" + text;
      }
      return text;
    }
  }

  return "";
}

function sendSeasonApplyResetCommand(text, room, sender, replier) {
  var body = "";
  var conn = null;
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;
  var parsedReply = "";

  try {
    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"";
    body += ",\"room\":\"" + escapeJson(room) + "\"";
    body += ",\"sender\":\"" + escapeJson(sender) + "\"";
    body += ",\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    conn = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .header("x-kakao-secret", KAKAO_RECRUIT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_RECRUIT_SECRET)
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST);

    res = conn.execute();
    statusCode = res.statusCode();
    resultText = res.body();
    data = safeJsonParse(resultText);

    parsedReply = extractBotReplyText(data);
    if (parsedReply != "") {
      replier.reply(parsedReply);
      return;
    }

    if (statusCode == 401 || statusCode == 403) {
      replier.reply(
        "[오늘내전 초기화 인증 오류]\n" +
          "KAKAO_RECRUIT_SECRET 값이 서버와 봇 코드에서 같은지 확인하세요.\n" +
          "상태코드: " +
          statusCode
      );
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[오늘내전 초기화 서버 오류]\n" +
          "상태코드: " +
          statusCode +
          "\n응답: " +
          limitText(String(resultText || "응답 없음"), 1000)
      );
      return;
    }

    replier.reply("[오늘내전 초기화 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[오늘내전 초기화 처리 오류]\n" + String(err));
  }
}

function sendSearchPlayerCommand(text, replier) {
  var body = "";
  var conn = null;
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;
  var parsedReply = "";

  try {
    body = "{";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += ",\"secret\":\"" + escapeJson(KAKAO_SEARCH_PLAYER_SECRET) + "\"";
    body += "}";

    conn = org.jsoup.Jsoup.connect(SEARCH_PLAYER_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-search-player-secret", KAKAO_SEARCH_PLAYER_SECRET)
      .header("x-kakao-openchat-secret", KAKAO_OPENCHAT_SECRET)
      .header("x-kakao-secret", KAKAO_SEARCH_PLAYER_SECRET)
      .header("Authorization", "Bearer " + KAKAO_SEARCH_PLAYER_SECRET)
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST);

    res = conn.execute();
    statusCode = res.statusCode();
    resultText = res.body();

    data = safeJsonParse(resultText);

    parsedReply = extractBotReplyText(data);
    if (parsedReply != "") {
      replier.reply(parsedReply);
      return;
    }

    if (statusCode == 401 || statusCode == 403) {
      replier.reply(
        "[전적 검색 인증 오류]\n" +
          "KAKAO_SEARCH_PLAYER_SECRET 값이 서버와 봇 코드에서 같은지 확인하세요.\n" +
          "상태코드: " +
          statusCode
      );
      return;
    }

    if (statusCode == 429) {
      replier.reply("[전적 검색 제한]\n잠시 후 다시 시도해주세요.");
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[전적 검색 서버 오류]\n" +
          "상태코드: " +
          statusCode +
          "\n" +
          "명령어: " +
          text +
          "\n" +
          "응답: " +
          limitText(String(resultText || "응답 없음"), 1000)
      );
      return;
    }

    replier.reply("[전적 검색 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[전적 검색 처리 오류]\n" + String(err));
  }
}

function sendOpenchatCommand(text, replier) {
  var body = "";
  var conn = null;
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;
  var parsedReply = "";

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
      .header("x-kakao-openchat-secret", KAKAO_OPENCHAT_SECRET)
      .header("x-kakao-secret", KAKAO_OPENCHAT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_OPENCHAT_SECRET)
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST);

    res = conn.execute();
    statusCode = res.statusCode();
    resultText = res.body();

    data = safeJsonParse(resultText);

    parsedReply = extractBotReplyText(data);
    if (parsedReply != "") {
      replier.reply(parsedReply);
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[전적/명령어 서버 오류]\n" +
          "상태코드: " +
          statusCode +
          "\n" +
          "명령어: " +
          text +
          "\n" +
          "응답: " +
          limitText(String(resultText || "응답 없음"), 1000)
      );
      return;
    }

    replier.reply("[전적/명령어 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[전적/명령어 처리 오류]\n" + String(err));
  }
}

function isSeasonRecruitTemplateCommand(text) {
  text = trimText(normalizeText(String(text || "")));

  return /^\/?(?:내전구인구직|내전구인)(?:\s*#?\s*\d{1,3})?\s*$/.test(text);
}

function isSeasonRecruitStatusCommand(text) {
  text = trimText(normalizeText(String(text || "")));

  return /^\/?(?:내전현황|시즌내전현황|AI공지)(?:\s*#?\s*\d{1,3})?\s*$/.test(text);
}

function isSeasonRecruitResetCommand(text) {
  text = trimText(normalizeText(String(text || "")));

  return /^\/?(?:오늘내전초기화|내전초기화)(?:\s*#?\s*\d{1,3})?\s*$/.test(text);
}

function extractSeasonRecruitNoFromCommand(text) {
  var match = null;
  var recruitNo = 1;

  text = trimText(normalizeText(String(text || "")));
  match = text.match(/#?\s*(\d{1,3})\s*$/);

  if (match) {
    recruitNo = Number(match[1]);
    if (recruitNo >= 1 && recruitNo <= 999) {
      return recruitNo;
    }
  }

  return 1;
}

function extractSeasonRecruitNoFromSnapshot(text) {
  var headerText = "";
  var lines = [];
  var match = null;
  var recruitNo = 1;

  text = normalizeText(String(text || ""));
  lines = text.split("\n");
  headerText = lines.slice(0, 8).join("\n");

  match = headerText.match(/(?:내전\s*(?:번호|NO|No|no)\s*[:：]?\s*#?\s*)(\d{1,3})/i);
  if (!match) match = headerText.match(/#\s*(\d{1,3})\s*(?:협곡\s*내전|협곡내전|내전)/i);
  if (!match) match = headerText.match(/(?:협곡\s*내전|협곡내전|내전)\s*(?:하실분|하실\s*분|구인|모집)?\s*#\s*(\d{1,3})/i);
  if (!match) match = headerText.match(/(?:협곡\s*내전|협곡내전|내전)\s*#\s*(\d{1,3})/i);

  if (match) {
    recruitNo = Number(match[1]);
    if (recruitNo >= 1 && recruitNo <= 999) {
      return recruitNo;
    }
  }

  return 1;
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
    body += "\"recruitNo\":" + String(extractSeasonRecruitNoFromCommand(text)) + ",";
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

function getSeasonRecruitTemplateNotice(commandText) {
  var n = "\n";
  var now = new Date();
  var recruitNo = extractSeasonRecruitNoFromCommand(commandText);
  var dateText = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());

  return (
    "📢 협곡내전하실분 #" + recruitNo +
    n +
    " 》" +
    dateText +
    " 21시" +
    n +
    n +
    "*참가 신청 양식*" +
    n +
    "이름/현티어/최고티어/주,부라인" +
    n +
    "EX) 1.지후/P/E/AD,MD" +
    n +
    n +
    "1." +
    n +
    "2." +
    n +
    "3." +
    n +
    "4." +
    n +
    "5." +
    n +
    "6." +
    n +
    "7." +
    n +
    "8." +
    n +
    "9." +
    n +
    "10."
  );
}

function isPartyRecruitLikeMessage(text) {
  text = normalizeText(String(text || ""));

  if (/\d{1,2}\s*인\s*(?:파티\s*)?구인/.test(text)) return true;
  if (text.indexOf("파티 구인") >= 0) return true;
  if (text.indexOf("모집번호") >= 0) return true;
  if (text.indexOf("게임정보") >= 0) return true;
  if (text.indexOf("시작시간") >= 0 && text.indexOf("파티") >= 0) return true;
  if (text.indexOf("5인 협곡 파티 구인") >= 0) return true;

  return false;
}

function isSeasonApplyFormMessage(text) {
  var filledCount = 0;

  text = normalizeText(text);

  if (isPartyRecruitLikeMessage(text)) {
    return false;
  }

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
  var conn = null;
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;
  var parsedReply = "";
  var recruitNo = 1;

  try {
    text = normalizeText(text);
    recruitNo = extractSeasonRecruitNoFromSnapshot(text);
    hash = makeHash("season-apply:" + String(recruitNo) + ":" + text);

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
    body += "\"recruitNo\":" + String(recruitNo) + ",";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    conn = org.jsoup.Jsoup.connect(RECRUIT_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .header("x-kakao-secret", KAKAO_RECRUIT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_RECRUIT_SECRET)
      .timeout(25000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST);

    res = conn.execute();
    statusCode = res.statusCode();
    resultText = res.body();
    data = safeJsonParse(resultText);

    parsedReply = extractBotReplyText(data);
    if (parsedReply != "") {
      replier.reply(parsedReply);
      if (data && data.ok) {
        lastRecruitHash = hash;
        DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
      }
      return;
    }

    if (statusCode == 401 || statusCode == 403) {
      replier.reply(
        "[참가 신청 등록 인증 오류]\n" +
          "KAKAO_RECRUIT_SECRET 값이 서버와 봇 코드에서 같은지 확인하세요.\n" +
          "상태코드: " +
          statusCode
      );
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[참가 신청 등록 서버 오류]\n" +
          "상태코드: " +
          statusCode +
          "\n응답: " +
          limitText(String(resultText || "응답 없음"), 1200)
      );
      return;
    }

    if (data && data.ok && Number(data.pending || 0) === 0) {
      replier.reply(getSeasonApplyCompleteNotice());
      lastRecruitHash = hash;
      DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
      return;
    }

    replier.reply("[참가 신청 등록 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1200));
  } catch (err) {
    replier.reply("[참가 신청 등록 API 오류]\n" + String(err));
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

function isPartyRecruitWebHelperCommand(text) {
  text = normalizeCommandText(text);

  return (
    text == "구인도우미" ||
    text == "/구인도우미" ||
    text == "구인웹도우미" ||
    text == "/구인웹도우미" ||
    text == "구인매뉴얼" ||
    text == "/구인매뉴얼" ||
    text == "명령어페이지" ||
    text == "/명령어페이지"
  );
}

function isPartyRecruitHelpCommand(text) {
  text = normalizeCommandText(text);

  return (
    text == "구인구직도움말" ||
    text == "/구인구직도움말" ||
    text == "구인도움말" ||
    text == "/구인도움말" ||
    text == "구인명령어" ||
    text == "/구인명령어"
  );
}

function isPartyRecruitStatusCommand(text) {
  text = normalizeCommandText(text);

  return (
    text == "현재구인구직현황" ||
    text == "/현재구인구직현황" ||
    text == "현재구인현황" ||
    text == "/현재구인현황" ||
    text == "구인구직현황" ||
    text == "/구인구직현황" ||
    text == "구인현황" ||
    text == "/구인현황" ||
    text == "현황" ||
    text == "/현황" ||
    /^\/?(?:구인상세|상세)\s*#?\s*\d{1,2}$/.test(text)
  );
}

function isPartyRecruitCreateCommand(text) {
  text = trimText(normalizeText(text));

  if (/^\/?\d{1,2}\s*인\s*(?:파티|구인)(?:\s+\d{1,2})?\s*$/.test(text)) {
    return true;
  }

  return /^\/?(칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|5인협곡파티)(?:\s+\d{1,2})?\s*$/.test(text);
}

function isPartyRecruitFinishCommand(text) {
  text = trimText(normalizeText(text));

  if (/^\/?\d{1,3}\s*(쫑|ㅉ)\s*$/.test(text)) {
    return true;
  }

  if (/^\/?구인마감\s*#?\s*\d{1,3}\s*$/.test(text)) {
    return true;
  }

  if (/^\/?#\s*\d{1,3}\s*(쫑|ㅉ)\s*$/.test(text)) {
    return true;
  }

  return false;
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

  if (/\d{1,2}\s*인\s*파티\s*구인/.test(text)) return true;
  if (/\d{1,2}\s*인\s*구인/.test(text)) return true;
  if (text.indexOf("5인 협곡 파티 구인") >= 0) return true;

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

  if (/(^|\n)\s*\d{1,2}(?:[.)]|\s+)/.test(text)) {
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
    body += "\"recruitNo\":" + String(extractSeasonRecruitNoFromCommand(text)) + ",";
    body += "\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(apiUrl)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .header("x-kakao-secret", KAKAO_RECRUIT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_RECRUIT_SECRET)
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    statusCode = res.statusCode();
    resultText = res.body();
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      return Boolean(data.ok !== false && statusCode >= 200 && statusCode < 300);
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply("[" + label + " 서버 오류]\n상태코드: " + statusCode + "\n" + limitText(String(resultText || "응답 없음"), 1000));
      return false;
    }

    replier.reply("[" + label + " 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
    return false;
  } catch (err) {
    replier.reply("[" + label + " API 오류]\n" + String(err));
    return false;
  }
}

function handlePartyRecruitSync(roomLabel, text, sender, replier) {
  var hash = "";
  var saved = "";
  var ok = false;

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

    ok = handlePartyRecruitApi(
      PARTY_RECRUIT_SYNC_API_URL,
      roomLabel,
      text,
      sender,
      replier,
      "구인구직 현황 반영"
    );

    if (ok === true) {
      lastPartyRecruitHash = hash;
      DataBase.setDataBase(PARTY_RECRUIT_SAVE_KEY, hash);
    }
  } catch (err) {
    replier.reply("[구인구직 현황 반영 오류]\n" + String(err));
  }
}

function fetchPartyRecruitStatusText(silentWhenEmpty, messageText) {
  var res = null;
  var resultText = "";
  var data = null;
  var body = "";

  try {
    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"";
    body += ",\"message\":\"" + escapeJson(String(messageText || "구인현황")) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(PARTY_RECRUIT_STATUS_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .header("x-kakao-secret", KAKAO_RECRUIT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_RECRUIT_SECRET)
      .timeout(15000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
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
  return (
    "[K-LOL.GG 구인구직방 참가 자동 등록 완료]\n" +
    "내전 시작 10분전에 디스코드 내전 대기방으로 와주세요."
  );
}

function getParticipationGuideNotice() {
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

function getPartyRecruitWebHelperNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 구인도우미]" + n + n;
  text += "현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요." + n + n;
  text += BASE_URL + "/recruit-helper" + n + n;
  text += "구인현황 바로가기:" + n;
  text += BASE_URL + "/recruit";

  return text;
}

function getPartyRecruitHelpNotice() {
  var n = "\n";

  return (
    "[K-LOL.GG 구인구직 도움말]" + n +
    "" + n +
    "구인 전에는 /구인현황 을 먼저 확인해주세요." + n +
    "" + n +
    "[파티 만들기]" + n +
    "/숫자인파티" + n +
    "예) /2인파티, /5인파티, /8인파티, /10인파티" + n +
    "" + n +
    "[파티 참여]" + n +
    "1. /구인현황 확인" + n +
    "2. 참여할 파티 양식 복사" + n +
    "3. 빈자리에 이름 추가" + n +
    "4. 수정한 양식 전송" + n +
    "" + n +
    "[파티 제외]" + n +
    "1. /구인현황 확인" + n +
    "2. 내 이름이 있는 양식 복사" + n +
    "3. 내 이름 삭제" + n +
    "4. 수정한 양식 전송" + n +
    "" + n +
    "[파티 마감]" + n +
    "번호ㅉ" + n +
    "예) 13ㅉ" + n +
    "" + n +
    "[상세 보기]" + n +
    "구인상세 번호" + n +
    "예) 구인상세 13" + n +
    "" + n +
    "[내전]" + n +
    "/내전구인 : 내전 양식 불러오기" + n +
    "/내전현황 : 내전 현황 보기"
  );
}

function getUnifiedHelpNotice() {
  var n = "\n";

  return (
    "[K-LOL.GG 일반 도움말]" + n +
    "" + n +
    "LOL-K 기능" + n +
    "- 내전현황 : 현재 시즌내전 신청 현황" + n +
    "- AI공지 : 내전현황과 동일하게 처리" + n +
    "- 오늘내전초기화 : 오늘 시즌내전 참가 신청 전체 초기화" + n +
    "- 내전참가 / 참가신청 : 참가 방법 안내" + n +
    "- 전적 닉네임#태그 : 플레이어 전적 조회" + n +
    "- 최근 닉네임#태그 : 최근 경기 조회" + n +
    "- 랭킹 : 랭킹 조회" + n +
    "" + n +
    "구인구직 명령어는 구인도움말을 입력해주세요." + n +
    "" + n +
    "참고" + n +
    "- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다." + n +
    "- 예) /내전현황, /전적 닉네임#태그, /구인도움말" + n +
    "" + n +
    "테스트 명령어" + n +
    "- 해시테스트" + n +
    "- 이미지DB테스트"
  );
}



function stripOperationLinePrefix(line) {
  line = trimText(String(line || ""));
  line = line.replace(/^\s*\d+\s*[.)]\s*/, "");
  return trimText(line);
}

function canonicalOperationText(value) {
  value = String(value || "");
  value = value.replace(/\s+/g, "");
  value = value.replace(/[.:：()（）\[\]{}<>·ㆍ,，\/\\_-]/g, "");
  return trimText(value);
}

function escapeOperationRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeOperationLabelRegex(label) {
  var compact = String(label || "").replace(/\s+/g, "");
  var pattern = "";
  var i = 0;

  for (i = 0; i < compact.length; i++) {
    if (i > 0) {
      pattern += "\\s*";
    }
    pattern += escapeOperationRegExp(compact.charAt(i));
  }

  return new RegExp("^\\s*" + pattern + "\\s*");
}

function lineStartsWithOperationLabel(line, label) {
  line = stripOperationLinePrefix(line);
  return canonicalOperationText(line).indexOf(canonicalOperationText(label)) == 0;
}

function removeOperationLabelPrefix(line, label) {
  line = stripOperationLinePrefix(line);
  return trimText(line.replace(makeOperationLabelRegex(label), ""));
}

function includesAllKeywords(text, keywords) {
  var i = 0;
  var j = 0;
  var lines = [];
  var found = false;

  text = normalizeText(String(text || ""));
  lines = text.split("\n");

  for (i = 0; i < keywords.length; i++) {
    found = false;

    for (j = 0; j < lines.length; j++) {
      if (lineStartsWithOperationLabel(lines[j], keywords[i])) {
        found = true;
        break;
      }
    }

    if (!found) {
      return false;
    }
  }

  return true;
}

function isOperationNextLabelLine(line, labels) {
  var i = 0;

  for (i = 0; i < labels.length; i++) {
    if (lineStartsWithOperationLabel(line, labels[i])) {
      return true;
    }
  }

  return false;
}

function readOperationField(text, label, nextLabels) {
  var lines = [];
  var i = 0;
  var line = "";
  var out = [];
  var collecting = false;

  text = normalizeText(String(text || ""));
  nextLabels = nextLabels || [];
  lines = text.split("\n");

  for (i = 0; i < lines.length; i++) {
    line = stripOperationLinePrefix(lines[i]);

    if (!collecting) {
      if (lineStartsWithOperationLabel(line, label)) {
        out.push(removeOperationLabelPrefix(line, label));
        collecting = true;
      }
      continue;
    }

    if (isOperationNextLabelLine(line, nextLabels)) {
      break;
    }

    out.push(line);
  }

  return trimText(out.join("\n"));
}

function cleanOperationField(value) {
  var lines = [];
  var out = [];
  var i = 0;
  var line = "";

  value = normalizeText(String(value || ""));
  lines = value.split("\n");

  for (i = 0; i < lines.length; i++) {
    line = trimText(lines[i]);
    if (line == "") continue;

    line = line.replace(/^\s*[:：]\s*/, "");
    line = line.replace(/^\s*[-]\s*/, "");
    line = line.replace(/^\s*\([^)]*\)\s*/, "");
    line = line.replace(/^\s*（[^）]*）\s*/, "");
    line = line.replace(/^\s*[:：]\s*/, "");
    line = line.replace(/^\s*[-]\s*/, "");
    line = trimText(line);

    if (line == "") continue;

    line = trimText(line.replace(/\s*\*\s*EX\)?[\s\S]*$/i, ""));
    line = trimText(line.replace(/\s*\*\s*예시[\s\S]*$/i, ""));
    line = trimText(line.replace(/\s*\*\s*선택\s*:?[\s\S]*$/i, ""));
    line = trimText(line.replace(/\s*\*\s*특별한\s*사유\s*없이는[\s\S]*$/i, ""));

    if (line == "") continue;
    if (/^\*\s*EX\)?/i.test(line)) continue;
    if (/^\*\s*예시/i.test(line)) continue;
    if (/^\*\s*선택\s*:?/i.test(line)) continue;
    if (/^\*\s*특별한\s*사유\s*없이는/i.test(line)) continue;

    if (/^\(?\s*소통방\s*,\s*구인방\s*,\s*디코\s*\)?$/.test(line)) continue;
    if (/^\(?\s*게임명\s*적기\s*\)?$/.test(line)) continue;
    if (/^\(?\s*장기\s*,\s*단기\s*,\s*특정\s*게임.*\)?$/.test(line)) continue;

    out.push(line);
  }

  return trimText(out.join("\n"));
}

function hasRealOperationValue(value) {
  value = cleanOperationField(value);
  if (value == "") return false;
  if (/^[.:：\-_/()（）\[\]{}\s]+$/.test(value)) return false;
  return true;
}

function detectOperationFormType(text) {
  text = normalizeText(String(text || ""));

  if (includesAllKeywords(text, ["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"])) {
    return "friends";
  }

  if (includesAllKeywords(text, ["본인 이름 및 닉네임", "건의 사유", "건의 내용"])) {
    return "suggestions";
  }

  if (includesAllKeywords(text, ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"])) {
    return "meetups";
  }

  if (includesAllKeywords(text, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"])) {
    return "leaves";
  }

  return "";
}

function isOperationFormMessage(text) {
  var values = [];
  var formType = "";

  text = normalizeText(String(text || ""));
  formType = detectOperationFormType(text);

  if (formType == "friends") {
    values = [
      readOperationField(text, "지인 이름", ["지인 닉네임", "이용기간", "디스코드 닉네임 변경"]),
      readOperationField(text, "지인 닉네임", ["이용기간", "디스코드 닉네임 변경"]),
      readOperationField(text, "이용기간", ["디스코드 닉네임 변경"])
    ];
    return hasRealOperationValue(values[0]) && hasRealOperationValue(values[1]) && hasRealOperationValue(values[2]);
  }

  if (formType == "suggestions") {
    values = [
      readOperationField(text, "본인 이름 및 닉네임", ["건의 사유", "건의 내용"]),
      readOperationField(text, "건의 사유", ["건의 내용"]),
      readOperationField(text, "건의 내용", [])
    ];
    return hasRealOperationValue(values[0]) && hasRealOperationValue(values[1]) && hasRealOperationValue(values[2]);
  }

  if (formType == "meetups") {
    values = [
      readOperationField(text, "주최자 이름 및 닉네임", ["일자", "장소", "참여자 명단"]),
      readOperationField(text, "일자", ["장소", "참여자 명단"]),
      readOperationField(text, "장소", ["참여자 명단"]),
      readOperationField(text, "참여자 명단", [])
    ];
    return hasRealOperationValue(values[0]) && hasRealOperationValue(values[1]) && hasRealOperationValue(values[2]) && hasRealOperationValue(values[3]);
  }

  if (formType == "leaves") {
    values = [
      readOperationField(text, "이름 및 닉네임", ["외출기간", "외출사유", "외출범위"]),
      readOperationField(text, "외출기간", ["외출사유", "외출범위"]),
      readOperationField(text, "외출사유", ["외출범위"])
    ];
    return hasRealOperationValue(values[0]) && hasRealOperationValue(values[1]) && hasRealOperationValue(values[2]);
  }

  return false;
}

function handleOperationFormMessage(room, text, sender, replier) {
  var hash = "";
  var saved = "";
  var body = "";
  var res = null;
  var statusCode = 0;
  var resultText = "";
  var data = null;
  var parsedReply = "";

  try {
    text = normalizeText(text);
    hash = makeHash("operation-form:" + text);

    if (lastOperationFormHash == hash) {
      return;
    }

    saved = DataBase.getDataBase(OPERATION_FORM_SAVE_KEY);
    if (saved == hash) {
      lastOperationFormHash = hash;
      return;
    }

    body = "{";
    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"";
    body += ",\"room\":\"" + escapeJson(room) + "\"";
    body += ",\"sender\":\"" + escapeJson(sender) + "\"";
    body += ",\"formType\":\"" + escapeJson(detectOperationFormType(text)) + "\"";
    body += ",\"message\":\"" + escapeJson(text) + "\"";
    body += "}";

    res = org.jsoup.Jsoup.connect(OPERATION_FORM_API_URL)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .header("x-kakao-secret", KAKAO_RECRUIT_SECRET)
      .header("Authorization", "Bearer " + KAKAO_RECRUIT_SECRET)
      .timeout(20000)
      .requestBody(body)
      .method(org.jsoup.Connection.Method.POST)
      .execute();

    statusCode = res.statusCode();
    resultText = res.body();
    data = safeJsonParse(resultText);

    parsedReply = extractBotReplyText(data);
    if (parsedReply != "") {
      replier.reply(parsedReply);
      if (data && data.ok) {
        lastOperationFormHash = hash;
        DataBase.setDataBase(OPERATION_FORM_SAVE_KEY, hash);
      }
      return;
    }

    if (statusCode == 401 || statusCode == 403) {
      replier.reply(
        "[운영 양식 접수 인증 오류]\n" +
          "KAKAO_RECRUIT_SECRET 값이 서버와 봇 코드에서 같은지 확인하세요.\n" +
          "상태코드: " +
          statusCode
      );
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      replier.reply(
        "[운영 양식 접수 서버 오류]\n" +
          "상태코드: " +
          statusCode +
          "\n응답: " +
          limitText(String(resultText || "응답 없음"), 1000)
      );
      return;
    }

    replier.reply("[운영 양식 접수 서버 응답 확인 필요]\n" + limitText(String(resultText || "응답 없음"), 1000));
  } catch (err) {
    replier.reply("[운영 양식 접수 API 오류]\n" + String(err));
  }
}

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