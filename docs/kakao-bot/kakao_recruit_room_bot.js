/*
 * K-LOL.GG 카카오봇 - K롤방 구인구직방 전용
 * 기능: 시즌내전 신청글 자동 등록, 구인구직 생성/반영/현황/마무리
 * 주의: LOL - K 전용 전적/최근/랭킹 명령어는 이 파일에서 처리하지 않음
 */

var RECRUIT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply";
var SEASON_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply/status";
var PARTY_RECRUIT_CREATE_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/create";
var PARTY_RECRUIT_SYNC_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/sync";
var PARTY_RECRUIT_FINISH_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/finish";
var PARTY_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/status";

var RECRUIT_SOURCE_ROOM = "K롤방 구인구직방";
var RECRUIT_ROOM_ALIASES = ["K롤방 구인구직방", "K-LOL 구인구직 도우미", "롤톡방 구인구직 도우미", "구인구직 도우미"];
var NOTICE_ROOM_ALIASES = ["LOL - K", "K-LOL 전적검색", "롤 전적검색"];

var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";
var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_V2";
var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_V2";

var lastRecruitHash = "";
var lastPartyRecruitHash = "";

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

    if (!isRecruitRoom(room)) {
      return;
    }

    if (isNoticeRoom(room) || isNoticeOnlyCommand(text)) {
      return;
    }

    if (text == "도움말") {
      replier.reply(getRecruitRoomHelpNotice());
      return;
    }

    if (text == "신청초기화") {
      lastRecruitHash = "";
      lastPartyRecruitHash = "";
      DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
      DataBase.setDataBase(PARTY_RECRUIT_SAVE_KEY, "");
      replier.reply("[신청 인식 초기화 완료]\n같은 신청글과 구인구직 양식을 다시 처리할 수 있습니다.");
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
      replier.reply(fetchSeasonRecruitStatusText(RECRUIT_SOURCE_ROOM, text, sender));
      return;
    }

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
      handlePartyRecruitApi(PARTY_RECRUIT_CREATE_API_URL, RECRUIT_SOURCE_ROOM, text, sender, replier, "구인구직 생성");
      return;
    }

    if (isPartyRecruitFinishCommand(text)) {
      handlePartyRecruitApi(PARTY_RECRUIT_FINISH_API_URL, RECRUIT_SOURCE_ROOM, text, sender, replier, "구인구직 마무리");
      return;
    }

    if (isPartyRecruitFormMessage(text)) {
      handlePartyRecruitSync(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }

    if (isRecruitMessage(text)) {
      handleRecruitMessage(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }
  } catch (e) {
    replier.reply("[구인구직방 봇 처리 오류]\n" + String(e));
  }
}

function isRecruitRoom(room) {
  return isInAliases(room, RECRUIT_ROOM_ALIASES);
}

function isNoticeRoom(room) {
  return isInAliases(room, NOTICE_ROOM_ALIASES);
}

function isInAliases(room, aliases) {
  var value = trimText(String(room || ""));
  var i = 0;

  for (i = 0; i < aliases.length; i++) {
    if (value == aliases[i]) return true;
  }

  return false;
}

function isNoticeOnlyCommand(text) {
  var normalized = normalizeCommandText(text);

  if (normalized == "내전참가" || normalized == "참가신청") return true;
  if (normalized == "전적") return true;
  if (text.indexOf("전적 ") == 0) return true;
  if (text.indexOf("최근 ") == 0) return true;
  if (normalized == "랭킹") return true;
  if (normalized == "AI공지") return true;

  return false;
}

function isSeasonRecruitTemplateCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "/내전구인구직" || normalized == "내전구인구직";
}

function isSeasonRecruitStatusCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "내전현황" || normalized == "/내전현황" || normalized == "시즌내전현황" || normalized == "/시즌내전현황";
}

function getSeasonRecruitTemplateNotice() {
  var n = "\n";
  var now = new Date();
  var dateText = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate());

  return "📢 협곡내전하실분" + n +
    " 》" + dateText + n + n +
    "*참가 신청 양식*" + n +
    "이름/현티어/최고티어/주,부라인" + n +
    "EX) 1.지후/P/E/AD,MD" + n + n +
    "1." + n + "2." + n + "3." + n + "4." + n + "5." + n +
    "6." + n + "7." + n + "8." + n + "9." + n + "10.";
}

