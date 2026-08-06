export type InhouseRecruitMode = "RIFT" | "ARAM" | "AUGMENT_ARAM";

export type ParsedInhouseRecruitCommand = {
  isCommand: boolean;
  mode: InhouseRecruitMode | null;
  dateKey: string;
  time: string;
  recruitNo: number | null;
  capacity: number;
  invalidMode: string | null;
};

const MODE_LABEL: Record<InhouseRecruitMode, string> = {
  RIFT: "협곡",
  ARAM: "칼바람",
  AUGMENT_ARAM: "증바람",
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDateKey(value: string, fallback: string) {
  const match = value.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (!match) return fallback;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return fallback;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function normalizeTime(value: string) {
  const match =
    value.match(/(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/) ||
    value.match(/(?:^|\s)([01]?\d|2[0-3])\s*시(?:\s*([0-5]\d)\s*분?)?(?:\s|$)/);

  if (!match) return "21:00";
  return `${pad2(Number(match[1]))}:${pad2(Number(match[2] || 0))}`;
}

function parseMode(value: string): InhouseRecruitMode | null {
  const compact = value.replace(/\s+/g, "").toLowerCase();

  if (/^(협곡|소환사의협곡|rift)$/.test(compact)) return "RIFT";
  if (/^(칼바람|칼바람아수라장|aram)$/.test(compact)) return "ARAM";
  if (/^(증바람|증바|증강칼바람|augmentaram)$/.test(compact)) return "AUGMENT_ARAM";
  return null;
}

export function parseInhouseRecruitCommand(
  message: unknown,
  fallbackDateKey: string,
): ParsedInhouseRecruitCommand {
  const text = String(message || "").trim().replace(/^\//, "");
  const commandMatch = text.match(/^(?:내전구인구직|내전구인)(?:\s+(.*))?$/i);

  if (!commandMatch) {
    return {
      isCommand: false,
      mode: null,
      dateKey: fallbackDateKey,
      time: "21:00",
      recruitNo: null,
      capacity: 10,
      invalidMode: null,
    };
  }

  const args = String(commandMatch[1] || "").trim();
  const firstToken = args.split(/\s+/)[0] || "";
  const mode = firstToken ? parseMode(firstToken) : null;
  const recruitNoMatch = args.match(/(?:^|\s)#(\d{1,3})(?:\s|$)/);
  const capacityMatch = args.match(/(?:^|\s)(\d{1,2})\s*명(?:\s|$)/);
  const recruitNo = recruitNoMatch ? Number(recruitNoMatch[1]) : null;
  const requestedCapacity = capacityMatch ? Number(capacityMatch[1]) : 10;

  return {
    isCommand: true,
    mode,
    dateKey: normalizeDateKey(args, fallbackDateKey),
    time: normalizeTime(` ${args} `),
    recruitNo:
      recruitNo != null && recruitNo >= 1 && recruitNo <= 999 ? recruitNo : null,
    capacity: Math.min(Math.max(requestedCapacity, 2), 20),
    invalidMode: firstToken && !mode ? firstToken : null,
  };
}

export function buildInhouseRecruitSelectionReply(invalidMode?: string | null) {
  return [
    "[K-LOL.GG 내전 종목 선택]",
    invalidMode ? `지원하지 않는 종목입니다: ${invalidMode}` : null,
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
    "칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildInhouseRecruitTemplate(params: {
  mode: InhouseRecruitMode;
  dateKey: string;
  time?: string | null;
  recruitNo?: number | null;
  capacity?: number;
  participantLines?: string[];
}) {
  const recruitNo = params.recruitNo || 1;
  const capacity = Math.min(Math.max(params.capacity || 10, 2), 20);
  const participantLines = params.participantLines || [];
  const lines = [
    `📢 내전하실분 #${recruitNo}`,
    ` 》${MODE_LABEL[params.mode]}`,
    ` 》${params.dateKey} ${params.time || "21:00"} 시작`,
    `👥 ${participantLines.filter(Boolean).length}/${capacity}명`,
    "",
    "*참가 신청 양식*",
  ];

  if (params.mode === "RIFT") {
    lines.push("이름/현티어/최고티어/주라인/부라인");
    lines.push("EX) 1.지후/P/E/AD/MD");
  } else {
    lines.push("이름");
    lines.push("EX) 1.지후");
  }

  lines.push("");

  for (let index = 0; index < capacity; index += 1) {
    lines.push(`${index + 1}.${participantLines[index] ? ` ${participantLines[index]}` : ""}`);
  }

  return lines.join("\n");
}

export function isRiftInhouseRecruitSnapshot(message: unknown) {
  const text = String(message || "").replace(/\r/g, "\n");
  const hasNumberedSlots = /^\s*(?:1|예비\s*1)\s*[.)]/m.test(text);
  const hasRecruitHeader = /참가\s*신청\s*양식|내전하실분|내전\s*(?:구인|모집)/.test(text);
  const explicitlyRift = /》\s*(?:협곡|소환사의\s*협곡)|협곡\s*내전|협곡내전/.test(text);
  const hasRiftFields = /현티어/.test(text) && /최고티어/.test(text) && /(주라인|주\s*,?\s*부라인)/.test(text);

  return hasNumberedSlots && hasRecruitHeader && (explicitlyRift || hasRiftFields);
}
