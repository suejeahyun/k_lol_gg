/* eslint-disable */
/*
 * The only network boundary used by the V1-strict phone artifact.
 * This is the V4 HMAC command contract, kept ES5-compatible for MessengerBot R.
 */
var KLOL_V1_GATEWAY = (function () {
  var CON = "KLOL_KAKAO_COMMAND_V4";
  var PROTO = "KLOL_KAKAO_V1_STRICT";
  var FORMAT = "V1_SERVER_EXACT";
  var ENDPOINT = "/api/integrations/kakao/v4/commands";
  var URL_KEY = "KLOL_V2_BASE_URL";
  var SIGN_KEY = "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT";
  var KEY_ID = "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT";
  var ID_KEY = "KLOL_V4_KAKAO_IDENTITY_SECRET";
  var BOOT_ID = String(java.util.UUID.randomUUID().toString()).replace(/-/g, "").substring(0, 16);
  var seq = 0;
  var settings = {};
  var inst = {};
  var origin = null;
  var logKey = "";
  var userKey = "";
  var who = "";
  var active = null;
  var sent = {};
  var order = [];
  var LIMIT = 256;
  var startMs = 0;
  var netMs = 0;
  var timing = null;

  function clean(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function setting(key) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) return settings[key];
    try {
      settings[key] = clean(String(DataBase.getDataBase(key) || ""));
    } catch (ignored) {
      settings[key] = "";
    }
    return settings[key];
  }

  function utf8(value) {
    return new java.lang.String(String(value)).getBytes(java.nio.charset.StandardCharsets.UTF_8);
  }

  function hex(bytes) {
    var builder = new java.lang.StringBuilder(bytes.length * 2);
    var index = 0;
    var value = 0;
    for (index = 0; index < bytes.length; index += 1) {
      value = bytes[index] & 255;
      if (value < 16) builder.append("0");
      builder.append(java.lang.Integer.toHexString(value));
    }
    return String(builder.toString());
  }

  function sha256(value) {
    return hex(java.security.MessageDigest.getInstance("SHA-256").digest(utf8(value)));
  }

  function hmac(secret, value) {
    var mac = javax.crypto.Mac.getInstance("HmacSHA256");
    mac.init(new javax.crypto.spec.SecretKeySpec(utf8(secret), "HmacSHA256"));
    return hex(mac.doFinal(utf8(value)));
  }

  function secret(key, label) {
    var value = setting(key);
    if (utf8(value).length < 32) throw new Error(label + " 비공개 설정을 확인해 주세요.");
    return value;
  }

  function profile(value) {
    if (value !== "RECRUIT" && value !== "FEATURES") throw new Error("봇 기능 구분을 확인해 주세요.");
    return value;
  }

  function baseUrl() {
    var value = "";
    if (origin !== null) return origin;
    value = setting(URL_KEY).replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(value)) {
      throw new Error("HTTPS 서버 주소 설정을 확인해 주세요.");
    }
    origin = value;
    return origin;
  }

  function beginRequest(logId, userHash, sender) {
    startMs = new Date().getTime();
    netMs = -1;
    settings = {};
    inst = {};
    origin = null;
    logKey = clean(logId);
    userKey = clean(userHash);
    who = clean(sender);
    active = null;
  }

  function finish() {
    if (netMs < 0) return;
    timing = "[봇 속도]\n처리: " + (new Date().getTime() - startMs) + "ms\n서버 왕복: " + netMs + "ms";
  }

  function speed() {
    return (timing || "내전상세 1을 보낸 뒤 다시 입력해주세요.") + "\n수신 전 대기는 제외";
  }

  function installationId(pid) {
    var sel = profile(pid);
    if (!inst[sel]) {
      inst[sel] = "install-" + hmac(
        secret(ID_KEY, "익명 식별 키"),
        "installation-id\nKLOL_V4\n" + sel
      ).substring(0, 32);
    }
    return inst[sel];
  }

  function senderId(sender) {
    var stable = userKey;
    var prefix = stable ? "sender-user-" : "sender-display-";
    if (!stable) stable = clean(sender) || who;
    return prefix + hmac(
      secret(ID_KEY, "익명 식별 키"),
      "sender-id\n" + stable
    ).substring(0, 32);
  }

  function nextId(pid) {
    if (logKey) {
      return "event-log-" + sha256(profile(pid) + "\n" + BOOT_ID + "\n" + logKey).substring(0, 32);
    }
    seq += 1;
    return "event-boot-" + BOOT_ID + "-" + String(seq);
  }

  function json(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (ignored) {
      return null;
    }
  }

  function delivery(pid, text, sender) {
    var key = logKey ? profile(pid) + "\n" + logKey : "";
    var cached = key ? sent[key] : null;
    var eventId = "";
    var body = "";
    if (cached) return cached;
    eventId = nextId(pid);
    body = JSON.stringify({
      profileId: profile(pid),
      installationId: installationId(pid),
      senderId: senderId(sender),
      eventId: eventId,
      timestamp: Math.floor(new Date().getTime() / 1000),
      nonce: String(java.util.UUID.randomUUID().toString()).replace(/-/g, ""),
      text: String(text),
      protocol: PROTO,
      responseFormat: FORMAT
    });
    cached = { eventId: eventId, body: body };
    if (key) {
      sent[key] = cached;
      order.push(key);
      if (order.length > LIMIT) delete sent[order.shift()];
    }
    return cached;
  }

  function send(pid, text, sender) {
    var keyId = setting(KEY_ID) || "current";
    var item = delivery(pid, text, sender);
    active = item;
    var material = CON + "\n" + keyId + "\n" + sha256(item.body);
    var netAt = new Date().getTime();
    var response = null;
    try {
      response = org.jsoup.Jsoup.connect(baseUrl() + ENDPOINT)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .method(org.jsoup.Connection.Method.POST)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Accept", "application/json")
      .header("x-klol-key-id", keyId)
      .header("x-klol-signature", "v4=" + hmac(secret(SIGN_KEY, "서명 키"), material))
      .header("Idempotency-Key", item.eventId)
      .timeout(5000)
      .requestBody(item.body)
      .execute();
    } finally {
      netMs = Math.max(0, new Date().getTime() - netAt);
    }
    var raw = String(response.body() || "");
    var status = response.statusCode();
    var replayed = clean(response.header("Idempotency-Replayed")) === "true";
    return {
      ok: status >= 200 && status < 300,
      status: status,
      body: json(raw),
      traceId: clean(response.header("X-Trace-Id")),
      replayed: replayed
    };
  }

  function shouldSuppressReply() {
    return Boolean(active && active.replySent);
  }

  function markReplySent() {
    if (active) active.replySent = true;
  }

  function replyText(result) {
    if (result && result.body && typeof result.body.reply === "string") {
      return String(result.body.reply);
    }
    return "";
  }

  return {
    beginRequest: beginRequest,
    finish: finish,
    speed: speed,
    replyText: replyText,
    send: send,
    shouldSuppressReply: shouldSuppressReply,
    markReplySent: markReplySent
  };
}());
