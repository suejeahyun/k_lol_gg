/* eslint-disable */
/* V1-visible constants. No legacy endpoint or bearer secret is retained. */
var BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R6_2026_09_12";
var BASE_URL = "https://k-lol-gg.vercel.app";
var WEB_INHOUSE_RESULT_UPLOAD_URL = BASE_URL + "/matches/submit";
var WEB_ADMIN_DISCIPLINE_CREATE_URL = BASE_URL + "/admin/discipline/new";
var WEB_DISCIPLINE_EVIDENCE_URL = BASE_URL + "/discipline/evidence";
var WEB_REGISTRATION_HUB_URL = BASE_URL + "/start";
var WEB_ACCOUNT_DISCIPLINE_URL = BASE_URL + "/account#discipline";
var RECRUIT_ROOM_LABEL = "K롤방 구인구직방";

/* These are dispatch tags only. They are never used as URLs. */
var PARTY_RECRUIT_CREATE_API_URL = "PARTY_CREATE";
var PARTY_RECRUIT_SYNC_API_URL = "PARTY_SYNC";
var PARTY_RECRUIT_FINISH_API_URL = "PARTY_FINISH";
var PARTY_RECRUIT_STATUS_API_URL = "PARTY_STATUS";
var SCRIM_RECRUIT_CREATE_API_URL = "SCRIM_CREATE";
var SCRIM_RECRUIT_STATUS_API_URL = "SCRIM_STATUS";

var PARTY_RECRUIT_SAVE_KEY = "KLOL_PARTY_RECRUIT_LAST_HASH_UNIFIED_V18";
var lastPartyRecruitHash = "";
var RECRUIT_SAVE_KEY = "KLOL_RECRUIT_LAST_HASH_UNIFIED_V24";
var lastRecruitHash = "";
var OPERATION_FORM_SAVE_KEY = "KLOL_OPERATION_FORM_LAST_HASH_V1";
var lastOperationFormHash = "";
var KLOL_V1_OPERATION_RAW_TEXT = "";

function v1GatewaySucceeded(result) {
  return Boolean(result && result.ok && (!result.body || result.body.ok !== false));
}

function v1GatewayFailureStatus(result) {
  var status = Number(result && result.status || 0);
  var bodyStatus = Number(result && result.body && result.body.statusCode || 0);
  if ((status === 0 || (status >= 200 && status < 300)) && bodyStatus >= 400) return bodyStatus;
  return status;
}

function v1GatewayFailureNotice(result, title) {
  var status = v1GatewayFailureStatus(result);
  if (status === 401 || status === 403) {
    return "[K-LOL.GG 연결 설정 확인]\n봇 인증 정보를 확인할 수 없습니다. 관리자에게 문의해주세요.";
  }
  if (status === 400) {
    return title + "\n입력 형식이 올바르지 않습니다. 양식을 확인한 뒤 다시 보내주세요.";
  }
  return title + "\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.";
}

