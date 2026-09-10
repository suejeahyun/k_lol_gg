/* eslint-disable */
var KLOL_V4_PROFILE_ID = "FEATURES";
var KLOL_V4_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V4_FEATURES_2026_09_10_R2";

function klolV4EntryAcceptsText(text) {
  var value = String(text == null ? "" : text).replace(/^\s+|\s+$/g, "");
  var canonical = value;
  if (!value || value === "/" || value.indexOf("//") === 0 || /^\/\s/.test(value)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  if (value.indexOf("\n") < 0 && value.indexOf("/") > 0) return false;
  if (value.charAt(0) === "/") canonical = value.substring(1);
  return !/^(?:(?:\d+인\s*(?:파티|구인))|5인\s*협곡|자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|현재구인|구인(?:구직)?현황|구인상세|상세\s*#?\d+|#?\d+(?:번|인)?\s*(?:파티|구인)?\s*(?:쫑|ㅉ|마감|종료)|스크림|멸망전\s*스크림)/.test(canonical);
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {
  var text = String(msg == null ? "" : msg);
  var local = null;
  var result = null;
  var reply = "";
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
