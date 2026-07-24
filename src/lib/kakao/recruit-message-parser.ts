import { addDays, getKstOperationDateKey, getKstStartOfDate } from "@/lib/date/kst";

export type RecruitPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP" | "ALL";
export type RecruitTier =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER"
  | "UNRANKED";

export type ParsedRecruitParticipant = {
  slotNumber: number;
  reserveSlotNumber: number | null;
  isReserve: boolean;
  name: string;
  currentTier: RecruitTier;
  peakTier: RecruitTier;
  mainPosition: RecruitPosition;
  subPosition: RecruitPosition | null;
  rawLine: string;
};

export type ParsedRecruitMessage = {
  applyDate: string;
  applyTime: string | null;
  recruitNo: number;
  participants: ParsedRecruitParticipant[];
  warnings: string[];
};

const POSITION_ALIASES: Record<string, RecruitPosition> = {
  ALL: "ALL",
  ANY: "ALL",
  FILL: "ALL",
  AUTO: "ALL",
  전체: "ALL",
  올: "ALL",
  아무거나: "ALL",
  상관없음: "ALL",
  자유: "ALL",
  TOP: "TOP",
  TOPLINE: "TOP",
  TOPLANE: "TOP",
  T: "TOP",
  탑: "TOP",
  탑라인: "TOP",
  탑솔: "TOP",

  JG: "JGL",
  JGL: "JGL",
  JUNGLE: "JGL",
  JUNG: "JGL",
  JUNGLELINE: "JGL",
  정글: "JGL",
  정글러: "JGL",
  ㅈㄱ: "JGL",

  MID: "MID",
  MIDDLE: "MID",
  MD: "MID",
  M: "MID",
  미드: "MID",
  미드라인: "MID",
  ㅁㄷ: "MID",

  ADC: "ADC",
  AD: "ADC",
  BOTTOM: "ADC",
  BOT: "ADC",
  원딜: "ADC",
  바텀: "ADC",
  봇: "ADC",
  ㅇㄷ: "ADC",

  SUP: "SUP",
  SUPPORT: "SUP",
  SPT: "SUP",
  SP: "SUP",
  서폿: "SUP",
  서포터: "SUP",
  서포트: "SUP",
  ㅅㅍ: "SUP",
};

const TIER_ALIASES: Record<string, RecruitTier> = {
  I: "IRON",
  IRON: "IRON",
  아이언: "IRON",

  B: "BRONZE",
  BRONZE: "BRONZE",
  브론즈: "BRONZE",

  S: "SILVER",
  SILVER: "SILVER",
  실버: "SILVER",

  G: "GOLD",
  GOLD: "GOLD",
  골드: "GOLD",

  P: "PLATINUM",
  PLAT: "PLATINUM",
  PLATINUM: "PLATINUM",
  플레: "PLATINUM",
  플래: "PLATINUM",
  플래티넘: "PLATINUM",

  E: "EMERALD",
  EM: "EMERALD",
  EMERALD: "EMERALD",
  에메: "EMERALD",
  에메랄드: "EMERALD",

  D: "DIAMOND",
  DIA: "DIAMOND",
  DIAMOND: "DIAMOND",
  다이아: "DIAMOND",

  M: "MASTER",
  MASTER: "MASTER",
  마스터: "MASTER",
  마: "MASTER",

  GM: "GRANDMASTER",
  GRANDMASTER: "GRANDMASTER",
  그마: "GRANDMASTER",
  그랜드마스터: "GRANDMASTER",

  C: "CHALLENGER",
  CH: "CHALLENGER",
  CHALLENGER: "CHALLENGER",
  챌: "CHALLENGER",
  챌린저: "CHALLENGER",

  U: "UNRANKED",
  UNRANKED: "UNRANKED",
  UN: "UNRANKED",
  언랭: "UNRANKED",
  언랭크: "UNRANKED",
  무랭: "UNRANKED",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeText(text: string) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[／]/g, "/")
    .replace(/[，]/g, ",")
    .replace(/[：]/g, ":")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[–—]/g, "-")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeToken(text: string) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.,/\\|_-]/g, "")
    .toUpperCase();
}

function isParticipantNumberLine(line: string) {
  return /^\s*\d{1,2}\s*[.)]\s*/.test(line) || /^\s*예비\s*\d{1,2}\s*[.)]\s*/.test(line);
}


function isExampleLine(line: string) {
  const normalized = line.toUpperCase();
  return (
    normalized.includes("EX)") ||
    normalized.includes("EX.") ||
    normalized.includes("예시") ||
    normalized.includes("양식")
  );
}

function removeParticipantAndExampleLines(text: string) {
  return normalizeText(text)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) return true;
      if (isExampleLine(trimmed)) return false;
      if (isParticipantNumberLine(trimmed)) return false;

      return true;
    })
    .join("\n");
}

function safeDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (year < 2020 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return toDateKey(year, month, day);
}