function fetchSeasonRecruitStatusText(room, text, sender) {
  var body = "";
  var resultText = "";
  var data = null;

  try {
    body = makeSecretBody(room, sender, text);
    resultText = httpPostText(SEASON_RECRUIT_STATUS_API_URL, body, 20000);
    data = safeJsonParse(resultText);

    if (!data || !data.ok) return "[내전현황]\n현황을 불러오지 못했습니다.\n" + trimLong(resultText, 500);
    if (data.empty) return "[내전현황]\n현재 등록된 내전 신청 현황이 없습니다.";
    return String(data.reply || "[내전현황]\n현황 응답이 비어 있습니다.");
  } catch (e) {
    return "[내전현황 API 오류]\n" + String(e);
  }
}

function handleRecruitMessage(room, text, sender, replier) {
  var hash = "";
  var saved = "";
  var body = "";
  var resultText = "";
  var data = null;

  try {
    text = normalizeText(text);
    hash = makeHash("season-apply:" + text);

    if (lastRecruitHash == hash) return;

    saved = DataBase.getDataBase(RECRUIT_SAVE_KEY);
    if (saved == hash) {
      lastRecruitHash = hash;
      return;
    }

    body = makeSecretBody(room, sender, text, [
      "\"syncRemoved\":true",
      "\"createMissingPlayers\":true"
    ]);

    resultText = httpPostText(RECRUIT_API_URL, body, 20000);
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
    } else {
      replier.reply("[참가 신청 등록 서버 응답 확인 필요]\n" + trimLong(resultText, 700));
    }

    lastRecruitHash = hash;
    DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
  } catch (e) {
    replier.reply("[참가 신청 등록 API 오류]\n" + String(e));
  }
}

function handleTodaySeasonApplyReset(room, text, sender, replier) {
  var resultText = "";
  var data = null;

  try {
    resultText = httpPostText(RECRUIT_API_URL, makeSecretBody(room, sender, text), 20000);
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      lastRecruitHash = "";
      DataBase.setDataBase(RECRUIT_SAVE_KEY, "");
      return;
    }

    replier.reply("[오늘 내전 초기화 서버 응답 확인 필요]\n" + trimLong(resultText, 700));
  } catch (e) {
    replier.reply("[오늘 내전 초기화 API 오류]\n" + String(e));
  }
}

function isRecruitMessage(text) {
  text = normalizeText(text);
  if (text.indexOf("/") < 0) return false;
  if (countFilledRecruitLines(text) < 1) return false;
  if (hasRecruitForm(text)) return true;
  if (hasRecruitWord(text)) return true;
  return false;
}

function hasRecruitForm(text) {
  if (text.indexOf("이름/현티어/최고티어") >= 0) return true;
  if (text.indexOf("현티어") >= 0 && text.indexOf("최고티어") >= 0) return true;
  if (text.indexOf("주,부라인") >= 0) return true;
  if (text.indexOf("주/부라인") >= 0) return true;
  return false;
}

function hasRecruitWord(text) {
  if (text.indexOf("내전") >= 0) return true;
  if (text.indexOf("참가") >= 0) return true;
  if (text.indexOf("신청") >= 0) return true;
  if (text.indexOf("협곡") >= 0) return true;
  if (text.indexOf("구인") >= 0) return true;
  if (text.indexOf("현티어") >= 0) return true;
  if (text.indexOf("최고티어") >= 0) return true;
  return false;
}