function v1ExtractSeasonRecruitNoFromSnapshot(text) {
  var lines = normalizeText(String(text || "")).split("\n");
  var headerText = lines.slice(0, 8).join("\n");
  var match = headerText.match(/(?:내전\s*(?:번호|NO|No|no)\s*[:：]?\s*#?\s*)(\d{1,3})/i);
  if (!match) match = headerText.match(/#\s*(\d{1,3})\s*(?:협곡\s*내전|협곡내전|내전)/i);
  if (!match) match = headerText.match(/(?:협곡\s*내전|협곡내전|내전)\s*(?:하실분|하실\s*분|구인|모집)?\s*#\s*(\d{1,3})/i);
  if (!match) match = headerText.match(/(?:협곡\s*내전|협곡내전|내전)\s*#\s*(\d{1,3})/i);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 999) return Number(match[1]);
  return 1;
}

function v1SeasonApplyCompleteNotice() {
  return "[K-LOL.GG 구인구직방 참가 자동 등록 완료]\n내전 시작 10분전에 디스코드 내전 대기방으로 와주세요.";
}

function isSeasonApplyCandidateMessage(text) {
  var lines = [];
  var i = 0;
  var line = "";
  var row = null;
  text = normalizeText(String(text || ""));
  if (isPartyRecruitLikeMessage(text)) return false;
  if (!hasSeasonApplyForm(text) && !hasSeasonApplyWord(text)) return false;
  lines = text.split("\n");
  for (i = 0; i < lines.length; i++) {
    line = trimText(String(lines[i] || ""));
    if (isSeasonApplyExampleLine(line)) continue;
    row = line.match(/^(\d{1,2})(?:(?:\s*\\?\s*[.)])|\s+)(.*)$/);
    if (row && trimText(String(row[2] || "")) != "") return true;
  }
  return false;
}

function sendSearchPlayerCommand(text, room, sender, replier) {
  var result = null;
  var reply = "";
  try {
    result = KLOL_V1_GATEWAY.send("FEATURES", text, sender);
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply != "") {
      replier.reply(reply);
      return;
    }
    if (v1GatewayFailureStatus(result) === 401 || v1GatewayFailureStatus(result) === 403) {
      replier.reply("[전적 검색 인증 오류]\n봇 인증 정보를 확인해 주세요.\n상태코드: " + result.status);
      return;
    }
    if (result.status == 429) {
      replier.reply("[전적 검색 제한]\n잠시 후 다시 시도해주세요.");
      return;
    }
    if (!result.ok) {
      replier.reply("[전적 검색 서버 오류]\n상태코드: " + result.status + "\n잠시 후 다시 시도해주세요.");
      return;
    }
    replier.reply("[전적 검색 서버 응답 확인 필요]\n서버 응답이 비어 있습니다.");
  } catch (error) {
    replier.reply("[전적 검색 처리 오류]\n잠시 후 다시 시도해주세요.");
  }
}

function sendOpenchatCommand(text, replier) {
  var result = null;
  var reply = "";
  try {
    result = KLOL_V1_GATEWAY.send("FEATURES", text, "");
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply != "") {
      replier.reply(reply);
      return;
    }
    if (!result.ok) {
      replier.reply("[전적/명령어 서버 오류]\n상태코드: " + result.status + "\n잠시 후 다시 시도해주세요.");
      return;
    }
    replier.reply("[전적/명령어 서버 응답 확인 필요]\n서버 응답이 비어 있습니다.");
  } catch (error) {
    replier.reply("[전적/명령어 처리 오류]\n잠시 후 다시 시도해주세요.");
  }
}

function fetchSeasonRecruitStatusText(roomLabel, text, sender) {
  var result = null;
  var reply = "";
  try {
    result = KLOL_V1_GATEWAY.send("FEATURES", text, sender);
    if (!result.body) return "[내전현황 API 오류]\nJSON 응답이 아닙니다.\n잠시 후 다시 시도해주세요.";
    if (!v1GatewaySucceeded(result)) {
      return "[내전현황]\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.";
    }
    if (result.body.empty === true) return "__NO_SEASON_RECRUIT_STATUS__";
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply != "") return reply;
    return "[내전현황]\n현황 응답이 비어 있습니다.";
  } catch (error) {
    return "[내전현황 API 오류]\n잠시 후 다시 시도해주세요.";
  }
}

function handleSeasonApplyMessage(roomLabel, text, sender, replier) {
  var hash = "";
  var saved = "";
  var result = null;
  var reply = "";
  var recruitNo = v1ExtractSeasonRecruitNoFromSnapshot(text);
  try {
    text = normalizeText(text);
    hash = makeHash("season-apply:" + roomLabel + ":" + sender + ":" + String(Math.floor(new Date().getTime() / 10000)) + ":" + String(recruitNo) + ":" + text);
    if (lastRecruitHash == hash) return;
    saved = DataBase.getDataBase(RECRUIT_SAVE_KEY);
    if (saved == hash) {
      lastRecruitHash = hash;
      return;
    }
    result = KLOL_V1_GATEWAY.send("FEATURES", text, sender);
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply != "") {
      replier.reply(reply);
      if (v1GatewaySucceeded(result)) {
        lastRecruitHash = hash;
        DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
      }
      return;
    }
    if (result.status == 401 || result.status == 403) {
      replier.reply("[참가 신청 등록 인증 오류]\n봇 인증 정보를 확인해 주세요.\n상태코드: " + result.status);
      return;
    }
    if (!result.ok) {
      replier.reply("[참가 신청 등록 서버 오류]\n상태코드: " + result.status + "\n잠시 후 다시 시도해주세요.");
      return;
    }
    if (result.body && result.body.ok === true && Number(result.body.pending || 0) === 0) {
      replier.reply(v1SeasonApplyCompleteNotice());
      lastRecruitHash = hash;
      DataBase.setDataBase(RECRUIT_SAVE_KEY, hash);
      return;
    }
    replier.reply("[참가 신청 등록 서버 응답 확인 필요]\n서버 응답이 비어 있습니다.");
  } catch (error) {
    replier.reply("[참가 신청 등록 API 오류]\n잠시 후 다시 시도해주세요.");
  }
}