function extractTimeFromHeader(text: string) {
  const headerText = removeParticipantAndExampleLines(text);

  const timeMatch =
    headerText.match(/(?:^|\s)([01]?\d|2[0-3])\s*[:시]\s*([0-5]\d)?\s*(?:분)?/) ||
    headerText.match(/(?:오후|PM)\s*([1-9]|1[0-2])\s*시?/i) ||
    headerText.match(/(?:오전|AM)\s*([0-9]|1[0-2])\s*시?/i);

  if (!timeMatch) return null;

  const raw = timeMatch[0];
  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;

  if (/오후|PM/i.test(raw) && hour < 12) hour += 12;
  if (/오전|AM/i.test(raw) && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${pad2(hour)}:${pad2(minute)}`;
}

export function extractRecruitNoFromMessage(text: string) {
  const headerText = removeParticipantAndExampleLines(normalizeText(text));

  const patterns = [
    /(?:^|\n)\s*#\s*(\d{1,3})\s*(?:$|\n)/i,
    /(?:내전\s*(?:번호|NO|No|no)\s*[:：]?\s*#?\s*)(\d{1,3})/i,
    /#\s*(\d{1,3})\s*(?:협곡\s*내전|협곡내전|내전)/i,
    /(?:협곡\s*내전|협곡내전|내전)\s*(?:하실분|하실\s*분|구인|모집)?\s*#\s*(\d{1,3})/i,
    /(?:협곡\s*내전|협곡내전|내전)\s*#\s*(\d{1,3})/i,
  ];

  for (const pattern of patterns) {
    const match = headerText.match(pattern);
    if (!match) continue;

    const recruitNo = Number(match[1]);
    if (Number.isInteger(recruitNo) && recruitNo >= 1 && recruitNo <= 999) {
      return recruitNo;
    }
  }

  return 1;
}

export function extractRecruitApplyDate(
  text: string,
  baseDate = new Date()
): { applyDate: string; applyTime: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const normalized = normalizeText(text);
  const headerText = removeParticipantAndExampleLines(normalized);
  const operationDateKey = getKstOperationDateKey(baseDate);
  const [operationYear, operationMonth, operationDay] = operationDateKey.split("-").map(Number);
  const currentYear = operationYear;

  const explicitAfterMark = headerText.match(
    /[》>▶📢]?\s*(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*(?:일)?/
  );

  if (explicitAfterMark) {
    const date = safeDate(
      Number(explicitAfterMark[1]),
      Number(explicitAfterMark[2]),
      Number(explicitAfterMark[3])
    );

    if (date) {
      return {
        applyDate: date,
        applyTime: extractTimeFromHeader(headerText),
        warnings,
      };
    }
  }

  const fullDate = headerText.match(
    /\b(20\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\b/
  );

  if (fullDate) {
    const date = safeDate(Number(fullDate[1]), Number(fullDate[2]), Number(fullDate[3]));

    if (date) {
      return {
        applyDate: date,
        applyTime: extractTimeFromHeader(headerText),
        warnings,
      };
    }
  }

  const koreanDateWithYear = headerText.match(
    /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/
  );

  if (koreanDateWithYear) {
    const date = safeDate(
      Number(koreanDateWithYear[1]),
      Number(koreanDateWithYear[2]),
      Number(koreanDateWithYear[3])
    );

    if (date) {
      return {
        applyDate: date,
        applyTime: extractTimeFromHeader(headerText),
        warnings,
      };
    }
  }

  const koreanDateNoYear = headerText.match(/(?:^|\s)(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);

  if (koreanDateNoYear) {
    const month = Number(koreanDateNoYear[1]);
    const day = Number(koreanDateNoYear[2]);
    const date = safeDate(currentYear, month, day);

    if (date) {
      return {
        applyDate: date,
        applyTime: extractTimeFromHeader(headerText),
        warnings,
      };
    }
  }

  const dotDateNoYear = headerText.match(/(?:^|\s)(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s|$)/);

  if (dotDateNoYear) {
    const month = Number(dotDateNoYear[1]);
    const day = Number(dotDateNoYear[2]);
    const date = safeDate(currentYear, month, day);

    if (date) {
      return {
        applyDate: date,
        applyTime: extractTimeFromHeader(headerText),
        warnings,
      };
    }
  }

  if (/내일|익일/.test(headerText)) {
    const tomorrow = addDays(getKstStartOfDate(operationDateKey), 1);

    return {
      applyDate: getKstOperationDateKey(tomorrow, 0),
      applyTime: extractTimeFromHeader(headerText),
      warnings,
    };
  }

  if (/오늘|금일|당일/.test(headerText)) {
    return {
      applyDate: toDateKey(operationYear, operationMonth, operationDay),
      applyTime: extractTimeFromHeader(headerText),
      warnings,
    };
  }

  warnings.push("신청일을 찾지 못해 서버 기준 오늘 날짜로 처리했습니다.");

  return {
    applyDate: toDateKey(operationYear, operationMonth, operationDay),
    applyTime: extractTimeFromHeader(headerText),
    warnings,
  };
}

function normalizeTier(raw: string): RecruitTier | null {
  const token = normalizeToken(raw);
  if (!token) return null;

  if (TIER_ALIASES[token]) return TIER_ALIASES[token];

  const withoutRank = token.replace(/[1-4IV]+$/g, "");
  if (TIER_ALIASES[withoutRank]) return TIER_ALIASES[withoutRank];

  return null;
}

function normalizePosition(raw: string): RecruitPosition | null {
  const token = normalizeToken(raw);
  if (!token) return null;

  if (POSITION_ALIASES[token]) return POSITION_ALIASES[token];

  return null;
}

function splitPositionText(raw: string) {
  return String(raw || "")
    .replace(/\+/g, " ")
    .replace(/,/g, " ")
    .replace(/\//g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function parseParticipantLine(line: string): {
  participant: ParsedRecruitParticipant | null;
  warning: string | null;
} {
  const originalLine = String(line || "");
  const trimmed = originalLine.trim();

  if (!isParticipantNumberLine(trimmed)) {
    return { participant: null, warning: null };
  }

  if (isExampleLine(trimmed)) {
    return { participant: null, warning: null };
  }

  const reserveSlotMatch = trimmed.match(/^\s*예비\s*(\d{1,2})\s*[.)]\s*(.*)$/);
  const slotMatch = reserveSlotMatch || trimmed.match(/^\s*(\d{1,2})\s*[.)]\s*(.*)$/);

  if (!slotMatch) {
    return { participant: null, warning: null };
  }

  const isReserve = Boolean(reserveSlotMatch);
  const slotNumber = Number(slotMatch[1]);
  const reserveSlotNumber = isReserve ? slotNumber : null;
  const body = slotMatch[2].trim();

  if (!body) {
    return { participant: null, warning: null };
  }

  const slashParts = body.replace(/／/g, "/").split("/").map((item) => item.trim());

  if (slashParts.length < 4) {
    return {
      participant: null,
      warning: `참가자 ${slotNumber}번은 양식이 부족해 제외했습니다: ${originalLine}`,
    };
  }

  const name = slashParts[0];
  const currentTierRaw = slashParts[1];
  const peakTierRaw = slashParts[2];
  const positionRaw = slashParts.slice(3).join(" ");

  if (!name) {
    return {
      participant: null,
      warning: `참가자 ${slotNumber}번은 이름이 없어 제외했습니다.`,
    };
  }

  const currentTier = normalizeTier(currentTierRaw);
  const peakTier = normalizeTier(peakTierRaw);

  if (!currentTier || !peakTier) {
    return {
      participant: null,
      warning: `참가자 ${slotNumber}번은 티어 인식 실패로 제외했습니다: ${originalLine}`,
    };
  }

  const positionTokens = splitPositionText(positionRaw);
  const positions: RecruitPosition[] = [];

  for (const token of positionTokens) {
    const position = normalizePosition(token);

    if (position && !positions.includes(position)) {
      positions.push(position);
    }
  }

  if (positions.length < 1) {
    return {
      participant: null,
      warning: `참가자 ${slotNumber}번은 포지션 인식 실패로 제외했습니다: ${originalLine}`,
    };
  }

  return {
    participant: {
      slotNumber,
      reserveSlotNumber,
      isReserve,
      name,
      currentTier,
      peakTier,
      mainPosition: positions[0],
      subPosition: positions[1] || null,
      rawLine: originalLine,
    },
    warning: null,
  };
}

export function parseRecruitMessage(text: string, baseDate = new Date()): ParsedRecruitMessage {
  const normalized = normalizeText(text);
  const dateResult = extractRecruitApplyDate(normalized, baseDate);
  const warnings = [...dateResult.warnings];
  const participants: ParsedRecruitParticipant[] = [];
  const seenSlots = new Set<string>();
  const seenNames = new Set<string>();

  const lines = normalized.split("\n");

  for (const line of lines) {
    const result = parseParticipantLine(line);

    if (result.warning) {
      warnings.push(result.warning);
    }

    if (!result.participant) {
      continue;
    }

    const participant = result.participant;
    const nameKey = `${participant.isReserve ? "reserve" : "main"}:${participant.name.replace(/\s+/g, "").toLowerCase()}`;
    const slotKey = `${participant.isReserve ? "reserve" : "main"}:${participant.slotNumber}`;

    if (seenSlots.has(slotKey)) {
      warnings.push(`${participant.isReserve ? "예비 " : "참가자 "}${participant.slotNumber}번이 중복되어 뒤 항목을 제외했습니다.`);
      continue;
    }

    if (seenNames.has(nameKey)) {
      warnings.push(`${participant.name}님이 중복되어 뒤 항목을 제외했습니다.`);
      continue;
    }

    seenSlots.add(slotKey);
    seenNames.add(nameKey);
    participants.push(participant);
  }

  participants.sort((a, b) => {
    if (a.isReserve !== b.isReserve) return a.isReserve ? 1 : -1;
    return a.slotNumber - b.slotNumber;
  });

  return {
    applyDate: dateResult.applyDate,
    applyTime: dateResult.applyTime,
    recruitNo: extractRecruitNoFromMessage(normalized),
    participants,
    warnings,
  };
}
