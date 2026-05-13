var OPENCHAT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/openchat";
var NOTICE_API_BASE_URL = "https://k-lol-gg.vercel.app/api/kakao/scheduled-notice";
var RECRUIT_API_URL = "https://k-lol-gg.vercel.app/api/kakao/recruit/season-apply";
var PARTY_RECRUIT_CREATE_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/create";
var PARTY_RECRUIT_SYNC_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/sync";
var PARTY_RECRUIT_FINISH_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/finish";
var PARTY_RECRUIT_STATUS_API_URL = "https://k-lol-gg.vercel.app/api/kakao/party-recruits/status";

var NOTICE_ROOM = "LOL - K";
var RECRUIT_SOURCE_ROOM = "K롤방 구인구직방";

var KAKAO_RECRUIT_SECRET = "klol-recruit-7942-long-secret";

var SAVE_KEY = "KLOL_NOTICE_KEY";
var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH";
var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH";
var PARTY_RECRUIT_NOTICE_SAVE_KEY = "KLOL_PARTY_RECRUIT_NOTICE_KEY";

var lastKey = "";
var lastRecruitHash = "";
var lastPartyRecruitHash = "";
var lastPartyRecruitNoticeKey = "";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = "";
  var resultText = "";
  var data = null;
  var noticeText = "";

  try {
    text = normalizeRecruitBotText(String(msg || ""));
    text = trimText(text);

    if (text == "방이름확인") {
      replier.reply(
        "[방 이름 확인]\n" +
        "실제 수신 room: " + room + "\n" +
        "보낸 사람: " + sender + "\n" +
        "표시/등록 room: " + RECRUIT_SOURCE_ROOM + "\n" +
        "NOTICE_ROOM: " + NOTICE_ROOM
      );
      return;
    }

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

    if (text == "도움말") {
      replier.reply(getHelpNotice());
      return;
    }

    if (room == NOTICE_ROOM) {
      checkNotice();
    }

    if (room == RECRUIT_SOURCE_ROOM) {
      checkPartyRecruitNotice();
    }

    if (isRecruitMessage(text)) {
      handleRecruitMessage(RECRUIT_SOURCE_ROOM, text, sender, replier);
      return;
    }

    if (text == "내전참가" || text == "참가신청") {
      replier.reply(getParticipationGuideNotice("manual"));
      return;
    }

    if (text == "AI공지") {
      noticeText = getAiNotice("manual");

      if (noticeText == "") {
        noticeText = getFallbackNotice("manual");
      }

      replier.reply(noticeText);
      return;
    }

    if (!isCommand(text)) {
      return;
    }

    resultText = org.jsoup.Jsoup.connect(OPENCHAT_API_URL)
      .ignoreContentType(true)
      .header("Content-Type", "application/json; charset=utf-8")
      .requestBody("{\"message\":\"" + escapeJson(text) + "\"}")
      .timeout(15000)
      .post()
      .text();

    data = JSON.parse(resultText);

    if (data && data.reply) {
      replier.reply(data.reply);
      return;
    }

    replier.reply("[서버 응답 확인 필요]\n" + resultText);
  } catch (e) {
    replier.reply("[봇 처리 오류]\n" + String(e));
  }
}

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

/**
 * 참가 신청글 감지
 *
 * 핵심:
 * - "/" 또는 "／" 포함
 * - 실제로 채워진 참가자 줄 1개 이상
 * - 신청 양식/내전/참가/현티어/최고티어 등 문맥 포함
 * - EX 예시 줄은 제외
 * - 3., 4. 같은 빈 줄은 제외
 */
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

/**
 * 번호 줄 개수 확인
 * 기존 indexOf("3.") 방식은 본문 어디든 잡기 때문에 위험함.
 * 반드시 줄 시작 기준으로만 판단.
 */
function countRecruitNumberLines(text) {
  var lines = [];
  var count = 0;
  var i = 0;
  var line = "";

  text = normalizeRecruitBotText(text);
  lines = text.split("\n");

  for (i = 0; i < lines.length; i++) {
    line = trimText(String(lines[i] || ""));

    if (isRecruitExampleLine(line)) {
      continue;
    }

    if (/^\d{1,2}\s*[.)]/.test(line)) {
      count++;
    }
  }

  return count;
}

/**
 * 실제 참가자 줄만 카운트
 *
 * 인정:
 * 1.정민/m/m/ad sup
 * 2. 주현/u/m/top mid
 * 3)민수/p/e/jg,mid
 *
 * 제외:
 * EX) 1.지후/P/E/AD,MD
 * 3.
 * 4.
 * 1. 이름/현티어/최고티어/주,부라인
 */
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

/**
 * 카카오 메시지 정규화
 *
 * 전각 문자, 특수 슬래시, CRLF 등을 통일.
 */
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

