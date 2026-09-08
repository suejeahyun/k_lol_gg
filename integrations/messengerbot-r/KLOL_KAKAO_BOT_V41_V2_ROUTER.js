/* eslint-disable */
/*
 * K-LOL.GG MessengerBot R V41 command router.
 * Build the paste-ready single file with scripts/build-messengerbot-v41.mjs.
 * This router requires KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js immediately before it.
 */
var KLOL_V41_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V41_V2_2026_09_08";
var KLOL_V41_SITE_URL = "https://k-lol-gg.vercel.app";

function v41Trim(value) {
  return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
}

function v41PrivateSetting(key) {
  try {
    return v41Trim(String(DataBase.getDataBase(key) || ""));
  } catch (ignored) {
    return "";
  }
}

function v41Reply(replier, text) {
  if (replier && replier.reply) replier.reply(String(text));
}

function v41ResultMessage(result) {
  return KLOL_V2_KAKAO.userMessage(result);
}

function v41Today() {
  var formatter = new java.text.SimpleDateFormat("yyyy-MM-dd");
  formatter.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Seoul"));
  return String(formatter.format(new java.util.Date()));
}

function v41RecruitNumber(text) {
  var match = String(text || "").match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
  if (!match) match = String(text || "").match(/#\s*(\d{1,3})/);
  var value = match ? Number(match[1]) : 1;
  return value >= 1 && value <= 999 ? value : 1;
}

function v41SeasonId() {
  var value = v41PrivateSetting("KLOL_V2_ACTIVE_SEASON_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("V2 활성 시즌 ID 설정을 확인해 주세요.");
  }
  return value;
}

function v41FormatSearch(result) {
  var body = result && result.body;
  var items = body && body.items instanceof Array ? body.items : [];
  var lines = ["[K-LOL.GG 전적 검색]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  if (!items.length) return lines[0] + "\n검색 결과가 없습니다.";
  for (index = 0; index < items.length; index += 1) {
    lines.push((index + 1) + ". " + items[index].displayName + " · " + items[index].riotId +
      (items[index].tier ? " · " + items[index].tier : ""));
  }
  if (body.truncated) lines.push("일부 결과만 표시했습니다.");
  return lines.join("\n");
}

function v41FormatOpenchat(result) {
  var body = result && result.body;
  var parties = body && body.parties instanceof Array ? body.parties : [];
  var scrims = body && body.scrims instanceof Array ? body.scrims : [];
  var lines = ["[K-LOL.GG 구인 현황]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  for (index = 0; index < parties.length; index += 1) {
    lines.push("파티 #" + parties[index].recruitNumber + " · " + parties[index].title + " · " +
      parties[index].memberCount + "/" + parties[index].maximumMembers);
  }
  for (index = 0; index < scrims.length; index += 1) {
    lines.push("스크림 #" + scrims[index].scrimNumber + " · " + scrims[index].status + " · BO" + scrims[index].bestOf);
  }
  if (lines.length === 1) lines.push("현재 진행 중인 모집이 없습니다.");
  return lines.join("\n");
}

function v41SafeSeasonField(value) {
  return v41Trim(value).replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ");
}

function v41SeasonStatusLabel(status) {
  return {
    APPLIED: "신청",
    RESERVE: "예비",
    CONFIRMED: "확정",
    REJECTED: "거절",
    CANCELLED: "취소",
    MATCHED_RESERVE: "예비 · 확인 필요",
    UNMATCHED: "플레이어 확인 필요",
    AMBIGUOUS: "동명이인 확인 필요"
  }[String(status || "")] || v41SafeSeasonField(status);
}

function v41FormatSeason(result) {
  var body = result && result.body;
  var entries = body && body.entries instanceof Array ? body.entries : [];
  var lines = ["[K-LOL.GG 내전 참가 신청]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  lines.push("신청일: " + body.applyDate);
  lines.push("회차: #" + body.recruitNo);
  lines.push("신청 " + Number(body.appliedCount || 0) + " · 예비 " + Number(body.reserveCount || 0) + " · 확정 " + Number(body.confirmedCount || 0) + " · 확인 필요 " + Number(body.pendingCount || 0));
  for (index = 0; index < entries.length; index += 1) {
    var entry = entries[index];
    var name = entry.player ? entry.player.displayName : entry.suppliedName;
    var riotId = entry.player ? entry.player.riotId : entry.suppliedRiotId;
    var subs = entry.subPositions instanceof Array && entry.subPositions.length ? entry.subPositions.join(", ") : "없음";
    lines.push(entry.slotNo + ". 플레이어: " + v41SafeSeasonField(name) +
      " | Riot ID: " + v41SafeSeasonField(riotId || "없음") +
      " | 주라인: " + v41SafeSeasonField(entry.mainPosition || "ALL") +
      " | 부라인: " + v41SafeSeasonField(subs) +
      " | 상태: " + v41SeasonStatusLabel(entry.status) +
      " | 출처: " + (entry.source === "SITE" ? "SITE" : "KAKAO"));
  }
  return lines.join("\n");
}

function v41Position(value) {
  var token = v41Trim(value).toUpperCase();
  if (token === "탑" || token === "T") return "TOP";
  if (token === "정글" || token === "JG" || token === "JUG") return "JGL";
  if (token === "미드" || token === "MD" || token === "M") return "MID";
  if (token === "원딜" || token === "AD" || token === "원딜러") return "ADC";
  if (token === "서폿" || token === "서포터" || token === "S") return "SUP";
  if (token === "올" || token === "전체" || token === "FILL") return "ALL";
  if (/^(TOP|JGL|MID|ADC|SUP|ALL)$/.test(token)) return token;
  return null;
}

function v41SeasonParticipants(text) {
  var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  var participants = [];
  var index = 0;
  for (index = 0; index < lines.length; index += 1) {
    var match = v41Trim(lines[index]).match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
    if (!match || /^(?:EX|예시)/i.test(match[2])) continue;
    if (match[2].indexOf("플레이어:") >= 0 || match[2].indexOf("플레이어：") >= 0) {
      var labeled = match[2].split("|");
      var values = {};
      var labelIndex = 0;
      for (labelIndex = 0; labelIndex < labeled.length; labelIndex += 1) {
        var labelMatch = v41Trim(labeled[labelIndex]).match(/^([^:：]+)\s*[:：]\s*(.*)$/);
        if (labelMatch) values[v41Trim(labelMatch[1]).toLowerCase()] = v41Trim(labelMatch[2]);
      }
      var labeledName = values["플레이어"] || values["이름"];
      var labeledRiotId = values["riot id"] || values["라이엇 id"] || null;
      var labeledMain = v41Position(values["주라인"] || values["주 포지션"]);
      var labeledSubs = [];
      var labeledSubTokens = String(values["부라인"] || values["부 포지션"] || "").split(/[,，]/);
      var labeledSubIndex = 0;
      if (!labeledName || !labeledMain) throw new Error(match[1] + "번 신청자의 플레이어 또는 주라인을 확인해 주세요.");
      for (labeledSubIndex = 0; labeledSubIndex < labeledSubTokens.length; labeledSubIndex += 1) {
        var labeledSubText = v41Trim(labeledSubTokens[labeledSubIndex]);
        if (!labeledSubText || /^(?:없음|-)$/.test(labeledSubText)) continue;
        var labeledSub = v41Position(labeledSubText);
        if (!labeledSub || labeledSub === labeledMain || labeledSub === "ALL" || labeledSubs.indexOf(labeledSub) >= 0) {
          throw new Error(match[1] + "번 신청자의 부라인을 확인해 주세요.");
        }
        labeledSubs.push(labeledSub);
      }
      if (labeledMain === "ALL" && labeledSubs.length) throw new Error(match[1] + "번 신청자의 부라인을 확인해 주세요.");
      if (labeledRiotId && /^(?:없음|-)$/.test(labeledRiotId)) labeledRiotId = null;
      participants.push({
        slotNo: Number(match[1]), name: labeledName, riotId: labeledRiotId,
        mainPosition: labeledMain, subPositions: labeledSubs,
        reserve: /(?:예비|대기|MATCHED_RESERVE|RESERVE)/i.test(values["상태"] || "")
      });
      continue;
    }
    if (match[2].indexOf("/") < 0) continue;
    var fields = match[2].split("/");
    if (fields.length < 4) continue;
    var name = v41Trim(fields[0]);
    var positions = v41Trim(fields.slice(3).join("/")).split(/[,，]/);
    var main = v41Position(positions[0]);
    if (!name || !main) throw new Error(match[1] + "번 신청자의 이름 또는 포지션을 확인해 주세요.");
    var subs = [];
    var subIndex = 1;
    for (subIndex = 1; subIndex < positions.length; subIndex += 1) {
      var sub = v41Position(positions[subIndex]);
      if (sub && sub !== main && sub !== "ALL" && subs.indexOf(sub) < 0) subs.push(sub);
    }
    participants.push({
      slotNo: Number(match[1]), name: name, riotId: null, mainPosition: main,
      subPositions: subs, reserve: /(?:예비|대기)/.test(match[2])
    });
  }
  if (!participants.length) throw new Error("내전 신청자 줄을 찾지 못했습니다.");
  return participants;
}

function v41DateFromSnapshot(text) {
  var match = String(text || "").match(/(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : v41Today();
}

function v41JsonAfter(text, prefix) {
  var parsed = JSON.parse(v41Trim(String(text).substring(prefix.length)));
  if (!parsed || typeof parsed !== "object" || parsed instanceof Array) throw new Error("JSON 객체 형식을 확인해 주세요.");
  return parsed;
}

function v41RecruitKind(type) {
  return String(type || "").indexOf("SCRIM") >= 0 ? "SCRIM" : "PARTY";
}

function v41RecruitStateKey(room, kind) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, "recruit-state");
  return "KLOL_V41_RECRUIT_" + kind + "_" + identity.roomId.substring(5);
}

function v41ReadRecruitState(room, kind) {
  try {
    var value = JSON.parse(String(DataBase.getDataBase(v41RecruitStateKey(room, kind)) || "null"));
    if (value && typeof value.aggregateId === "string" && typeof value.revision === "number") return value;
  } catch (ignored) {}
  return null;
}

function v41SaveRecruitState(room, kind, result) {
  var body = result && result.body;
  if (!result || !result.ok || !body || typeof body.aggregateId !== "string" || typeof body.revision !== "number") return;
  DataBase.setDataBase(v41RecruitStateKey(room, kind), JSON.stringify({
    aggregateId: body.aggregateId, revision: body.revision, status: body.status
  }));
}

function v41HandleRecruitJson(text, room, sender, replier) {
  var input = v41JsonAfter(text, "/V2모집");
  var type = String(input.type || "");
  var kind = v41RecruitKind(type);
  var create = type.indexOf("CREATE_") === 0;
  var saved = create ? null : v41ReadRecruitState(room, kind);
  var aggregateId = typeof input.aggregateId === "string" ? input.aggregateId : (saved ? saved.aggregateId : "");
  var expectedRevision = typeof input.expectedRevision === "number" ? input.expectedRevision : (create ? 0 : (saved ? saved.revision : -1));
  if (create && !aggregateId) aggregateId = KLOL_V2_KAKAO.newUuid();
  if (!aggregateId || expectedRevision < 0) throw new Error("모집 ID 또는 최신 revision을 확인해 주세요.");
  var payload = { type: type, aggregateId: aggregateId, payload: input.payload };
  var result = KLOL_V2_KAKAO.recruit(payload, KLOL_V2_KAKAO.contextFromChat(room, sender, {
    expectedRevision: expectedRevision
  }));
  v41SaveRecruitState(room, kind, result);
  v41Reply(replier, v41ResultMessage(result));
}

function v41ImageSaveKey(room, sender) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
  return "KLOL_V41_IMAGE_SESSION_" + identity.roomId.substring(5) + "_" + identity.senderId.substring(7);
}

function v41SaveImageSession(room, sender, sessionId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    throw new Error("사진 세션 ID를 확인해 주세요.");
  }
  DataBase.setDataBase(v41ImageSaveKey(room, sender), sessionId + "|" + String(new Date().getTime()));
}

function v41ReadImageSession(room, sender) {
  var saved = String(DataBase.getDataBase(v41ImageSaveKey(room, sender)) || "").split("|");
  var savedAt = Number(saved[1] || 0);
  if (!savedAt || new Date().getTime() - savedAt > 30 * 60 * 1000) return "";
  return v41Trim(saved[0]);
}

function v41ReceivedImage(imageDB) {
  var value = "";
  try { if (imageDB && imageDB.getImageBase64) value = String(imageDB.getImageBase64() || ""); } catch (ignored) {}
  try { if (!value && imageDB && imageDB.getImage) value = String(imageDB.getImage() || ""); } catch (ignored2) {}
  return value;
}

function v41HandleImage(room, sender, rawImage, replier) {
  var sessionId = v41ReadImageSession(room, sender);
  if (!sessionId) return false;
  var contentType = "image/jpeg";
  var match = String(rawImage).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
  var base64Image = match ? match[2] : String(rawImage);
  if (match) contentType = match[1].toLowerCase();
  base64Image = base64Image.replace(/\s+/g, "");
  var result = KLOL_V2_KAKAO.imageReceive({
    sessionId: sessionId,
    base64Image: base64Image,
    declaredContentType: contentType,
    declaredSha256Hex: KLOL_V2_KAKAO.sha256Base64BytesHex(base64Image),
    originalFileName: null
  }, KLOL_V2_KAKAO.contextFromChat(room, sender, { timeoutMs: 90000 }));
  v41Reply(replier, v41ResultMessage(result));
  return true;
}

function v41Help() {
  return [
    "[K-LOL.GG V41 도움말]",
    "전적 닉네임#태그 · 구인현황 · 내전현황",
    "내전 신청 양식 전체 전송(SYNC)",
    "신청일: YYYY-MM-DD · 회차: #1",
    "1. 플레이어: 닉네임 | Riot ID: 닉네임#태그 | 주라인: MID | 부라인: SUP, ADC | 상태: 신청",
    "/V2연동확인 · /V2사진세션 <사이트 발급 UUID>",
    "운영자 구조화 명령: /V2모집, /V2시즌, /V2양식 뒤에 JSON 객체",
    "구형 free-text 파티/스크림 등록은 안전을 위해 사이트에서 진행: " + KLOL_V41_SITE_URL + "/recruit"
  ].join("\n");
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
  var text = v41Trim(String(msg || "").replace(/\r\n?/g, "\n"));
  var rawImage = v41ReceivedImage(imageDB);
  try {
    if (rawImage && v41HandleImage(room, sender, rawImage, replier)) return;
    if (text === "/봇버전" || text === "봇버전") return v41Reply(replier, "[K-LOL.GG 카카오봇]\n" + KLOL_V41_BOT_CODE_VERSION);
    if (text === "/도움말" || text === "도움말" || text === "/명령어" || text === "명령어") return v41Reply(replier, v41Help());
    if (text === "/V2연동확인") {
      var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
      return v41Reply(replier, "[K-LOL.GG V2 연동 ID]\n방: " + identity.roomId + "\n발신자: " + identity.senderId);
    }
    if (/^\/?전적\s+/.test(text)) {
      return v41Reply(replier, v41FormatSearch(KLOL_V2_KAKAO.searchPlayer(text.replace(/^\/?전적\s+/, ""), KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?(?:구인현황|스크림현황)$/.test(text)) {
      return v41Reply(replier, v41FormatOpenchat(KLOL_V2_KAKAO.openchatStatus(KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?내전현황(?:\s*#?\d{1,3})?$/.test(text)) {
      return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications({
        action: "STATUS", seasonId: v41SeasonId(), applyDate: v41Today(), recruitNo: v41RecruitNumber(text)
      }, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/K-LOL\.GG\s*내전\s*참가\s*신청|내전\s*(?:참가\s*)?신청|협곡\s*내전|참가\s*신청\s*양식/.test(text) && /^\s*\d{1,2}\s*[.)]/m.test(text)) {
      return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications({
        action: "SYNC", seasonId: v41SeasonId(), applyDate: v41DateFromSnapshot(text),
        recruitNo: v41RecruitNumber(text), participants: v41SeasonParticipants(text)
      }, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (text.indexOf("/V2모집 ") === 0) return v41HandleRecruitJson(text, room, sender, replier);
    if (text.indexOf("/V2시즌 ") === 0) {
      return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications(v41JsonAfter(text, "/V2시즌"), KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (text.indexOf("/V2양식 ") === 0) {
      var form = v41JsonAfter(text, "/V2양식");
      return v41Reply(replier, v41ResultMessage(KLOL_V2_KAKAO.operationForm(form.formType, form.payload, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (text.indexOf("/V2사진세션 ") === 0) {
      v41SaveImageSession(room, sender, v41Trim(text.substring("/V2사진세션".length)));
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n30분 동안 이 대화의 다음 사진을 안전하게 접수합니다.");
    }
    if (/^\/?(?:5인파티|구인생성|구인마감|스크림구인|스크림모집)/.test(text)) {
      return v41Reply(replier, "[K-LOL.GG 안전 전환 안내]\n구형 문장형 등록은 종료되었습니다. 사이트 또는 /V2모집 구조화 명령을 이용해 주세요.\n" + KLOL_V41_SITE_URL + "/recruit");
    }
  } catch (error) {
    v41Reply(replier, "[K-LOL.GG 요청 실패]\n설정 또는 입력 형식을 확인해 주세요.");
  }
}

response.__kakaoBotEntryPoint = true;
