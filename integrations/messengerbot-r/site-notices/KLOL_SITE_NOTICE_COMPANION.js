/* eslint-disable */
/* MessengerBot R 0.7.29a legacy companion. OFF until explicitly configured.
 * The source callback's one-argument Replier is the only message destination.
 * No room-name lookup, Api.replyRoom, channelId, or ordinary command replies.
 */
var KLOL_SITE_NOTICE_CODE_VERSION = "KLOL_SITE_NOTICE_COMPANION_1.0.3";
function createKlolSiteNoticeWorker(io) {
  var session = null;
  var ledgerKey = "KLOL_SITE_NOTICE_LEDGER_V1";
  var maximumLedger = 512;
  function ledger() {
    var text = io.read(ledgerKey);
    var value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || value instanceof Array) throw new Error("LEDGER_INVALID");
    return value;
  }
  function save(value) {
    var serialized = JSON.stringify(value);
    io.write(ledgerKey, serialized);
    if (io.read(ledgerKey) !== serialized) throw new Error("LEDGER_WRITE_FAILED");
  }
  function enabled() { return io.read("KLOL_SITE_NOTICE_ENABLED") === "true"; }
  function replySafely(replier, text) {
    try { replier.reply(text); } catch (ignoredReplyFailure) {}
  }
  function register(message, isGroupChat, replier, packageName) {
    // Some real open-chat callbacks report a false group flag. The explicit
    // one-use code and exact Replier session select the destination instead.
    if (!enabled() || session || packageName !== "com.kakao.talk") return false;
    var code = io.read("KLOL_SITE_NOTICE_REGISTRATION_CODE");
    if (!/^[a-f0-9]{32}$/.test(code) || message !== "사이트알림연동 " + code) return false;
    if (!replier || typeof replier.reply !== "function") return false;
    if (!io.enter()) return false;
    try {
      if (session || io.read("KLOL_SITE_NOTICE_REGISTRATION_CODE") !== code) return false;
      // Consume the one-use local code before retaining a session. A restart
      // requires a fresh code; a later chat cannot silently replace the target.
      io.write("KLOL_SITE_NOTICE_REGISTRATION_CODE", "");
      if (io.read("KLOL_SITE_NOTICE_REGISTRATION_CODE") !== "") return false;
      var result = io.request("REGISTER", {});
      if (!result || result.registered !== true) return false;
      session = replier;
      return true;
    } finally { io.leave(); }
  }
  function handleMessage(message, isGroupChat, replier, packageName) {
    if (packageName !== "com.kakao.talk" || !replier || typeof replier.reply !== "function") return false;
    if (message === "사이트알림버전") {
      replySafely(replier, "사이트 알림 버전: " + KLOL_SITE_NOTICE_CODE_VERSION);
      return true;
    }
    if (message === "사이트알림상태") {
      var stateText = "사이트 알림 상태를 확인하지 못했어요. 설치 설정을 점검해주세요.";
      try {
        stateText = "사이트 알림 버전: " + KLOL_SITE_NOTICE_CODE_VERSION +
          "\n휴대폰 알림: " + (enabled() ? "켜짐" : "꺼짐") +
          "\n수신 세션: " + (session ? "등록됨" : "등록 필요") +
          "\n서버 연결과 실제 알림 수신은 별도 확인이 필요해요.";
      } catch (ignoredStateFailure) {}
      replySafely(replier, stateText);
      return true;
    }
    if (!/^사이트알림연동 [a-f0-9]{32}$/.test(message)) return false;
    var registrationText = "사이트 알림 등록에 실패했어요. 새 등록 코드가 담긴 설치본으로 교체한 뒤 다시 등록해주세요.";
    try {
      if (!enabled()) registrationText = "휴대폰 사이트 알림이 꺼져 있어 등록하지 않았어요. 활성 설치본을 적용한 뒤 다시 등록해주세요.";
      else if (session) registrationText = "사이트 알림은 이미 등록되어 있어요. 수신 대상은 변경하지 않았어요.";
      else if (register(message, isGroupChat, replier, packageName)) {
        registrationText = "사이트 알림 수신 세션을 등록했어요. 휴대폰이 실행 중이면 새 내전 충원 안내를 확인해요. 실제 알림 수신은 별도로 확인해주세요.";
      }
    } catch (ignoredRegistrationFailure) {}
    replySafely(replier, registrationText);
    return true;
  }
  function poll() {
    if (!enabled() || !session || !io.enter()) return;
    try {
      if (!enabled() || !session) return;
      var result = io.request("POLL", {});
      var event = result && result.event;
      if (!event) return;
      if (!enabled() || !session) return;
      if (!/^[a-f0-9-]{36}$/.test(event.id) || !/^[a-f0-9]{64}$/.test(event.leaseToken) ||
          event.targetHash !== io.targetHash() || typeof event.text !== "string" || event.text.length > 600 ||
          !(Date.parse(event.leaseUntil) > io.now() + 5000)) return;
      var entries = ledger();
      var key;
      var size = 0;
      for (key in entries) if (Object.prototype.hasOwnProperty.call(entries, key)) {
        if (entries[key].at < io.now() - 36 * 60 * 60 * 1000) delete entries[key];
        else size += 1;
      }
      var previous = entries[event.id];
      var outcome = "UNCERTAIN";
      if (previous) {
        // PREPARED survived a crash: the SDK may already have sent it.
        outcome = previous.state === "SENT" ? "SENT" : "UNCERTAIN";
      } else if (size >= maximumLedger) {
        outcome = "RETRY";
      } else {
        entries[event.id] = { state: "PREPARED", at: io.now() };
        save(entries);
        try {
          // One argument retains the exact registered notification session.
          // A void return is SDK acceptance, not a remote delivery receipt.
          var accepted = session.reply(event.text);
          outcome = accepted === false ? "RETRY" : "SENT";
        } catch (ignoredSendFailure) { outcome = "UNCERTAIN"; session = null; }
        if (outcome === "RETRY") { delete entries[event.id]; session = null; }
        else entries[event.id] = { state: outcome, at: io.now() };
        save(entries);
      }
      io.request("ACK", { eventId: event.id, leaseToken: event.leaseToken, outcome: outcome });
    } catch (ignoredFailure) {
      // Never print identities, message bodies, registration codes or secrets.
      // Unacked leases are retried by the server; persistent ledger dedupes.
    } finally { io.leave(); }
  }
  return { register: register, handleMessage: handleMessage, poll: poll, stop: function () { session = null; },
    status: function () { return enabled() ? session ? "REGISTERED" : "REGISTRATION_REQUIRED" : "DISABLED"; } };
}

