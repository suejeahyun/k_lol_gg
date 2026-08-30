/* eslint-disable */
var BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31";

var BASE_URL = "https://k-lol-gg.vercel.app";


var OPENCHAT_API_URL = BASE_URL + "/api/kakao/openchat";

var SEARCH_PLAYER_API_URL = BASE_URL + "/api/kakao/search-player";


var RECRUIT_API_URL = BASE_URL + "/api/kakao/recruit/season-apply";

var SEASON_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/recruit/season-apply/status";


var PARTY_RECRUIT_CREATE_API_URL = BASE_URL + "/api/kakao/party-recruits/create";

var PARTY_RECRUIT_SYNC_API_URL = BASE_URL + "/api/kakao/party-recruits/sync";

var PARTY_RECRUIT_FINISH_API_URL = BASE_URL + "/api/kakao/party-recruits/finish";

var PARTY_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/party-recruits/status";

var SCRIM_RECRUIT_CREATE_API_URL = BASE_URL + "/api/kakao/destruction-scrim-recruits/create";
var SCRIM_RECRUIT_STATUS_API_URL = BASE_URL + "/api/kakao/destruction-scrim-recruits/status";

var OPERATION_FORM_API_URL = BASE_URL + "/api/kakao/operation-forms";
var MANAGED_FORM_API_URL = BASE_URL + "/api/kakao/managed-forms";
var IMAGE_RECEIVE_API_URL = BASE_URL + "/api/kakao/image-receive";
var WEB_INHOUSE_RESULT_UPLOAD_URL = BASE_URL + "/matches/submit";
var WEB_ADMIN_DISCIPLINE_CREATE_URL = BASE_URL + "/admin/discipline/new";
var WEB_DISCIPLINE_EVIDENCE_URL = BASE_URL + "/discipline/evidence";
var WEB_REGISTRATION_HUB_URL = BASE_URL + "/start";
var WEB_ACCOUNT_DISCIPLINE_URL = BASE_URL + "/account#discipline";


function readPrivateBotSetting(key) {
  try { return trimText(String(DataBase.getDataBase(key) || "")); } catch (ignored) { return ""; }
}

/* 인증값은 소스에 적지 말고 메신저봇R DataBase에만 저장합니다. */
var KAKAO_RECRUIT_SECRET = readPrivateBotSetting("KLOL_KAKAO_RECRUIT_SECRET");
var KAKAO_OPENCHAT_SECRET = readPrivateBotSetting("KLOL_KAKAO_OPENCHAT_SECRET");
var KAKAO_SEARCH_PLAYER_SECRET = readPrivateBotSetting("KLOL_KAKAO_SEARCH_PLAYER_SECRET");


var RECRUIT_ROOM_LABEL = "K롤방 구인구직방";


var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_UNIFIED_V24";

var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_UNIFIED_V18";
var SCRIM_RECRUIT_SAVE_KEY = "KLOL_SCRIM_RECRUIT_LAST_HASH_V1";

var OPERATION_FORM_SAVE_KEY = "KLOL_OPERATION_FORM_LAST_HASH_V1";


var lastRecruitHash = "";

var lastPartyRecruitHash = "";
var lastScrimRecruitHash = "";

var lastOperationFormHash = "";


function isKlolBotEchoSender(sender) {

  sender = trimText(String(sender || ""));

  if (sender == "") return false;

  return sender.indexOf("\uC624\uD508\uCC44\uD305\uBD07") >= 0 ||
    sender.indexOf("K-LOL") >= 0 ||
    sender.indexOf("\uAD6C\uC778\uAD6C\uC9C1 \uB3C4\uC6B0\uBBF8") >= 0 ||
    sender.indexOf("\uAD6C\uC778\uB3C4\uC6B0\uBBF8") >= 0;

}


