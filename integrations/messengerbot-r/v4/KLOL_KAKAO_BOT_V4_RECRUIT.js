/* eslint-disable */
/* DEPRECATED split-profile entry. Do not install; use KLOL_KAKAO_BOT_V4_UNIFIED_MESSENGERBOT_R.js. */
var KLOL_V4_PROFILE_ID = "RECRUIT";
var KLOL_V4_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V4_RECRUIT_2026_09_10_R2";

function klolV4EntryAcceptsText(text) {
  var value = String(text == null ? "" : text).replace(/^\s+|\s+$/g, "");
  var canonical = value;
  if (!value || value === "/" || value.indexOf("//") === 0 || /^\/\s/.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  if (value.indexOf("\n") < 0 && value.indexOf("/") > 0) return false;
  if (value.charAt(0) === "/") canonical = value.substring(1);
  return !/^(?:랭킹|전적\s|최근\s|내전(?:구인|모집|현황|상세|참가|신청)|시즌내전|AI공지)/.test(canonical);
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {
  var text = String(msg == null ? "" : msg);
  var local = null;
  var result = null;
  var reply = "";
  if (KLOL_V4.beginRequest) KLOL_V4.beginRequest();
  if (!klolV4EntryAcceptsText(text)) return;
  if (KLOL_V4.acceptsPublicText && !KLOL_V4.acceptsPublicText(KLOL_V4_PROFILE_ID, text)) return;
  if (KLOL_V4.shouldIgnore(KLOL_V4_PROFILE_ID, text, sender)) return;
  local = KLOL_V4.localReply(KLOL_V4_PROFILE_ID, text, KLOL_V4_BOT_CODE_VERSION);
  if (local) {
    replier.reply(local);
    return;
  }
  try {
    result = KLOL_V4.send(KLOL_V4_PROFILE_ID, text, sender, logId, userHash);
    reply = KLOL_V4.resultReply(result);
    if (reply) replier.reply(reply);
  } catch (error) {
    replier.reply("[K-LOL.GG 요청 실패]\n" + String(error && error.message ? error.message : error));
  }
}
