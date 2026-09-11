import type { RecruitPartyType } from "../domain/recruiting";

const NUMBERED_ROW = /^\s*([0-9０-９]{1,2})(?:\s*\\?[.)．。）]|\s+)\s*(.*?)\s*$/u;
const POSITION_ROW = /^\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)(?:\s*\\?[.:：．。]|\s+)\s*(.*?)\s*$/iu;
const RESERVE_ROW = /^\s*(?:예비|후보|대기)\s*([0-9０-９]{1,2})?(?:\s*\\?[.):：．。）]|\s+)?\s*(.*?)\s*$/u;
const RECRUIT_LABEL = /^\s*(?:[》>*#-]\s*)*모\s*집\s*번\s*호\s*[:：]?\s*(.*?)\s*$/u;
const START_TIME_LABEL = /^\s*[》>]?\s*(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]?\s*(.*?)\s*$/u;
const GAME_INFO_LABEL = /^\s*[》>]?\s*게임\s*정보\s*[:：]?\s*(.*?)\s*$/u;
const DETAIL_HEADER = /^\s*\[\s*K-LOL\.GG\s+구인\s*상세\s*#\s*(\d+)\s*\]\s*$/iu;
const DETAIL_SUMMARY = /^\s*#\s*(\d+)\s*[·ㆍ|]\s*(.*?)\s*[·ㆍ|]\s*(\d+)\s*\/\s*(\d+)(?:\s|$)/u;
const RESERVE_COUNT_SUMMARY = /^\s*예비\s*[:：]\s*\d+\s*명(?:\s|$)/u;
const MERGED_ROW = /\s+(?:(?:예비|후보|대기)\s*[0-9]{0,2}\s*[.):：.]|[0-9]{1,2}\s*[.)]|(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：])/iu;

export const PARTY_FORM_DECISIONS = ["EXACT", "RECOVERABLE", "AMBIGUOUS", "REJECT", "IGNORE"] as const;
export type PartyFormDecision = (typeof PARTY_FORM_DECISIONS)[number];
export type PartySlotState = "PRESENT_VALUE" | "PRESENT_EMPTY" | "ABSENT";
export type PartySlotKind = "NUMBERED" | "POSITION" | "RESERVE";

export type PartyFormDiagnosticCode =
  | "MISSING_RECRUIT_NUMBER"
  | "MULTIPLE_RECRUIT_NUMBERS"
  | "RECRUIT_NUMBER_CONFLICT"
  | "INVALID_RECRUIT_NUMBER"
  | "MISSING_DETAIL_HEADER"
  | "MISSING_DETAIL_SUMMARY"
  | "DETAIL_SUMMARY_CONFLICT"
  | "INVALID_DETAIL_SUMMARY"
  | "MISSING_SUBMITTED_TITLE"
  | "MULTIPLE_SUBMITTED_TITLES"
  | "MISSING_SLOT"
  | "DUPLICATE_SLOT"
  | "MIXED_SLOT_SCHEME"
  | "MERGED_SLOT_ROWS"
  | "INVALID_SLOT"
  | "VALUE_TOO_LONG"
  | "DUPLICATE_METADATA_LABEL";

export type PartyFormDiagnostic = Readonly<{
  code: PartyFormDiagnosticCode;
  line: number | null;
  key: string | null;
}>;

export type ParsedPartySlot = Readonly<{
  kind: PartySlotKind;
  slotNo: number;
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  state: PartySlotState;
  value: string | null;
  line: number | null;
}>;

export type ParsedPartyMetadata = Readonly<{
  state: PartySlotState;
  value: string | null;
  line: number | null;
}>;

export type ParsedPartyTitle = Readonly<{
  raw: string;
  partyType: RecruitPartyType;
  maximumMembers: number;
  canonicalTitle: string;
  positionSlots: boolean;
  line: number;
}>;

export type ParsedPartyForm = Readonly<{
  decision: PartyFormDecision;
  rawText: string;
  normalizedText: string;
  recruitNumber: number | null;
  automaticRecruitNumber: boolean;
  recruitNumbers: readonly (number | "AUTO")[];
  submittedTitle: ParsedPartyTitle | null;
  slots: readonly ParsedPartySlot[];
  startTime: ParsedPartyMetadata;
  gameInfo: ParsedPartyMetadata;
  diagnostics: readonly PartyFormDiagnostic[];
}>;

const POSITION_DEFINITIONS = Object.freeze(new Map<string, Readonly<{
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
  slotNo: number;
}>>([
  ["TOP", { position: "TOP", slotNo: 1 }], ["탑", { position: "TOP", slotNo: 1 }],
  ["JUG", { position: "JGL", slotNo: 2 }], ["JGL", { position: "JGL", slotNo: 2 }],
  ["JG", { position: "JGL", slotNo: 2 }], ["정글", { position: "JGL", slotNo: 2 }],
  ["MID", { position: "MID", slotNo: 3 }], ["미드", { position: "MID", slotNo: 3 }],
  ["ADC", { position: "ADC", slotNo: 4 }], ["AD", { position: "ADC", slotNo: 4 }],
  ["원딜", { position: "ADC", slotNo: 4 }],
  ["SUP", { position: "SUP", slotNo: 5 }], ["서폿", { position: "SUP", slotNo: 5 }],
  ["서포터", { position: "SUP", slotNo: 5 }],
]));

function normalizePartyText(value: string) {
  return value
    .replace(/\r\n?/gu, "\n")
    .normalize("NFKC")
    .replace(/[\u00A0\u3000]/gu, " ")
    .replace(/\\(?=[.):：#*\-])/gu, "")
    .replace(/^\/(?!\/)(?=\S)/u, "")
    .trim();
}

function normalizedValue(value: string) {
  return value.trim().replace(/[\t ]+/gu, " ");
}

function rowNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  return Number(value.replace(/[０-９]/gu, (digit) => String(digit.codePointAt(0)! - 0xFF10)));
}

/**
 * Kakao copy/paste can remove list punctuation or expose a Markdown escape.
 * A dot, closing parenthesis, or whitespace separator is still required, so
 * ordinary text such as `2명` and clock text such as `20:00` are not rows.
 */
export function parsePartyNumberedRow(line: string) {
  const match = NUMBERED_ROW.exec(normalizePartyText(line));
  if (!match) return null;
  return Object.freeze({ slotNo: rowNumber(match[1], 0), value: normalizedValue(match[2]!) });
}

export function parsePartyPositionRow(line: string) {
  const match = POSITION_ROW.exec(normalizePartyText(line));
  if (!match) return null;
  return Object.freeze({ label: match[1]!, value: normalizedValue(match[2]!) });
}

export function parsePartyReserveRow(line: string) {
  const match = RESERVE_ROW.exec(normalizePartyText(line));
  if (!match) return null;
  return Object.freeze({ slotNo: rowNumber(match[1], 1), value: normalizedValue(match[2]!) });
}

function submittedTitle(line: string, lineNumber: number, allowCompact = false): ParsedPartyTitle | null {
  const raw = line.trim().replace(/^📢\s*/u, "").replace(/^[-*#]\s*/u, "").trim();
  const definitions = [
    [/롤체\s*일반/u, "TFT_NORMAL", "롤체 일반 하실분!", 8, false],
    [/롤체\s*랭크/u, "TFT_RANK", "롤체 랭크 하실분!", 3, false],
    [/더블업/u, "DOUBLE_UP", "더블업 하실분!", 2, false],
    [/솔랭/u, "SOLO_RANK", "솔랭 하실분!", 2, false],
    [/자랭/u, "FLEX_RANK", "자랭 하실분!", 5, true],
    [/^일반(?:\s|하실분|구인|$)/u, "NORMAL_GAME", "일반 하실분!", 5, true],
    [/증바람/u, "ARAM", "증바람 하실분!", 5, false],
    [/칼바람/u, "ARAM", "칼바람 하실분!", 5, false],
    [/기타\s*게임/u, "OTHER_GAME", "기타게임 하실분!", 8, false],
    [/협곡/u, "PARTY_RIFT", "5인 협곡 파티 구인", 5, true],
  ] as const;
  for (const [pattern, partyType, canonicalTitle, maximumMembers, positionSlots] of definitions) {
    if (pattern.test(raw) && (allowCompact || /(?:구인|하실분|파티)/u.test(raw))) {
      return Object.freeze({ raw, partyType, canonicalTitle, maximumMembers, positionSlots, line: lineNumber });
    }
  }
  const numbered = /(\d{1,3})\s*인\s*(?:협곡\s*)?(?:(?:파티)(?:\s*구인)?|구인)/u.exec(raw);
  const maximumMembers = Number(numbered?.[1] ?? 0);
  if (maximumMembers < 1 || maximumMembers > 99) return null;
  return Object.freeze({ raw, partyType: "PARTY_NUMBER" as const, canonicalTitle: `${maximumMembers}인 파티 구인`, maximumMembers, positionSlots: false, line: lineNumber });
}

function diagnostic(code: PartyFormDiagnosticCode, line: number | null = null, key: string | null = null) {
  return Object.freeze({ code, line, key });
}

function slotState(value: string): Exclude<PartySlotState, "ABSENT"> {
  return value.length > 0 ? "PRESENT_VALUE" : "PRESENT_EMPTY";
}

function metadata(lines: readonly string[], pattern: RegExp): Readonly<{ field: ParsedPartyMetadata; duplicateLines: readonly number[] }> {
  const matches: { lineIndex: number; firstValue: string }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = pattern.exec(lines[index]!);
    if (match) matches.push({ lineIndex: index, firstValue: normalizedValue(match[1] ?? "") });
  }
  if (matches.length === 0) return Object.freeze({ field: Object.freeze({ state: "ABSENT", value: null, line: null }), duplicateLines: Object.freeze([]) });
  const selected = matches[0]!;
  const values = selected.firstValue ? [selected.firstValue] : [];
  for (let index = selected.lineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (
      RECRUIT_LABEL.test(line) || START_TIME_LABEL.test(line) || GAME_INFO_LABEL.test(line) ||
      DETAIL_HEADER.test(line) || DETAIL_SUMMARY.test(line) || RESERVE_COUNT_SUMMARY.test(line) ||
      parsePartyReserveRow(line) || parsePartyNumberedRow(line) || parsePartyPositionRow(line) ||
      submittedTitle(line, index + 1) || /^\s*(?:\[K-LOL|참여해|\*상호배려|같이 할사람|아래 양식|수정\s*:|마감\s*:)/u.test(line)
    ) break;
    const value = normalizedValue(line);
    if (value) values.push(value);
  }
  const value = values.join("\n");
  return Object.freeze({
    field: Object.freeze({ state: value ? "PRESENT_VALUE" : "PRESENT_EMPTY", value: value || null, line: selected.lineIndex + 1 }),
    duplicateLines: Object.freeze(matches.slice(1).map((match) => match.lineIndex + 1)),
  });
}

function decisionFor(diagnostics: readonly PartyFormDiagnostic[], candidate: boolean): PartyFormDecision {
  if (!candidate) return "IGNORE";
  if (diagnostics.some(({ code }) => ["INVALID_RECRUIT_NUMBER", "INVALID_DETAIL_SUMMARY", "INVALID_SLOT", "VALUE_TOO_LONG"].includes(code))) return "REJECT";
  if (diagnostics.some(({ code }) => [
    "MULTIPLE_RECRUIT_NUMBERS", "MULTIPLE_SUBMITTED_TITLES", "MISSING_SLOT", "DUPLICATE_SLOT",
    "RECRUIT_NUMBER_CONFLICT", "DETAIL_SUMMARY_CONFLICT", "MIXED_SLOT_SCHEME", "MERGED_SLOT_ROWS", "DUPLICATE_METADATA_LABEL",
  ].includes(code))) return "AMBIGUOUS";
  if (diagnostics.some(({ code }) => ["MISSING_RECRUIT_NUMBER", "MISSING_SUBMITTED_TITLE", "MISSING_DETAIL_HEADER", "MISSING_DETAIL_SUMMARY"].includes(code))) return "RECOVERABLE";
  return "EXACT";
}

export function parsePartyForm(input: string): ParsedPartyForm {
  const normalizedText = normalizePartyText(input);
  const lines = normalizedText.split("\n");
  const diagnostics: PartyFormDiagnostic[] = [];
  const recruitNumbers: (number | "AUTO")[] = [];
  const titles: ParsedPartyTitle[] = [];
  const slots: ParsedPartySlot[] = [];
  let slotSignals = 0;
  let invalidStructuralSignal = false;
  let recruitLabelSignals = 0;
  let detailHeaderSignals = 0;
  let detailSummarySignals = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    const detailHeader = DETAIL_HEADER.exec(line);
    if (detailHeader) {
      detailHeaderSignals += 1;
      const value = Number(detailHeader[1]);
      if (value < 1 || value > 999) diagnostics.push(diagnostic("INVALID_RECRUIT_NUMBER", lineNumber, "detailHeader"));
      else recruitNumbers.push(value);
      continue;
    }
    const detailSummary = DETAIL_SUMMARY.exec(line);
    if (detailSummary) {
      detailSummarySignals += 1;
      const recruitNumber = Number(detailSummary[1]);
      const activeCount = Number(detailSummary[3]);
      const maximumMembers = Number(detailSummary[4]);
      if (recruitNumber < 1 || recruitNumber > 999) diagnostics.push(diagnostic("INVALID_RECRUIT_NUMBER", lineNumber, "detailSummary"));
      else recruitNumbers.push(recruitNumber);
      if (maximumMembers < 1 || maximumMembers > 99 || activeCount < 0 || activeCount > maximumMembers) {
        diagnostics.push(diagnostic("INVALID_DETAIL_SUMMARY", lineNumber, "capacity"));
      }
      const title = submittedTitle(detailSummary[2] ?? "", lineNumber, true);
      if (title) {
        titles.push(title);
        if (maximumMembers >= 1 && maximumMembers <= 99 && title.maximumMembers !== maximumMembers) {
          diagnostics.push(diagnostic("DETAIL_SUMMARY_CONFLICT", lineNumber, "maximumMembers"));
        }
      }
      continue;
    }
    if (RESERVE_COUNT_SUMMARY.test(line)) continue;
    const recruit = RECRUIT_LABEL.exec(line);
    if (recruit) {
      recruitLabelSignals += 1;
      const value = normalizedValue(recruit[1] ?? "").replace(/^#\s*/u, "");
      if (/^자동\s*배정$/u.test(value)) recruitNumbers.push("AUTO");
      else if (/^\d{1,3}$/u.test(value) && Number(value) > 0) recruitNumbers.push(Number(value));
      else {
        const multiple = [...value.matchAll(/(?:#\s*)?(자동\s*배정|\d{1,3})/gu)].map((match) => match[1]!);
        if (multiple.length > 1) {
          for (const entry of multiple) recruitNumbers.push(/^자동/u.test(entry) ? "AUTO" : Number(entry));
        } else diagnostics.push(diagnostic("INVALID_RECRUIT_NUMBER", lineNumber, "recruitNumber"));
      }
      continue;
    }
    const title = submittedTitle(line, lineNumber);
    if (title) {
      titles.push(title);
      continue;
    }
    if (/^\s*\d{3,}\s*[.)]/u.test(line)) {
      invalidStructuralSignal = true;
      diagnostics.push(diagnostic("INVALID_SLOT", lineNumber, null));
      continue;
    }
    const reserve = parsePartyReserveRow(line);
    const position = reserve ? null : parsePartyPositionRow(line);
    const numbered = reserve || position ? null : parsePartyNumberedRow(line);
    if (!reserve && !position && !numbered) continue;
    slotSignals += 1;
    const parsed = reserve ?? position ?? numbered!;
    if (MERGED_ROW.test(parsed.value)) diagnostics.push(diagnostic("MERGED_SLOT_ROWS", lineNumber, null));
    const value = normalizedValue(parsed.value);
    if (value.length > 80) diagnostics.push(diagnostic("VALUE_TOO_LONG", lineNumber, null));
    if (reserve) slots.push(Object.freeze({ kind: "RESERVE", slotNo: reserve.slotNo, position: null, state: slotState(value), value: value || null, line: lineNumber }));
    else if (position) {
      const definition = POSITION_DEFINITIONS.get(position.label.toUpperCase()) ?? POSITION_DEFINITIONS.get(position.label);
      if (!definition) diagnostics.push(diagnostic("INVALID_SLOT", lineNumber, position.label));
      else slots.push(Object.freeze({ kind: "POSITION", slotNo: definition.slotNo, position: definition.position, state: slotState(value), value: value || null, line: lineNumber }));
    } else if (numbered) slots.push(Object.freeze({ kind: "NUMBERED", slotNo: numbered.slotNo, position: null, state: slotState(value), value: value || null, line: lineNumber }));
  }

  const detailSignals = detailHeaderSignals + detailSummarySignals;
  if (detailSignals > 0 && detailHeaderSignals === 0) diagnostics.push(diagnostic("MISSING_DETAIL_HEADER", null, "detailHeader"));
  if (detailSignals > 0 && detailSummarySignals === 0) diagnostics.push(diagnostic("MISSING_DETAIL_SUMMARY", null, "detailSummary"));
  const uniqueRecruitNumbers = new Set(recruitNumbers);
  if (recruitNumbers.length === 0) diagnostics.push(diagnostic("MISSING_RECRUIT_NUMBER", null, "recruitNumber"));
  if (
    recruitLabelSignals > 1 || detailHeaderSignals > 1 || detailSummarySignals > 1 ||
    (recruitLabelSignals > 0 && detailSignals > 0)
  ) diagnostics.push(diagnostic("MULTIPLE_RECRUIT_NUMBERS", null, "recruitNumber"));
  if (uniqueRecruitNumbers.size > 1 || (uniqueRecruitNumbers.has("AUTO") && uniqueRecruitNumbers.size > 1)) {
    diagnostics.push(diagnostic("RECRUIT_NUMBER_CONFLICT", null, "recruitNumber"));
  }
  if (titles.length === 0) diagnostics.push(diagnostic("MISSING_SUBMITTED_TITLE", null, "title"));
  if (titles.length > 1) diagnostics.push(diagnostic("MULTIPLE_SUBMITTED_TITLES", null, "title"));

  const selectedTitle = titles.length === 1 ? titles[0]! : null;
  const numberedRows = slots.filter((slot) => slot.kind === "NUMBERED");
  const positionRows = slots.filter((slot) => slot.kind === "POSITION");
  if (numberedRows.length > 0 && positionRows.length > 0) diagnostics.push(diagnostic("MIXED_SLOT_SCHEME"));

  const seen = new Set<string>();
  for (const slot of slots) {
    const key = slot.kind === "RESERVE" ? `reserve:${slot.slotNo}` : `primary:${slot.slotNo}`;
    if (seen.has(key)) diagnostics.push(diagnostic("DUPLICATE_SLOT", slot.line, key));
    seen.add(key);
  }

  if (selectedTitle) {
    const expectedKind = selectedTitle.positionSlots ? "POSITION" : "NUMBERED";
    for (let slotNo = 1; slotNo <= selectedTitle.maximumMembers; slotNo += 1) {
      if (!slots.some((slot) => slot.kind === expectedKind && slot.slotNo === slotNo)) {
        slots.push(Object.freeze({
          kind: expectedKind,
          slotNo,
          position: expectedKind === "POSITION" ? (["TOP", "JGL", "MID", "ADC", "SUP"] as const)[slotNo - 1] ?? null : null,
          state: "ABSENT",
          value: null,
          line: null,
        }));
        diagnostics.push(diagnostic("MISSING_SLOT", null, `${expectedKind.toLowerCase()}:${slotNo}`));
      }
    }
  }
  if (!slots.some((slot) => slot.kind === "RESERVE")) slots.push(Object.freeze({ kind: "RESERVE", slotNo: 1, position: null, state: "ABSENT", value: null, line: null }));

  const start = metadata(lines, START_TIME_LABEL);
  const game = metadata(lines, GAME_INFO_LABEL);
  for (const line of start.duplicateLines) diagnostics.push(diagnostic("DUPLICATE_METADATA_LABEL", line, "startTime"));
  for (const line of game.duplicateLines) diagnostics.push(diagnostic("DUPLICATE_METADATA_LABEL", line, "gameInfo"));

  const candidate = slotSignals >= 2 && (recruitLabelSignals > 0 || detailSignals > 0 || titles.length > 0 || invalidStructuralSignal);
  const decision = decisionFor(diagnostics, candidate);
  const onlyRecruitNumber = uniqueRecruitNumbers.size === 1 ? [...uniqueRecruitNumbers][0] : null;
  return Object.freeze({
    decision,
    rawText: input,
    normalizedText,
    recruitNumber: typeof onlyRecruitNumber === "number" ? onlyRecruitNumber : null,
    automaticRecruitNumber: onlyRecruitNumber === "AUTO",
    recruitNumbers: Object.freeze(recruitNumbers),
    submittedTitle: selectedTitle,
    slots: Object.freeze(slots),
    startTime: start.field,
    gameInfo: game.field,
    diagnostics: Object.freeze(diagnostics),
  });
}
