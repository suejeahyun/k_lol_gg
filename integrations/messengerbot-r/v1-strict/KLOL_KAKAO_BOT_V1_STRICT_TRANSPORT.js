/* eslint-disable */
/*
 * The only network boundary used by the V1-strict phone artifact.
 * This is the V4 HMAC command contract, kept ES5-compatible for MessengerBot R.
 */
var KLOL_V1_GATEWAY = (function () {
  var CONTRACT = "KLOL_KAKAO_COMMAND_V4";
  var PROTOCOL = "KLOL_KAKAO_V1_STRICT";
  var RESPONSE_FORMAT = "V1_SERVER_EXACT";
  var ENDPOINT = "/api/integrations/kakao/v4/commands";
  var BASE_URL_KEY = "KLOL_V2_BASE_URL";
  var SIGNING_SECRET_KEY = "KLOL_V4_KAKAO_WEBHOOK_SECRET_CURRENT";
  var SIGNING_KEY_ID_KEY = "KLOL_V4_KAKAO_WEBHOOK_KEY_ID_CURRENT";
  var IDENTITY_SECRET_KEY = "KLOL_V4_KAKAO_IDENTITY_SECRET";
  var BOOT_ID = String(java.util.UUID.randomUUID().toString()).replace(/-/g, "").substring(0, 16);
  var eventCounter = 0;
  var settingCache = {};
  var installationIdCache = {};
  var baseUrlCache = null;
  var currentLogId = "";
  var currentUserHash = "";
  var currentSender = "";
  var deliveryCache = {};
  var deliveryCacheOrder = [];
  var DELIVERY_CACHE_LIMIT = 256;

  function clean(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function setting(key) {
    if (Object.prototype.hasOwnProperty.call(settingCache, key)) return settingCache[key];
    try {
      settingCache[key] = clean(String(DataBase.getDataBase(key) || ""));
    } catch (ignored) {
      settingCache[key] = "";
    }
    return settingCache[key];
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
    if (baseUrlCache !== null) return baseUrlCache;
    value = setting(BASE_URL_KEY).replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(value)) {
      throw new Error("HTTPS 서버 주소 설정을 확인해 주세요.");
    }
    baseUrlCache = value;
    return baseUrlCache;
  }

  function beginRequest(logId, userHash, sender) {
    settingCache = {};
    installationIdCache = {};
    baseUrlCache = null;
    currentLogId = clean(logId);
    currentUserHash = clean(userHash);
    currentSender = clean(sender);
  }

  function installationId(profileId) {
    var canonicalProfile = profile(profileId);
    if (!installationIdCache[canonicalProfile]) {
      installationIdCache[canonicalProfile] = "install-" + hmac(
        requiredSecret(IDENTITY_SECRET_KEY, "익명 식별 키"),
        "installation-id\nKLOL_V4\n" + canonicalProfile
      ).substring(0, 32);
    }
    return installationIdCache[canonicalProfile];
  }

  function senderId(sender) {
    var stable = currentUserHash;
    var prefix = stable ? "sender-user-" : "sender-display-";
    if (!stable) stable = clean(sender) || currentSender;
    return prefix + hmac(
      requiredSecret(IDENTITY_SECRET_KEY, "익명 식별 키"),
      "sender-id\n" + stable
    ).substring(0, 32);
  }

  function nextEventId(profileId) {
    if (currentLogId) {
      return "event-log-" + sha256(profile(profileId) + "\n" + BOOT_ID + "\n" + currentLogId).substring(0, 32);
    }
    eventCounter += 1;
    return "event-boot-" + BOOT_ID + "-" + String(eventCounter);
  }

  function parseJson(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (ignored) {
      return null;
    }
  }

  function delivery(profileId, text, sender) {
    var cacheKey = currentLogId ? profile(profileId) + "\n" + currentLogId : "";
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
      responseFormat: RESPONSE_FORMAT
    });
    cached = { eventId: eventId, body: body };
    if (cacheKey) {
      deliveryCache[cacheKey] = cached;
      deliveryCacheOrder.push(cacheKey);
      if (deliveryCacheOrder.length > DELIVERY_CACHE_LIMIT) delete deliveryCache[deliveryCacheOrder.shift()];
    }
    return cached;
  }

  function send(profileId, text, sender) {
    var keyId = setting(SIGNING_KEY_ID_KEY) || "current";
    var item = delivery(profileId, text, sender);
    var material = CONTRACT + "\n" + keyId + "\n" + sha256(item.body);
    var responseValue = org.jsoup.Jsoup.connect(baseUrl() + ENDPOINT)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .method(org.jsoup.Connection.Method.POST)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Accept", "application/json")
      .header("x-klol-key-id", keyId)
      .header("x-klol-signature", "v4=" + hmac(requiredSecret(SIGNING_SECRET_KEY, "서명 키"), material))
      .header("Idempotency-Key", item.eventId)
      .timeout(5000)
      .requestBody(item.body)
      .execute();
    var responseText = String(responseValue.body() || "");
    return {
      ok: responseValue.statusCode() >= 200 && responseValue.statusCode() < 300,
      status: responseValue.statusCode(),
      body: parseJson(responseText),
      traceId: clean(responseValue.header("X-Trace-Id")),
      replayed: clean(responseValue.header("Idempotency-Replayed")) === "true"
    };
  }

  function replyText(result) {
    if (result && result.body && typeof result.body.reply === "string") {
      return String(result.body.reply);
    }
    return "";
  }

  return {
    beginRequest: beginRequest,
    replyText: replyText,
    send: send
  };
}());
