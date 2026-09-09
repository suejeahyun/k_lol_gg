/* eslint-disable */
/*
 * K-LOL.GG MessengerBot R V41 command router.
 * Build the paste-ready single file with scripts/build-messengerbot-v41.mjs.
 * This router requires KLOL_KAKAO_BOT_V41_V2_TRANSPORT.js and
 * KLOL_KAKAO_BOT_V41_V1_COMPAT.js immediately before it.
 */
var KLOL_V41_BOT_CODE_VERSION = "KLOL_KAKAO_BOT_V41_V3_2026_09_09_R14_2_INSTALLATION_SCOPE";
var KLOL_V41_CURRENT_DELIVERY_ID = "";
var KLOL_V41_CURRENT_USER_HASH = "";
var KLOL_V41_DELIVERY_TTL_MS = 30000;

function v41ClaimMessageDelivery(deliveryId) {
  var key = "KLOL_V41_DELIVERY_" + String(deliveryId || "").replace(/^delivery-/, "");
  var now = new Date().getTime();
  var previous = 0;
  try { previous = Number(DataBase.getDataBase(key) || 0); } catch (readError) { return true; }
  if (previous > 0 && now - previous >= 0 && now - previous <= KLOL_V41_DELIVERY_TTL_MS) return false;
  try { DataBase.setDataBase(key, String(now)); } catch (writeError) { return true; }
  return true;
}

function v41FallbackMessageDeliveryId(room, sender, msg, logId, channelId, userHash) {
  var installationScope = "installation-unavailable";
  try { installationScope = KLOL_V2_KAKAO.installationScopeId(); } catch (scopeError) {}
  var material = ["KLOL_V41_MESSAGE_DELIVERY_FALLBACK_V2", installationScope, userHash || sender, logId || "", msg || ""].join("\n");
  var seeds = [2166136261, 3339675911, 2246822507, 3266489909];
  var output = "";
  var seedIndex = 0;
  for (seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
    var hash = seeds[seedIndex] >>> 0;
    var index = 0;
    for (index = 0; index < material.length; index += 1) {
      hash ^= material.charCodeAt(index);
      hash = Math.imul ? Math.imul(hash, 16777619 + seedIndex * 2) >>> 0 : (hash * (16777619 + seedIndex * 2)) >>> 0;
    }
    output += ("00000000" + hash.toString(16)).slice(-8);
  }
  return "delivery-" + output;
}

function v41MessageDeliveryId(room, sender, msg, logId, channelId, userHash) {
  var deliveryId = "";
  try {
    if (typeof KLOL_V2_KAKAO.messageDeliveryId === "function") deliveryId = KLOL_V2_KAKAO.messageDeliveryId(room, sender, msg, logId, channelId, userHash);
  } catch (deliveryError) {}
  return /^delivery-[a-f0-9]{32}$/.test(String(deliveryId || "")) ? deliveryId : v41FallbackMessageDeliveryId(room, sender, msg, logId, channelId, userHash);
}

function v41AggregateId(domain) {
  return typeof KLOL_V2_KAKAO.deterministicMessageUuid === "function"
    ? KLOL_V2_KAKAO.deterministicMessageUuid(domain)
    : KLOL_V2_KAKAO.newUuid();
}
var KLOL_V41_SEASON_PREVIEW_TTL_MS = 10 * 60 * 1000;
var KLOL_V41_IMAGE_SESSION_TTL_MS = 30 * 60 * 1000;

function v41Trim(value) {
  return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
}

function v41IsArray(value) {
  return Object.prototype.toString.call(value) === "[object Array]";
}

function v41NormalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u3000]/g, " ")
    .replace(/／/g, "/")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/＃/g, "#")
    .replace(/．/g, ".")
    .replace(/[–—]/g, "-")
    .replace(/０/g, "0").replace(/１/g, "1").replace(/２/g, "2")
    .replace(/３/g, "3").replace(/４/g, "4").replace(/５/g, "5")
    .replace(/６/g, "6").replace(/７/g, "7").replace(/８/g, "8").replace(/９/g, "9");
}

function v41IsBotEchoSender(sender) {
  var value = v41Trim(sender);
  return value.indexOf("오픈채팅봇") >= 0 || value.indexOf("K-LOL") >= 0 ||
    value.indexOf("구인구직 도우미") >= 0 || value.indexOf("구인도우미") >= 0;
}

function v41IsServerEchoMessage(text) {
  var value = v41Trim(v41NormalizeText(text));
  return value.indexOf("[K-LOL.GG") === 0 || value.indexOf("[스크림구인") === 0 ||
    value.indexOf("[구인구직") === 0 || value.indexOf("[내전현황") === 0 ||
    value.indexOf("[참가 신청") === 0 || value.indexOf("[운영 양식") === 0 ||
    value.indexOf("{\"ok\":") === 0;
}

function v41IsBotEcho(sender, text) {
  return v41IsBotEchoSender(sender) && v41IsServerEchoMessage(text);
}

function v41PrivateSetting(key) {
  try {
    return v41Trim(String(DataBase.getDataBase(key) || ""));
  } catch (ignored) {
    return "";
  }
}

function v41SitePath(path) {
  try {
    return KLOL_V2_KAKAO.publicBaseUrl() + String(path || "");
  } catch (ignored) {
    return "KLOL_V2_BASE_URL 설정 후 열기: " + String(path || "/");
  }
}

function v41Reply(replier, text) {
  if (replier && replier.reply) replier.reply(String(text));
  return true;
}

function v41UserError(message) {
  var error = new Error(String(message));
  error.v41UserSafe = true;
  return error;
}

