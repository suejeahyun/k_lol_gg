/* eslint-disable */
/* Shared ES5 transport. It intentionally contains no response() callback. */
var KLOL_V4 = (function () {
  var CONTRACT = "KLOL_KAKAO_COMMAND_V4";
  var ENDPOINT = "/api/integrations/kakao/v4/commands";
  var BASE_URL_KEY = "KLOL_V2_BASE_URL";
  var SIGNING_SECRET_KEY = "KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT";
  var SIGNING_KEY_ID_KEY = "KLOL_V2_KAKAO_WEBHOOK_KEY_ID_CURRENT";
  var IDENTITY_SECRET_KEY = "KLOL_V2_KAKAO_IDENTITY_SECRET";
  var BOOT_ID = String(java.util.UUID.randomUUID().toString()).replace(/-/g, "").substring(0, 16);
  var eventCounter = 0;

  function trimText(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function setting(key) {
    try {
      return trimText(String(DataBase.getDataBase(key) || ""));
    } catch (ignored) {
      return "";
    }
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
    if (value !== "RECRUIT" && value !== "FEATURES") throw new Error("V4 profileId를 확인해 주세요.");
    return value;
  }

  function baseUrl() {
    var value = setting(BASE_URL_KEY).replace(/\/+$/, "");
    if (!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(value)) {
      throw new Error("V4 HTTPS 주소 설정을 확인해 주세요.");
    }
    return value;
  }

  function installationId(profileId) {
    return "install-" + hmac(requiredSecret(IDENTITY_SECRET_KEY, "익명 식별 키"), "installation-id\nKLOL_V4\n" + profile(profileId)).substring(0, 32);
  }

  function senderId(sender, userHash) {
    var stable = trimText(userHash);
    var prefix = stable ? "sender-user-" : "sender-display-";
    if (!stable) stable = trimText(sender);
    return prefix + hmac(requiredSecret(IDENTITY_SECRET_KEY, "익명 식별 키"), "sender-id\n" + stable).substring(0, 32);
  }

  function nextEventId(profileId, logId) {
    var stableLogId = trimText(logId);
    if (stableLogId) return "event-log-" + sha256(profile(profileId) + "\n" + stableLogId).substring(0, 32);
    eventCounter += 1;
    return "event-boot-" + BOOT_ID + "-" + String(eventCounter);
  }

  function canonicalLocalCommand(value) {
    var text = trimText(value);
    var stripped = "";
    if (!text || text === "/" || text.indexOf("//") === 0) return null;
    if (text.charAt(0) !== "/") return text;
    stripped = text.substring(1);
    return !stripped || /^\s/.test(stripped) ? null : stripped;
  }

  function localReply(profileId, text, codeVersion) {
    var command = canonicalLocalCommand(text);
    if (command === "봇버전") {
      return "[K-LOL.GG V4 봇 버전]\n프로필: " + profile(profileId) + "\n버전: " + codeVersion + "\n설치본: " + installationId(profileId);
    }
    if (command === "도움말" || command === "명령어") {
      return "[K-LOL.GG 일반 도움말]\n\nLOL-K 기능\n- 내전현황 : 현재 시즌내전 신청 현황\n- 내전참가 / 참가신청 : 참가 방법 안내\n- 전적 닉네임#태그 : 플레이어 전적 조회\n- 최근 닉네임#태그 : 최근 경기 조회\n- 랭킹 : 랭킹 조회\n\n운영 기능\n- /등록 : 초보자용 등록 센터\n- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록\n- /경고등록 : 관리자 경고 등록 화면 열기\n- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출\n- /경고현황 : 내정보의 경고 진행 상황 열기\n- /결과현황 : 사이트의 내 미완료 결과 접수 열기\n\n구인구직 명령어는 구인도움말을 입력해주세요.\n스크림구인은 /스크림구인, /스크림현황을 사용해주세요.\n\n참고\n- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.\n- 예) /내전현황, /전적 닉네임#태그, /구인도움말";
    }
    if (profileId === "RECRUIT" && /^(?:구인구직도움말|구인도움말|구인명령어)$/.test(command)) {
      return "[K-LOL.GG 구인 도움말]\n\n1. 파티\n생성: 5인파티\n현황: 구인현황\n종료: 번호ㅉ\n\n2. 내전\n생성: 내전구인\n현황: 내전현황\n매일 오전 6시 자동 종료\n\n3. 스크림\n생성: 스크림구인\n현황: 스크림현황\n매일 오전 6시 자동 종료\n\n공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송";
    }
    if (profileId === "RECRUIT" && /^(?:구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(command)) {
      return "[K-LOL.GG 구인도우미]\n\n현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.\n\nhttps://k-lol-gg.vercel.app/recruit-helper\n\n구인현황 바로가기:\nhttps://k-lol-gg.vercel.app/recruit";
    }
    if (profileId === "FEATURES" && command === "사진상태") {
      return "[K-LOL.GG 사진 제출 안내]\nV4 휴대폰 봇은 사진 세션 업로드를 사용하지 않습니다.\n사이트에 로그인해 사진을 제출해 주세요.\n\n내전 결과 사진:\nhttps://k-lol-gg.vercel.app/matches/submit\n\n경고 차감 사진:\nhttps://k-lol-gg.vercel.app/discipline/evidence";
    }
    if (profileId === "FEATURES" && (command === "내전미리보기취소" || /^내전확인\s+.+$/.test(command))) {
      return "[K-LOL.GG 내전 신청 안내]\n내전 미리보기·확인 코드 방식은 사용하지 않습니다.\n미리보기·확인 요청은 취소되었습니다.\n봇이 출력한 협곡 전체 양식을 수정해 전송하면 서버의 최종 명단으로 즉시 반영됩니다.\n사이트에는 반영하지 않았으며, 이 명령으로 변경된 내용은 없습니다.";
    }
    return null;
  }

  function acceptsPublicText(profileId, value) {
    var command = canonicalLocalCommand(value);
    if (!command) return false;
    if (/^(?:V2도움말|V2진단|V2연동확인|연동확인|V2사진취소)$/.test(command)) return false;
    if (/^V2(?:모집|시즌|양식|사진세션)\s+\S/.test(command)) return false;
    if (/^(?:봇버전|도움말|명령어|V4상태|V4계약확인)$/.test(command)) return true;
    if (profileId === "RECRUIT") {
      if (/^(?:구인구직도움말|구인도움말|구인명령어|구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(command)) return true;
      if (/^(?:(?:\d+인\s*(?:파티|구인))(?:\s+\d+)?|5인\s*협곡(?:\s*파티)?(?:\s+\d+)?|(?:자랭|일반|솔랭|칼바람|증바람|기타게임|롤체일반|롤체랭크|더블업)구인(?:\s+\d+)?)$/.test(command)) return true;
      if (/^(?:현재구인구직현황|현재구인현황|구인구직현황|구인현황|현황|(?:구인상세|상세)\s*#?\d+|구인(?:마감|쫑|종료)\s*#?\d+|#?\d+(?:번|인)?\s*(?:파티|구인)?\s*(?:쫑|ㅉ|마감|종료))$/.test(command)) return true;
      if (/^(?:(?:멸망전\s*)?스크림(?:\s*(?:구인|모집))?|(?:멸망전\s*)?스크림\s*(?:현황|목록)(?:\s*#?\d+)?|(?:멸망전\s*)?스크림\s*상세\s*#?\d+|(?:멸망전\s*)?스크림\s*(?:참가|확정|취소|마감|종료)(?:\s*#?\d+)?(?:\s+.*)?)$/.test(command)) return true;
      if (/^\[K-LOL\.GG 스크림 구인 양식\]/.test(command)) return true;
      return command.indexOf("모집번호:") >= 0 && /📢\s*.+(?:파티 구인|하실분!?)/.test(command);
    }
    if (/^(?:(?:내전구인구직|내전구인|내전모집)(?:\s+.*)?|내전상세(?:\s*#?\d+)?|(?:내전현황|시즌내전현황|AI공지)(?:\s*#?\d+)?|(?:내전참가|내전신청|참가신청)(?:\s*#?\d+)?)$/.test(command)) return true;
    if (/^(?:전적|최근)\s+.+$/.test(command) || command === "랭킹") return true;
    if (/^(?:등록|등록도움말|사진취소|내전등록|결과등록|내전결과|내전등록현황|결과현황|경고등록|경고|인증|경고인증|경고현황|사진상태|내전미리보기취소|내전확인\s+.+|자동공지(?:\s+(?:12|15|18|20))?|공지생성(?:\s+(?:12|15|18|20))?)$/.test(command)) return true;
    if (/^(?:내전등록|경고등록|경고인증완료|경고현황)\s+\S/.test(command) || /^내전현황\s+MR[A-F0-9]{10,16}$/i.test(command)) return true;
    if (/^📢\s*내전하실분\s*#\d+/m.test(command)) return true;
    if (command.indexOf("지인 이름") >= 0 && command.indexOf("지인 닉네임") >= 0 && command.indexOf("이용기간") >= 0 && command.indexOf("디스코드 닉네임 변경") >= 0) return true;
    if (command.indexOf("본인 이름 및 닉네임") >= 0 && command.indexOf("건의 사유") >= 0 && command.indexOf("건의 내용") >= 0) return true;
    if (command.indexOf("주최자 이름 및 닉네임") >= 0 && command.indexOf("일자") >= 0 && command.indexOf("장소") >= 0 && command.indexOf("참여자 명단") >= 0) return true;
    return command.indexOf("이름 및 닉네임") >= 0 && command.indexOf("외출기간") >= 0 && command.indexOf("외출사유") >= 0 && command.indexOf("외출범위") >= 0;
  }

  function shouldIgnore(profileId, text, sender) {
    var normalized = String(text == null ? "" : text);
    var configuredName = setting("KLOL_V4_BOT_SELF_NAME_" + profile(profileId));
    if (!normalized || normalized.length > 20000) return true;
    if (trimText(sender) === "오픈채팅봇") return true;
    return Boolean(configuredName && trimText(sender) === configuredName);
  }

  function parseJson(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (ignored) {
      return null;
    }
  }

  function send(profileId, text, sender, logId, userHash) {
    var timestamp = Math.floor(new Date().getTime() / 1000);
    var nonce = String(java.util.UUID.randomUUID().toString()).replace(/-/g, "");
    var keyId = setting(SIGNING_KEY_ID_KEY) || "current";
    var eventId = nextEventId(profileId, logId);
    var body = JSON.stringify({
      profileId: profile(profileId),
      installationId: installationId(profileId),
      senderId: senderId(sender, userHash),
      eventId: eventId,
      timestamp: timestamp,
      nonce: nonce,
      text: String(text)
    });
    var material = CONTRACT + "\n" + keyId + "\n" + sha256(body);
    var response = null;
    var attempt = 0;
    function execute() {
      return org.jsoup.Jsoup.connect(baseUrl() + ENDPOINT).ignoreContentType(true).ignoreHttpErrors(true)
        .method(org.jsoup.Connection.Method.POST).header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json").header("x-klol-key-id", keyId)
        .header("x-klol-signature", "v4=" + hmac(requiredSecret(SIGNING_SECRET_KEY, "서명 키"), material))
        .header("Idempotency-Key", eventId).timeout(5000).requestBody(body).execute();
    }
    try {
      attempt = 1;
      response = execute();
    } catch (firstNetworkError) {
      attempt = 2;
      response = execute();
    }
    return {
      ok: response.statusCode() >= 200 && response.statusCode() < 300,
      status: response.statusCode(),
      body: parseJson(response.body()),
      traceId: trimText(response.header("X-Trace-Id"))
    };
  }

  function resultReply(result) {
    if (result && result.ok && result.body && typeof result.body.reply === "string") return result.body.reply;
    if (result && result.ok) return "";
    var code = result && result.body && typeof result.body.code === "string" ? result.body.code : "SERVER_UNAVAILABLE";
    var detail = result && result.body && typeof result.body.detail === "string" ? result.body.detail : "잠시 후 다시 시도해 주세요.";
    if (code === "WRONG_PROFILE") detail = "이 명령은 다른 봇 프로필에서 사용할 수 있습니다.";
    else if (code === "INVALID_SIGNATURE") detail = "봇 설치본의 서명 키와 key ID를 확인해 주세요.";
    else if (code === "REPLAY_CONFLICT") detail = "동일 event ID가 다른 요청에 사용되었습니다.";
    else if (code === "SERVER_UNAVAILABLE") detail = "서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    else if (code === "INVALID_FORM") detail = "양식 필수 항목을 확인해 주세요.";
    return "[K-LOL.GG 요청 실패]\n" + detail + (result && result.traceId ? "\n문의 코드: " + result.traceId : "");
  }

  return {
    localReply: localReply,
    acceptsPublicText: acceptsPublicText,
    resultReply: resultReply,
    send: send,
    shouldIgnore: shouldIgnore
  };
}());