function countFilledRecruitLines(text) {
  var lines = normalizeText(text).split("\n");
  var count = 0;
  var i = 0;
  var line = "";
  var body = "";
  var parts = [];

  for (i = 0; i < lines.length; i++) {
    line = trimText(lines[i]);
    if (isRecruitExampleLine(line)) continue;
    if (!/^\d{1,2}\s*[.)]/.test(line)) continue;

    body = trimText(line.replace(/^\d{1,2}\s*[.)]\s*/, ""));
    if (body == "" || body.indexOf("/") < 0) continue;

    parts = body.split("/");
    if (parts.length < 4) continue;
    if (trimText(parts[0]) == "") continue;
    if (trimText(parts[1]) == "") continue;
    if (trimText(parts[2]) == "") continue;
    if (trimText(parts.slice(3).join("/")) == "") continue;
    if (isBadRecruitName(parts[0])) continue;

    count++;
  }

  return count;
}

function isBadRecruitName(name) {
  name = trimText(name);
  if (name == "") return true;
  if (name.indexOf("이름") >= 0) return true;
  if (name.indexOf("EX") >= 0) return true;
  if (name.indexOf("ex") >= 0) return true;
  if (name.indexOf("예시") >= 0) return true;
  return false;
}

function isRecruitExampleLine(line) {
  line = trimText(line);
  if (line.indexOf("EX)") >= 0) return true;
  if (line.indexOf("EX.") >= 0) return true;
  if (line.indexOf("ex)") >= 0) return true;
  if (line.indexOf("ex.") >= 0) return true;
  if (line.indexOf("예시") >= 0) return true;
  if (line.indexOf("참가 신청 양식") >= 0) return true;
  if (line.indexOf("이름/현티어/최고티어") >= 0) return true;
  return false;
}

function isPartyRecruitHelpCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "구인구직도움말" || normalized == "/구인도움말" || normalized == "구인도움말";
}

function isPartyRecruitStatusCommand(text) {
  var normalized = normalizeCommandText(text);
  return normalized == "현재구인구직현황" || normalized == "구인구직현황" || normalized == "/구인구직현황" || normalized == "/구인현황" || normalized == "구인현황";
}

function isPartyRecruitCreateCommand(text) {
  return /^\/(칼바람구인|증바람구인|솔랭구인|자랭구인|일반구인|기타게임구인|내전구인)(?:\s+\d{1,2})?\s*$/.test(trimText(normalizeText(text)));
}

function isPartyRecruitFinishCommand(text) {
  return /^\/\d{1,2}\s*(쫑|ㅉ)\s*$/.test(trimText(normalizeText(text)));
}