function isKlolServerEchoMessage(text) {

  text = trimText(normalizeText(String(text || "")));

  if (text == "") return false;

  return text.indexOf("[K-LOL.GG") === 0 ||
    text.indexOf("[\uC2A4\uD06C\uB9BC\uAD6C\uC778") === 0 ||
    text.indexOf("[\uAD6C\uC778\uAD6C\uC9C1") === 0 ||
    text.indexOf("[\uB0B4\uC804\uD604\uD669") === 0 ||
    text.indexOf("[\uCC38\uAC00 \uC2E0\uCCAD") === 0 ||
    text.indexOf("[\uC6B4\uC601 \uC591\uC2DD") === 0 ||
    text.indexOf("{\"ok\":") === 0;

}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {

  var text = "";

  var roomText = "";

  var senderText = "";


  try {

    text = trimText(normalizeText(String(msg || "")));

    roomText = trimText(String(room || ""));

    senderText = trimText(String(sender || ""));

    var receivedImage = "";
    try {
      if (imageDB && imageDB.getImage) receivedImage = String(imageDB.getImage() || "");
    } catch (ignoredImageError) { receivedImage = ""; }
    if (receivedImage == "") {
      try {
        if (imageDB && imageDB.getImageBase64) receivedImage = String(imageDB.getImageBase64() || "");
      } catch (ignoredImageBase64Error) { receivedImage = ""; }
    }
    if (receivedImage == "") {
      try {
        if (imageDB && imageDB.getImageBitmap) {
          var receivedBitmap = imageDB.getImageBitmap();
          if (receivedBitmap) {
            var imageStream = new java.io.ByteArrayOutputStream();
            receivedBitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, imageStream);
            receivedImage = String(android.util.Base64.encodeToString(imageStream.toByteArray(), android.util.Base64.NO_WRAP) || "");
            imageStream.close();
          }
        }
      } catch (ignoredImageBitmapError) { receivedImage = ""; }
    }

    if (receivedImage != "") {
      handleManagedImage(roomText || RECRUIT_ROOM_LABEL, senderText, receivedImage, replier);
      return;
    }
    if (isImagePlaceholderMessage(text) && replyManagedImageFallback(roomText || RECRUIT_ROOM_LABEL, senderText, replier)) {
      return;
    }
    if (isKlolBotEchoSender(senderText) && isKlolServerEchoMessage(text)) {

      return;

    }
    if (text.indexOf("들어왔습니다") >= 0) {

      replier.reply("다시 오셨네요, 반가워요! 😊");

      return;

    }

    if (text.indexOf("나갔습니다") >= 0 || text.indexOf("초대되었습니다") >= 0) {

      return;

    }


    if (text == "") {

      return;

    }

    if (isRegistrationHubCommand(text)) {
      replier.reply(getRegistrationHubNotice());
      return;
    }

    if (isGuidedRegistrationShortcut(text)) {
      handleGuidedRegistrationShortcut(text, replier);
      return;
    }

    if (isManagedWorkflowMessage(text)) {
      handleSiteFirstManagedWorkflow(text, replier);
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


    if (isScrimRecruitCommand(text)) {

      handleScrimRecruitCommand(text, roomText || RECRUIT_ROOM_LABEL, senderText, replier);

      return;

    }


    if (isLolKCommand(text)) {

      handleLolKCommand(text, roomText, senderText, replier);

      return;

    }


    if (isPartyRecruitFormWithoutNumber(text)) {

      replier.reply(
        "[K-LOL.GG 양식 확인 필요]\n" +
        "모집번호를 찾지 못했습니다.\n\n" +
        "봇이 출력한 원본 양식의 ‘모집번호: #번호’를 유지해서 다시 보내주세요."
      );

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



function isScrimRecruitFormMessageForBot(text) {
  text = trimText(normalizeText(String(text || "")));
  var normalized = normalizeCommandText(text);

  if (/\[?K-?LOL\.GG스크림구인양식\]?/.test(normalized)) return true;
  if (/\[?K-?LOL\.GG멸망전스크림구인양식\]?/.test(normalized)) return true;

  var hasBaseFields = /일시\s*[:：]/.test(text) && /방식\s*[:：]/.test(text);
  var hasTeams = /(우리팀|아군팀|요청팀)\s*[:：]/.test(text) && /상대팀\s*[:：]/.test(text);
  var hasLanes = /(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]/i.test(text);
  if (hasBaseFields && hasTeams && hasLanes) return true;

  if (/스크림번호\s*[:：]/.test(text) && /(우리팀|아군팀|요청팀)/.test(text) && /상대팀/.test(text)) return true;
  if (/멸망전\s*(번호|ID)\s*[:：]/.test(text) && hasBaseFields && hasTeams) return true;

  return false;
}


function isScrimRecruitCommand(text) {
  text = trimText(normalizeText(String(text || "")));
  var normalized = normalizeCommandText(text);

  if (isScrimRecruitFormMessageForBot(text)) return true;
  if (/^\/?스크림\s*(구인|모집)(?:\s|$)/.test(text)) return true;
  if (/^\/?스크림\s*(현황|목록|상세)(?:\s|$|#?\d)/.test(text)) return true;
  if (/^\/?멸망전\s*스크림\s*(구인|모집|현황|목록|상세)?(?:\s*#?\d{1,3})?\s*$/.test(text)) return true;
  if (/^\/?멸망전스크림(?:구인|모집|현황|목록|상세)?(?:#?\d{1,3})?$/.test(normalized)) return true;

  return false;
}

function getScrimRecruitApiUrl(text) {
  var normalized = normalizeCommandText(text);

  if (isScrimRecruitFormMessageForBot(text)) return SCRIM_RECRUIT_CREATE_API_URL;
  if (/^\/?(?:스크림구인|스크림모집|멸망전스크림구인|멸망전스크림모집)/.test(normalized)) return SCRIM_RECRUIT_CREATE_API_URL;
  if (/^\/?(?:스크림현황|스크림목록|스크림상세|멸망전스크림현황|멸망전스크림목록|멸망전스크림상세)/.test(normalized)) return SCRIM_RECRUIT_STATUS_API_URL;
  return "";
}

function handleScrimRecruitCommand(text, room, sender, replier) {
  var apiUrl = getScrimRecruitApiUrl(text);
  if (apiUrl == "") {
    replier.reply("[K-LOL.GG 스크림구인]\n명령어를 확인하지 못했습니다. 양식 호출: /스크림구인");
    return;
  }

  handlePartyRecruitApi(apiUrl, room, text, sender, replier, "스크림구인");
}

function isLolKCommand(text) {

  var normalized = normalizeCommandText(text);


  if (normalized == "봇버전" || normalized == "/봇버전") return true;



  if (normalized == "도움말" || normalized == "/도움말") return true;

  if (normalized == "명령어" || normalized == "/명령어") return true;


  if (normalized == "내전참가" || normalized == "/내전참가") return true;

  if (normalized == "참가신청" || normalized == "/참가신청") return true;


  if (isSeasonRecruitStatusCommand(text)) return true;


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


  if (text.indexOf("/전적 ") == 0) {

    sendSearchPlayerCommand(text.replace(/^\/전적\s+/, "전적 "), room, sender, replier);

    return;

  }


  if (text.indexOf("전적 ") == 0) {

    sendSearchPlayerCommand(text, room, sender, replier);

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

    var seasonTemplateReply = fetchSeasonRecruitStatusText(
      room || RECRUIT_ROOM_LABEL,
      text,
      sender
    );

    if (seasonTemplateReply == "__NO_SEASON_RECRUIT_STATUS__" || seasonTemplateReply == "") {
      seasonTemplateReply = "[K-LOL.GG 내전구인 오류]\n서버 응답이 비어 있습니다. 잠시 후 다시 시도해주세요.";
    }
    replier.reply(seasonTemplateReply);

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

    replier.reply(fetchPartyRecruitStatusText(false, text, room || RECRUIT_ROOM_LABEL, sender));

    return;

  }


  if (isPartyRecruitCreateCommand(text)) {

    handlePartyRecruitApi(

      PARTY_RECRUIT_CREATE_API_URL,

      room || RECRUIT_ROOM_LABEL,

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

      room || RECRUIT_ROOM_LABEL,

      text,

      sender,

      replier,

      "구인구직 마무리"

    );

    return;

  }


  if (isPartyRecruitFormMessage(text)) {

    handlePartyRecruitSync(room || RECRUIT_ROOM_LABEL, text, sender, replier);

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


function sendSearchPlayerCommand(text, room, sender, replier) {

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

    body += ",\"roomName\":\"" + escapeJson(String(room || "")) + "\"";

    body += ",\"sender\":\"" + escapeJson(String(sender || "")) + "\"";

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


  return /^\/?(?:내전구인구직|내전구인)(?:\s*#?\s*\d{1,3}|\s+\S(?:.*\S)?)?\s*$/.test(text);

}


function isSeasonRecruitStatusCommand(text) {

  text = trimText(normalizeText(String(text || "")));


  return /^\/?(?:내전현황|내전상세|시즌내전현황|AI공지)(?:\s*#?\s*\d{1,3})?\s*$/.test(text);

}


function extractExplicitSeasonRecruitNoFromCommand(text) {

  var match = null;

  var recruitNo = 0;


  text = trimText(normalizeText(String(text || "")));

  match = text.match(/#?\s*(\d{1,3})\s*$/);


  if (match) {

    recruitNo = Number(match[1]);

    if (recruitNo >= 1 && recruitNo <= 999) {

      return recruitNo;

    }

  }


  return null;

}


function extractSeasonRecruitNoFromCommand(text) {

  var recruitNo = extractExplicitSeasonRecruitNoFromCommand(text);

  if (recruitNo !== null) return recruitNo;

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


  if (KAKAO_RECRUIT_SECRET == "") {
    return "[K-LOL.GG 설정 오류]\n봇 DataBase의 KLOL_KAKAO_RECRUIT_SECRET 값을 먼저 설정해주세요.";
  }


  try {

    var explicitRecruitNo = extractExplicitSeasonRecruitNoFromCommand(text);


    body = "{";

    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";

    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";

    body += "\"sender\":\"" + escapeJson(sender) + "\",";

    if (explicitRecruitNo !== null) {

      body += "\"recruitNo\":" + String(explicitRecruitNo) + ",";

    }

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

  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }

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

    hash = makeHash(
      "season-apply:" +
      roomLabel +
      ":" +
      sender +
      ":" +
      String(Math.floor(new Date().getTime() / 10000)) +
      ":" +
      String(recruitNo) +
      ":" +
      text
    );


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


  if (/^\/?\d{1,2}\s*(\uCAD1|\u3149)\s*$/.test(text)) {

    return true;

  }


  if (/^\/?#?\s*\d{1,2}\s*(\uBC88|\uC778)?\s*(\uD30C\uD2F0|\uAD6C\uC778)?\s*(\uCAD1|\u3149|\uB9C8\uAC10|\uC885\uB8CC)\s*$/.test(text)) {

    return true;

  }


  if (/^\/?\uAD6C\uC778(\uB9C8\uAC10|\uCAD1|\uC885\uB8CC)\s*#?\s*\d{1,2}\s*$/.test(text)) {

    return true;

  }


  if (/^\/?#\s*\d{1,2}\s*(\uCAD1|\u3149)\s*$/.test(text)) {

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
  var requestId = "";

  var res = null;

  var statusCode = 0;

  var resultText = "";

  var data = null;


  try {

    var explicitRecruitNo = extractExplicitSeasonRecruitNoFromCommand(text);
    var requestBucket = Math.floor(new Date().getTime() / 60000);
    requestId =
      "kakao:" +
      String(requestBucket) +
      ":" +
      String(makeHash(apiUrl + ":" + roomLabel + ":" + sender + ":" + text));


    body = "{";

    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\",";

    body += "\"room\":\"" + escapeJson(roomLabel) + "\",";

    body += "\"sender\":\"" + escapeJson(sender) + "\",";
    body += "\"requestId\":\"" + escapeJson(requestId) + "\",";
    body += "\"operatorOverride\":true,";

    if (explicitRecruitNo !== null) {

      body += "\"recruitNo\":" + String(explicitRecruitNo) + ",";

    }

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



    if (data && Number(data.statusCode || 0) === 401) {

      replier.reply("[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.");

      return false;

    }



    if (data && (data.ignored === true || data.empty === true) && !data.reply) {

      return Boolean(data.ok !== false && statusCode >= 200 && statusCode < 300);

    }


    if (data && data.reply !== undefined && String(data.reply || "") === "" && statusCode >= 200 && statusCode < 300) {

      return Boolean(data.ok !== false);

    }


    if (data && data.reply) {

      replier.reply(String(data.reply));

      return Boolean(data.ok !== false && statusCode >= 200 && statusCode < 300);

    }


    if (statusCode < 200 || statusCode >= 300) {

      replier.reply("[K-LOL.GG " + label + "]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");

      return false;

    }


    replier.reply("[K-LOL.GG " + label + "]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");

    return false;

  } catch (err) {

    replier.reply("[K-LOL.GG " + label + "]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");

    return false;

  }

}


function handlePartyRecruitSync(roomLabel, text, sender, replier) {

  var hash = "";

  var saved = "";

  var ok = false;


  try {

    text = normalizeText(text);

    hash = makeHash(
      "party-sync:" +
      roomLabel +
      ":" +
      sender +
      ":" +
      String(Math.floor(new Date().getTime() / 10000)) +
      ":" +
      text
    );


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


function fetchPartyRecruitStatusText(silentWhenEmpty, messageText, room, sender) {

  var res = null;

  var resultText = "";

  var data = null;

  var body = "";


  try {

    body = "{";

    body += "\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"";

    body += ",\"message\":\"" + escapeJson(String(messageText || "구인현황")) + "\"";

    body += ",\"roomName\":\"" + escapeJson(String(room || "")) + "\"";

    body += ",\"sender\":\"" + escapeJson(String(sender || "")) + "\"";

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

    "[K-LOL.GG 구인 도움말]" + n +
    "" + n +
    "1. 파티" + n +
    "생성: 5인파티" + n +
    "현황: 구인현황" + n +
    "종료: 번호ㅉ" + n +
    "" + n +
    "2. 내전" + n +
    "생성: 내전구인" + n +
    "현황: 내전현황" + n +
    "매일 오전 6시 자동 종료" + n +
    "" + n +
    "3. 스크림" + n +
    "생성: 스크림구인" + n +
    "현황: 스크림현황" + n +
    "매일 오전 6시 자동 종료" + n +
    "" + n +
    "공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송"

  );

}


function getUnifiedHelpNotice() {

  var n = "\n";


  return (

    "[K-LOL.GG 일반 도움말]" + n +

    "" + n +

    "LOL-K 기능" + n +

    "- 내전현황 : 현재 시즌내전 신청 현황" + n +

    "- 내전참가 / 참가신청 : 참가 방법 안내" + n +

    "- 전적 닉네임#태그 : 플레이어 전적 조회" + n +

    "- 최근 닉네임#태그 : 최근 경기 조회" + n +

    "- 랭킹 : 랭킹 조회" + n +

    "" + n +

    "운영 기능" + n +

    "- /등록 : 초보자용 등록 센터" + n +

    "- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록" + n +

    "- /경고등록 : 관리자 경고 등록 화면 열기" + n +

    "- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출" + n +

    "- /경고현황 : 내정보의 경고 진행 상황 열기" + n +

    "- /결과현황 : 사이트의 내 미완료 결과 접수 열기" + n +

    "" + n +

    "구인구직 명령어는 구인도움말을 입력해주세요." + n +
    "스크림구인은 /스크림구인, /스크림현황을 사용해주세요." + n +

    "" + n +

    "참고" + n +

    "- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다." + n +

    "- 예) /내전현황, /전적 닉네임#태그, /구인도움말"

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

    hash = makeHash("operation-form:" + room + ":" + sender + ":" + text);


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

    if (data && data.duplicate === true && data.ok === true) {
      lastOperationFormHash = hash;
      DataBase.setDataBase(OPERATION_FORM_SAVE_KEY, hash);
      return;
    }


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

      replier.reply("[K-LOL.GG 운영 양식]\n현재 접수 권한을 확인할 수 없습니다. 관리자에게 문의해주세요.");

      return;

    }


    if (statusCode < 200 || statusCode >= 300) {

      replier.reply("[K-LOL.GG 운영 양식]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");

      return;

    }


    replier.reply("[K-LOL.GG 운영 양식]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");

  } catch (err) {

    replier.reply("[K-LOL.GG 운영 양식]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");

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

function isRegistrationHubCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "등록" ||
    normalized == "/등록" ||
    normalized == "등록도움말" ||
    normalized == "/등록도움말";
}

function isGuidedRegistrationShortcut(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "내전등록" ||
    normalized == "/내전등록" ||
    normalized == "결과등록" ||
    normalized == "/결과등록" ||
    normalized == "내전결과" ||
    normalized == "/내전결과" ||
    normalized == "내전등록현황" ||
    normalized == "/내전등록현황" ||
    normalized == "경고등록" ||
    normalized == "/경고등록" ||
    normalized == "경고" ||
    normalized == "/경고" ||
    normalized == "인증" ||
    normalized == "/인증" ||
    normalized == "경고인증" ||
    normalized == "/경고인증" ||
    normalized == "경고현황" ||
    normalized == "/경고현황" ||
    normalized == "결과현황" ||
    normalized == "/결과현황";
}

function getRegistrationHubNotice() {
  var n = "\n";
  return (
    "[K-LOL.GG 쉬운 등록 센터]" + n +
    "처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다." + n +
    "▶ " + WEB_REGISTRATION_HUB_URL + n +
    "" + n +
    "① 내전 결과 등록" + n +
    "경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다." + n +
    "▶ " + WEB_INHOUSE_RESULT_UPLOAD_URL + n +
    "" + n +
    "② 주의·경고·벤 등록 (관리자)" + n +
    "대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다." + n +
    "▶ " + WEB_ADMIN_DISCIPLINE_CREATE_URL + n +
    "※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다." + n +
    "" + n +
    "③ 경고 차감 사진 제출" + n +
    "본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다." + n +
    "▶ " + WEB_DISCIPLINE_EVIDENCE_URL + n +
    "※ 본인 계정 로그인이 필요합니다." + n +
    "" + n +
    "등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다."
  );
}

function getGuidedInhouseRegistrationNotice() {
  var n = "\n";
  return (
    "[K-LOL.GG 내전 결과 등록]" + n +
    "가장 쉬운 등록 방법을 안내합니다." + n +
    "" + n +
    "1. 아래 링크를 엽니다." + n +
    "2. 세트 수·회차·팀 밸런스를 확인합니다." + n +
    "3. 결과 사진 2~3장을 한 번에 올리고 제출합니다." + n +
    "" + n +
    "▶ " + WEB_INHOUSE_RESULT_UPLOAD_URL + n +
    "" + n +
    "로그인하면 진행 중인 제출을 자동으로 찾아 이어서 할 수 있습니다."
  );
}

function getGuidedDisciplineRegistrationNotice() {
  var n = "\n";
  return (
    "[K-LOL.GG 관리자 경고 등록]" + n +
    "관리자 화면에서 대상 검색 → 종류 선택 → 사유·사진 등록 순서로 진행합니다." + n +
    "" + n +
    "▶ " + WEB_ADMIN_DISCIPLINE_CREATE_URL + n +
    "" + n +
    "※ 관리자 로그인과 2차 인증이 필요하며, 완료 후 이 화면으로 돌아옵니다."
  );
}

function getGuidedEvidenceNotice() {
  return (
    "[K-LOL.GG 경고 차감 사진 제출]\n" +
    "사이트에 로그인하면 본인의 진행 과제만 자동으로 표시됩니다.\n" +
    "로그인 계정 기준으로 남은 사진을 한 번에 제출할 수 있습니다.\n\n" +
    "▶ " + WEB_DISCIPLINE_EVIDENCE_URL
  );
}

function getGuidedDisciplineStatusNotice() {
  return (
    "[K-LOL.GG 내 경고 현황]\n" +
    "내정보에서 경고 상태와 남은 사진 수를 확인하세요.\n\n" +
    "▶ " + WEB_ACCOUNT_DISCIPLINE_URL
  );
}

function getGuidedInhouseStatusNotice() {
  return (
    "[K-LOL.GG 내전 결과 제출 현황]\n" +
    "사이트에 로그인하면 진행 중인 내 제출을 자동으로 확인할 수 있습니다.\n\n" +
    "▶ " + WEB_INHOUSE_RESULT_UPLOAD_URL
  );
}

function handleGuidedRegistrationShortcut(text, replier) {
  var normalized = normalizeCommandText(text);
  if (normalized == "내전등록" || normalized == "/내전등록" ||
      normalized == "결과등록" || normalized == "/결과등록" ||
      normalized == "내전결과" || normalized == "/내전결과") {
    replier.reply(getGuidedInhouseRegistrationNotice());
    return;
  }
  if (normalized == "경고등록" || normalized == "/경고등록" ||
      normalized == "경고" || normalized == "/경고") {
    replier.reply(getGuidedDisciplineRegistrationNotice());
    return;
  }
  if (normalized == "인증" || normalized == "/인증" ||
      normalized == "경고인증" || normalized == "/경고인증") {
    replier.reply(getGuidedEvidenceNotice());
    return;
  }
  if (normalized == "경고현황" || normalized == "/경고현황") {
    replier.reply(getGuidedDisciplineStatusNotice());
    return;
  }
  replier.reply(getGuidedInhouseStatusNotice());
}

function handleSiteFirstManagedWorkflow(text, replier) {
  text = trimText(normalizeText(String(text || "")));
  if (text.indexOf("경고현황") >= 0) {
    replier.reply(getGuidedDisciplineStatusNotice());
    return;
  }
  if (text.indexOf("인증") >= 0) {
    replier.reply(getGuidedEvidenceNotice());
    return;
  }
  if (text.indexOf("내전등록현황") >= 0 || text.indexOf("결과현황") >= 0 ||
      /^\/내전현황\s+/i.test(text)) {
    replier.reply(getGuidedInhouseStatusNotice());
    return;
  }
  if (text.indexOf("내전등록") >= 0 || text.indexOf("내전결과") >= 0 ||
      text.indexOf("결과등록") >= 0 || (text.charAt(0) == "[" && text.indexOf("내전") >= 0)) {
    replier.reply(getGuidedInhouseRegistrationNotice());
    return;
  }
  if (text.indexOf("경고") >= 0 || (text.charAt(0) == "[" && text.indexOf("징계") >= 0)) {
    replier.reply(getGuidedDisciplineRegistrationNotice());
    return;
  }
  replier.reply(getRegistrationHubNotice());
}

function isGuidedEvidenceCommand(text) {
  text = trimText(normalizeText(String(text || "")));
  return text == "/인증" ||
    text == "인증" ||
    text.indexOf("/인증 ") === 0 ||
    text.indexOf("인증 ") === 0;
}

function getGuidedEvidenceUrl(text, data) {
  return WEB_DISCIPLINE_EVIDENCE_URL;
}

function prependGuidedEvidenceNotice(text, data, reply) {
  if (!isGuidedEvidenceCommand(text)) return reply;
  return (
    "[K-LOL.GG 경고 차감 사진 제출]\n" +
    "✅ 권장: 아래 사이트에서 본인 과제를 선택하고 남은 사진을 한 번에 제출하세요.\n" +
    getGuidedEvidenceUrl(text, data) +
    "\n\n[카카오 사진 접수 안내]\n" +
    reply
  );
}

function isManagedWorkflowMessage(text) {
  text = trimText(normalizeText(String(text || "")));
  return text == "/경고" || text == "경고" ||
    text == "/내전등록" || text == "내전등록" ||
    text == "/내전결과" || text == "내전결과" ||
    text == "/결과등록" || text == "결과등록" ||
    text == "/사진취소" || text == "사진취소" ||
    /^\/?(?:경고|경고등록)\s+/.test(text) ||
    /^\/?(?:내전등록|결과등록|내전결과)\s+/.test(text) ||
    (text.charAt(0) == "[" && text.indexOf("양식") >= 0 && text.indexOf(" v") >= 0) ||
    text == "/경고현황" || text == "경고현황" ||
    text == "/경고인증" || text == "경고인증" ||
    text == "/인증" || text == "인증" ||
    text == "/내전등록현황" || text == "내전등록현황" ||
    text == "/결과현황" || text == "결과현황" ||
    text.indexOf("/경고현황 ") === 0 ||
    text.indexOf("/경고인증 ") === 0 ||
    text.indexOf("경고현황 ") === 0 ||
    text.indexOf("경고인증 ") === 0 ||
    text.indexOf("/인증 ") === 0 ||
    text.indexOf("인증 ") === 0 ||
    text.indexOf("/경고인증완료 ") === 0 ||
    text.indexOf("/내전등록현황 ") === 0 ||
    text.indexOf("내전등록현황 ") === 0 ||
    text.indexOf("/결과현황 ") === 0 ||
    text.indexOf("결과현황 ") === 0 ||
    /^\/내전현황\s+MR[A-F0-9]{10}$/i.test(text);
}

function managedUploadSaveKey(room, sender) {
  return "KLOL_MANAGED_UPLOAD_V1_" + makeHash(String(room || "") + "|" + String(sender || ""));
}

function rememberManagedUploadCode(room, sender, publicCode) {
  publicCode = trimText(String(publicCode || "")).toUpperCase();
  if (!/^(?:MR|DS|WR)[A-F0-9]{10}$/.test(publicCode)) return;
  try {
    DataBase.setDataBase(managedUploadSaveKey(room, sender), publicCode + "|" + String(new Date().getTime()));
  } catch (ignoredManagedCodeSaveError) {}
}

function clearManagedUploadCode(room, sender) {
  try {
    DataBase.setDataBase(managedUploadSaveKey(room, sender), "");
  } catch (ignoredManagedCodeClearError) {}
}

function readManagedUploadCode(room, sender) {
  try {
    var saved = trimText(String(DataBase.getDataBase(managedUploadSaveKey(room, sender)) || ""));
    var parts = saved.split("|");
    var code = trimText(String(parts[0] || "")).toUpperCase();
    var savedAt = Number(parts[1] || 0);
    if (!/^(?:MR|DS|WR)[A-F0-9]{10}$/.test(code)) return "";
    if (!savedAt || new Date().getTime() - savedAt > 30 * 60 * 1000) {
      clearManagedUploadCode(room, sender);
      return "";
    }
    return code;
  } catch (ignoredManagedCodeReadError) {
    return "";
  }
}

function isImagePlaceholderMessage(text) {
  text = trimText(normalizeText(String(text || "")));
  return text == "사진" || text == "[사진]" || text == "Photo" || text == "photo";
}

function replyManagedImageFallback(room, sender, replier) {
  var publicCode = readManagedUploadCode(room, sender);
  if (publicCode == "") return false;
  if (publicCode.indexOf("MR") === 0) {
    replier.reply("[K-LOL.GG 사진 수신 안내]\n카카오 사진 접수 대신 사이트에 로그인해 진행 중인 내전 결과를 이어서 제출해주세요.\n" + WEB_INHOUSE_RESULT_UPLOAD_URL);
  } else if (publicCode.indexOf("WR") === 0) {
    replier.reply("[K-LOL.GG 사진 수신 안내]\n카카오 사진 접수 대신 사이트에 로그인해 본인의 남은 경고 차감 사진을 제출해주세요.\n" + WEB_DISCIPLINE_EVIDENCE_URL);
  } else {
    replier.reply("[K-LOL.GG 사진 수신 안내]\n경고 등록은 관리자 사이트를 이용해주세요.\n" + WEB_ADMIN_DISCIPLINE_CREATE_URL);
  }
  return true;
}

function handleManagedWorkflowMessage(room, text, sender, replier) {
  var body = "";
  try {
    if (KAKAO_RECRUIT_SECRET == "") {
      replier.reply(prependGuidedEvidenceNotice(
        text,
        null,
        "[K-LOL.GG 설정 오류]\n봇 DataBase의 KLOL_KAKAO_RECRUIT_SECRET 값을 먼저 설정해주세요."
      ));
      return;
    }
    var requestBucket = Math.floor(new Date().getTime() / 60000);
    var requestId = "managed:" + String(requestBucket) + ":" + String(makeHash(room + ":" + sender + ":" + text));
    body = "{\"message\":\"" + escapeJson(text) + "\",\"roomName\":\"" + escapeJson(room) + "\",\"sender\":\"" + escapeJson(sender) + "\",\"requestId\":\"" + escapeJson(requestId) + "\",\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"}";
    var resultText = org.jsoup.Jsoup.connect(MANAGED_FORM_API_URL)
      .ignoreContentType(true).ignoreHttpErrors(true).timeout(30000)
      .header("Content-Type", "application/json; charset=UTF-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .requestBody(body).post().text();
    var data = safeJsonParse(resultText);
    if (data && (data.clearSession === true || data.sessionActive === false)) {
      var savedManagedCode = readManagedUploadCode(room, sender);
      var responseManagedCode = trimText(String(data.publicCode || "")).toUpperCase();
      if (responseManagedCode == "" || savedManagedCode == "" || savedManagedCode == responseManagedCode) {
        clearManagedUploadCode(room, sender);
      }
    }
    if (data && data.publicCode && data.sessionActive === true) rememberManagedUploadCode(room, sender, data.publicCode);
    var managedReply = data && data.reply ? String(data.reply) : "[K-LOL.GG]\n서버 응답을 해석하지 못했습니다.";
    replier.reply(prependGuidedEvidenceNotice(text, data, managedReply));
  } catch (error) {
    replier.reply(prependGuidedEvidenceNotice(
      text,
      null,
      "[K-LOL.GG]\n경고·내전 접수 서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요."
    ));
  }
}

function handleManagedImage(room, sender, imageBase64, replier) {
  var body = "";
  try {
    if (KAKAO_RECRUIT_SECRET == "") {
      replier.reply("[K-LOL.GG 사진 접수 실패]\n봇 인증값이 설정되지 않았습니다.");
      return true;
    }
    var publicCode = readManagedUploadCode(room, sender);
    if (publicCode == "") return false;
    var imageSessionCode = publicCode.indexOf("MR") === 0 || publicCode.indexOf("DS") === 0 ? publicCode : "";
    body = "{\"roomName\":\"" + escapeJson(room) + "\",\"sender\":\"" + escapeJson(sender) + "\",\"publicCode\":\"" + escapeJson(imageSessionCode) + "\",\"base64Image\":\"" + escapeJson(imageBase64) + "\",\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"}";
    var resultText = org.jsoup.Jsoup.connect(IMAGE_RECEIVE_API_URL)
      .ignoreContentType(true).ignoreHttpErrors(true).maxBodySize(0).timeout(90000)
      .header("Content-Type", "application/json; charset=UTF-8")
      .header("x-kakao-recruit-secret", KAKAO_RECRUIT_SECRET)
      .requestBody(body).post().text();
    var data = safeJsonParse(resultText);
    if (data && (data.clearSession === true || data.completed === true || data.sessionActive === false || Number(data.statusCode || 0) === 404 || Number(data.statusCode || 0) === 410)) {
      clearManagedUploadCode(room, sender);
    }
    replier.reply(data && data.reply ? String(data.reply) : "[K-LOL.GG 사진 접수 실패]\n서버 응답을 해석하지 못했습니다.");
    return true;
  } catch (error) {
    replier.reply("[K-LOL.GG 사진 접수 실패]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
    return true;
  }
}
