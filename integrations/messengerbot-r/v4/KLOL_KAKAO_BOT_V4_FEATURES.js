/* eslint-disable */
var KLOL_V4_PROFILE_ID = "FEATURES";
var KLOL_V4_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V4_FEATURES_2026_09_10_R1";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {
  var text = String(msg == null ? "" : msg);
  var local = null;
  var result = null;
  var reply = "";
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
