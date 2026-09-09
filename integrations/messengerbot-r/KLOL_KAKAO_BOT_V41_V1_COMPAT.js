/* eslint-disable */
/*
 * K-LOL.GG MessengerBot R V41 V1 command compatibility parser.
 *
 * This file is deliberately transport-free. It accepts the public text formats
 * supported by the V39/V40 bot and converts them to small, bounded V2-friendly
 * objects. Keep this file ES5-compatible because MessengerBot R embeds an older
 * JavaScript runtime on some devices.
 */
var KLOL_V41_V1_COMPAT = (function () {
  var MAX_INPUT_LENGTH = 12000;
  var MAX_INPUT_LINES = 320;
  var MAX_MEMBERS = 120;
  var POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"];
  var POSITION_ALIASES = {
    TOP: "TOP", "탑": "TOP",
    JUG: "JGL", JGL: "JGL", JG: "JGL", JUNGLE: "JGL", "정글": "JGL",
    MID: "MID", MIDDLE: "MID", "미드": "MID",
    ADC: "ADC", AD: "ADC", BOT: "ADC", BOTTOM: "ADC", "원딜": "ADC", "바텀": "ADC",
    SUP: "SUP", SPT: "SUP", SUPPORT: "SUP", "서폿": "SUP", "서포터": "SUP"
  };

  function trim(value) {
    return String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  }

  function normalizeText(value) {
    var source = String(value == null ? "" : value);
    var output = "";
    var index = 0;
    var code = 0;
    for (index = 0; index < source.length; index += 1) {
      code = source.charCodeAt(index);
      if (code >= 0xff01 && code <= 0xff5e) output += String.fromCharCode(code - 0xfee0);
      else if (code === 0x00a0 || code === 0x3000) output += " ";
      else output += source.charAt(index);
    }
    return output
      .replace(/\r\n?/g, "\n")
      .replace(/[–—]/g, "-")
      .replace(/\n{4,}/g, "\n\n\n");
  }

  function canonicalCommandText(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    if (text.length > 1 && text.charAt(0) === "/" && text.charAt(1) !== "/" && !/\s/.test(text.charAt(1))) {
      return text.substring(1);
    }
    return text;
  }

  function validateInput(value) {
    var source = String(value == null ? "" : value);
    var normalized = "";
    if (source.length > MAX_INPUT_LENGTH) return { ok: false, error: "INPUT_TOO_LONG", text: "" };
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
      return { ok: false, error: "CONTROL_CHARACTER", text: "" };
    }
    if (source.replace(/\r\n?/g, "\n").split("\n").length > MAX_INPUT_LINES) {
      return { ok: false, error: "TOO_MANY_LINES", text: "" };
    }
    normalized = normalizeText(source);
    return { ok: true, error: null, text: normalized };
  }

  function safeText(value, maximum) {
    var checked = validateInput(value);
    var result = checked.ok ? trim(checked.text).replace(/\s+/g, " ") : "";
    return result && result.length <= maximum ? result : "";
  }

  function validNumber(value, minimum, maximum) {
    return typeof value === "number" && isFinite(value) && Math.floor(value) === value && value >= minimum && value <= maximum;
  }

  function explicitNumber(value, maximum) {
    var number = value ? Number(value) : null;
    return number !== null && validNumber(number, 1, maximum) ? number : null;
  }

  function partyDefinition(command) {
    var definitions = {
      "자랭구인": ["FLEX_RANK", "자랭 하실분!", 5],
      "일반구인": ["NORMAL_GAME", "일반 하실분!", 5],
      "솔랭구인": ["SOLO_RANK", "솔랭 하실분!", 2],
      "칼바람구인": ["ARAM", "칼바람 하실분!", 5],
      "증바람구인": ["ARAM", "증바람 하실분!", 5],
      "기타게임구인": ["OTHER_GAME", "기타게임 하실분!", 8],
      "롤체일반구인": ["TFT_NORMAL", "롤체 일반 하실분!", 8],
      "롤체랭크구인": ["TFT_RANK", "롤체 랭크 하실분!", 3],
      "더블업구인": ["DOUBLE_UP", "더블업 하실분!", 2],
      "5인협곡": ["PARTY_RIFT", "5인 협곡 파티 구인", 5],
      "5인협곡파티": ["PARTY_RIFT", "5인 협곡 파티 구인", 5]
    };
    return definitions[command] || null;
  }

  function parsePartyCreateCommand(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var match = null;
    var count = 0;
    var recruitNo = null;
    var definition = null;
    var command = "";
    if (!text || text.indexOf("\n") >= 0) return null;

    match = text.match(/^\/?(\d{1,2})\s*인\s*(협곡\s*)?(?:파티|구인)(?:\s+(\d{1,2}))?\s*$/);
    if (match) {
      count = Number(match[1]);
      recruitNo = explicitNumber(match[3], 99);
      if (!validNumber(count, 1, 99) || (match[3] && recruitNo === null)) return null;
      if (match[2] && count !== 5) return null;
      return {
        domain: "PARTY", action: "CREATE",
        type: match[2] ? "PARTY_RIFT" : "PARTY_NUMBER",
        title: match[2] ? "5인 협곡 파티 구인" : String(count) + "인 파티 구인",
        maximumMembers: count,
        explicitRecruitNumber: recruitNo
      };
    }

    match = text.match(/^\/?(자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|5\s*인\s*협곡(?:\s*파티)?)(?:\s+(\d{1,2}))?\s*$/);
    if (!match) return null;
    command = match[1].replace(/\s+/g, "");
    definition = partyDefinition(command);
    recruitNo = explicitNumber(match[2], 99);
    if (!definition || (match[2] && recruitNo === null)) return null;
    return {
      domain: "PARTY", action: "CREATE", type: definition[0], title: definition[1],
      maximumMembers: definition[2], explicitRecruitNumber: recruitNo
    };
  }

  function parsePartyFinishCommand(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var compact = text.replace(/\s+/g, "");
    var match = null;
    if (!text || text.indexOf("\n") >= 0) return null;
    match = text.match(/^\/?#?\s*(\d{1,2})\s*(?:쫑|ㅉ)\s*$/);
    if (!match) match = compact.match(/^\/?#?(\d{1,2})(?:번|인)?(?:파티|구인)?(?:쫑|ㅉ|마감|종료)$/);
    if (!match) match = text.match(/^\/?구인(?:마감|쫑|종료)\s*#?\s*(\d{1,2})\s*$/);
    if (!match || !validNumber(Number(match[1]), 1, 99)) return null;
    return { domain: "PARTY", action: "FINISH", recruitNo: Number(match[1]) };
  }

  function extractPartyRecruitNo(text) {
    var match = text.match(/모집\s*번호\s*:?\s*#?\s*(\d{1,2})/i);
    if (!match) match = text.match(/(^|\s)#\s*(\d{1,2})(?=\s|[·]|$)/);
    var raw = match ? match[match.length - 1] : null;
    return explicitNumber(raw, 99);
  }

  function cleanMemberName(value) {
    var name = trim(value)
      .replace(/^[.:)\]\-\s]+/, "")
      .replace(/\s+/g, " ");
    if (!name || name.length > 100) return "";
    if (/^(?:미정|없음|공란|-|모집중|\d+\s*명)$/.test(name)) return "";
    return name;
  }

  function normalizePosition(value) {
    var key = trim(value).toUpperCase();
    return POSITION_ALIASES[key] || POSITION_ALIASES[trim(value)] || null;
  }

  function readSimpleMeta(text) {
    var lines = text.split("\n");
    var result = { startTimeText: null, gameInfo: null, tierText: null, preferredLineText: null, playStyle: null };
    var index = 0;
    var line = "";
    var value = "";
    for (index = 0; index < lines.length; index += 1) {
      line = trim(lines[index]).replace(/^[》>]\s*/, "");
      if (/^(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]/.test(line)) {
        value = trim(line.replace(/^(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]/, ""));
        var tierMatch = value.match(/^(.*?)(?:\+\s*티어\s*[:：]?\s*)([^+]+)$/);
        if (tierMatch) {
          if (trim(tierMatch[1]).length <= 160) result.startTimeText = trim(tierMatch[1]) || null;
          if (trim(tierMatch[2]).length <= 80) result.tierText = trim(tierMatch[2]) || null;
        } else if (value && value.length <= 160) result.startTimeText = value;
      } else if (/^게임\s*정보\s*[:：]/.test(line)) {
        value = trim(line.replace(/^게임\s*정보\s*[:：]/, ""));
        if (value && value.length <= 500) result.gameInfo = value;
      } else if (/^(?:티어|현티어)\s*:/.test(line)) {
        value = trim(line.replace(/^(?:티어|현티어)\s*:/, ""));
        if (value && value.length <= 80) result.tierText = value;
      } else if (/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/.test(line)) {
        value = trim(line.replace(/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/, ""));
        if (value && value.length <= 80) result.preferredLineText = value;
      }
      if (/즐겜/.test(line) && !/빡겜/.test(line)) result.playStyle = "즐겜";
      if (/빡겜/.test(line) && !/즐겜/.test(line)) result.playStyle = "빡겜";
    }
    return result;
  }

  function inferPartyDefinition(text, requestedType, requestedMaximum) {
    var titleMap = [
      [/롤체\s*일반/, "TFT_NORMAL", "롤체 일반 하실분!", 8],
      [/롤체\s*랭크/, "TFT_RANK", "롤체 랭크 하실분!", 3],
      [/더블업/, "DOUBLE_UP", "더블업 하실분!", 2],
      [/솔랭/, "SOLO_RANK", "솔랭 하실분!", 2],
      [/자랭/, "FLEX_RANK", "자랭 하실분!", 5],
      [/일반/, "NORMAL_GAME", "일반 하실분!", 5],
      [/(?:칼바람|증바람)/, "ARAM", /증바람/.test(text) ? "증바람 하실분!" : "칼바람 하실분!", 5],
      [/기타게임/, "OTHER_GAME", "기타게임 하실분!", 8],
      [/협곡/, "PARTY_RIFT", "5인 협곡 파티 구인", 5]
    ];
    var type = safeText(requestedType, 32);
    var maximum = Number(requestedMaximum);
    var title = "파티 구인";
    var index = 0;
    var numbered = null;
    for (index = 0; index < titleMap.length; index += 1) {
      if (titleMap[index][0].test(text)) {
        if (!type) type = titleMap[index][1];
        title = titleMap[index][2];
        if (!validNumber(maximum, 1, 99)) maximum = titleMap[index][3];
        break;
      }
    }
    numbered = text.match(/(\d{1,2})\s*인\s*(?:파티\s*)?구인/);
    if (numbered && !type) {
      type = "PARTY_NUMBER";
      maximum = Number(numbered[1]);
      title = String(maximum) + "인 파티 구인";
    }
    if (!type && /(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿)\s*[.:]/i.test(text)) type = "PARTY_RIFT";
    if (!validNumber(maximum, 1, 99)) maximum = type === "PARTY_RIFT" || type === "FLEX_RANK" || type === "NORMAL_GAME" ? 5 : 99;
    return { type: type || "PARTY_NUMBER", title: title, maximumMembers: maximum };
  }

  function parsePartyForm(value, requestedType, requestedMaximum) {
    var checked = validateInput(value);
    var text = checked.ok ? checked.text : "";
    var recruitNo = text ? extractPartyRecruitNo(text) : null;
    var definition = null;
    var meta = null;
    var lines = [];
    var members = [];
    var occupied = {};
    var index = 0;
    var line = "";
    var match = null;
    var position = null;
    var name = "";
    var slotNo = 0;
    var substitute = false;
    var substituteNames = [];
    var substituteIndex = 0;
    if (!text || recruitNo === null) return null;
    definition = inferPartyDefinition(text, requestedType, requestedMaximum);
    meta = readSimpleMeta(text);
    lines = text.split("\n");
    for (index = 0; index < lines.length; index += 1) {
      line = trim(lines[index]);
      if (!line) continue;
      match = line.match(/^(TOP|JUG|JGL|JG|JUNGLE|MID|ADC|AD|BOT|SUP|SPT|SUPPORT|탑|정글|미드|원딜|바텀|서폿|서포터)\s*[.:]\s*(.*)$/i);
      if (match) {
        position = normalizePosition(match[1]);
        name = cleanMemberName(match[2]);
        if (!position || !name) continue;
        if (occupied["position:" + position]) return null;
        occupied["position:" + position] = true;
        members.push({ name: name, position: position, slotNo: null, substitute: false });
        continue;
      }
      match = line.match(/^(?:예비|후보|대기)\s*(\d{1,2})?\s*[.):]?\s*(.*)$/);
      if (match) {
        slotNo = match[1] ? Number(match[1]) : 1;
        substituteNames = String(match[2] || "").split(/[,/]+/);
        if (!validNumber(slotNo, 1, 99)) continue;
        for (substituteIndex = 0; substituteIndex < substituteNames.length; substituteIndex += 1) {
          name = cleanMemberName(substituteNames[substituteIndex].replace(/^\d{1,2}\s*[.)]\s*/, ""));
          if (!name) continue;
          if (!validNumber(slotNo + substituteIndex, 1, 99) || occupied["substitute:" + (slotNo + substituteIndex)]) return null;
          occupied["substitute:" + (slotNo + substituteIndex)] = true;
          members.push({ name: name, position: null, slotNo: slotNo + substituteIndex, substitute: true });
        }
        continue;
      }
      match = line.match(/^(\d{1,2})(?:[.)]|\s+)\s*(.*)$/);
      if (!match) continue;
      slotNo = Number(match[1]);
      name = cleanMemberName(match[2]);
      substitute = false;
      if (!name || !validNumber(slotNo, 1, definition.maximumMembers)) continue;
      if (occupied["slot:" + slotNo]) return null;
      occupied["slot:" + slotNo] = true;
      members.push({ name: name, position: null, slotNo: slotNo, substitute: substitute });
      if (members.length > MAX_MEMBERS) return null;
    }
    if (members.length < 1) return null;
    members.sort(function (left, right) {
      var leftPosition = left.position ? POSITIONS.indexOf(left.position) : 100;
      var rightPosition = right.position ? POSITIONS.indexOf(right.position) : 100;
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
      if (left.substitute !== right.substitute) return left.substitute ? 1 : -1;
      return Number(left.slotNo || 0) - Number(right.slotNo || 0);
    });
    return {
      domain: "PARTY", action: "SYNC_FORM", recruitNo: recruitNo,
      type: definition.type, title: definition.title, maximumMembers: definition.maximumMembers,
      startTimeText: meta.startTimeText, tierText: meta.tierText,
      gameInfo: meta.gameInfo, preferredLineText: meta.preferredLineText, playStyle: meta.playStyle,
      members: members
    };
  }

  function isPartyFormWithoutNumber(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    if (!text || extractPartyRecruitNo(text) !== null) return false;
    if (/내전\s*(?:참가\s*)?신청|신청일\s*[:：]|회차\s*[:：]|Riot\s*ID\s*[:：]|주라인\s*[:：]/i.test(text)) return false;
    if (/(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]/i.test(text)) return true;
    if (/(?:자랭|일반|솔랭|칼바람|증바람|기타게임|롤체\s*(?:일반|랭크)|더블업)\s*하실분/.test(text)) return true;
    if (/\d{1,2}\s*인\s*(?:협곡\s*)?(?:파티\s*)?구인/.test(text)) return true;
    return false;
  }

  function classifyPartyCommand(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var compact = text.replace(/\s+/g, "");
    var match = null;
    var parsed = parsePartyCreateCommand(text) || parsePartyFinishCommand(text);
    if (!text) return null;
    if (parsed) return parsed;
    if (/^\/?(?:구인구직도움말|구인도움말|구인명령어|구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(compact)) {
      return { domain: "PARTY", action: "HELP" };
    }
    match = text.match(/^\/?(?:구인상세|상세)\s*#?\s*(\d{1,2})$/);
    if (match && validNumber(Number(match[1]), 1, 99)) return { domain: "PARTY", action: "DETAIL", recruitNo: Number(match[1]) };
    if (/^\/?(?:현재구인구직현황|현재구인현황|구인구직현황|구인현황|현황)$/.test(compact)) {
      return { domain: "PARTY", action: "STATUS" };
    }
    if (isPartyFormWithoutNumber(text)) return { domain: "PARTY", action: "MISSING_NUMBER" };
    parsed = parsePartyForm(text);
    return parsed;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function validDateKey(year, month, day) {
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return String(year) + "-" + pad2(month) + "-" + pad2(day);
  }

  function dateFromText(text) {
    var match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    return match ? validDateKey(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  }

  function timeFromText(text, fallback) {
    var match = text.match(/(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/);
    if (!match) match = text.match(/(?:^|\s)([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분?)?(?:\s|$)/);
    return match ? pad2(Number(match[1])) + ":" + pad2(Number(match[2] || 0)) : fallback;
  }

  function inhouseMode(value) {
    var compact = trim(value).replace(/\s+/g, "").toLowerCase();
    if (/^(?:협곡|소환사의협곡|rift)$/.test(compact)) return "RIFT";
    if (/^(?:칼바람|칼바람아수라장|aram)$/.test(compact)) return "ARAM";
    if (/^(?:증바람|증바|증강칼바람|augmentaram)$/.test(compact)) return "AUGMENT_ARAM";
    return null;
  }

  function parseInhouseCommand(value, fallbackDateKey) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text).replace(/^\//, "") : "";
    var match = null;
    var args = "";
    var first = "";
    var mode = null;
    var recruitMatch = null;
    var capacityMatch = null;
    var capacity = 10;
    if (!text || text.indexOf("\n") >= 0) return null;
    match = text.match(/^(?:내전구인구직|내전구인|내전모집)(?:\s+(.*))?$/i);
    if (match) {
      args = trim(match[1] || "");
      first = args.split(/\s+/)[0] || "";
      mode = inhouseMode(first);
      recruitMatch = args.match(/(?:^|\s)#\s*(\d{1,3})(?:\s|$)/);
      capacityMatch = args.match(/(?:^|\s)(\d{1,2})\s*명(?:\s|$)/);
      if (capacityMatch) capacity = Math.min(Math.max(Number(capacityMatch[1]), 2), 20);
      return {
        domain: "INHOUSE", action: "CREATE", mode: mode,
        dateKey: dateFromText(args) || safeText(fallbackDateKey, 10) || null,
        time: timeFromText(" " + args + " ", "21:00"),
        recruitNo: recruitMatch ? explicitNumber(recruitMatch[1], 999) : null,
        capacity: capacity, templateRequest: !args,
        invalidMode: first && !mode && !dateFromText(first) && first.charAt(0) !== "#" && !/^\d{1,2}(?::\d{2}|시|명)/.test(first) ? first : null
      };
    }
    match = text.match(/^(?:내전상세)(?:\s*#?\s*(\d{1,3}))?$/);
    if (match) return { domain: "INHOUSE", action: "DETAIL", recruitNo: match[1] ? Number(match[1]) : null };
    match = text.match(/^(?:내전현황|시즌내전현황|AI공지)(?:\s*#?\s*(\d{1,3}))?$/);
    if (match) return { domain: "INHOUSE", action: "STATUS", recruitNo: match[1] ? Number(match[1]) : null };
    match = text.match(/^(?:내전참가|내전신청|참가신청)(?:\s*#?\s*(\d{1,3}))?$/);
    if (match) return { domain: "INHOUSE", action: "JOIN", recruitNo: match[1] ? Number(match[1]) : null };
    return null;
  }

  function compactText(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function readLabeledField(text, labels) {
    var lines = text.split("\n");
    var index = 0;
    var labelIndex = 0;
    var line = "";
    var escaped = "";
    var match = null;
    for (index = 0; index < lines.length; index += 1) {
      line = trim(lines[index]);
      for (labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
        escaped = labels[labelIndex].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
        match = line.match(new RegExp("^" + escaped + "\\s*:\\s*(.*)$", "i"));
        if (match) return trim(match[1]) || null;
      }
    }
    return null;
  }

  function cleanScrimValue(value) {
    var result = safeText(value, 160);
    if (/^(?:미정|없음|상대구함|상대\s*구함|모집중|비워두기|공란|-)$/.test(result)) return null;
    return result || null;
  }

  function sectionBetween(text, startPattern, stopPattern) {
    var lines = text.split("\n");
    var active = false;
    var output = [];
    var index = 0;
    var line = "";
    for (index = 0; index < lines.length; index += 1) {
      line = trim(lines[index]);
      if (!active && startPattern.test(line)) { active = true; continue; }
      if (active && stopPattern && stopPattern.test(line)) break;
      if (active) output.push(line);
    }
    return output.join("\n");
  }

  function parseLineup(block, prefixes) {
    var result = { top: null, jungle: null, mid: null, adc: null, support: null };
    var map = { TOP: "top", JGL: "jungle", MID: "mid", ADC: "adc", SUP: "support" };
    var lines = block.split("\n");
    var index = 0;
    var match = null;
    var position = null;
    var key = "";
    var prefixPattern = prefixes ? "(?:" + prefixes.join("|") + ")\\s*" : "";
    var regex = new RegExp("^" + prefixPattern + "(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\\s*[.:]\\s*(.*)$", "i");
    for (index = 0; index < lines.length; index += 1) {
      match = trim(lines[index]).match(regex);
      if (!match) continue;
      position = normalizePosition(match[1]);
      key = map[position];
      if (key && result[key] === null) result[key] = cleanScrimValue(match[2]);
    }
    return result;
  }

  function parseGameRule(text) {
    var series = text.match(/(\d{1,2}\s*판\s*\d{1,2}\s*선|\d{1,2}\s*전\s*\d{1,2}\s*선|BO\s*\d{1,2})/i);
    var game = text.match(/(\d{1,2})\s*(?:판|게임|세트|전)/);
    var count = game ? Number(game[1]) : null;
    return {
      gameCount: validNumber(count, 1, 20) ? count : null,
      seriesRuleText: series ? series[1].replace(/\s+/g, "") : game ? game[0].replace(/\s+/g, "") : null
    };
  }

  function parseScrimCommand(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var withoutSlash = text.replace(/^\//, "");
    var compact = compactText(withoutSlash);
    var match = null;
    var action = null;
    var scrimNo = null;
    var requesterBlock = "";
    var opponentBlock = "";
    var requesterLineup = null;
    var opponentLineup = null;
    var operationDate = null;
    var timeRaw = null;
    var ruleRaw = null;
    var rule = null;
    var tournamentRaw = null;
    var firstNumber = null;
    var args = "";
    var requesterName = null;
    var tournamentNo = null;
    if (!text) return null;

    match = compact.match(/^(?:스크림참가|멸망전스크림참가)#?\d{1,3}.*$/);
    if (match) return { domain: "SCRIM", action: "UNSUPPORTED", unsupportedKind: "JOIN" };
    match = compact.match(/^(?:스크림확정|멸망전스크림확정)#?\d{1,3}.*$/);
    if (match) return { domain: "SCRIM", action: "UNSUPPORTED", unsupportedKind: "CONFIRM" };
    match = compact.match(/^(?:스크림취소|멸망전스크림취소)#?\d{1,3}.*$/);
    if (match) return { domain: "SCRIM", action: "UNSUPPORTED", unsupportedKind: "CANCEL" };
    match = compact.match(/^(?:스크림마감|스크림종료|멸망전스크림마감|멸망전스크림종료)#?\d{1,3}.*$/);
    if (match) return { domain: "SCRIM", action: "UNSUPPORTED", unsupportedKind: "FINISH" };

    match = compact.match(/^(?:스크림상세|멸망전스크림상세)#?(\d{1,3})$/);
    if (match) return { domain: "SCRIM", action: "DETAIL", scrimNo: Number(match[1]) };
    if (/^(?:스크림현황|스크림목록|멸망전스크림현황|멸망전스크림목록)(?:#?\d{1,3})?$/.test(compact)) {
      match = compact.match(/#?(\d{1,3})$/);
      return { domain: "SCRIM", action: "STATUS", scrimNo: match ? Number(match[1]) : null };
    }
    action = /^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)/.test(compact) ||
      /\[?K-?LOL\.GG(?:멸망전)?스크림구인양식\]?/.test(compact) ||
      (/일시\s*:/.test(text) && /방식\s*:/.test(text) && /(?:우리팀|아군팀|요청팀)\s*:/.test(text) && /상대팀\s*:/.test(text));
    if (!action) return null;
    if (/^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)$/.test(compact)) {
      return {
        domain: "SCRIM", action: "CREATE", templateRequest: true, operationDate: null,
        scrimNo: null, tournamentNo: null, requesterTeamName: null, opponentTeamName: null,
        requesterLineup: { top: null, jungle: null, mid: null, adc: null, support: null },
        opponentLineup: { top: null, jungle: null, mid: null, adc: null, support: null },
        startTimeText: null, gameCount: null, seriesRuleText: null, memo: null
      };
    }

    operationDate = dateFromText(readLabeledField(text, ["운영일", "운영 일자"]) || "");
    match = (readLabeledField(text, ["스크림번호", "스크림 번호", "번호"]) || "").match(/#?\s*(\d{1,3})/);
    if (!match) match = text.match(/(?:^|\n)\s*#\s*(\d{1,3})\b/);
    scrimNo = match ? explicitNumber(match[1], 999) : null;
    tournamentRaw = readLabeledField(text, ["멸망전번호", "멸망전 번호", "대회번호", "대회 번호", "tournamentId"]);
    match = tournamentRaw ? tournamentRaw.match(/\d{1,4}/) : null;
    tournamentNo = match ? Number(match[0]) : null;
    timeRaw = readLabeledField(text, ["일시", "시간", "시작시간", "스크림일시"]);
    ruleRaw = readLabeledField(text, ["방식", "판수", "게임수", "진행방식"]);
    rule = parseGameRule(ruleRaw || text);
    requesterBlock = sectionBetween(text, /^\s*(?:우리팀|아군팀|요청팀)(?:명|\s*라인업|\s*명단)?\s*:/i, /^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i);
    opponentBlock = sectionBetween(text, /^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i, /^\s*(?:메모|비고|요청사항)\s*:/i);
    requesterLineup = parseLineup(requesterBlock);
    opponentLineup = parseLineup(opponentBlock);
    if (!requesterLineup.top && !requesterLineup.jungle && !requesterLineup.mid && !requesterLineup.adc && !requesterLineup.support) {
      requesterLineup = parseLineup(text, ["우리", "아군", "요청"]);
    }
    if (!opponentLineup.top && !opponentLineup.jungle && !opponentLineup.mid && !opponentLineup.adc && !opponentLineup.support) {
      opponentLineup = parseLineup(text, ["상대"]);
    }
    requesterName = cleanScrimValue(readLabeledField(text, ["우리팀명", "우리 팀명", "아군팀명", "요청팀명", "우리팀", "요청팀"]));

    if (!/\n/.test(text)) {
      args = trim(withoutSlash.replace(/^(?:스크림\s*구인|스크림\s*모집|멸망전\s*스크림\s*구인|멸망전\s*스크림\s*모집)\s*/i, ""));
      firstNumber = args.match(/^(\d{1,4})(?:\s+|$)/);
      if (firstNumber && tournamentNo === null) tournamentNo = Number(firstNumber[1]);
      if (firstNumber) args = trim(args.substring(firstNumber[0].length));
      if (!requesterName) requesterName = cleanScrimValue((args.split(/\s+/)[0] || ""));
    }
    return {
      domain: "SCRIM", action: "CREATE", templateRequest: false,
      operationDate: operationDate, scrimNo: scrimNo,
      tournamentNo: tournamentNo,
      requesterTeamName: requesterName,
      opponentTeamName: cleanScrimValue(readLabeledField(text, ["상대팀명", "상대 팀명", "상대팀"])),
      requesterLineup: requesterLineup, opponentLineup: opponentLineup,
      startTimeText: timeRaw || timeFromText(" " + text + " ", null),
      gameCount: rule.gameCount, seriesRuleText: rule.seriesRuleText || cleanScrimValue(ruleRaw),
      memo: !/\n/.test(text) ? safeText(args, 500) || null : cleanScrimValue(readLabeledField(text, ["메모", "비고", "요청사항"]))
    };
  }

  function stripFieldPrefix(line) {
    return trim(line).replace(/^\d+\s*[.)]\s*/, "");
  }

  function canonical(value) {
    return trim(value).replace(/\s+/g, "").replace(/[.:()\[\]{}<>·ㆍ,/\\_-]/g, "");
  }

  function startsWithLabel(line, label) {
    return canonical(stripFieldPrefix(line)).indexOf(canonical(label)) === 0;
  }

  function hasLabels(text, labels) {
    var lines = text.split("\n");
    var labelIndex = 0;
    var lineIndex = 0;
    var found = false;
    for (labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
      found = false;
      for (lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        if (startsWithLabel(lines[lineIndex], labels[labelIndex])) { found = true; break; }
      }
      if (!found) return false;
    }
    return true;
  }

  function readOperationField(text, label, nextLabels) {
    var lines = text.split("\n");
    var output = [];
    var startIndex = -1;
    var index = 0;
    var nextIndex = 0;
    var line = "";
    var labelPattern = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
    var labelRegex = new RegExp("^\\s*" + labelPattern + "\\s*[:：]?\\s*", "i");
    for (index = 0; index < lines.length; index += 1) {
      if (startsWithLabel(lines[index], label)) startIndex = index;
    }
    if (startIndex < 0) return "";
    line = stripFieldPrefix(lines[startIndex]);
    output.push(trim(line.replace(labelRegex, "")));
    for (index = startIndex + 1; index < lines.length; index += 1) {
      line = stripFieldPrefix(lines[index]);
      for (nextIndex = 0; nextIndex < nextLabels.length; nextIndex += 1) {
        if (startsWithLabel(line, nextLabels[nextIndex])) break;
      }
      if (nextIndex < nextLabels.length) break;
      output.push(line);
    }
    return trim(output.join("\n"));
  }

  function cleanOperationField(value, maximum) {
    var lines = normalizeText(value).split("\n");
    var output = [];
    var index = 0;
    var line = "";
    for (index = 0; index < lines.length; index += 1) {
      line = trim(lines[index]).replace(/^\s*:\s*/, "").replace(/^\s*-\s*/, "").replace(/^\s*[（(][^）)]*[）)]\s*/, "");
      line = trim(line.replace(/\s*\*\s*(?:EX\)?|예시|선택\s*:|특별한\s*사유\s*없이는)[\s\S]*$/i, ""));
      if (!line || /^\(?\s*(?:소통방\s*,\s*구인방\s*,?\s*디코?|게임명\s*적기|장기\s*,\s*단기\s*,\s*특정\s*게임.*)\s*\)?$/.test(line)) continue;
      output.push(line);
    }
    line = trim(output.join("\n"));
    if (!line || line.length > maximum || /^[.:\-_/()\[\]{}\s]+$/.test(line)) return "";
    return line;
  }

  function splitPerson(value, fallback) {
    var cleaned = cleanOperationField(value, 180);
    var backup = safeText(fallback, 100) || "카카오 사용자";
    var parts = cleaned ? cleaned.split(/\s*(?:\/|\||,|·)\s*/) : [];
    var name = safeText(parts[0] || backup, 100) || backup.substring(0, 100);
    var nickname = safeText(parts[1] || parts[0] || backup, 64) || backup.substring(0, 64);
    return { name: name, nickname: nickname };
  }

  function booleanFromText(value) {
    var compact = canonical(value).toLowerCase();
    if (/^(?:x|아니오|아니요|안함|변경안함|없음|no|false)$/.test(compact)) return false;
    return /(?:o|예|네|변경|yes|true)/.test(compact);
  }

  function participantsFromText(value) {
    var parts = normalizeText(value).split(/\n|,/);
    var output = [];
    var seen = {};
    var index = 0;
    var name = "";
    for (index = 0; index < parts.length; index += 1) {
      name = safeText(parts[index].replace(/^\s*[-*]?\s*\d*\s*[.)]?\s*/, ""), 100);
      if (!name || seen[name]) continue;
      seen[name] = true;
      output.push(name);
      if (output.length > 30) return [];
    }
    return output;
  }

  function parsePeriod(value) {
    var text = cleanOperationField(value, 160);
    var matches = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g) || [];
    var first = matches[0] ? dateFromText(matches[0]) : null;
    var second = matches[1] ? dateFromText(matches[1]) : first;
    if (first && second && second >= first) return { periodStart: first, periodEnd: second, legacyPeriodText: null };
    return text ? { periodStart: null, periodEnd: null, legacyPeriodText: text } : null;
  }

  function scopeFromText(value) {
    var normalized = normalizeText(value);
    var withoutChoices = normalized.replace(/^\s*[（(][^）)]*[）)]\s*/, "");
    var selectedValue = trim(withoutChoices) ? withoutChoices : normalized;
    var text = cleanOperationField(selectedValue, 160);
    var compact = selectedValue.replace(/\s+/g, "");
    var selected = [];
    if (/소통방/.test(compact)) selected.push("소통방");
    if (/구인방/.test(compact)) selected.push("구인방");
    if (/디코|디스코드/.test(compact)) selected.push("디코");
    return selected.length ? selected.join(", ") : text;
  }

  function parseOperationForm(value, sender) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var person = null;
    var field = null;
    var period = null;
    var participants = null;
    var payload = null;
    var missing = [];
    var leaveMarker = false;
    if (!text) return null;
    if (hasLabels(text, ["지인 이름", "지인 닉네임", "이용기간", "디스코드 닉네임 변경"])) {
      person = splitPerson("", sender);
      payload = {
        applicantName: person.name, applicantNickname: person.nickname,
        friendName: cleanOperationField(readOperationField(text, "지인 이름", ["지인 닉네임", "이용기간", "디스코드 닉네임 변경"]), 100),
        friendNickname: cleanOperationField(readOperationField(text, "지인 닉네임", ["이용기간", "디스코드 닉네임 변경"]), 64),
        usagePeriod: cleanOperationField(readOperationField(text, "이용기간", ["디스코드 닉네임 변경"]), 160),
        discordNicknameChange: booleanFromText(readOperationField(text, "디스코드 닉네임 변경", []))
      };
      if (!payload.friendName || !payload.friendNickname || !payload.usagePeriod) return null;
      return { domain: "OPERATION_FORM", action: "SUBMIT", formType: "friends", payload: payload };
    }
    if (hasLabels(text, ["본인 이름 및 닉네임", "건의 사유", "건의 내용"])) {
      person = splitPerson(readOperationField(text, "본인 이름 및 닉네임", ["건의 사유", "건의 내용"]), sender);
      payload = {
        applicantName: person.name, applicantNickname: person.nickname,
        reason: cleanOperationField(readOperationField(text, "건의 사유", ["건의 내용"]), 500),
        content: cleanOperationField(readOperationField(text, "건의 내용", []), 4000)
      };
      if (!payload.reason || !payload.content) return null;
      return { domain: "OPERATION_FORM", action: "SUBMIT", formType: "suggestions", payload: payload };
    }
    if (hasLabels(text, ["주최자 이름 및 닉네임", "일자", "장소", "참여자 명단"])) {
      person = splitPerson(readOperationField(text, "주최자 이름 및 닉네임", ["일자", "장소", "참여자 명단"]), sender);
      field = cleanOperationField(readOperationField(text, "일자", ["장소", "참여자 명단"]), 160);
      participants = participantsFromText(readOperationField(text, "참여자 명단", []));
      payload = {
        hostName: person.name, hostNickname: person.nickname, meetupAt: null,
        legacyDateText: field,
        location: cleanOperationField(readOperationField(text, "장소", ["참여자 명단"]), 240),
        participants: participants
      };
      if (!payload.legacyDateText || !payload.location || participants.length < 1) return null;
      return { domain: "OPERATION_FORM", action: "SUBMIT", formType: "meetups", payload: payload };
    }
    leaveMarker = /(?:<\s*외출\s*>|&lt;\s*외출\s*&gt;)/i.test(text) ||
      hasLabels(text, ["이름 및 닉네임", "외출기간", "외출사유", "외출범위"]);
    if (leaveMarker) {
      person = splitPerson(readOperationField(text, "이름 및 닉네임", ["외출기간", "외출사유", "외출범위"]), sender);
      period = parsePeriod(readOperationField(text, "외출기간", ["외출사유", "외출범위"]));
      payload = {
        applicantName: person.name, applicantNickname: person.nickname,
        periodStart: period ? period.periodStart : null, periodEnd: period ? period.periodEnd : null,
        reason: cleanOperationField(readOperationField(text, "외출사유", ["외출범위"]), 1000),
        scope: scopeFromText(readOperationField(text, "외출범위", []))
      };
      if (period && period.legacyPeriodText) payload.legacyPeriodText = period.legacyPeriodText;
      if (!period) missing.push("외출기간");
      if (!payload.reason) missing.push("외출사유");
      if (!payload.scope) missing.push("외출범위");
      if (missing.length) return { domain: "OPERATION_FORM", action: "INVALID", formType: "leaves", missingFields: missing };
      return { domain: "OPERATION_FORM", action: "SUBMIT", formType: "leaves", payload: payload };
    }
    return null;
  }

  function classifyManagedCommand(value) {
    var checked = validateInput(value);
    var text = checked.ok ? trim(checked.text) : "";
    var compact = text.replace(/\s+/g, "");
    if (!text) return null;
    if (text.charAt(0) === "[" && text.indexOf("양식") >= 0 && /\sv\d+/i.test(text)) {
      if (/징계|경고/.test(text)) return { domain: "MANAGED", action: "DISCIPLINE_CREATE" };
      if (/내전|경기|결과/.test(text)) return { domain: "MANAGED", action: "INHOUSE_RESULT" };
      return { domain: "MANAGED", action: "REGISTRATION_HUB" };
    }
    if (text.indexOf("\n") >= 0) return null;
    if (/^\/?(?:등록|등록도움말)$/.test(compact)) return { domain: "MANAGED", action: "REGISTRATION_HUB" };
    if (/^\/?(?:사진취소|V2사진취소)$/.test(compact)) return { domain: "MANAGED", action: "PHOTO_CANCEL" };
    if (/^\/?(?:내전등록|결과등록|내전결과)(?:\s+.+)?$/.test(text)) return { domain: "MANAGED", action: "INHOUSE_RESULT" };
    if (/^\/?(?:내전등록현황|결과현황)(?:\s+.+)?$/.test(text) || /^\/?내전현황\s+MR[A-F0-9]{10,16}$/i.test(text)) {
      return { domain: "MANAGED", action: "INHOUSE_RESULT_STATUS" };
    }
    if (/^\/?(?:경고등록|경고)(?:\s+.+)?$/.test(text)) return { domain: "MANAGED", action: "DISCIPLINE_CREATE" };
    if (/^\/?(?:인증|경고인증|경고인증완료)(?:\s+.+)?$/.test(text)) return { domain: "MANAGED", action: "DISCIPLINE_EVIDENCE" };
    if (/^\/?경고현황(?:\s+.+)?$/.test(text)) return { domain: "MANAGED", action: "DISCIPLINE_STATUS" };
    return null;
  }

  function classifyMessage(value, sender, fallbackDateKey) {
    var checked = validateInput(value);
    var text = "";
    var parsed = null;
    if (!checked.ok) return { domain: "INPUT", action: "REJECT", error: checked.error };
    text = canonicalCommandText(checked.text);
    parsed = classifyManagedCommand(text);
    if (parsed) return parsed;
    parsed = parseOperationForm(text, sender);
    if (parsed) return parsed;
    parsed = parseInhouseCommand(text, fallbackDateKey);
    if (parsed) return parsed;
    parsed = parseScrimCommand(text);
    if (parsed) return parsed;
    return classifyPartyCommand(text);
  }

  return {
    VERSION: "KLOL_V41_V1_COMPAT_2026_09_09_SLASH_PARITY",
    limits: { maximumInputLength: MAX_INPUT_LENGTH, maximumInputLines: MAX_INPUT_LINES, maximumMembers: MAX_MEMBERS },
    normalizeText: normalizeText,
    canonicalCommandText: canonicalCommandText,
    validateInput: validateInput,
    parsePartyCreateCommand: parsePartyCreateCommand,
    parsePartyFinishCommand: parsePartyFinishCommand,
    parsePartyForm: parsePartyForm,
    isPartyFormWithoutNumber: isPartyFormWithoutNumber,
    classifyPartyCommand: classifyPartyCommand,
    parseInhouseCommand: parseInhouseCommand,
    parseScrimCommand: parseScrimCommand,
    parseOperationForm: parseOperationForm,
    classifyManagedCommand: classifyManagedCommand,
    classifyMessage: classifyMessage
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = KLOL_V41_V1_COMPAT;
