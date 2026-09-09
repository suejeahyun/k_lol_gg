/* eslint-disable */
/*
 * K-LOL.GG MessengerBot R V2 transport adapter.
 *
 * This file intentionally does not define response(). Use it with the V41
 * router, or paste the generated KLOL_KAKAO_BOT_V41_V2_COMPLETE.js into
 * MessengerBot R as the standalone bot entry.
 *
 * Never place the signing secret in source. Store it only in MessengerBot R's
 * private DataBase under KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT. Keep the stable
 * pseudonymous-ID key under KLOL_V2_KAKAO_IDENTITY_SECRET.
 */
var KLOL_V2_KAKAO = (function () {
  var CONTRACT_VERSION = "KLOL_KAKAO_WEBHOOK_V2";
  var SETTING_BASE_URL = "KLOL_V2_BASE_URL";
  var SETTING_SIGNING_SECRET = "KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT";
  var SETTING_IDENTITY_SECRET = "KLOL_V2_KAKAO_IDENTITY_SECRET";
  var ENDPOINTS = {
    recruit: "/api/integrations/kakao/recruits",
    playerSearch: "/api/integrations/kakao/search-player",
    openchat: "/api/integrations/kakao/openchat",
    seasonApplications: "/api/integrations/kakao/season-applications",
    managedForms: "/api/integrations/kakao/managed-forms",
    operationForms: "/api/integrations/kakao/operation-forms",
    imageReceive: "/api/integrations/kakao/image-receive",
    scheduledNotice: "/api/integrations/kakao/scheduled-notice",
    pairRoom: "/api/integrations/kakao/pair-room"
  };

  function trimText(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function readPrivateSetting(key) {
    try {
      return trimText(String(DataBase.getDataBase(key) || ""));
    } catch (ignored) {
      return "";
    }
  }

  function utf8(value) {
    return new java.lang.String(String(value)).getBytes(java.nio.charset.StandardCharsets.UTF_8);
  }

  function bytesToHex(bytes) {
    var builder = new java.lang.StringBuilder(bytes.length * 2);
    for (var index = 0; index < bytes.length; index += 1) {
      var unsigned = bytes[index] & 255;
      if (unsigned < 16) builder.append("0");
      builder.append(java.lang.Integer.toHexString(unsigned));
    }
    return String(builder.toString());
  }

  function sha256Hex(value) {
    var digest = java.security.MessageDigest.getInstance("SHA-256");
    return bytesToHex(digest.digest(utf8(value)));
  }

  function sha256Base64BytesHex(value) {
    var decoded = android.util.Base64.decode(String(value), android.util.Base64.DEFAULT);
    var digest = java.security.MessageDigest.getInstance("SHA-256");
    return bytesToHex(digest.digest(decoded));
  }

  function hmacSha256Hex(secret, value) {
    var mac = javax.crypto.Mac.getInstance("HmacSHA256");
    mac.init(new javax.crypto.spec.SecretKeySpec(utf8(secret), "HmacSHA256"));
    return bytesToHex(mac.doFinal(utf8(value)));
  }

  function normalizeBaseUrl(value) {
    var baseUrl = trimText(value).replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("V2 HTTPS 주소가 없습니다. 봇의 KLOL_V2_BASE_URL 비공개 설정을 확인해 주세요.");
    }
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(baseUrl)) {
      throw new Error("V2 HTTPS 주소 설정을 확인해 주세요.");
    }
    return baseUrl;
  }

  function publicBaseUrl() {
    return normalizeBaseUrl(readPrivateSetting(SETTING_BASE_URL));
  }

  function safeIdentifier(value, label) {
    var normalized = trimText(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(normalized)) {
      throw new Error(label + " 식별자 설정을 확인해 주세요.");
    }
    return normalized;
  }

  function signingSecret() {
    var secret = readPrivateSetting(SETTING_SIGNING_SECRET);
    if (utf8(secret).length < 32) {
      throw new Error("V2 서명 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
    }
    return secret;
  }

  function identitySecret() {
    var secret = readPrivateSetting(SETTING_IDENTITY_SECRET);
    if (utf8(secret).length < 32) {
      throw new Error("V2 익명 식별 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
    }
    return secret;
  }

  function randomNonce() {
    return String(java.util.UUID.randomUUID().toString()).replace(/-/g, "");
  }

  function newUuid() {
    return String(java.util.UUID.randomUUID().toString());
  }

  function idempotencyKey(nonce) {
    return "mbr-v41-" + nonce;
  }

  function installationId() {
    return "install-" + hmacSha256Hex(identitySecret(), "installation-id\nKLOL_V41").substring(0, 32);
  }

  function signatureMaterial(timestampSeconds, nonce, installId, roomId, senderId, bodyDigestHex) {
    return [CONTRACT_VERSION, timestampSeconds, nonce, installId, roomId, senderId, bodyDigestHex].join("\n");
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (ignored) {
      return null;
    }
  }

  function request(path, payload, context) {
    if (!context || typeof context !== "object") throw new Error("V2 요청 컨텍스트가 필요합니다.");
    if (!Object.prototype.hasOwnProperty.call(ENDPOINTS, context.endpointName) || ENDPOINTS[context.endpointName] !== path) {
      throw new Error("허용되지 않은 V2 API 경로입니다.");
    }
    var rawBody = JSON.stringify(payload);
    var roomId = safeIdentifier(context.roomId, "방");
    var senderId = safeIdentifier(context.senderId, "발신자");
    var installId = safeIdentifier(context.installationId || installationId(), "설치본");
    var nonce = randomNonce();
    var timestampSeconds = Math.floor(new Date().getTime() / 1000);
    var bodyDigestHex = sha256Hex(rawBody);
    var signature = "v2=" + hmacSha256Hex(
      signingSecret(),
      signatureMaterial(timestampSeconds, nonce, installId, roomId, senderId, bodyDigestHex)
    );
    var connection = org.jsoup.Jsoup.connect(publicBaseUrl() + path)
      .ignoreContentType(true)
      .ignoreHttpErrors(true)
      .method(org.jsoup.Connection.Method.POST)
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Accept", "application/json")
      .header("x-klol-timestamp", String(timestampSeconds))
      .header("x-klol-nonce", nonce)
      .header("x-klol-installation", installId)
      .header("x-klol-room", roomId)
      .header("x-klol-sender", senderId)
      .header("x-klol-bot-self", context.botSelf === true ? "1" : "0")
      .header("x-klol-signature", signature)
      .header("Idempotency-Key", context.requestKey || idempotencyKey(nonce))
      .timeout(typeof context.timeoutMs === "number" ? Math.floor(context.timeoutMs) : 12000)
      .requestBody(rawBody);
    if (path === ENDPOINTS.imageReceive) connection.maxBodySize(0);
    if (typeof context.expectedRevision === "number" && context.expectedRevision >= 0) {
      connection.header("If-Match", "\"" + String(Math.floor(context.expectedRevision)) + "\"");
    }
    var response = connection.execute();
    var parsed = safeJsonParse(response.body());
    return {
      ok: response.statusCode() >= 200 && response.statusCode() < 300,
      status: response.statusCode(),
      body: parsed,
      traceId: trimText(response.header("X-Trace-Id"))
    };
  }

  function contextFor(endpointName, context) {
    var next = {};
    var key = "";
    context = context || {};
    for (key in context) {
      if (Object.prototype.hasOwnProperty.call(context, key)) next[key] = context[key];
    }
    next.endpointName = endpointName;
    return next;
  }

  function identityForChat(room, sender) {
    var secret = identitySecret();
    return {
      roomId: "room-" + hmacSha256Hex(secret, "room-id\n" + trimText(room)).substring(0, 32),
      senderId: "sender-" + hmacSha256Hex(secret, "sender-id\n" + trimText(sender)).substring(0, 32)
    };
  }

  function contextFromChat(room, sender, options) {
    var identity = identityForChat(room, sender);
    var context = { installationId: installationId(), roomId: identity.roomId, senderId: identity.senderId, botSelf: false };
    var key = "";
    options = options || {};
    for (key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) context[key] = options[key];
    }
    return context;
  }

  function recruit(command, context) {
    if (!context || typeof context.expectedRevision !== "number") {
      throw new Error("모집 요청에는 최신 revision이 필요합니다.");
    }
    var body = {};
    var key = "";
    for (key in command) {
      if (Object.prototype.hasOwnProperty.call(command, key)) body[key] = command[key];
    }
    body.source = context.commandSource === "RAW_V2" ? "RAW_V2" : "COMPAT_V1";
    return request(ENDPOINTS.recruit, body, contextFor("recruit", context));
  }

  function searchPlayer(query, context) {
    return request(ENDPOINTS.playerSearch, { query: String(query || "") }, contextFor("playerSearch", context));
  }

  function openchatStatus(context) {
    return request(ENDPOINTS.openchat, { command: "STATUS" }, contextFor("openchat", context));
  }

  function openchatSearch(query, context) {
    return request(ENDPOINTS.openchat, { command: "SEARCH_PLAYER", query: String(query || "") }, contextFor("openchat", context));
  }

  function playerRecord(query, context) {
    return request(ENDPOINTS.openchat, { command: "RECORD", query: String(query || "") }, contextFor("openchat", context));
  }

  function recentMatches(query, context) {
    return request(ENDPOINTS.openchat, { command: "RECENT", query: String(query || "") }, contextFor("openchat", context));
  }

  function ranking(context) {
    return request(ENDPOINTS.openchat, { command: "RANKING" }, contextFor("openchat", context));
  }

  function seasonApplications(command, context) {
    return request(ENDPOINTS.seasonApplications, command, contextFor("seasonApplications", context));
  }

  function managedForm(formType, payload, context) {
    return request(ENDPOINTS.managedForms, {
      command: "SUBMIT_OPERATION_FORM",
      formType: formType,
      payload: payload
    }, contextFor("managedForms", context));
  }

  function operationForm(formType, payload, context) {
    return request(ENDPOINTS.operationForms, { formType: formType, payload: payload }, contextFor("operationForms", context));
  }

  function imageReceive(command, context) {
    return request(ENDPOINTS.imageReceive, command, contextFor("imageReceive", context));
  }

  function scheduledNotice(slot, context) {
    return request(ENDPOINTS.scheduledNotice, slot == null ? {} : { slot: slot }, contextFor("scheduledNotice", context));
  }

  function pairRoom(code, context) {
    return request(ENDPOINTS.pairRoom, { code: String(code || "") }, contextFor("pairRoom", context));
  }

  function userMessage(result) {
    if (result && result.ok) return "[K-LOL.GG]\n요청을 안전하게 처리했습니다.";
    var body = result && result.body && typeof result.body === "object" ? result.body : null;
    var code = body && typeof body.code === "string" ? body.code : "";
    var detail = body && typeof body.detail === "string" ? body.detail : "잠시 후 다시 시도해 주세요.";
    if (code === "ROOM_BINDING_REQUIRED" || code === "ROOM_NOT_REGISTERED" || code === "KAKAO_ROOM_FORBIDDEN") detail = "이 설치본의 방 연결이 필요합니다. /V2연동확인 결과를 관리자에게 전달해 주세요.";
    else if (code === "ROOM_PAUSED") detail = "이 방의 K-LOL.GG 기능이 일시 중지되었습니다.";
    else if (code === "ROLE_FORBIDDEN" || code === "KAKAO_CAPABILITY_FORBIDDEN" || code === "FORBIDDEN") detail = "이 기능 권한 없음: 이 요청에 필요한 권한을 확인해 주세요.";
    else if (code === "FORM_INVALID" || code === "INVALID_OPERATION_FORM") detail = "양식 필드 누락: 신청 유형과 필수 항목을 확인해 주세요.";
    else if (code === "CONFLICT") detail = "이미 처리되었거나 현재 상태와 충돌합니다. 최신 상태를 확인해 주세요.";
    else if (code === "KAKAO_INTEGRATION_ERROR" || (result && result.status === 401)) detail = "연동 설정 오류: 봇의 서버 주소와 서명 설정을 확인해 주세요.";
    var trace = result && result.traceId ? "\n문의 코드: " + result.traceId : "";
    return "[K-LOL.GG 요청 실패]\n" + detail + trace;
  }

  return {
    version: "KLOL_KAKAO_BOT_V41_V2_TRANSPORT_2026_09_09_REQUIRED_ORIGIN",
    contractVersion: CONTRACT_VERSION,
    publicBaseUrl: publicBaseUrl,
    identityForChat: identityForChat,
    installationId: installationId,
    contextFromChat: contextFromChat,
    sha256Base64BytesHex: sha256Base64BytesHex,
    newUuid: newUuid,
    recruit: recruit,
    searchPlayer: searchPlayer,
    openchatStatus: openchatStatus,
    openchatSearch: openchatSearch,
    playerRecord: playerRecord,
    recentMatches: recentMatches,
    ranking: ranking,
    seasonApplications: seasonApplications,
    managedForm: managedForm,
    operationForm: operationForm,
    imageReceive: imageReceive,
    scheduledNotice: scheduledNotice,
    pairRoom: pairRoom,
    userMessage: userMessage
  };
}());