function v41ResultMessage(result) {
  var body = result && result.body;
  var detail = body && typeof body.detail === "string" ? String(body.detail) : "";
  if ((!result || !result.ok) && detail.indexOf("[K-LOL.GG 요청 실패]") === 0) return detail;
  if (body && typeof body.legacyReply === "string" && v41Trim(body.legacyReply)) return String(body.legacyReply);
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
  var items = body && v41IsArray(body.items) ? body.items : [];
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

function v41PositionLabel(position) {
  return { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" }[String(position || "")] || String(position || "미정");
}

function v41Percent(value) {
  var number = Number(value || 0);
  if (!isFinite(number)) number = 0;
  return String(Math.round(number * 10) / 10).replace(/\.0$/, "") + "%";
}

function v41FormatRecentMatch(match) {
  return String(match.playedOn || "날짜 미정") + " · " + String(match.title || "내전") + " #" + Number(match.gameNumber || 1) +
    " · " + String(match.championName || "챔피언 미정") + " " + v41PositionLabel(match.position) +
    " · " + (match.won === true ? "승" : "패") + (match.mvp === true ? " · MVP" : "");
}

function v41FormatPlayerRecord(result) {
  if (!result || !result.ok) return v41ResultMessage(result);
  var body = result.body && typeof result.body === "object" ? result.body : {};
  if (typeof body.legacyReply === "string" && v41Trim(body.legacyReply)) return String(body.legacyReply);
  if (typeof body.reply === "string" && v41Trim(body.reply)) return String(body.reply);
  var recent = v41IsArray(body.recentMatches) ? body.recentMatches : [];
  var mode = body.mode === "RECENT" ? "RECENT" : "RECORD";
  var riotId = body.player ? String(body.player.riotId || body.player.displayName || "플레이어") : "플레이어";
  var lines = [mode === "RECENT" ? "[" + riotId + " 최근 경기]" : "[" + riotId + " 전적]", ""];
  var index = 0;
  if (!body.player) return lines[0] + "\n\n일치하는 플레이어를 찾지 못했습니다.";
  if (mode === "RECORD") {
    if (body.season) lines.push("시즌: " + body.season.name);
    if (body.currentTier || body.peakTier) lines.push("티어: " + String(body.currentTier || "-") + " / " + String(body.peakTier || "-"));
    if (body.summary) {
      lines.push("참여: " + Number(body.summary.participationCount || 0) + "회 / " + Number(body.summary.totalGames || 0) + "세트");
      lines.push("전적: " + Number(body.summary.wins || 0) + "승 " + Number(body.summary.losses || 0) + "패 (" + v41Percent(body.summary.winRate) + ")");
      lines.push("KDA: " + Number(body.summary.kda || 0).toFixed(2) + " (" + Number(body.summary.kills || 0) + "/" + Number(body.summary.deaths || 0) + "/" + Number(body.summary.assists || 0) + ")");
      lines.push("MVP: " + Number(body.summary.mvpCount || 0) + "회");
    } else {
      lines.push("집계된 시즌 전적이 없습니다.");
    }
    if (recent.length) {
      lines.push("");
      lines.push("최근: " + (recent[0].won === true ? "승" : "패") + " " + String(recent[0].championName || "챔피언 미정") + " " + Number(recent[0].kills || 0) + "/" + Number(recent[0].deaths || 0) + "/" + Number(recent[0].assists || 0));
    }
  } else {
    for (index = 0; index < recent.length && index < 10; index += 1) {
      lines.push((index + 1) + ". " + (recent[index].won === true ? "승" : "패") + " | " + String(recent[index].championName || "챔피언 미정") + " | " + Number(recent[index].kills || 0) + "/" + Number(recent[index].deaths || 0) + "/" + Number(recent[index].assists || 0));
    }
    if (!recent.length) lines.push("표시할 최근 경기가 없습니다.");
  }
  lines.push("", v41SitePath("/players/" + body.player.playerId));
  return lines.join("\n");
}

function v41FormatRanking(result) {
  if (!result || !result.ok) return v41ResultMessage(result);
  var body = result.body && typeof result.body === "object" ? result.body : {};
  if (typeof body.legacyReply === "string" && v41Trim(body.legacyReply)) return String(body.legacyReply);
  if (typeof body.reply === "string" && v41Trim(body.reply)) return String(body.reply);
  var rows = v41IsArray(body.rows) ? body.rows : [];
  var lines = ["🏆 K-LOL.GG 랭킹 TOP 5", "기준: 내전 참여 " + Number(body.minimumParticipation || 0) + "회 이상", ""];
  var index = 0;
  for (index = 0; index < rows.length && index < 5; index += 1) {
    var row = rows[index];
    lines.push(Number(row.rank || index + 1) + ". " + String(row.riotId || row.displayName) +
      " | 승률 " + v41Percent(row.winRate) + " | 참여 " + Number(row.participationCount || 0) +
      "회 | " + Number(row.totalGames || 0) + "세트 | KDA " + Number(row.kda || 0).toFixed(2));
  }
  if (!rows.length) lines.push("표시할 랭킹 기록이 없습니다.");
  return lines.join("\n");
}

function v41FormatScheduledNotice(result) {
  if (!result || !result.ok) return v41ResultMessage(result);
  var body = result.body && typeof result.body === "object" ? result.body : {};
  var counts = body.positionCounts && typeof body.positionCounts === "object" ? body.positionCounts : {};
  var shortages = v41IsArray(body.shortagePositions) ? body.shortagePositions : [];
  var shortageLabels = [];
  var index = 0;
  for (index = 0; index < shortages.length; index += 1) shortageLabels.push(v41PositionLabel(shortages[index]));
  return [
    "[K-LOL.GG 내전 공지 미리보기]",
    "읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.",
    "날짜: " + String(body.date || "오늘") + (body.slot ? " · 시간: " + String(body.slot) + "시" : ""),
    body.seasonId ? "활성 시즌 신청 현황" : "활성 시즌이 없습니다.",
    "신청 " + Number(body.total || 0) + "/" + Number(body.targetCount || 10) + " · 남은 인원 " + Number(body.remaining || 0) + "명",
    "포지션: 탑 " + Number(counts.TOP || 0) + " · 정글 " + Number(counts.JGL || 0) + " · 미드 " + Number(counts.MID || 0) + " · 원딜 " + Number(counts.ADC || 0) + " · 서포터 " + Number(counts.SUP || 0),
    "부족 포지션: " + (shortageLabels.length ? shortageLabels.join(", ") : "없음")
  ].join("\n");
}

function v41PartyTypeLabel(party) {
  var type = String(party && party.type || "");
  if (type === "FLEX_RANK") return "자랭";
  if (type === "NORMAL_GAME") return "일반";
  if (type === "SOLO_RANK") return "솔랭";
  if (type === "ARAM") return String(party.title || "").indexOf("증바람") >= 0 ? "증바람" : "칼바람";
  if (type === "TFT_NORMAL") return "롤체 일반";
  if (type === "TFT_RANK") return "롤체 랭크";
  if (type === "DOUBLE_UP") return "더블업";
  if (type === "PARTY_RIFT") return "5인 협곡";
  if (type === "OTHER_GAME") return "기타게임";
  return Number(party && party.maximumMembers || 0) + "인 파티";
}

function v41PartyStartText(party) {
  var direct = v41Trim(party && party.startTimeText);
  var scheduled = party && party.scheduledStartAt;
  var match = null;
  if (direct) return direct;
  if (!scheduled) return "미정";
  match = String(scheduled).match(/T(\d{2}):(\d{2})/);
  return match ? match[1] + ":" + match[2] : "미정";
}

function v41PartyMemberNames(party) {
  var members = party && v41IsArray(party.members) ? party.members : [];
  var names = [];
  var index = 0;
  for (index = 0; index < members.length; index += 1) {
    if (!members[index].substitute && members[index].name) names.push(String(members[index].name));
  }
  return names;
}

function v41PartySummaryLine(party) {
  var gameInfo = v41Trim(party && (party.gameInfo || party.note)) || "미입력";
  return "#" + Number(party.recruitNumber) + " · " + v41PartyTypeLabel(party) + " · " +
    Number(party.memberCount || 0) + "/" + Number(party.maximumMembers || 0) + " · " +
    v41PartyStartText(party) + " · " + gameInfo;
}

function v41FormatPartyStatus(result) {
  var body = result && result.body;
  var parties = body && v41IsArray(body.parties) ? body.parties : [];
  var lines = ["[K-LOL.GG 구인구직 현황]"];
  var names = [];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  if (!parties.length) return lines.concat(["", "현재 진행 중인 구인글이 없습니다."]).join("\n");
  lines.push("🔎 전체 명단: 상세 번호", "", "[구인중]");
  for (index = 0; index < parties.length; index += 1) {
    lines.push(v41PartySummaryLine(parties[index]));
    names = v41PartyMemberNames(parties[index]);
    if (names.length) lines.push("참여: " + names.join(", "));
    lines.push("└ 상세 " + Number(parties[index].recruitNumber));
    if (index + 1 < parties.length) lines.push("");
  }
  return lines.join("\n");
}

function v41FormatOpenchat(result) {
  var body = result && result.body;
  var parties = body && v41IsArray(body.parties) ? body.parties : [];
  var scrims = body && v41IsArray(body.scrims) ? body.scrims : [];
  var lines = ["[K-LOL.GG 구인 현황]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  for (index = 0; index < parties.length; index += 1) {
    lines.push("파티 #" + parties[index].recruitNumber + " · " + parties[index].title + " · " +
      parties[index].memberCount + "/" + parties[index].maximumMembers +
      (Number(parties[index].reserveCount || 0) ? " · 예비 " + Number(parties[index].reserveCount) : ""));
  }
  for (index = 0; index < scrims.length; index += 1) {
    lines.push("스크림 #" + scrims[index].scrimNumber + " · " + scrims[index].status + " · BO" + scrims[index].bestOf);
  }
  if (lines.length === 1) lines.push("현재 진행 중인 모집이 없습니다.");
  return lines.join("\n");
}

function v41PartyTemplate(parsed, recruitNo, party) {
  var title = String(parsed.title || (Number(parsed.maximumMembers) + "인 파티 구인"));
  var startTimeText = v41Trim(party && party.startTimeText) || v41Trim(parsed.startTimeText);
  var gameInfo = v41Trim(party && party.gameInfo) || v41Trim(parsed.gameInfo);
  var lines = ["[K-LOL.GG 구인구직 양식]", "같이 할사람~", "", "아래 양식의 모집번호는 유지해서 작성해주세요.", "", "📢 " + title, "모집번호: #" + Number(recruitNo), "", "》시작시간 :" + (startTimeText ? " " + startTimeText : ""), "》게임정보 :" + (gameInfo ? " " + gameInfo : ""), ""];
  var positions = ["TOP.", "JUG.", "MID.", "ADC.", "SUP."];
  var lineParty = parsed.type === "FLEX_RANK" || parsed.type === "NORMAL_GAME" || parsed.type === "PARTY_RIFT";
  var index = 0;
  if (lineParty) {
    for (index = 0; index < positions.length; index += 1) lines.push(positions[index]);
    lines.push("예비 1.", "", "마지막 참가자가 전체 태그 해주세요.", "*상호배려와 존중 부탁드립니다.");
  } else {
    for (index = 1; index <= Number(parsed.maximumMembers); index += 1) lines.push(index + ".");
    lines.push("예비 1.", "", "참여해주실 분은 태그해주세요.", "*상호배려와 존중 부탁드립니다.");
  }
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
  var entries = body && v41IsArray(body.entries) ? body.entries : [];
  var lines = ["[K-LOL.GG 내전 참가 신청]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  if (body && typeof body.legacyReply === "string" && v41Trim(body.legacyReply)) return String(body.legacyReply);
  lines.push("신청일: " + body.applyDate);
  lines.push("회차: #" + body.recruitNo);
  lines.push("종목: 협곡");
  if (typeof body.createdCount === "number" && typeof body.updatedCount === "number") {
    lines.push("신청 " + Number(body.createdCount || 0) + " · 수정 " + Number(body.updatedCount || 0) + " · 취소 " + Number(body.cancelledCount || 0) + " · 확인 필요 " + Number(body.pendingCount || 0));
  } else {
    lines.push("신청 " + Number(body.appliedCount || 0) + " · 예비 " + Number(body.reserveCount || 0) + " · 확정 " + Number(body.confirmedCount || 0) + " · 확인 필요 " + Number(body.pendingCount || 0));
  }
  for (index = 0; index < entries.length; index += 1) {
    var entry = entries[index];
    var name = entry.player ? entry.player.displayName : entry.suppliedName;
    var riotId = entry.player ? entry.player.riotId : entry.suppliedRiotId;
    var subs = v41IsArray(entry.subPositions) && entry.subPositions.length ? entry.subPositions.join(", ") : "없음";
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

function v41SeasonParticipants(text, allowEmpty) {
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
    var positions = v41Trim(fields.slice(3).join("/")).split(/[\/,，]/);
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
  if (!participants.length && allowEmpty !== true) throw new Error("내전 신청자 줄을 찾지 못했습니다.");
  return participants;
}

function v41DateFromSnapshot(text) {
  var match = String(text || "").match(/(20\d{2}-\d{2}-\d{2})/);
  return match ? match[1] : v41Today();
}

function v41SnapshotHeader(text) {
  var lines = v41NormalizeText(text).split("\n");
  var header = [];
  var index = 0;
  for (index = 0; index < lines.length; index += 1) {
    if (/^\s*\d{1,2}\s*[.)]/.test(lines[index])) break;
    header.push(lines[index]);
  }
  return header.join("\n");
}

function v41RequiredSnapshotDate(text) {
  var header = v41SnapshotHeader(text);
  var match = header.match(/(?:신청일|날짜|일자)\s*[:：]\s*(20\d{2}-\d{2}-\d{2})/);
  if (!match) match = header.match(/》\s*(20\d{2}-\d{2}-\d{2})(?:\s|$)/);
  if (!match) throw v41UserError("내전 전체 양식에 신청일: YYYY-MM-DD를 적어 주세요.");
  var parsed = new Date(match[1] + "T00:00:00Z");
  if (isNaN(parsed.getTime()) || parsed.toISOString().substring(0, 10) !== match[1]) {
    throw v41UserError("내전 전체 양식의 신청일을 확인해 주세요.");
  }
  return match[1];
}

function v41RequiredSnapshotMode(text) {
  var header = v41SnapshotHeader(text);
  var match = header.match(/(?:종목|모드)\s*[:：]\s*(협곡)/);
  if (!match) match = header.match(/》\s*(협곡)\s*(?:\n|$)/);
  if (!match) throw v41UserError("내전 전체 양식에 종목: 협곡을 적어 주세요.");
  return "RIFT";
}

function v41RequiredSnapshotCapacity(text) {
  var header = v41SnapshotHeader(text);
  var match = header.match(/👥\s*\d{1,3}\s*\/\s*(\d{1,3})\s*명/);
  if (!match) match = header.match(/정원\s*[:：]\s*(\d{1,3})\s*명?/);
  var capacity = match ? Number(match[1]) : 0;
  if (!capacity || capacity < 1 || capacity > 99) {
    throw v41UserError("내전 전체 양식의 정원과 전체 번호를 확인해 주세요.");
  }
  return capacity;
}

function v41RequireCompleteSnapshotSlots(text, capacity) {
  var lines = v41NormalizeText(text).split("\n");
  var slots = {};
  var index = 0;
  for (index = 0; index < lines.length; index += 1) {
    var match = v41Trim(lines[index]).match(/^(\d{1,2})\s*[.)]\s*(.*)$/);
    if (!match || /^(?:EX|예시)/i.test(match[2])) continue;
    if (slots[match[1]]) throw v41UserError("내전 전체 양식에 중복된 번호가 있습니다.");
    slots[match[1]] = true;
  }
  for (index = 1; index <= capacity; index += 1) {
    if (!slots[String(index)]) throw v41UserError("내전 전체 양식은 1번부터 정원까지 모든 줄을 유지해 주세요.");
  }
  if (Object.keys(slots).length !== capacity) {
    throw v41UserError("내전 전체 양식의 번호 범위를 확인해 주세요.");
  }
}

function v41AuthoritativeSeasonSnapshot(text) {
  var value = v41Trim(v41NormalizeText(text));
  if (!/^(?:📢\s*내전하실분\s*#\s*\d{1,3}|\[K-LOL\.GG\s*내전\s*참가\s*신청\])/.test(value)) {
    throw v41UserError("봇이 출력한 전체 참가 신청 양식을 사용해 주세요.");
  }
  if (!/참가\s*신청\s*양식/.test(value)) throw v41UserError("봇이 출력한 전체 참가 신청 양식을 사용해 주세요.");
  var snapshot = {
    applyDate: v41RequiredSnapshotDate(value),
    recruitNo: v41RequiredSnapshotRecruitNo(value),
    mode: v41RequiredSnapshotMode(value),
    capacity: v41RequiredSnapshotCapacity(value)
  };
  v41RequireCompleteSnapshotSlots(value, snapshot.capacity);
  return snapshot;
}

function v41RequiredSnapshotRecruitNo(text) {
  var header = v41SnapshotHeader(text);
  var match = header.match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
  if (!match) match = header.match(/내전\s*(?:번호|NO)\s*[:：]?\s*#?\s*(\d{1,3})/i);
  if (!match) match = header.match(/(?:협곡\s*)?내전[^\n#]*#\s*(\d{1,3})/);
  var value = match ? Number(match[1]) : 0;
  if (!value || value < 1 || value > 999) {
    throw v41UserError("내전 전체 양식에 회차: #번호를 적어 주세요.");
  }
  return value;
}

function v41SnapshotSummaryHash(value) {
  var text = JSON.stringify(value);
  var hash = 2166136261;
  var index = 0;
  for (index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul ? Math.imul(hash, 16777619) : ((hash * 16777619) | 0);
  }
  return ("00000000" + (hash >>> 0).toString(16)).slice(-8).toUpperCase();
}

function v41SeasonPreviewKey(room, sender) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
  return "KLOL_V41_SEASON_PREVIEW_" + identity.roomId.substring(5) + "_" + identity.senderId.substring(7);
}

function v41ClearSeasonPreview(room, sender) {
  try { DataBase.setDataBase(v41SeasonPreviewKey(room, sender), ""); } catch (ignored) {}
}

function v41SaveSeasonPreview(room, sender, preview) {
  DataBase.setDataBase(v41SeasonPreviewKey(room, sender), JSON.stringify(preview));
}

function v41ReadSeasonPreview(room, sender) {
  var saved = null;
  try { saved = JSON.parse(String(DataBase.getDataBase(v41SeasonPreviewKey(room, sender)) || "null")); } catch (ignored) {}
  if (!saved || typeof saved !== "object" || typeof saved.code !== "string" ||
      typeof saved.createdAt !== "number" || typeof saved.applyDate !== "string" ||
      typeof saved.recruitNo !== "number" || saved.mode !== "RIFT" || !v41IsArray(saved.participants)) {
    v41ClearSeasonPreview(room, sender);
    return null;
  }
  if (new Date().getTime() - saved.createdAt > KLOL_V41_SEASON_PREVIEW_TTL_MS) {
    v41ClearSeasonPreview(room, sender);
    return null;
  }
  return saved;
}

function v41CreateSeasonPreview(room, sender, text) {
  var authoritative = v41AuthoritativeSeasonSnapshot(text);
  var applyDate = authoritative.applyDate;
  var recruitNo = authoritative.recruitNo;
  var participants = v41SeasonParticipants(text, true);
  var slots = {};
  var index = 0;
  if (participants.length > 99) {
    throw v41UserError("내전 전체 양식은 회차당 최대 99명까지 확인할 수 있습니다.");
  }
  for (index = 0; index < participants.length; index += 1) {
    if (slots[String(participants[index].slotNo)]) throw v41UserError("내전 전체 양식에 중복된 번호가 있습니다.");
    slots[String(participants[index].slotNo)] = true;
  }
  var summary = { applyDate: applyDate, recruitNo: recruitNo, mode: authoritative.mode, participants: participants };
  var hash = v41SnapshotSummaryHash(summary);
  var code = String(KLOL_V2_KAKAO.newUuid()).replace(/-/g, "").substring(0, 6).toUpperCase();
  var preview = {
    code: code,
    createdAt: new Date().getTime(),
    applyDate: applyDate,
    recruitNo: recruitNo,
    mode: authoritative.mode,
    participants: participants,
    count: participants.length,
    hash: hash
  };
  v41SaveSeasonPreview(room, sender, preview);
  return [
    "[K-LOL.GG 내전 신청 미리보기]",
    "아직 사이트에 반영하지 않았습니다.",
    "신청일: " + applyDate + " · 회차: #" + recruitNo,
    "인원: " + participants.length + "명 · 요약 해시: " + hash,
    "10분 안에 /내전확인 " + code + " 를 보내면 한 번만 반영합니다.",
    "취소: /내전미리보기취소",
    "주의: 확인하면 이 전체 양식에서 빠진 기존 카카오 신청은 취소될 수 있습니다."
  ].join("\n");
}

function v41ConfirmSeasonPreview(room, sender, code, replier) {
  var preview = v41ReadSeasonPreview(room, sender);
  if (!preview) {
    return v41Reply(replier, "[K-LOL.GG 내전 신청]\n확인할 미리보기가 없거나 10분이 지났습니다. 전체 양식을 다시 보내 주세요.");
  }
  if (preview.code !== String(code || "").toUpperCase()) {
    return v41Reply(replier, "[K-LOL.GG 내전 신청]\n확인 코드가 일치하지 않습니다. 미리보기의 코드를 확인해 주세요.");
  }
  v41ClearSeasonPreview(room, sender);
  var result = KLOL_V2_KAKAO.seasonApplications({
    action: "SYNC", seasonId: v41SeasonId(), applyDate: preview.applyDate,
    recruitNo: preview.recruitNo, mode: preview.mode, participants: preview.participants
  }, KLOL_V2_KAKAO.contextFromChat(room, sender));
  return v41Reply(replier, v41FormatSeason(result));
}

function v41IsV1SeasonSnapshot(text) {
  var value = v41Trim(v41NormalizeText(text));
  return /^📢\s*내전하실분\s*#\s*\d{1,3}/.test(value) &&
    /참가\s*신청\s*양식/.test(value) &&
    /이름\s*\/\s*현티어\s*\/\s*최고티어/.test(value) &&
    /^\s*\d{1,2}\s*[.)]/m.test(value);
}

function v41V1SeasonSyncKey(room, sender, text) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
  return "KLOL_V41_V1_SEASON_SYNC_" + identity.roomId.substring(5) + "_" +
    identity.senderId.substring(7) + "_" + v41SnapshotSummaryHash(v41NormalizeText(text));
}

function v41HandleV1SeasonSnapshot(text, room, sender, replier) {
  var key = v41V1SeasonSyncKey(room, sender, text);
  if (String(DataBase.getDataBase(key) || "") === "done") return true;
  var authoritative = v41AuthoritativeSeasonSnapshot(text);
  var applyDate = authoritative.applyDate;
  var recruitNo = authoritative.recruitNo;
  var participants = v41SeasonParticipants(text, true);
  var result = KLOL_V2_KAKAO.seasonApplications({
    action: "SYNC", seasonId: v41SeasonId(), applyDate: applyDate,
    recruitNo: recruitNo, mode: authoritative.mode, participants: participants
  }, KLOL_V2_KAKAO.contextFromChat(room, sender, {
    requestKey: "mbr-v41-v1-season-" + v41SnapshotSummaryHash(v41NormalizeText(text)).toLowerCase()
  }));
  if (result && result.ok) DataBase.setDataBase(key, "done");
  return v41Reply(replier, v41FormatSeason(result));
}

function v41JsonAfter(text, prefix) {
  var parsed = JSON.parse(v41Trim(String(text).substring(prefix.length)));
  if (!parsed || typeof parsed !== "object" || v41IsArray(parsed)) throw new Error("JSON 객체 형식을 확인해 주세요.");
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
  var input = v41JsonAfter(text, "V2모집");
  var type = String(input.type || "");
  var kind = v41RecruitKind(type);
  var create = type.indexOf("CREATE_") === 0;
  var saved = create ? null : v41ReadRecruitState(room, kind);
  var aggregateId = typeof input.aggregateId === "string" ? input.aggregateId : (saved ? saved.aggregateId : "");
  var expectedRevision = typeof input.expectedRevision === "number" ? input.expectedRevision : (create ? 0 : (saved ? saved.revision : -1));
  if (create && !aggregateId) aggregateId = v41AggregateId("raw-recruit");
  if (!aggregateId || expectedRevision < 0) throw new Error("모집 ID 또는 최신 revision을 확인해 주세요.");
  var payload = { type: type, aggregateId: aggregateId, payload: input.payload };
  var result = KLOL_V2_KAKAO.recruit(payload, KLOL_V2_KAKAO.contextFromChat(room, sender, {
    expectedRevision: expectedRevision, commandSource: "RAW_V2"
  }));
  v41SaveRecruitState(room, kind, result);
  v41Reply(replier, v41ResultMessage(result));
}

function v41CompatParser() {
  if (typeof KLOL_V41_V1_COMPAT === "undefined" || !KLOL_V41_V1_COMPAT || !KLOL_V41_V1_COMPAT.classifyMessage) {
    throw new Error("V1 호환 파서가 로드되지 않았습니다.");
  }
  return KLOL_V41_V1_COMPAT;
}

function v41LegacyIntentKey(room, sender, text) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
  return "KLOL_V41_INTENT_" + identity.roomId.substring(5) + "_" + identity.senderId.substring(7) + "_" +
    v41SnapshotSummaryHash(v41NormalizeText(text));
}

function v41ReadLegacyIntent(room, sender, text) {
  var key = v41LegacyIntentKey(room, sender, text);
  var now = new Date().getTime();
  var saved = null;
  try { saved = JSON.parse(String(DataBase.getDataBase(key) || "null")); } catch (ignored) {}
  if (saved && typeof saved === "object" && typeof saved.createdAt === "number" &&
      now - saved.createdAt >= 0 && now - saved.createdAt <= KLOL_V41_SEASON_PREVIEW_TTL_MS &&
      typeof saved.requestKey === "string") {
    return saved;
  }
  return null;
}

function v41LegacyIntent(room, sender, text, createValue) {
  var key = v41LegacyIntentKey(room, sender, text);
  var now = new Date().getTime();
  var saved = v41ReadLegacyIntent(room, sender, text);
  if (saved) return saved;
  saved = createValue();
  saved.createdAt = now;
  saved.requestKey = "mbr-v41-legacy-" + v41SnapshotSummaryHash({
    room: KLOL_V2_KAKAO.identityForChat(room, sender).roomId,
    sender: KLOL_V2_KAKAO.identityForChat(room, sender).senderId,
    text: text,
    createdAt: now
  }).toLowerCase();
  DataBase.setDataBase(key, JSON.stringify(saved));
  return saved;
}

function v41OpenChat(room, sender) {
  var result = KLOL_V2_KAKAO.openchatStatus(KLOL_V2_KAKAO.contextFromChat(room, sender));
  if (!result || !result.ok || !result.body || typeof result.body !== "object") {
    throw v41UserError(v41ResultMessage(result));
  }
  return result;
}

function v41FindParty(status, recruitNo) {
  var parties = status && status.body && v41IsArray(status.body.parties) ? status.body.parties : [];
  var today = v41Today();
  var index = 0;
  for (index = 0; index < parties.length; index += 1) {
    if (String(parties[index].recruitDate || today) === today &&
        Number(parties[index].recruitNumber) === Number(recruitNo)) return parties[index];
  }
  return null;
}

function v41FindScrim(status, scrimNo) {
  var scrims = status && status.body && v41IsArray(status.body.scrims) ? status.body.scrims : [];
  var today = v41Today();
  var index = 0;
  for (index = 0; index < scrims.length; index += 1) {
    if (String(scrims[index].recruitDate || today) === today &&
        Number(scrims[index].scrimNumber) === Number(scrimNo)) return scrims[index];
  }
  return null;
}

function v41PartyMembers(parsed) {
  var source = v41IsArray(parsed.members) ? parsed.members : [];
  var positions = { TOP: 1, JGL: 2, MID: 3, ADC: 4, SUP: 5 };
  var output = [];
  var index = 0;
  for (index = 0; index < source.length; index += 1) {
    if (!source[index].name || String(source[index].name).length > 80) {
      throw v41UserError("참가자 이름은 80자 이내로 적어 주세요.");
    }
    output.push({
      name: String(source[index].name),
      position: source[index].position || null,
      slotNo: Number(source[index].slotNo || positions[source[index].position] || index + 1),
      substitute: source[index].substitute === true
    });
  }
  return output;
}

function v41ScheduledInstant(dateKey, timeText) {
  var match = String(timeText || "").match(/(?:^|\s)((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s|$)/);
  if (!match) return null;
  var value = new Date(dateKey + "T" + String(match[1]).replace(/^(\d):/, "0$1:") + ":00+09:00");
  return isNaN(value.getTime()) ? null : value.toISOString();
}

function v41FormatPartyDetail(party) {
  var members = party && v41IsArray(party.members) ? party.members : [];
  var lines = ["[K-LOL.GG 파티 #" + Number(party.recruitNumber) + "]", String(party.title || "파티 구인")];
  var index = 0;
  lines.push("인원 " + Number(party.memberCount || 0) + "/" + Number(party.maximumMembers || 0) +
    (Number(party.reserveCount || 0) ? " · 예비 " + Number(party.reserveCount) : ""));
  lines.push("시작시간: " + v41PartyStartText(party) + " · 게임정보: " + (v41Trim(party.gameInfo || party.note) || "미입력"));
  for (index = 0; index < members.length; index += 1) {
    lines.push((members[index].substitute ? "예비 " : "") + Number(members[index].slotNo || index + 1) + ". " +
      String(members[index].name || "이름 미정") + (members[index].position ? " · " + v41PositionLabel(members[index].position) : ""));
  }
  if (!members.length) lines.push("아직 참가자가 없습니다.");
  return lines.join("\n");
}

function v41ScrimLineupLines(label, lineup) {
  var lines = [];
  var source = lineup && typeof lineup === "object" ? lineup : {};
  var positions = [["TOP", "top"], ["JUG", "jungle"], ["MID", "mid"], ["ADC", "adc"], ["SUP", "support"]];
  var index = 0;
  if (!lineup) return lines;
  lines.push(label);
  for (index = 0; index < positions.length; index += 1) {
    lines.push(positions[index][0] + ": " + String(source[positions[index][1]] || "미정"));
  }
  return lines;
}

function v41ScrimStatusLabel(status) {
  return {
    RECRUITING: "모집중", MATCHED: "매칭완료", CONFIRMED: "확정",
    COMPLETED: "완료", CANCELED: "취소", CANCELLED: "취소"
  }[String(status || "")] || String(status || "");
}

function v41ScrimTime(scrim) {
  var fallback = scrim && scrim.startTimeText ? String(scrim.startTimeText) : "미정";
  var value = scrim && scrim.scheduledAt ? new Date(scrim.scheduledAt) : null;
  if (!value || isNaN(value.getTime())) return fallback;
  var kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  var hour = String(kst.getUTCHours());
  var minute = String(kst.getUTCMinutes());
  if (hour.length < 2) hour = "0" + hour;
  if (minute.length < 2) minute = "0" + minute;
  return String(kst.getUTCMonth() + 1) + "/" + String(kst.getUTCDate()) + " " + hour + ":" + minute;
}

function v41ScrimRule(scrim) {
  return String(scrim.seriesRuleText || (scrim.bestOf ? Number(scrim.bestOf) + "판" : "판수 미정"));
}

function v41ScrimSummaryLine(scrim) {
  return "#" + Number(scrim.scrimNumber) + " " +
    String(scrim.requesterTeamName || "요청팀 미정") + " vs " +
    String(scrim.opponentTeamName || "상대구함") + " / " + v41ScrimTime(scrim) + " / " +
    v41ScrimRule(scrim) + " / " + v41ScrimStatusLabel(scrim.status);
}

function v41FormatScrimStatus(result) {
  var body = result && result.body;
  var scrims = body && v41IsArray(body.scrims) ? body.scrims : [];
  var lines = ["[K-LOL.GG 스크림 현황]"];
  var index = 0;
  if (!result || !result.ok) return v41ResultMessage(result);
  if (!scrims.length) return lines.concat(["", "현재 모집중/확정된 스크림이 없습니다."]).join("\n");
  lines.push("🔎 전체 양식: 스크림상세 번호", "");
  for (index = 0; index < scrims.length; index += 1) {
    lines.push(v41ScrimSummaryLine(scrims[index]));
    lines.push("└ 스크림상세 " + Number(scrims[index].scrimNumber));
  }
  return lines.join("\n");
}

function v41ScrimFormLines(scrim) {
  var requester = scrim.requesterLineup || {};
  var opponent = scrim.opponentLineup || {};
  return [
    "운영일: " + String(scrim.recruitDate || v41Today()),
    "번호: #" + Number(scrim.scrimNumber),
    "일시: " + v41ScrimTime(scrim),
    "방식: " + v41ScrimRule(scrim), "",
    "우리팀: " + String(scrim.requesterTeamName || ""),
    "TOP: " + String(requester.top || ""), "JUG: " + String(requester.jungle || ""),
    "MID: " + String(requester.mid || ""), "ADC: " + String(requester.adc || ""),
    "SUP: " + String(requester.support || ""), "",
    "상대팀: " + String(scrim.opponentTeamName || ""),
    "TOP: " + String(opponent.top || ""), "JUG: " + String(opponent.jungle || ""),
    "MID: " + String(opponent.mid || ""), "ADC: " + String(opponent.adc || ""),
    "SUP: " + String(opponent.support || "")
  ];
}

function v41FormatScrimDetail(scrim) {
  var lines = ["[K-LOL.GG 멸망전 스크림 상세]", "", v41ScrimSummaryLine(scrim), ""];
  lines = lines.concat(v41ScrimFormLines(scrim));
  lines.push("", "수정: 이 메시지를 복사해 내용을 고친 뒤 전체 전송");
  return lines.join("\n");
}

function v41RecruitMutation(room, sender, text, commandFactory) {
  var intent = v41LegacyIntent(room, sender, text, commandFactory);
  var result = KLOL_V2_KAKAO.recruit(intent.command, KLOL_V2_KAKAO.contextFromChat(room, sender, {
    expectedRevision: Number(intent.expectedRevision), requestKey: intent.requestKey
  }));
  v41SaveRecruitState(room, v41RecruitKind(intent.command.type), result);
  return result;
}

function v41HandleLegacyParty(parsed, text, room, sender, replier) {
  var status = null;
  var party = null;
  var result = null;
  if (parsed.action === "HELP") return v41Reply(replier, v41RecruitHelpNotice());
  if (parsed.action === "MISSING_NUMBER") {
    return v41Reply(replier, [
      "[K-LOL.GG 양식 확인 필요]",
      "모집번호를 찾지 못했습니다.",
      "봇이 출력한 원본 양식의 ‘모집번호: #번호’를 유지해서 다시 보내 주세요."
    ].join("\n"));
  }
  status = v41OpenChat(room, sender);
  if (parsed.action === "STATUS") return v41Reply(replier, v41FormatPartyStatus(status));
  if (parsed.action === "DETAIL") {
    party = v41FindParty(status, parsed.recruitNo);
    if (!party) throw v41UserError("진행 중인 파티 #" + parsed.recruitNo + "을 찾지 못했습니다.");
    return v41Reply(replier, v41FormatPartyDetail(party));
  }
  if (parsed.action === "CREATE") {
    var recruitNo = parsed.explicitRecruitNumber || Number(status.body.nextPartyRecruitNumber || 0);
    if (!recruitNo) throw v41UserError("오늘 모집 번호 99개를 모두 사용했습니다. 관리자에게 번호 초기화를 요청해 주세요.");
    if (v41FindParty(status, recruitNo) && !v41ReadLegacyIntent(room, sender, text)) {
      throw v41UserError("이미 진행 중인 파티 #" + recruitNo + "이 있습니다.");
    }
    result = v41RecruitMutation(room, sender, text, function () {
      return {
        expectedRevision: 0,
        command: {
          type: "CREATE_PARTY", aggregateId: v41AggregateId("party-create"),
          payload: {
            recruitDate: v41Today(), resetSequence: Number(status.body.nextPartyResetSequence || 0),
            recruitNumber: recruitNo, partyType: parsed.type, title: parsed.title,
            maximumMembers: Number(parsed.maximumMembers), members: [],
            startTimeText: null, gameInfo: null, scheduledStartAt: null, protectedUntil: null
          }
        }
      };
    });
    if (!result || !result.ok) return v41Reply(replier, v41ResultMessage(result));
    var createdNo = result.body && result.body.data ? Number(result.body.data.recruitNumber || recruitNo) : recruitNo;
    return v41Reply(replier, v41PartyTemplate(parsed, createdNo, result.body && result.body.data));
  }
  if (parsed.action === "SYNC_FORM") {
    party = v41FindParty(status, parsed.recruitNo);
    var members = v41PartyMembers(parsed);
    var primaryCount = 0;
    var memberIndex = 0;
    for (memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      if (!members[memberIndex].substitute) primaryCount += 1;
    }
    if (primaryCount > Number(party ? party.maximumMembers : parsed.maximumMembers)) {
      throw v41UserError("참가 인원이 모집 정원을 넘었습니다. 예비 인원은 정원과 별도로 최대 99명까지 보존됩니다.");
    }
    result = v41RecruitMutation(room, sender, text, function () {
      if (party) {
        return {
          expectedRevision: Number(party.revision),
          command: {
            type: "SYNC_PARTY", aggregateId: party.id,
            payload: {
              members: members, startTimeText: parsed.startTimeText, gameInfo: parsed.gameInfo,
              scheduledStartAt: v41ScheduledInstant(v41Today(), parsed.startTimeText)
            }
          }
        };
      }
      return {
        expectedRevision: 0,
        command: {
            type: "CREATE_PARTY", aggregateId: v41AggregateId("party-form-create"),
          payload: {
            recruitDate: v41Today(), resetSequence: Number(status.body.nextPartyResetSequence || 0),
            recruitNumber: Number(parsed.recruitNo), partyType: parsed.type, title: parsed.title,
            maximumMembers: Number(parsed.maximumMembers), members: members,
            startTimeText: parsed.startTimeText, gameInfo: parsed.gameInfo,
            scheduledStartAt: v41ScheduledInstant(v41Today(), parsed.startTimeText), protectedUntil: null
          }
        }
      };
    });
    if (!result || !result.ok) return v41Reply(replier, v41ResultMessage(result));
    status = v41OpenChat(room, sender);
    party = v41FindParty(status, parsed.recruitNo);
    return v41Reply(replier, party
      ? "[파티 #" + Number(parsed.recruitNo) + " 반영]\n" + Number(party.memberCount || 0) + "/" + Number(party.maximumMembers || 0) + " · 예비 " + Number(party.reserveCount || 0) + "명\n시작시간: " + v41PartyStartText(party) + " · 게임정보: " + (v41Trim(party.gameInfo || party.note) || "미입력") + "\n마감: " + Number(parsed.recruitNo) + "ㅉ"
      : "[K-LOL.GG 파티]\n명단을 반영했습니다.");
  }
  if (parsed.action === "FINISH") {
    party = v41FindParty(status, parsed.recruitNo);
    if (!party && !v41ReadLegacyIntent(room, sender, text)) {
      throw v41UserError("진행 중인 파티 #" + parsed.recruitNo + "을 찾지 못했습니다.");
    }
    result = v41RecruitMutation(room, sender, text, function () {
      return {
        expectedRevision: Number(party.revision),
        command: { type: "FINISH_PARTY", aggregateId: party.id, payload: {} }
      };
    });
    return v41Reply(replier, result && result.ok
      ? "[K-LOL.GG 파티 #" + parsed.recruitNo + "]\n모집을 마감했습니다."
      : v41ResultMessage(result));
  }
  return false;
}

function v41InhouseTemplate(parsed) {
  var mode = parsed.mode === "ARAM" ? "칼바람" : parsed.mode === "AUGMENT_ARAM" ? "증바람" : "협곡";
  var dateKey = parsed.dateKey || v41Today();
  var recruitNo = Number(parsed.recruitNo || 1);
  var capacity = Number(parsed.capacity || 10);
  var lines = ["📢 내전하실분 #" + recruitNo, " 》" + mode,
    " 》" + dateKey + " " + String(parsed.time || "21:00") + " 시작",
    "👥 0/" + capacity + "명", "", "*참가 신청 양식*"];
  var index = 0;
  if (parsed.mode === "RIFT") {
    lines.push("이름/현티어/최고티어/주라인/부라인");
    lines.push("EX) 1.지후/P/E/AD/MD");
  } else {
    lines.push("이름");
    lines.push("EX) 1.지후");
  }
  lines.push("");
  for (index = 1; index <= capacity; index += 1) lines.push(index + ".");
  return lines.join("\n");
}

function v41InhouseModeSelection() {
  return [
    "[K-LOL.GG 내전 종목 선택]",
    "지원하지 않는 종목입니다: 양식",
    "✅️협곡내전은 관리자에게 신청 후 안내에 따라 구인해주세요.✅️",
    "",
    "아래 명령어 중 하나를 입력해주세요.",
    "- /내전구인 협곡",
    "- /내전구인 칼바람",
    "- /내전구인 증바람",
    "",
    "날짜·시간 지정: /내전구인 협곡 2026-08-06 21:00",
    "모집번호·정원 지정: /내전구인 칼바람 #2 10명",
    "",
    "협곡은 티어·라인 양식으로 내전 명단에 등록됩니다.",
    "칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다."
  ].join("\n");
}

function v41HandleLegacyInhouse(parsed, room, sender, replier) {
  if (parsed.action === "JOIN") return v41Reply(replier, v41ParticipationGuideNotice());
  if (parsed.action === "CREATE") {
    if (parsed.templateRequest || parsed.invalidMode || !parsed.mode) return v41Reply(replier, v41InhouseModeSelection());
    return v41Reply(replier, v41InhouseTemplate(parsed));
  }
  if (parsed.action === "STATUS" || parsed.action === "DETAIL") {
    return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications({
      action: "STATUS", seasonId: v41SeasonId(), applyDate: v41Today(),
      recruitNo: parsed.recruitNo === null ? null : Number(parsed.recruitNo)
    }, KLOL_V2_KAKAO.contextFromChat(room, sender))));
  }
  return false;
}

function v41ScrimTemplate() {
  return [
    "[K-LOL.GG 스크림 구인 양식]", "", "운영일: " + v41Today(), "번호: #자동배정", "",
    "일시: ", "방식: 3판2선", "", "우리팀: ",
    "TOP: ", "JUG: ", "MID: ", "ADC: ", "SUP: ", "", "상대팀: ",
    "TOP: ", "JUG: ", "MID: ", "ADC: ", "SUP: "
  ].join("\n");
}

function v41V1ScrimSyncKey(room, sender, text) {
  var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
  return "KLOL_V41_V1_SCRIM_SYNC_" + identity.roomId.substring(5) + "_" +
    identity.senderId.substring(7) + "_" + v41SnapshotSummaryHash(v41NormalizeText(text));
}

function v41HandleLegacyScrim(parsed, text, room, sender, replier) {
  var status = v41OpenChat(room, sender);
  var scrim = null;
  var result = null;
  if (parsed.action === "STATUS") {
    if (!parsed.scrimNo) return v41Reply(replier, v41FormatScrimStatus(status));
    scrim = v41FindScrim(status, parsed.scrimNo);
    if (!scrim) throw v41UserError("진행 중인 스크림 #" + parsed.scrimNo + "을 찾지 못했습니다.");
    return v41Reply(replier, v41FormatScrimDetail(scrim));
  }
  if (parsed.action === "UNSUPPORTED") {
    if (parsed.unsupportedKind === "JOIN") return v41Reply(replier, "[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요.");
    if (parsed.unsupportedKind === "CONFIRM") return v41Reply(replier, "[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.");
    if (parsed.unsupportedKind === "CANCEL") return v41Reply(replier, "[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다.");
    return v41Reply(replier, "[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다.");
  }
  if (parsed.action === "DETAIL") {
    scrim = v41FindScrim(status, parsed.scrimNo);
    if (!scrim) throw v41UserError("진행 중인 스크림 #" + parsed.scrimNo + "을 찾지 못했습니다.");
    return v41Reply(replier, v41FormatScrimDetail(scrim));
  }
  if (parsed.action === "CREATE" && parsed.templateRequest) return v41Reply(replier, v41ScrimTemplate());
  if (parsed.action === "CREATE") {
    var dedupeKey = v41V1ScrimSyncKey(room, sender, text);
    if (String(DataBase.getDataBase(dedupeKey) || "") === "done") return true;
    var scrimNo = Number(parsed.scrimNo || status.body.nextScrimNumber || 0);
    var operationDate = parsed.operationDate || v41Today();
    if (!scrimNo) throw v41UserError("오늘 스크림 번호 99개를 모두 사용했습니다.");
    if (!parsed.requesterTeamName) throw v41UserError("우리팀 항목에 팀 이름을 적어 주세요. 예: 우리팀: 별빛단");
    scrim = v41FindScrim(status, scrimNo);
    var tournamentId = scrim && scrim.tournamentId ? String(scrim.tournamentId) : null;
    var legacyTournamentNumber = parsed.tournamentNo ? Number(parsed.tournamentNo) :
      (scrim && scrim.legacyTournamentNumber ? Number(scrim.legacyTournamentNumber) : null);
    result = v41RecruitMutation(room, sender, text, function () {
      return {
        expectedRevision: scrim ? Number(scrim.revision) : 0,
        command: {
          type: scrim ? "SYNC_SCRIM" : "CREATE_SCRIM", aggregateId: scrim ? String(scrim.id) : v41AggregateId("scrim-create"),
          payload: {
            recruitDate: operationDate, scrimNumber: scrimNo,
            tournamentId: tournamentId, legacyTournamentNumber: legacyTournamentNumber,
            requesterTeamId: null,
            title: parsed.requesterTeamName + " 스크림 구인",
            requesterTeamName: parsed.requesterTeamName,
            opponentTeamName: parsed.opponentTeamName || null,
            requesterLineup: parsed.requesterLineup || null,
            opponentLineup: parsed.opponentLineup || null,
            memo: parsed.memo || null,
            seriesRuleText: parsed.seriesRuleText || null,
            scheduledAt: v41ScheduledInstant(operationDate, parsed.startTimeText),
            bestOf: Number(parsed.gameCount || 3)
          }
        }
      };
    });
    if (!result || !result.ok) return v41Reply(replier, v41ResultMessage(result));
    DataBase.setDataBase(dedupeKey, "done");
    status = v41OpenChat(room, sender);
    scrim = v41FindScrim(status, scrimNo);
    if (result.body && result.body.commandType === "CREATE_SCRIM") return v41Reply(replier, "[K-LOL.GG 스크림 등록 완료]");
    if (scrim) return v41Reply(replier, "[스크림 #" + scrimNo + " 반영]\n상태: " + v41ScrimStatusLabel(scrim.status) + "\n\n" + v41ScrimFormLines(scrim).join("\n"));
    return v41Reply(replier, "[스크림 #" + scrimNo + " 반영]");
  }
  return false;
}

function v41HandleCompat(text, room, sender, replier) {
  var parsed = v41CompatParser().classifyMessage(text, sender, v41Today());
  if (!parsed) return false;
  if (parsed.domain === "INPUT" && parsed.action === "REJECT") {
    throw v41UserError("메시지가 너무 길거나 사용할 수 없는 제어문자가 포함되어 있습니다.");
  }
  if (parsed.domain === "PARTY") return v41HandleLegacyParty(parsed, text, room, sender, replier);
  if (parsed.domain === "INHOUSE") return v41HandleLegacyInhouse(parsed, room, sender, replier);
  if (parsed.domain === "SCRIM") return v41HandleLegacyScrim(parsed, text, room, sender, replier);
  if (parsed.domain === "OPERATION_FORM" && parsed.action === "INVALID") {
    return v41Reply(replier, "[K-LOL.GG 양식 필드 누락]\n필수 항목을 확인해 주세요: " + parsed.missingFields.join(", "));
  }
  if (parsed.domain === "OPERATION_FORM" && parsed.action === "SUBMIT") {
    var intent = v41LegacyIntent(room, sender, text, function () { return {}; });
    var result = KLOL_V2_KAKAO.operationForm(parsed.formType, parsed.payload, KLOL_V2_KAKAO.contextFromChat(room, sender, {
      requestKey: intent.requestKey
    }));
    return v41Reply(replier, result && result.ok
      ? (result.body && typeof result.body.reply === "string"
        ? String(result.body.reply)
        : "[K-LOL.GG 운영 양식]\n" + parsed.formType + " 양식을 접수했습니다.")
      : v41ResultMessage(result));
  }
  if (parsed.domain === "MANAGED") {
    if (parsed.action === "PHOTO_CANCEL") {
      v41ClearImageSession(room, sender);
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
    }
    if (parsed.action === "REGISTRATION_HUB") return v41Reply(replier, v41RegistrationHubNotice());
    if (parsed.action === "INHOUSE_RESULT") {
      return v41Reply(replier, "[K-LOL.GG 내전 결과 등록]\n로그인한 계정으로 결과와 사진을 제출해 주세요.\n" + v41SitePath("/matches/submit"));
    }
    if (parsed.action === "INHOUSE_RESULT_STATUS") {
      return v41Reply(replier, "[K-LOL.GG 내전 결과 제출 현황]\n로그인한 본인의 제출 상태만 확인할 수 있습니다.\n" + v41SitePath("/matches/submissions"));
    }
    if (parsed.action === "DISCIPLINE_CREATE") {
      return v41Reply(replier, "[K-LOL.GG 관리자 경고 등록]\n관리자 로그인과 2차 인증 후 등록해 주세요.\n" + v41SitePath("/admin/discipline/new"));
    }
    if (parsed.action === "DISCIPLINE_EVIDENCE") {
      return v41Reply(replier, "[K-LOL.GG 경고 차감 사진 제출]\n로그인하면 본인의 진행 과제만 표시됩니다.\n" + v41SitePath("/account/discipline"));
    }
    if (parsed.action === "DISCIPLINE_STATUS") {
      return v41Reply(replier, "[K-LOL.GG 내 경고 현황]\n내정보에서 경고 상태와 남은 사진 수를 확인해 주세요.\n" + v41SitePath("/account/discipline"));
    }
  }
  return false;
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

function v41ClearImageSession(room, sender) {
  try { DataBase.setDataBase(v41ImageSaveKey(room, sender), ""); } catch (ignored) {}
}

function v41ImageSessionState(room, sender) {
  var saved = String(DataBase.getDataBase(v41ImageSaveKey(room, sender)) || "").split("|");
  var sessionId = v41Trim(saved[0]);
  var savedAt = Number(saved[1] || 0);
  var age = new Date().getTime() - savedAt;
  if (!savedAt || age < 0 || age > KLOL_V41_IMAGE_SESSION_TTL_MS ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    v41ClearImageSession(room, sender);
    return null;
  }
  return { sessionId: sessionId, savedAt: savedAt, remainingMs: KLOL_V41_IMAGE_SESSION_TTL_MS - age };
}

function v41ReadImageSession(room, sender) {
  var state = v41ImageSessionState(room, sender);
  return state ? state.sessionId : "";
}

function v41ReceivedImage(imageDB) {
  var value = "";
  try { if (imageDB && imageDB.getImageBase64) value = String(imageDB.getImageBase64() || ""); } catch (ignored) {}
  try { if (!value && imageDB && imageDB.getImage) value = String(imageDB.getImage() || ""); } catch (ignored2) {}
  try {
    if (!value && imageDB && imageDB.getImageBitmap) {
      var bitmap = imageDB.getImageBitmap();
      if (bitmap) {
        var stream = new java.io.ByteArrayOutputStream();
        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, stream);
        value = String(android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP) || "");
        stream.close();
      }
    }
  } catch (ignored3) { value = ""; }
  return value;
}

function v41IsImagePlaceholderMessage(text) {
  var value = v41Trim(v41NormalizeText(text));
  return value === "사진" || value === "[사진]" || value === "Photo" || value === "photo";
}

function v41FormatImageResult(result) {
  if (!result || !result.ok) return v41ResultMessage(result);
  var body = result.body && typeof result.body === "object" ? result.body : {};
  var received = Number(body.receivedImageCount || 0);
  var expected = Number(body.expectedImageCount || 0);
  var lines = ["[K-LOL.GG 사진 접수]", "사진을 안전하게 접수했습니다."];
  if (expected > 0) lines.push("진행: " + received + "/" + expected);
  if (body.completed === true) lines.push("필요한 사진 접수가 완료되었습니다.");
  else if (expected > received) lines.push("남은 사진: " + (expected - received) + "장");
  return lines.join("\n");
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
  if ((result && result.body && (result.body.completed === true || result.body.sessionActive === false)) ||
      (result && (result.status === 404 || result.status === 410))) {
    v41ClearImageSession(room, sender);
  }
  v41Reply(replier, v41FormatImageResult(result));
  return true;
}

function v41RegistrationHubNotice() {
  return [
    "[K-LOL.GG 쉬운 등록 센터]",
    "처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다.",
    "▶ " + v41SitePath("/start"), "",
    "① 내전 결과 등록",
    "경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다.",
    "▶ " + v41SitePath("/matches/submit"), "",
    "② 주의·경고·벤 등록 (관리자)",
    "대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다.",
    "▶ " + v41SitePath("/admin/discipline/new"),
    "※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다.", "",
    "③ 경고 차감 사진 제출",
    "본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다.",
    "▶ " + v41SitePath("/discipline/evidence"),
    "※ 본인 계정 로그인이 필요합니다.", "",
    "등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다."
  ].join("\n");
}

function v41RecruitWebHelperNotice() {
  return [
    "[K-LOL.GG 구인도우미]", "",
    "현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.", "",
    v41SitePath("/recruit-helper"), "", "구인현황 바로가기:", v41SitePath("/recruit")
  ].join("\n");
}

function v41RecruitHelpNotice() {
  return [
    "[K-LOL.GG 구인 도움말]",
    "",
    "1. 파티",
    "생성: 5인파티",
    "현황: 구인현황",
    "종료: 번호ㅉ",
    "",
    "2. 내전",
    "생성: 내전구인",
    "현황: 내전현황",
    "매일 오전 6시 자동 종료",
    "",
    "3. 스크림",
    "생성: 스크림구인",
    "현황: 스크림현황",
    "매일 오전 6시 자동 종료",
    "",
    "공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송"
  ].join("\n");
}

function v41ParticipationGuideNotice() {
  return [
    "[K-LOL.GG 내전 참가 방법 안내]",
    "오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.",
    "",
    "1. K-LOL.GG 접속",
    v41SitePath(""),
    "2. 로그인",
    "3. 시즌내전 참가하기 클릭",
    "4. 주 포지션 / 부 포지션 선택",
    "5. 참가 신청 완료",
    "",
    "참가 신청 기준으로 팀 밸런스가 진행됩니다.",
    "신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다."
  ].join("\n");
}

function v41LegacyLinkNotice(text) {
  var normalized = v41Trim(text).replace(/\s+/g, "");
  if (/^\/?(?:구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(normalized)) {
    return v41RecruitWebHelperNotice();
  }
  if (/^\/?(?:구인구직도움말|구인도움말|구인명령어)$/.test(normalized)) {
    return v41RecruitHelpNotice();
  }
  if (/^\/?(?:등록|등록도움말|사진취소)$/.test(normalized)) return v41RegistrationHubNotice();
  if (/^\/?(?:내전참가|참가신청)$/.test(normalized)) return v41ParticipationGuideNotice();
  if (/^\/?(?:내전등록|결과등록|내전결과)$/.test(normalized)) {
    return ["[K-LOL.GG 내전 결과 등록]", "가장 쉬운 등록 방법을 안내합니다.", "",
      "1. 아래 링크를 엽니다.", "2. 세트 수·회차·팀 밸런스를 확인합니다.",
      "3. 결과 사진 2~3장을 한 번에 올리고 제출합니다.", "",
      "▶ " + v41SitePath("/matches/submit"), "",
      "로그인하면 진행 중인 제출을 자동으로 찾아 이어서 할 수 있습니다."].join("\n");
  }
  if (/^\/?(?:내전등록현황|결과현황)$/.test(normalized)) {
    return ["[K-LOL.GG 내전 결과 제출 현황]",
      "사이트에 로그인하면 진행 중인 내 제출을 자동으로 확인할 수 있습니다.", "",
      "▶ " + v41SitePath("/matches/submit")].join("\n");
  }
  if (/^\/?(?:경고등록|경고)$/.test(normalized)) {
    return ["[K-LOL.GG 관리자 경고 등록]",
      "관리자 화면에서 대상 검색 → 종류 선택 → 사유·사진 등록 순서로 진행합니다.", "",
      "▶ " + v41SitePath("/admin/discipline/new"), "",
      "※ 관리자 로그인과 2차 인증이 필요하며, 완료 후 이 화면으로 돌아옵니다."].join("\n");
  }
  if (/^\/?(?:인증|경고인증)$/.test(normalized)) {
    return ["[K-LOL.GG 경고 차감 사진 제출]",
      "사이트에 로그인하면 본인의 진행 과제만 자동으로 표시됩니다.",
      "로그인 계정 기준으로 남은 사진을 한 번에 제출할 수 있습니다.", "",
      "▶ " + v41SitePath("/discipline/evidence")].join("\n");
  }
  if (/^\/?경고현황$/.test(normalized)) {
    return ["[K-LOL.GG 내 경고 현황]", "내정보에서 경고 상태와 남은 사진 수를 확인하세요.", "",
      "▶ " + v41SitePath("/account#discipline")].join("\n");
  }
  return "";
}

function v41Help() {
  return [
    "[K-LOL.GG 일반 도움말]", "", "LOL-K 기능",
    "- 내전현황 : 현재 시즌내전 신청 현황",
    "- 내전참가 / 참가신청 : 참가 방법 안내",
    "- 전적 닉네임#태그 : 플레이어 전적 조회",
    "- 최근 닉네임#태그 : 최근 경기 조회",
    "- 랭킹 : 랭킹 조회", "", "운영 기능",
    "- /등록 : 초보자용 등록 센터",
    "- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록",
    "- /경고등록 : 관리자 경고 등록 화면 열기",
    "- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출",
    "- /경고현황 : 내정보의 경고 진행 상황 열기",
    "- /결과현황 : 사이트의 내 미완료 결과 접수 열기", "",
    "구인구직 명령어는 구인도움말을 입력해주세요.",
    "스크림구인은 /스크림구인, /스크림현황을 사용해주세요.", "", "참고",
    "- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.",
    "- 예) /내전현황, /전적 닉네임#태그, /구인도움말"
  ].join("\n");
}

function v41V2Help() {
  return [
    "[K-LOL.GG V2 관리 도움말]",
    "/V2연동확인 · /V2진단 · /V2방연동 <8자리 코드> · /V2사진세션 <사이트 발급 UUID>",
    "/사진상태 · /V2사진취소",
    "/V2모집 · /V2시즌 · /V2양식"
  ].join("\n");
}

function v41Diagnostic(room, sender) {
  var result = null;
  try { KLOL_V2_KAKAO.publicBaseUrl(); }
  catch (error) { return "[K-LOL.GG V2 진단]\n주소 설정: 확인 필요\n비밀값은 표시하지 않습니다."; }
  try { result = KLOL_V2_KAKAO.openchatStatus(KLOL_V2_KAKAO.contextFromChat(room, sender)); }
  catch (error) { return "[K-LOL.GG V2 진단]\n주소 설정: 정상\n서명·HTTPS 실행: 실패\nMessengerBot R 실행 로그를 확인해 주세요."; }
  return "[K-LOL.GG V2 진단]\n서버 도달: HTTP " + Number(result.status || 0) + "\n서버 코드: " + String(result.body && result.body.code || "OK") + (result.traceId ? "\n문의 코드: " + String(result.traceId) : "") + "\n비밀값은 표시하지 않습니다.";
}

function response(room, msg, sender, isGroupChat, replier, imageDB, packageName, isMention, logId, channelId, userHash) {
  var text = v41CompatParser().canonicalCommandText(msg);
  var rawImage = "";
  var deliveryId = v41MessageDeliveryId(room, sender, msg, logId, channelId, userHash);
  if (!v41ClaimMessageDelivery(deliveryId)) return null;
  KLOL_V41_CURRENT_DELIVERY_ID = deliveryId;
  KLOL_V41_CURRENT_USER_HASH = String(userHash || "");
  try {
    room = typeof KLOL_V2_KAKAO.installationScopeId === "function"
      ? KLOL_V2_KAKAO.installationScopeId()
      : KLOL_V2_KAKAO.identityForChat(room, "room-scope").roomId;
    if (v41IsBotEchoSender(sender)) return null;
    rawImage = v41ReceivedImage(imageDB);
    if (rawImage && v41HandleImage(room, sender, rawImage, replier)) return null;
    if (v41IsImagePlaceholderMessage(text) && v41ImageSessionState(room, sender)) {
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n사진 원본을 읽지 못했습니다. 카카오톡의 사진을 파일이 아닌 일반 사진으로 다시 보내 주세요. 세션은 그대로 유지됩니다.");
    }
    if (text.indexOf("들어왔습니다") >= 0) return v41Reply(replier, "다시 오셨네요, 반가워요! 😊");
    if (text.indexOf("나갔습니다") >= 0 || text.indexOf("초대되었습니다") >= 0) return null;
    if (!text) return null;
    if (text === "봇버전") {
      try { return v41Reply(replier, "[K-LOL.GG 카카오봇]\n" + KLOL_V41_BOT_CODE_VERSION + "\n설치본: " + KLOL_V2_KAKAO.installationId() + "\n키 ID: " + KLOL_V2_KAKAO.signingKeyId()); }
      catch (versionIdentityError) { return v41Reply(replier, "[K-LOL.GG 카카오봇]\n" + KLOL_V41_BOT_CODE_VERSION + "\n설치본: 설정 확인 필요"); }
    }
    if (text === "V2도움말") return v41Reply(replier, v41V2Help());
    if (/^\/?V2진단$/i.test(text)) return v41Reply(replier, v41Diagnostic(room, sender));
    if (text === "도움말" || text === "명령어") return v41Reply(replier, v41Help());
    var legacyNotice = v41LegacyLinkNotice(text);
    if (legacyNotice) return v41Reply(replier, legacyNotice);
    if (/^\/?(?:V2)?연동확인$/i.test(text)) {
      try {
        var identity = KLOL_V2_KAKAO.identityForChat(room, sender);
        return v41Reply(replier, "[K-LOL.GG V2 연동 ID]\n설치본: " + KLOL_V2_KAKAO.installationId() + "\n키 ID: " + KLOL_V2_KAKAO.signingKeyId() + "\n발신자: " + identity.senderId + "\n연동 기준: 설치본\n주의: 이 봇 설치본은 카카오톡 방 하나에서만 사용하세요.");
      } catch (identityError) {
        return v41Reply(replier, "[K-LOL.GG V2 연동]\n연동 ID 생성에 실패했습니다. MessengerBot R 실행 로그를 확인해 주세요.");
      }
    }
    if (/^\/?사진상태$/.test(text)) {
      var imageState = v41ImageSessionState(room, sender);
      if (!imageState) return v41Reply(replier, "[K-LOL.GG 사진 접수]\n연결된 사진 세션이 없습니다. 사이트에서 세션을 발급한 뒤 /V2사진세션 UUID를 보내 주세요.");
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n사진 세션이 연결되어 있습니다. 약 " + Math.max(1, Math.ceil(imageState.remainingMs / 60000)) + "분 남았습니다.\n취소: /사진취소");
    }
    if (/^\/?(?:사진취소|V2사진취소)$/.test(text)) {
      v41ClearImageSession(room, sender);
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
    }
    if (/^\/?내전미리보기취소$/.test(text)) {
      v41ClearSeasonPreview(room, sender);
      return v41Reply(replier, "[K-LOL.GG 내전 신청]\n저장된 미리보기를 취소했습니다. 사이트에는 반영하지 않았습니다.");
    }
    var confirmMatch = text.match(/^\/?내전확인\s+([A-Za-z0-9]{4,16})$/);
    if (confirmMatch) return v41ConfirmSeasonPreview(room, sender, confirmMatch[1], replier);
    if (/^\/?전적\s+/.test(text)) {
      return v41Reply(replier, v41FormatPlayerRecord(KLOL_V2_KAKAO.playerRecord(text.replace(/^\/?전적\s+/, ""), KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?최근\s+/.test(text)) {
      return v41Reply(replier, v41FormatPlayerRecord(KLOL_V2_KAKAO.recentMatches(text.replace(/^\/?최근\s+/, ""), KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?랭킹$/.test(text)) {
      return v41Reply(replier, v41FormatRanking(KLOL_V2_KAKAO.ranking(KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (v41IsV1SeasonSnapshot(text)) {
      return v41HandleV1SeasonSnapshot(text, room, sender, replier);
    }
    if (/K-LOL\.GG\s*내전\s*참가\s*신청|내전\s*(?:참가\s*)?신청|협곡\s*내전|참가\s*신청\s*양식/.test(text) && /^\s*\d{1,2}\s*[.)]/m.test(text)) {
      return v41Reply(replier, v41CreateSeasonPreview(room, sender, text));
    }
    if (v41HandleCompat(text, room, sender, replier)) return null;
    var noticeMatch = text.match(/^\/?(?:자동공지|공지생성)(?:\s+(12|15|18|20))?$/i);
    if (noticeMatch) {
      return v41Reply(replier, v41FormatScheduledNotice(KLOL_V2_KAKAO.scheduledNotice(noticeMatch[1] || null, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?(?:구인현황|스크림현황)$/.test(text)) {
      return v41Reply(replier, v41FormatOpenchat(KLOL_V2_KAKAO.openchatStatus(KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (/^\/?내전현황(?:\s*#?\d{1,3})?$/.test(text)) {
      return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications({
        action: "STATUS", seasonId: v41SeasonId(), applyDate: v41Today(), recruitNo: v41RecruitNumber(text)
      }, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (text.indexOf("V2모집 ") === 0) return v41HandleRecruitJson(text, room, sender, replier);
    if (text.indexOf("V2시즌 ") === 0) {
      return v41Reply(replier, v41FormatSeason(KLOL_V2_KAKAO.seasonApplications(v41JsonAfter(text, "V2시즌"), KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    var pairingMatch = /^\/?V2방연동\s+([A-HJ-NP-Z2-9]{8})$/i.exec(text);
    if (pairingMatch) return v41Reply(replier, v41ResultMessage(KLOL_V2_KAKAO.pairRoom(pairingMatch[1], KLOL_V2_KAKAO.contextFromChat(room, sender))));
    if (text.indexOf("V2양식 ") === 0) {
      var form = v41JsonAfter(text, "V2양식");
      return v41Reply(replier, v41ResultMessage(KLOL_V2_KAKAO.operationForm(form.formType, form.payload, KLOL_V2_KAKAO.contextFromChat(room, sender))));
    }
    if (text.indexOf("V2사진세션 ") === 0) {
      v41SaveImageSession(room, sender, v41Trim(text.substring("V2사진세션".length)));
      return v41Reply(replier, "[K-LOL.GG 사진 접수]\n30분 동안 이 대화의 다음 사진을 안전하게 접수합니다.");
    }
  } catch (error) {
    var detail = error && error.v41UserSafe === true ? String(error.message || "입력 형식을 확인해 주세요.") : "설정 또는 입력 형식을 확인해 주세요.";
    v41Reply(replier, detail.indexOf("[K-LOL.GG 요청 실패]") === 0 ? detail : "[K-LOL.GG 요청 실패]\n" + detail);
  } finally {
    KLOL_V41_CURRENT_DELIVERY_ID = "";
    KLOL_V41_CURRENT_USER_HASH = "";
  }
}

response.__kakaoBotEntryPoint = true;