var KLOL_SITE_NOTICE_INIT_STAGE = "SETUP";
function klolSiteNoticeLog(code) {
  // Only fixed codes reach the local log, never callback values or exceptions.
  try { Log.i("[KLOL_SITE_NOTICE] " + code); } catch (ignoredLogFailure) {}
}
var KLOL_SITE_NOTICE = null;
try {
  if (typeof KLOL_SITE_NOTICE_SETUP_FAILED !== "undefined" && KLOL_SITE_NOTICE_SETUP_FAILED) throw new Error("SETUP_FAILED");
  KLOL_SITE_NOTICE = (function () {
  var timer = null;
  KLOL_SITE_NOTICE_INIT_STAGE = "LOCK";
  var workerLock = new java.util.concurrent.locks.ReentrantLock();
  function read(key) { return String(DataBase.getDataBase(key) || "").replace(/^\s+|\s+$/g, ""); }
  function write(key, value) { DataBase.setDataBase(key, String(value)); }
  function utf8(value) { return new java.lang.String(String(value)).getBytes(java.nio.charset.StandardCharsets.UTF_8); }
  function hex(bytes) {
    var out = "", index = 0, value = 0;
    for (index = 0; index < bytes.length; index += 1) { value = bytes[index] & 255; out += (value < 16 ? "0" : "") + String(java.lang.Integer.toHexString(value)); }
    return out;
  }
  function sha(value) { return hex(java.security.MessageDigest.getInstance("SHA-256").digest(utf8(value))); }
  function secret(key) { var value = read(key); if (utf8(value).length < 32) throw new Error("CONFIG_REQUIRED"); return value; }
  function hmac(key, value) {
    var mac = javax.crypto.Mac.getInstance("HmacSHA256");
    mac.init(new javax.crypto.spec.SecretKeySpec(utf8(key), "HmacSHA256"));
    return hex(mac.doFinal(utf8(value)));
  }
  function targetHash() {
    var target = read("KLOL_SITE_NOTICE_TARGET_ID");
    if (!/^[a-f0-9]{32}$/.test(target)) throw new Error("TARGET_REQUIRED");
    return hmac(secret("KLOL_V4_KAKAO_IDENTITY_SECRET"), "site-notice-target\n" + target);
  }
  function request(action, extra) {
    var url = read("KLOL_V2_BASE_URL").replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(url)) throw new Error("HTTPS_REQUIRED");
    var keyId = read("KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT") || "v4-current";
    var body = { action: action, installationId: "install-" + hmac(secret("KLOL_V4_KAKAO_IDENTITY_SECRET"), "installation-id\nKLOL_V4\nFEATURES").substring(0, 32),
      targetHash: targetHash(), timestamp: Math.floor(new Date().getTime() / 1000), nonce: String(java.util.UUID.randomUUID().toString()).replace(/-/g, "") };
    var key;
    for (key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) body[key] = extra[key];
    var raw = JSON.stringify(body);
    var result = org.jsoup.Jsoup.connect(url + "/api/integrations/kakao/site-notices")
      .ignoreContentType(true).ignoreHttpErrors(true).method(org.jsoup.Connection.Method.POST)
      .header("Content-Type", "application/json; charset=utf-8").header("Accept", "application/json")
      .header("x-klol-key-id", keyId)
      .header("x-klol-signature", "notice-v1=" + hmac(secret("KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT"), "KLOL_KAKAO_SITE_NOTICE_V1\n" + keyId + "\n" + sha(raw)))
      .timeout(5000).requestBody(raw).execute();
    if (result.statusCode() !== 200) throw new Error("REQUEST_FAILED");
    var parsed = JSON.parse(String(result.body()));
    if (parsed.contract !== "KLOL_KAKAO_SITE_NOTICE_V1") throw new Error("CONTRACT_INVALID");
    return parsed;
  }
  var worker = createKlolSiteNoticeWorker({ read: read, write: write, targetHash: targetHash, request: request, now: function () { return new Date().getTime(); },
    enter: function () { return workerLock.tryLock(); }, leave: function () { workerLock.unlock(); } });
  KLOL_SITE_NOTICE_INIT_STAGE = "STORAGE";
  var pollingEnabled = read("KLOL_SITE_NOTICE_ENABLED") === "true";
  KLOL_SITE_NOTICE_INIT_STAGE = "TIMER";
  if (pollingEnabled) timer = setInterval(worker.poll, 30000);
  return { register: worker.register, handleMessage: worker.handleMessage, poll: worker.poll, status: worker.status, targetHash: targetHash,
    stop: function () { if (timer !== null) clearInterval(timer); timer = null; worker.stop(); } };
  }());
  KLOL_SITE_NOTICE_INIT_STAGE = "READY";
  klolSiteNoticeLog("INIT_READY");
} catch (ignoredInitializationFailure) {
  klolSiteNoticeLog("INIT_FAILED_" + KLOL_SITE_NOTICE_INIT_STAGE);
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var message = String(msg);
  var diagnostic = message === "사이트알림진단" || message === "사이트알림버전" || message === "사이트알림상태";
  if (!diagnostic && !/^사이트알림연동 [a-f0-9]{32}$/.test(message)) return;
  if (diagnostic) klolSiteNoticeLog("CALLBACK_RECEIVED");
  if (!isGroupChat && diagnostic) klolSiteNoticeLog("GROUP_FLAG_COMPAT");
  if (String(packageName || "") !== "com.kakao.talk") { if (diagnostic) klolSiteNoticeLog("PACKAGE_REJECTED"); return; }
  try {
    if (!replier || !replier.reply) { if (diagnostic) klolSiteNoticeLog("REPLIER_MISSING"); return; }
    // Wrap the SDK method just like the working R25 adapter. Preserve the
    // original Replier and its receiver; do not assume a host method's typeof.
    var callbackReplier = { reply: function (text) {
      try {
        var result = replier.reply(text);
        if (diagnostic) klolSiteNoticeLog(result === false ? "REPLY_REJECTED" : "REPLY_ACCEPTED");
        return result;
      } catch (replyFailure) {
        if (diagnostic) klolSiteNoticeLog("REPLY_FAILED");
        throw replyFailure;
      }
    } };
    if (message === "사이트알림버전") {
      callbackReplier.reply("사이트 알림 버전: " + KLOL_SITE_NOTICE_CODE_VERSION);
      return;
    }
    if (message === "사이트알림진단") {
      callbackReplier.reply("[사이트 알림 진단]\n버전: " + KLOL_SITE_NOTICE_CODE_VERSION +
        "\n메시지 수신: 정상\n카카오톡: 확인\n그룹 표시: " + (isGroupChat ? "켜짐" : "꺼짐/미제공 (호환 처리)") +
        "\n초기화: " + KLOL_SITE_NOTICE_INIT_STAGE +
        "\n서버 연결·충원 발송은 실행하지 않았어요.");
      return;
    }
    if (!KLOL_SITE_NOTICE) {
      callbackReplier.reply("사이트 알림 초기화 실패: " + KLOL_SITE_NOTICE_INIT_STAGE + "\n사이트알림진단 결과를 확인해주세요.");
      return;
    }
    KLOL_SITE_NOTICE.handleMessage(message, isGroupChat, callbackReplier, "com.kakao.talk");
  } catch (ignoredResponseFailure) { if (diagnostic) klolSiteNoticeLog("CALLBACK_FAILED"); }
}
function onStartCompile() { if (KLOL_SITE_NOTICE) KLOL_SITE_NOTICE.stop(); }