function hasPartyRecruitNumber(text) {
  text = normalizeText(text);
  if (/모집번호\s*[:：]?\s*#?\s*\d{1,2}/.test(text)) return true;
  if (/(^|\s)#\s*\d{1,2}(\s|$)/.test(text)) return true;
  return false;
}

function isPartyRecruitFormWithoutNumber(text) {
  text = trimText(normalizeText(text));
  if (text == "") return false;
  if (hasPartyRecruitNumber(text)) return false;

  if (text.indexOf("TOP.") >= 0 && text.indexOf("JUG.") >= 0 && text.indexOf("MID.") >= 0 && text.indexOf("ADC.") >= 0 && text.indexOf("SUP.") >= 0) return true;
  if (text.indexOf("1.") >= 0 && text.indexOf("2.") >= 0 && text.indexOf("3.") >= 0 && text.indexOf("4.") >= 0 && text.indexOf("5.") >= 0) return true;
  if (text.indexOf("자랭 하실분") >= 0) return true;
  if (text.indexOf("일반 하실분") >= 0) return true;
  if (text.indexOf("솔랭하실분") >= 0 || text.indexOf("솔랭 하실분") >= 0) return true;
  if (text.indexOf("칼바람 하실분") >= 0) return true;
  if (text.indexOf("기타게임 하실분") >= 0) return true;

  return false;
}

function isPartyRecruitFormMessage(text) {
  text = normalizeText(text);
  if (!hasPartyRecruitNumber(text)) return false;
  if (/(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]?/i.test(text)) return true;
  if (/(^|\n)\s*\d{1,2}\s*[.)]?/.test(text)) return true;
  return false;
}

function handlePartyRecruitApi(apiUrl, room, text, sender, replier, label) {
  var resultText = "";
  var data = null;

  try {
    resultText = httpPostText(apiUrl, makeSecretBody(room, sender, text), 20000);
    data = safeJsonParse(resultText);

    if (data && data.reply) {
      replier.reply(String(data.reply));
      return;
    }

    replier.reply("[" + label + " 서버 응답 확인 필요]\n" + trimLong(resultText, 700));
  } catch (e) {
    replier.reply("[" + label + " API 오류]\n" + String(e));
  }
}

function handlePartyRecruitSync(room, text, sender, replier) {
  var hash = "";
  var saved = "";

  try {
    text = normalizeText(text);
    hash = makeHash("party-sync:" + text);

    if (lastPartyRecruitHash == hash) return;

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
    resultText = httpGetText(PARTY_RECRUIT_STATUS_API_URL, 15000);
    data = safeJsonParse(resultText);

    if (!data || !data.ok) return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n" + trimLong(resultText, 500);
    if (data.empty && silentWhenEmpty) return "__NO_ACTIVE_PARTY_RECRUIT__";
    return String(data.reply || "[K-LOL.GG 구인구직 현황]\n\n현황 응답이 비어 있습니다.");
  } catch (e) {
    return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n" + String(e);
  }
}

function getPartyRecruitHelpNotice() {
  return [
    "[K-LOL.GG 구인구직 도움말]",
    "",
    "생성",
    "- /자랭구인",
    "- /일반구인",
    "- /솔랭구인",
    "- /칼바람구인",
    "- /증바람구인",
    "- /기타게임구인",
    "- /내전구인",
    "",
    "반영",
    "- 모집번호가 포함된 양식에 이름을 채운 뒤 다시 올리면 자동 반영됩니다.",
    "- 모집번호가 없는 양식은 봇이 무시합니다.",
    "",
    "현황",
    "- /구인현황",
    "- /구인구직현황",
    "",
    "마무리",
    "- /12 쫑",
    "- /12 ㅉ",
    "",
    "시즌내전 신청",
    "- /내전구인구직: 신청 양식 출력",
    "- 내전현황: 오늘 신청 현황 조회",
    "- 오늘내전초기화: 오늘 신청 DB 기록 삭제",
    "",
    "현황 보기:",
    "https://k-lol-gg.vercel.app/recruit",
  ].join("\n");
}

function getRecruitRoomHelpNotice() {
  return getPartyRecruitHelpNotice();
}

function getRoomCheckText(room, sender) {
  return [
    "[방 이름 확인]",
    "실제 수신 room: " + room,
    "보낸 사람: " + sender,
    "구인구직방 인식: " + String(isRecruitRoom(room)),
    "공지방 인식: " + String(isNoticeRoom(room)),
    "RECRUIT_SOURCE_ROOM: " + RECRUIT_SOURCE_ROOM,
  ].join("\n");
}

function makeSecretBody(room, sender, text, extraFields) {
  var fields = [];
  fields.push("\"secret\":\"" + escapeJson(KAKAO_RECRUIT_SECRET) + "\"");
  fields.push("\"room\":\"" + escapeJson(room) + "\"");
  fields.push("\"sender\":\"" + escapeJson(sender) + "\"");
  fields.push("\"message\":\"" + escapeJson(text) + "\"");

  if (extraFields && extraFields.length) {
    fields = fields.concat(extraFields);
  }

  return "{" + fields.join(",") + "}";
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
    return response.body() || ("{\"ok\":false,\"reply\":\"HTTP " + response.statusCode() + "\"}");
  }

  return response.body();
}

function httpGetText(url, timeoutMs) {
  var response = org.jsoup.Jsoup.connect(url)
    .ignoreContentType(true)
    .ignoreHttpErrors(true)
    .timeout(timeoutMs)
    .method(org.jsoup.Connection.Method.GET)
    .execute();

  if (response.statusCode() < 200 || response.statusCode() >= 300) {
    return response.body() || ("{\"ok\":false,\"reply\":\"HTTP " + response.statusCode() + "\"}");
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
    .replace(/–/g, "-")
    .replace(/—/g, "-")
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

function trimLong(text, maxLength) {
  text = String(text || "");
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

response.__kakaoBotEntryPoint = true;
