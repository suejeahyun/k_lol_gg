/* eslint-disable */
/*
 * The only network boundary used by the V1-strict phone artifact.
 * This is the V4 HMAC command contract, kept ES5-compatible for MessengerBot R.
 */
var KLOL_V1_GATEWAY = (function () {
  var CONTRACT = "KLOL_KAKAO_COMMAND_V4";
  var PROTOCOL = "KLOL_KAKAO_V1_STRICT";
  var FORMAT = "V1_SERVER_EXACT";
  var ENDPOINT = "/api/integrations/kakao/v4/commands";
  var URL_KEY = "KLOL_V2_BASE_URL";
  var SIGN_KEY = "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT";
  var KEY_ID = "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT";
  var ID_KEY = "KLOL_V4_KAKAO_IDENTITY_SECRET";
  var BOOT_ID = String(java.util.UUID.randomUUID().toString()).replace(/-/g, "").substring(0, 16);
  var eventSeq = 0;
  var settings = {};
  var installCache = {};
  var originCache = null;
  var logKey = "";
  var userKey = "";
  var senderValue = "";
  var active = null;
  var deliveryCache = {};
  var deliveryOrder = [];
  var CACHE_LIMIT = 256;
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

  function requiredSecret(key, label) {
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
    if (originCache !== null) return originCache;
    value = setting(URL_KEY).replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(value)) {
      throw new Error("HTTPS 서버 주소 설정을 확인해 주세요.");
    }
    originCache = value;
    return originCache;
  }

  function beginRequest(logId, userHash, sender) {
    startMs = new Date().getTime();
    netMs = -1;
    settings = {};
    installCache = {};
    originCache = null;
    logKey = clean(logId);
    userKey = clean(userHash);
    senderValue = clean(sender);
    active = null;
  }

  function finish() {
    if (netMs < 0) return;
    timing = "[봇 속도]\n처리: " + (new Date().getTime() - startMs) + "ms\n서버 왕복: " + netMs + "ms";
  }

  function speed() {
    return (timing || "내전상세 1을 보낸 뒤 다시 입력해주세요.") + "\n수신 전 대기는 제외";
  }

  function installationId(profileId) {
    var selected = profile(profileId);
    if (!installCache[selected]) {
      installCache[selected] = "install-" + hmac(
        requiredSecret(ID_KEY, "익명 식별 키"),
        "installation-id\nKLOL_V4\n" + selected
      ).substring(0, 32);
    }
    return installCache[selected];
  }

  function senderId(sender) {
    var stable = userKey;
    var prefix = stable ? "sender-user-" : "sender-display-";
    if (!stable) stable = clean(sender) || senderValue;
    return prefix + hmac(
      requiredSecret(ID_KEY, "익명 식별 키"),
      "sender-id\n" + stable
    ).substring(0, 32);
  }

  function nextEventId(profileId) {
    if (logKey) {
      return "event-log-" + sha256(profile(profileId) + "\n" + BOOT_ID + "\n" + logKey).substring(0, 32);
    }
    eventSeq += 1;
    return "event-boot-" + BOOT_ID + "-" + String(eventSeq);
  }

  function parseJson(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (ignored) {
      return null;
    }
  }

  function delivery(profileId, text, sender) {
    var cacheKey = logKey ? profile(profileId) + "\n" + logKey : "";
    var cached = cacheKey ? deliveryCache[cacheKey] : null;
    var eventId = "";
    var body = "";
    if (cached) return cached;
    eventId = nextEventId(profileId);
    body = JSON.stringify({
      profileId: profile(profileId),
      installationId: installationId(profileId),
      senderId: senderId(sender),
      eventId: eventId,
      timestamp: Math.floor(new Date().getTime() / 1000),
      nonce: String(java.util.UUID.randomUUID().toString()).replace(/-/g, ""),
      text: String(text),
      protocol: PROTOCOL,
      responseFormat: FORMAT
    });
    cached = { eventId: eventId, body: body };
    if (cacheKey) {
      deliveryCache[cacheKey] = cached;
      deliveryOrder.push(cacheKey);
      if (deliveryOrder.length > CACHE_LIMIT) delete deliveryCache[deliveryOrder.shift()];
    }
    return cached;
  }

  function send(profileId, text, sender) {
    var keyId = setting(KEY_ID) || "current";
    var item = delivery(profileId, text, sender);
    active = item;
    var material = CONTRACT + "\n" + keyId + "\n" + sha256(item.body);
    var netStart = new Date().getTime();
    var response = null;
    try {
      response = org.jsoup.Jsoup.connect(baseUrl() + ENDPOINT)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .method(org.jsoup.Connection.Method.POST)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Accept", "application/json")
      .header("x-klol-key-id", keyId)
      .header("x-klol-signature", "v4=" + hmac(requiredSecret(SIGN_KEY, "서명 키"), material))
      .header("Idempotency-Key", item.eventId)
      .timeout(5000)
      .requestBody(item.body)
      .execute();
    } finally {
      netMs = Math.max(0, new Date().getTime() - netStart);
    }
    var raw = String(response.body() || "");
    var status = response.statusCode();
    var replayed = clean(response.header("Idempotency-Replayed")) === "true";
    return {
      ok: status >= 200 && status < 300,
      status: status,
      body: parseJson(raw),
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
