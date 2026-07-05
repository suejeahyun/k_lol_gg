import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";

export type ScrimAction = "CREATE" | "STATUS" | "JOIN" | "CONFIRM" | "FINISH" | "CANCEL" | "DETAIL";

export type ScrimLineup = {
  top: string | null;
  jungle: string | null;
  mid: string | null;
  adc: string | null;
  support: string | null;
};

export type ScrimCreateCommand = {
  isTemplateRequest: boolean;
  scrimNo: number | null;
  tournamentId: number | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  requesterLineup: ScrimLineup;
  opponentLineup: ScrimLineup;
  startTimeText: string | null;
  scheduledAt: Date | null;
  gameCount: number | null;
  seriesRuleText: string | null;
  memo: string | null;
};

export type ScrimNumberCommand = {
  scrimNo: number;
  teamName?: string | null;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const EMPTY_LINEUP: ScrimLineup = { top: null, jungle: null, mid: null, adc: null, support: null };

export function normalizeScrimMultiline(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/　/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/／/g, "/")
    .replace(/：/g, ":")
    .replace(/，/g, ",")
    .replace(/–|—/g, "-")
    .replace(/０/g, "0")
    .replace(/１/g, "1")
    .replace(/２/g, "2")
    .replace(/３/g, "3")
    .replace(/４/g, "4")
    .replace(/５/g, "5")
    .replace(/６/g, "6")
    .replace(/７/g, "7")
    .replace(/８/g, "8")
    .replace(/９/g, "9")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeScrimText(value: string) {
  return normalizeScrimMultiline(value).replace(/\s+/g, " ").trim();
}

function compact(value: string) {
  return normalizeScrimMultiline(value).replace(/\s+/g, "");
}

export function getScrimRecruitDateKey(now = new Date()) {
  return getKakaoRecruitDateKey(now);
}

function toUtcFromKst(params: { month: number; day: number; hour: number; minute: number; base?: Date }) {
  const base = params.base ?? new Date();
  const kst = new Date(base.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  return new Date(Date.UTC(year, params.month - 1, params.day, params.hour, params.minute, 0, 0) - KST_OFFSET_MS);
}

export function parseScrimScheduledAt(text: string, base = new Date()) {
  const normalized = normalizeScrimText(text);
  const full = normalized.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s+(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?/);
  if (full) {
    let hour = Number(full[4]);
    const minute = full[5] ? Number(full[5]) : 0;
    if (full[3] === "오후" && hour < 12) hour += 12;
    if (full[3] === "오전" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return {
        text: `${Number(full[1])}/${Number(full[2])} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        date: toUtcFromKst({ month: Number(full[1]), day: Number(full[2]), hour, minute, base }),
      };
    }
  }

  const timeOnly = normalized.match(/(?:^|\s)(오전|오후)?\s*(\d{1,2})(?:\s*[:시]\s*(\d{1,2}))?\s*(?:분)?(?:\s|$)/);
  if (!timeOnly) return { text: null, date: null };

  let hour = Number(timeOnly[2]);
  const minute = timeOnly[3] ? Number(timeOnly[3]) : 0;
  if (timeOnly[1] === "오후" && hour < 12) hour += 12;
  if (timeOnly[1] === "오전" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { text: null, date: null };

  const kst = new Date(base.getTime() + KST_OFFSET_MS);
  const date = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hour, minute, 0, 0) - KST_OFFSET_MS);
  return { text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, date };
}

export function isScrimTemplateRequest(message: string) {
  const normalized = compact(message).replace(/^\//, "");
  return normalized === "스크림구인" || normalized === "스크림모집" || normalized === "멸망전스크림구인" || normalized === "멸망전스크림모집";
}

export function isScrimRecruitFormMessage(message: string) {
  const text = normalizeScrimMultiline(message);
  const normalized = compact(text);

  if (/\[?K-?LOL\.GG스크림구인양식\]?/.test(normalized)) return true;
  if (/\[?K-?LOL\.GG멸망전스크림구인양식\]?/.test(normalized)) return true;

  const hasBaseFields = /일시\s*[:：]/.test(text) && /방식\s*[:：]/.test(text);
  const hasTeams = /(우리팀|아군팀|요청팀)\s*[:：]/.test(text) && /상대팀\s*[:：]/.test(text);
  const hasLanes = /(^|\n)\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]/i.test(text);
  if (hasBaseFields && hasTeams && hasLanes) return true;

  // Backward compatibility for the previous template while older bot code may still be installed.
  if (/스크림번호\s*[:：]/.test(text) && /(우리팀|아군팀|요청팀)/.test(text) && /상대팀/.test(text)) return true;
  if (/멸망전\s*(번호|ID)\s*[:：]/.test(text) && hasBaseFields && hasTeams) return true;

  return false;
}

export function parseScrimAction(message: string): ScrimAction | null {
  const text = normalizeScrimMultiline(message).replace(/^\//, "");
  const normalized = compact(text);

  if (isScrimRecruitFormMessage(message)) return "CREATE";
  if (/^(스크림구인|스크림모집|멸망전스크림구인|멸망전스크림모집)/.test(normalized)) return "CREATE";
  if (/^(스크림현황|스크림목록|멸망전스크림현황|멸망전스크림목록)/.test(normalized)) return "STATUS";
  if (/^(스크림상세|멸망전스크림상세)/.test(normalized)) return "DETAIL";
  if (/^(스크림참가|스크림신청|멸망전스크림참가|멸망전스크림신청)/.test(normalized)) return "JOIN";
  if (/^(스크림확정|멸망전스크림확정)/.test(normalized)) return "CONFIRM";
  if (/^(스크림완료|스크림마감|멸망전스크림완료|멸망전스크림마감)/.test(normalized)) return "FINISH";
  if (/^(스크림취소|멸망전스크림취소)/.test(normalized)) return "CANCEL";

  return null;
}

function readField(text: string, labels: string[]) {
  const lines = normalizeScrimMultiline(text).split("\n");
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"));
  const re = new RegExp(`^\\s*(?:${escaped.join("|")})\\s*[:：]\\s*(.*)\\s*$`, "i");

  for (const line of lines) {
    const match = line.match(re);
    if (match) return match[1]?.trim() || null;
  }

  return null;
}

function readLineValue(text: string, labels: string[]) {
  const lines = normalizeScrimMultiline(text).split("\n");
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`^\\s*(?:${escaped.join("|")})\\s*[.:：]\\s*(.*)\\s*$`, "i");

  for (const line of lines) {
    const match = line.match(re);
    if (match) return cleanValue(match[1]);
  }

  return null;
}

function extractSection(text: string, startLabels: RegExp[], stopLabels: RegExp[]) {
  const lines = normalizeScrimMultiline(text).split("\n");
  const out: string[] = [];
  let active = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!active && startLabels.some((re) => re.test(trimmed))) {
      active = true;
      continue;
    }
    if (active && stopLabels.some((re) => re.test(trimmed))) break;
    if (active) out.push(line);
  }

  return out.join("\n").trim();
}

function cleanValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^(미정|없음|상대구함|상대 구함|비워두기|공란|-)$/.test(text)) return null;
  return text;
}

export function hasScrimLineupValue(lineup: ScrimLineup) {
  return Boolean(lineup.top || lineup.jungle || lineup.mid || lineup.adc || lineup.support);
}

function parseLineupBlock(block: string): ScrimLineup {
  if (!block) return { ...EMPTY_LINEUP };

  return {
    top: readLineValue(block, ["TOP", "TOPLANE", "TOP LANE", "탑"]),
    jungle: readLineValue(block, ["JUG", "JGL", "JG", "JUNGLE", "정글"]),
    mid: readLineValue(block, ["MID", "MIDDLE", "미드"]),
    adc: readLineValue(block, ["ADC", "AD", "BOT", "BOTTOM", "원딜"]),
    support: readLineValue(block, ["SUP", "SUPPORT", "서폿", "서포터"]),
  };
}

function parseLineupByPrefix(text: string, prefixLabels: string[]): ScrimLineup {
  const escapedPrefix = prefixLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const source = normalizeScrimMultiline(text);
  const result: ScrimLineup = { ...EMPTY_LINEUP };
  const laneMap: Array<[keyof ScrimLineup, string[]]> = [
    ["top", ["TOP", "탑"]],
    ["jungle", ["JUG", "JGL", "JG", "정글"]],
    ["mid", ["MID", "미드"]],
    ["adc", ["ADC", "AD", "원딜"]],
    ["support", ["SUP", "서폿", "서포터"]],
  ];

  for (const [key, lanes] of laneMap) {
    const lane = lanes.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const re = new RegExp(`^\\s*(?:${escapedPrefix})\\s*(?:${lane})\\s*[.:：]\\s*(.*)\\s*$`, "im");
    const match = source.match(re);
    if (match) result[key] = cleanValue(match[1]);
  }

  return result;
}

function parseScrimNo(value: string | null) {
  if (!value) return null;
  if (/신규|새로|새글|생성/i.test(value)) return null;
  const match = value.match(/#?\s*(\d{1,3})/);
  if (!match) return null;
  const scrimNo = Number(match[1]);
  return Number.isInteger(scrimNo) && scrimNo >= 1 && scrimNo <= 999 ? scrimNo : null;
}

function parseGameRule(text: string) {
  const normalized = normalizeScrimText(text);
  const series = normalized.match(/(\d{1,2}\s*판\s*\d{1,2}\s*선|\d{1,2}\s*전\s*\d{1,2}\s*선|BO\s*\d{1,2}|bo\s*\d{1,2})/i);
  const game = normalized.match(/(\d{1,2})\s*(?:판|게임|세트|전)/);
  const gameCount = game ? Number(game[1]) : null;

  return {
    gameCount: Number.isInteger(gameCount) && gameCount! > 0 && gameCount! <= 20 ? gameCount : null,
    seriesRuleText: series ? series[1].replace(/\s+/g, "") : game ? game[0].replace(/\s+/g, "") : null,
  };
}

function parseFormCreateCommand(message: string): ScrimCreateCommand | null {
  const text = normalizeScrimMultiline(message);
  const scrimNo = parseScrimNo(readField(text, ["스크림번호", "스크림 번호", "번호"]));
  const tournamentRaw = readField(text, ["멸망전번호", "멸망전 번호", "대회번호", "대회 번호", "tournamentId"]);
  const tournamentIdMatch = tournamentRaw?.match(/\d{1,4}/);
  const tournamentId = tournamentIdMatch ? Number(tournamentIdMatch[0]) : null;
  const requesterTeamName = cleanValue(readField(text, ["우리팀명", "우리 팀명", "아군팀명", "요청팀명", "우리팀", "요청팀"]));
  const opponentTeamName = cleanValue(readField(text, ["상대팀명", "상대 팀명", "상대팀"]));
  const timeRaw = readField(text, ["일시", "시간", "시작시간", "스크림일시"]);
  const ruleRaw = readField(text, ["방식", "판수", "게임수", "진행방식"]);
  const schedule = parseScrimScheduledAt(timeRaw || text);
  const gameRule = parseGameRule(ruleRaw || text);

  const requesterBlock = extractSection(
    text,
    [/^\s*(우리팀|아군팀|요청팀)(?:명|\s*라인업|\s*명단)?\s*[:：]/i, /^\s*(우리팀|아군팀|요청팀)\s*(라인업|명단)\s*$/i],
    [/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*[:：]/i, /^\s*상대팀\s*(라인업|명단)\s*$/i, /^\s*(메모|비고|요청사항)\s*[:：]/i],
  );
  const opponentBlock = extractSection(
    text,
    [/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*[:：]/i, /^\s*상대팀\s*(라인업|명단)\s*$/i],
    [/^\s*(메모|비고|요청사항)\s*[:：]/i],
  );

  const requesterLineupFromBlock = parseLineupBlock(requesterBlock);
  const opponentLineupFromBlock = parseLineupBlock(opponentBlock);
  const requesterLineup = hasScrimLineupValue(requesterLineupFromBlock)
    ? requesterLineupFromBlock
    : parseLineupByPrefix(text, ["우리", "아군", "요청"]);
  const opponentLineup = hasScrimLineupValue(opponentLineupFromBlock)
    ? opponentLineupFromBlock
    : parseLineupByPrefix(text, ["상대"]);

  if (!tournamentId && !requesterTeamName && !opponentTeamName && !schedule.text && !gameRule.gameCount && !hasScrimLineupValue(requesterLineup) && !hasScrimLineupValue(opponentLineup)) {
    return null;
  }

  return {
    isTemplateRequest: false,
    scrimNo,
    tournamentId,
    requesterTeamName,
    opponentTeamName,
    requesterLineup,
    opponentLineup,
    startTimeText: schedule.text || timeRaw || null,
    scheduledAt: schedule.date,
    gameCount: gameRule.gameCount,
    seriesRuleText: gameRule.seriesRuleText || ruleRaw || null,
    memo: null,
  };
}

export function parseScrimCreateCommand(message: string): ScrimCreateCommand | null {
  if (isScrimTemplateRequest(message)) {
    return {
      isTemplateRequest: true,
      scrimNo: null,
      tournamentId: null,
      requesterTeamName: null,
      opponentTeamName: null,
      requesterLineup: { ...EMPTY_LINEUP },
      opponentLineup: { ...EMPTY_LINEUP },
      startTimeText: null,
      scheduledAt: null,
      gameCount: null,
      seriesRuleText: null,
      memo: null,
    };
  }

  if (isScrimRecruitFormMessage(message)) return parseFormCreateCommand(message);

  let text = normalizeScrimText(message).replace(/^\//, "");
  text = text.replace(/^(스크림\s*구인|스크림\s*모집|멸망전\s*스크림\s*구인|멸망전\s*스크림\s*모집)\s*/i, "").trim();

  if (!text) return null;

  let tournamentId: number | null = null;
  const firstNumber = text.match(/^(\d{1,4})(?:\s+|$)/);
  if (firstNumber) {
    tournamentId = Number(firstNumber[1]);
    text = text.slice(firstNumber[0].length).trim();
  }

  const gameRule = parseGameRule(text);
  const schedule = parseScrimScheduledAt(text);
  let cleaned = text;
  if (gameRule.seriesRuleText) cleaned = cleaned.replace(/\d{1,2}\s*(?:판|전)\s*\d{1,2}\s*선|BO\s*\d{1,2}/i, " ").trim();
  else if (gameRule.gameCount) cleaned = cleaned.replace(/\d{1,2}\s*(?:판|게임|세트|전)/, " ").trim();
  if (schedule.text) {
    cleaned = cleaned
      .replace(/\d{1,2}\s*[\/.-]\s*\d{1,2}\s+(오전|오후)?\s*\d{1,2}(?:\s*[:시]\s*\d{1,2})?/, " ")
      .replace(/(?:오전|오후)?\s*\d{1,2}(?:\s*[:시]\s*\d{1,2})?\s*(?:분)?/, " ")
      .trim();
  }

  const requesterTeamName = cleaned.split(/\s+/).filter(Boolean)[0] || null;

  return {
    isTemplateRequest: false,
    scrimNo: null,
    tournamentId,
    requesterTeamName,
    opponentTeamName: null,
    requesterLineup: { ...EMPTY_LINEUP },
    opponentLineup: { ...EMPTY_LINEUP },
    startTimeText: schedule.text,
    scheduledAt: schedule.date,
    gameCount: gameRule.gameCount,
    seriesRuleText: gameRule.seriesRuleText,
    memo: text || null,
  };
}

export function parseScrimNumberCommand(message: string): ScrimNumberCommand | null {
  let text = normalizeScrimText(message).replace(/^\//, "");
  text = text.replace(/^(스크림\s*상세|스크림\s*참가|스크림\s*신청|스크림\s*확정|스크림\s*완료|스크림\s*마감|스크림\s*취소|멸망전\s*스크림\s*상세|멸망전\s*스크림\s*참가|멸망전\s*스크림\s*신청|멸망전\s*스크림\s*확정|멸망전\s*스크림\s*완료|멸망전\s*스크림\s*마감|멸망전\s*스크림\s*취소)\s*/i, "").trim();

  const match = text.match(/^#?\s*(\d{1,3})(?:\s+(.+))?$/);
  if (!match) return null;

  const scrimNo = Number(match[1]);
  if (!Number.isInteger(scrimNo) || scrimNo < 1 || scrimNo > 999) return null;

  return {
    scrimNo,
    teamName: match[2]?.trim() || null,
  };
}

export function formatScrimTime(value: Date | string | null | undefined, fallback?: string | null) {
  if (!value) return fallback || "미정";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback || "미정";
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const hour = String(kst.getUTCHours()).padStart(2, "0");
  const minute = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
}

export function getScrimStatusLabel(status: string) {
  if (status === "RECRUITING") return "모집중";
  if (status === "MATCHED") return "상대 신청";
  if (status === "CONFIRMED") return "확정";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELED") return "취소";
  return status;
}

function lineupToText(lineup: ScrimLineup | null | undefined) {
  const safeLineup = lineup || EMPTY_LINEUP;
  return [
    `TOP: ${safeLineup.top || ""}`,
    `JUG: ${safeLineup.jungle || ""}`,
    `MID: ${safeLineup.mid || ""}`,
    `ADC: ${safeLineup.adc || ""}`,
    `SUP: ${safeLineup.support || ""}`,
  ].join("\n");
}

export function buildScrimRecruitTemplate() {
  return [
    "[K-LOL.GG 스크림 구인 양식]",
    "",
    "일시: ",
    "방식: 3판2선",
    "",
    "우리팀: ",
    "TOP: ",
    "JUG: ",
    "MID: ",
    "ADC: ",
    "SUP: ",
    "",
    "상대팀: ",
    "TOP: ",
    "JUG: ",
    "MID: ",
    "ADC: ",
    "SUP: ",
  ].join("\n");
}


export function buildScrimFormFromData(scrim: {
  scrimNo: number;
  tournamentId: number;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  requesterLineupJson?: unknown;
  opponentLineupJson?: unknown;
  startTimeText: string | null;
  scheduledAt: Date | string | null;
  gameCount: number | null;
  seriesRuleText?: string | null;
  memo?: string | null;
}) {
  const requesterLineup = (scrim.requesterLineupJson || EMPTY_LINEUP) as ScrimLineup;
  const opponentLineup = (scrim.opponentLineupJson || EMPTY_LINEUP) as ScrimLineup;
  return [
    `일시: ${formatScrimTime(scrim.scheduledAt, scrim.startTimeText)}`,
    `방식: ${scrim.seriesRuleText || (scrim.gameCount ? `${scrim.gameCount}판` : "")}`,
    "",
    `우리팀: ${scrim.requesterTeamName || ""}`,
    lineupToText(requesterLineup || EMPTY_LINEUP),
    "",
    `상대팀: ${scrim.opponentTeamName || ""}`,
    lineupToText(opponentLineup || EMPTY_LINEUP),
  ].join("\n");
}


export function formatScrimLine(scrim: {
  scrimNo: number;
  title: string;
  status: string;
  startTimeText: string | null;
  scheduledAt: Date | string | null;
  gameCount: number | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  seriesRuleText?: string | null;
}) {
  const teams = `${scrim.requesterTeamName || "요청팀 미정"} vs ${scrim.opponentTeamName || "상대구함"}`;
  const gameText = scrim.seriesRuleText || (scrim.gameCount ? `${scrim.gameCount}판` : "판수 미정");
  return `#${scrim.scrimNo} ${teams} / ${formatScrimTime(scrim.scheduledAt, scrim.startTimeText)} / ${gameText} / ${getScrimStatusLabel(scrim.status)}`;
}

export function buildScrimStatusReply(scrims: Array<Parameters<typeof formatScrimLine>[0]>) {
  if (scrims.length === 0) {
    return [
      "[K-LOL.GG 스크림 현황]",
      "",
      "현재 모집중/확정된 스크림이 없습니다.",
    ].join("\n");
  }

  return [
    "[K-LOL.GG 스크림 현황]",
    "",
    ...scrims.map(formatScrimLine),
  ].join("\n");
}