function handlePartyRecruitApi(apiTag, roomLabel, text, sender, replier, label) {
  var result = null;
  var reply = "";
  try {
    result = KLOL_V1_GATEWAY.send("RECRUIT", text, sender);
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply == "" && (v1GatewayFailureStatus(result) === 401 || v1GatewayFailureStatus(result) === 403)) {
      replier.reply(v1GatewayFailureNotice(result, "[K-LOL.GG " + label + "]"));
      return false;
    }
    if (result.body && (result.body.ignored === true || result.body.empty === true) && !result.body.reply) {
      return v1GatewaySucceeded(result);
    }
    if (result.body && result.body.reply !== undefined && String(result.body.reply || "") === "" && result.ok) {
      return result.body.ok !== false;
    }
    if (reply != "") {
      replier.reply(reply);
      return v1GatewaySucceeded(result);
    }
    if (!result.ok) {
      replier.reply(v1GatewayFailureNotice(result, "[K-LOL.GG " + label + "]"));
      return false;
    }
    replier.reply("[K-LOL.GG " + label + "]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  } catch (error) {
    replier.reply("[K-LOL.GG " + label + "]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }
}

function fetchPartyRecruitStatusText(silentWhenEmpty, messageText, room, sender) {
  var result = null;
  try {
    result = KLOL_V1_GATEWAY.send("RECRUIT", messageText, sender);
    if (!v1GatewaySucceeded(result)) {
      return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.";
    }
    if (result.body && result.body.empty === true && silentWhenEmpty) return "__NO_ACTIVE_PARTY_RECRUIT__";
    return KLOL_V1_GATEWAY.replyText(result);
  } catch (error) {
    return "[K-LOL.GG 구인구직 현황]\n\n현황을 불러오지 못했습니다.\n잠시 후 다시 시도해주세요.";
  }
}

function handleOperationFormMessage(room, text, sender, replier) {
  var hash = "";
  var saved = "";
  var result = null;
  var reply = "";
  try {
    text = canonicalizeOperationCandidateForGateway(KLOL_V1_OPERATION_RAW_TEXT || text);
    hash = makeHash("operation-form:" + room + ":" + sender + ":" + text);
    if (lastOperationFormHash == hash) return;
    saved = DataBase.getDataBase(OPERATION_FORM_SAVE_KEY);
    if (saved == hash) {
      lastOperationFormHash = hash;
      return;
    }
    result = KLOL_V1_GATEWAY.send("FEATURES", text, sender);
    if (result.body && result.body.duplicate === true && v1GatewaySucceeded(result)) {
      lastOperationFormHash = hash;
      DataBase.setDataBase(OPERATION_FORM_SAVE_KEY, hash);
      return;
    }
    reply = KLOL_V1_GATEWAY.replyText(result);
    if (reply != "") {
      replier.reply(reply);
      if (v1GatewaySucceeded(result)) {
        lastOperationFormHash = hash;
        DataBase.setDataBase(OPERATION_FORM_SAVE_KEY, hash);
      }
      return;
    }
    if (result.status == 401 || result.status == 403) {
      replier.reply(v1GatewayFailureNotice(result, "[K-LOL.GG 운영 양식]"));
      return;
    }
    if (!result.ok) {
      replier.reply(v1GatewayFailureNotice(result, "[K-LOL.GG 운영 양식]"));
      return;
    }
    replier.reply("[K-LOL.GG 운영 양식]\n서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
  } catch (error) {
    replier.reply("[K-LOL.GG 운영 양식]\n서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.");
  }
}

/*
 * V40 R2's active site-first branch never creates a managed image session.
 * With normal settings and a clean session store, imageDB therefore produces
 * no reply and no HTTP request. Keep that exact active behavior here.
 */
function handleManagedImage(room, sender, imageBase64, replier) {
  return false;
}

function replyManagedImageFallback(room, sender, replier) {
  return false;
}

/*
 * Operation-form routing is intentionally structural. The canonical V1
 * predicate remains available as isOperationFormCompleteMessage in the built
 * artifact, while response() uses this candidate predicate so an incomplete
 * form can receive the server's field-specific validation reply.
 */
function normalizeOperationCandidateText(value) {
  var input = String(value || "");
  var output = "";
  var index = 0;
  var code = 0;
  input = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  input = input.replace(/[\u00a0\u2007\u202f\u3000]/g, " ");
  for (index = 0; index < input.length; index += 1) {
    code = input.charCodeAt(index);
    output += code >= 65281 && code <= 65374 ? String.fromCharCode(code - 65248) : input.charAt(index);
  }
  return output;
}

function makeOperationCandidateLabelRegex(label) {
  var compact = normalizeOperationCandidateText(label).replace(/\s+/g, "");
  var pattern = "";
  var index = 0;
  var character = "";
  for (index = 0; index < compact.length; index += 1) {
    character = compact.charAt(index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (index > 0) pattern += "\\s*";
    pattern += character;
  }
  return new RegExp(
    "^\\s*(?:(?:\\(\\s*)?\\d+\\s*(?:\\\\\\s*)?(?:[.)]\\s*)?)?" +
    pattern + "(?:\\s*:\\s*|\\s+|(?=$)|(?=\\())"
  );
}

function hasOperationCandidateLabelWithSyntax(text, label) {
  var lines = normalizeOperationCandidateText(text).split("\n");
  var pattern = makeOperationCandidateLabelRegex(label);
  var index = 0;
  for (index = 0; index < lines.length; index += 1) {
    if (hasOperationCandidateFieldSyntax(lines[index]) && pattern.test(lines[index])) return true;
  }
  return false;
}

function hasOperationCandidateFieldSyntax(line) {
  line = normalizeOperationCandidateText(line);
  return /^\s*(?:\(\s*)?\d+\s*(?:\\\s*)?[.)]/.test(line) || /:/.test(line);
}

function operationCandidateDefinitions() {
  return [
    ["friends", "지인", ["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"]],
    ["suggestions", "건의", ["본인 이름 및 닉네임", "건의 사유", "건의 내용"]],
    ["meetups", "(?:모임|정모)", ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"]],
    ["leaves", "외출", ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"]]
  ];
}

function detectOperationFormHeaderType(text, forms) {
  var lines = normalizeOperationCandidateText(text).split("\n");
  var formIndex = 0;
  var lineIndex = 0;
  var pattern = null;
  for (formIndex = 0; formIndex < forms.length; formIndex += 1) {
    pattern = new RegExp(
      "^\\s*(?:[-*#>》•▪▶]\\s*)?(?:(?:\\(\\s*)?\\d+\\s*(?:\\\\\\s*)?[.)]\\s*)?" +
      "(?:<|&lt;)\\s*" + forms[formIndex][1] + "\\s*(?:>|&gt;)\\s*$",
      "i"
    );
    for (lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (pattern.test(lines[lineIndex])) return forms[formIndex][0];
    }
  }
  return "";
}

function detectOperationFormCandidateType(text) {
  var forms = operationCandidateDefinitions();
  var normalized = normalizeOperationCandidateText(text);
  var headerType = detectOperationFormHeaderType(normalized, forms);
  var bestType = "";
  var bestScore = 0;
  var tied = false;
  var formIndex = 0;
  var labelIndex = 0;
  var score = 0;
  if (headerType != "") return headerType;
  for (formIndex = 0; formIndex < forms.length; formIndex += 1) {
    score = 0;
    for (labelIndex = 0; labelIndex < forms[formIndex][2].length; labelIndex += 1) {
      if (hasOperationCandidateLabelWithSyntax(normalized, forms[formIndex][2][labelIndex])) score += 1;
    }
    if (score > bestScore) {
      bestType = forms[formIndex][0];
      bestScore = score;
      tied = false;
    } else if (score == bestScore && score > 0) {
      tied = true;
    }
  }
  return bestScore >= 2 && !tied ? bestType : "";
}

function isOperationFormCandidateMessage(text) {
  return detectOperationFormCandidateType(text) != "";
}

function canonicalizeOperationCandidateForGateway(text) {
  var normalized = normalizeOperationCandidateText(text);
  var formType = detectOperationFormCandidateType(normalized);
  var forms = operationCandidateDefinitions();
  var labels = [];
  var lines = normalized.split("\n");
  var formIndex = 0;
  var lineIndex = 0;
  var labelIndex = 0;
  var match = null;
  for (formIndex = 0; formIndex < forms.length; formIndex += 1) {
    if (forms[formIndex][0] == formType) labels = forms[formIndex][2];
  }
  if (formType == "") return trimText(normalized);
  for (lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    for (labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      if (!hasOperationCandidateFieldSyntax(lines[lineIndex])) continue;
      match = makeOperationCandidateLabelRegex(labels[labelIndex]).exec(lines[lineIndex]);
      if (!match) continue;
      lines[lineIndex] = labels[labelIndex] + ": " + lines[lineIndex].substring(match[0].length);
      break;
    }
  }
  return trimText(lines.join("\n"));
}
