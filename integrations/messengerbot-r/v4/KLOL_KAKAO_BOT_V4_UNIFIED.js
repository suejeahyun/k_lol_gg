/* eslint-disable */
var KLOL_V4_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V4_UNIFIED_2026_09_10_R2_TEMPLATE_FIRST";

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {
  var text = String(msg == null ? "" : msg);
  var profileId = null;
  var local = null;
  var result = null;
  var reply = "";
  if (KLOL_V4.shouldIgnoreUnified(text, sender)) return;
  local = KLOL_V4.unifiedLocalReply(text, KLOL_V4_BOT_CODE_VERSION);
  if (local) {
    replier.reply(local);
    return;
  }
  profileId = KLOL_V4.publicProfileId(text);
  if (!profileId) return;
  try {
    result = KLOL_V4.send(profileId, text, sender, logId, userHash);
    reply = KLOL_V4.resultReply(result);
    if (reply) replier.reply(reply);
  } catch (error) {
    replier.reply("[K-LOL.GG 요청 실패]\n" + String(error && error.message ? error.message : error));
  }
}