function checkNotice() {
  var now = new Date();
  var h = now.getHours();
  var m = now.getMinutes();
  var slot = "";
  var noticeType = "";
  var key = "";
  var saved = "";
  var notice = "";

  if (h == 12) {
    slot = "12";
    noticeType = "status";
  }

  if (h == 15) {
    slot = "15";
    noticeType = "status";
  }

  if (h == 18) {
    slot = "18";
    noticeType = "status";
  }

  if (h == 13) {
    slot = "13";
    noticeType = "guide";
  }

  if (h == 17) {
    slot = "17";
    noticeType = "guide";
  }

  if (h == 19) {
    slot = "19";
    noticeType = "guide";
  }

  if (h == 20 && m >= 50) {
    slot = "20";
    noticeType = "status";
  }

  if (slot == "" || noticeType == "") {
    return;
  }

  key = makeDateKey(now) + "-" + noticeType + "-" + slot;

  if (lastKey == key) {
    return;
  }

  saved = DataBase.getDataBase(SAVE_KEY);

  if (saved == key) {
    lastKey = key;
    return;
  }

  if (noticeType == "guide") {
    notice = getParticipationGuideNotice(slot);
  } else {
    notice = getAiNotice(slot);

    if (notice == "") {
      notice = getFallbackNotice(slot);
    }
  }

  Api.replyRoom(NOTICE_ROOM, notice);

  lastKey = key;
  DataBase.setDataBase(SAVE_KEY, key);
}

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
  } catch (e) {
    return "";
  }
}

function getFallbackNotice(slot) {
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

  text = text + "자동 공지 시간" + n;
  text = text + "- 12시 / 15시 / 18시 / 20시 50분 이후 : 참가 현황 공지" + n;
  text = text + "- 13시 / 17시 / 19시 : 참가 방법 안내" + n + n;

  text = text + "구인구직 파티 현황" + n;
  text = text + "- /자랭구인구직 12 : 자랭 파티 생성" + n;
  text = text + "- /일반게임구인구직 13 : 일반게임 파티 생성" + n;
  text = text + "- /솔랭구인구직 14 : 솔랭 파티 생성" + n;
  text = text + "- /칼바람구인구직 15 : 칼바람 파티 생성" + n;
  text = text + "- /종합게임구인구직 16 : 종합게임 파티 생성" + n;
  text = text + "- /구인현황 : 현재 구인구직 현황 조회" + n;
  text = text + "- /12 쫑 또는 /12 ㅉ : 해당 파티 마무리" + n;
  text = text + "- /구인도움말 : 구인구직 전용 도움말" + n + n;

  text = text + "주의" + n;
  text = text + "- 신청초기화는 DB 삭제가 아닙니다." + n;
  text = text + "- 오늘내전초기화는 오늘 날짜의 참가 신청 기록을 삭제합니다." + n;
  text = text + "- 초기화 후 같은 신청글을 다시 올리면 재등록할 수 있습니다.";

  return text;
}

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


function isPartyRecruitHelpCommand(text) {
  text = normalizeCommandText(text);
  return text == "구인구직도움말" || text == "/구인도움말" || text == "구인도움말";
}

function isPartyRecruitStatusCommand(text) {
  text = normalizeCommandText(text);
  return text == "현재구인구직현황" || text == "/구인구직현황" || text == "/구인현황" || text == "구인현황";
}

function isPartyRecruitCreateCommand(text) {
  text = trimText(normalizeRecruitBotText(text));
  return /^\/(자랭구인구직|일반게임구인구직|일겜구인구직|솔랭구인구직|칼바람구인구직|종합게임구인구직)\s+\d{1,2}\s*$/.test(text);
}

function isPartyRecruitFinishCommand(text) {
  text = trimText(normalizeRecruitBotText(text));
  return /^\/\d{1,2}\s*(쫑|ㅉ)\s*$/.test(text);
}

function isPartyRecruitFormMessage(text) {
  text = normalizeRecruitBotText(text);

  if (!/모집번호\s*[:：]?\s*#?\s*\d{1,2}/.test(text) && !/(^|\s)#\d{1,2}(\s|$)/.test(text)) {
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

function checkPartyRecruitNotice() {
  var now = new Date();
  var key = "";
  var saved = "";
  var notice = "";

  if (now.getMinutes() > 4) {
    return;
  }

  key = makeDateKey(now) + "-party-recruit-" + pad2(now.getHours());

  if (lastPartyRecruitNoticeKey == key) {
    return;
  }

  saved = DataBase.getDataBase(PARTY_RECRUIT_NOTICE_SAVE_KEY);
  if (saved == key) {
    lastPartyRecruitNoticeKey = key;
    return;
  }

  notice = fetchPartyRecruitStatusText(false);
  Api.replyRoom(RECRUIT_SOURCE_ROOM, notice);

  lastPartyRecruitNoticeKey = key;
  DataBase.setDataBase(PARTY_RECRUIT_NOTICE_SAVE_KEY, key);
}

function getPartyRecruitHelpNotice() {
  var n = "\n";
  var text = "";

  text = "[K-LOL.GG 구인구직 도움말]" + n + n;
  text = text + "생성" + n;
  text = text + "- /자랭구인구직 12" + n;
  text = text + "- /일반게임구인구직 13" + n;
  text = text + "- /일겜구인구직 13" + n;
  text = text + "- /솔랭구인구직 14" + n;
  text = text + "- /칼바람구인구직 15" + n;
  text = text + "- /종합게임구인구직 16" + n + n;
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
  text = text + "현황 보기:" + n;
  text = text + "https://k-lol-gg.vercel.app/recruit";

  return text;
}

function pad2(value) {
  value = Number(value);
  if (value < 10) return "0" + value;
  return String(value);
}

setInterval(function () {
  try {
    checkNotice();
  } catch (e) {
  }
}, 60000);
setInterval(function () {
  try {
    checkPartyRecruitNotice();
  } catch (e) {
  }
}, 60000);
