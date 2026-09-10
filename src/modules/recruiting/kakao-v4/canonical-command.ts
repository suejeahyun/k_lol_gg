import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

import type { ScrimFormCommandPayload, SyncScrimCommandPayload } from "../application/commands";
import type { RecruitMember, RecruitPartyType, ScrimLineup } from "../domain/recruiting";
import { isOperationFormType, type OperationFormPayloadByType, type OperationFormType } from "../operation-forms/domain";
import type { KakaoV4CommandClassification } from "./classifier";
import type { KakaoV4CommandEnvelope } from "./domain";
import { parseKakaoV4OperationForm } from "./operation-form";

export type KakaoV4RecruitTarget = Readonly<{
  recruitDate: string;
  recruitNumber: number;
}>;

export type KakaoV4PartyCreatePayload = Readonly<{
  recruitDate: string;
  preferredRecruitNumber: number | null;
  partyType: RecruitPartyType;
  title: string;
  maximumMembers: number;
  members: readonly RecruitMember[];
  startTimeText?: string | null;
  gameInfo?: string | null;
  scheduledStartAt: string | null;
  protectedUntil: string | null;
}>;

export type KakaoV4PartySyncPayload = Readonly<{
  recruitDate: string;
  preferredRecruitNumber: number | null;
  partyType: RecruitPartyType;
  title: string;
  maximumMembers: number;
  members: readonly RecruitMember[];
  startTimeText?: string | null;
  gameInfo?: string | null;
  scheduledStartAt?: string | null;
  protectedUntil?: string | null;
}>;

export type KakaoV4PartySyncTarget = Readonly<{
  recruitDate: string;
  recruitNumber: number | null;
}>;

export type KakaoV4SeasonParticipant = Readonly<{
  slotNo: number;
  name: string;
  riotId: string | null;
  mainPosition: SeasonApplicationPosition;
  subPositions: readonly SeasonApplicationPosition[];
  reserve: boolean;
}>;

export type KakaoV4InhouseMode = "RIFT" | "ARAM" | "AUGMENT_ARAM";

export type KakaoV4ScrimUpsertPayload = Readonly<{
  recruitDate: string;
  scrimNumber: number | null;
  legacyTournamentNumber: number | null;
  title: string;
  requesterTeamName: string;
  opponentTeamName: string | null;
  requesterLineup: ScrimLineup | null;
  opponentLineup: ScrimLineup | null;
  memo: string | null;
  seriesRuleText: string | null;
  scheduledAt: string | null;
  bestOf: number;
}>;

/**
 * Output contract of the classifier and input contract of the dispatcher.
 * This module intentionally contains no text parsing or command aliases.
 */
export type CanonicalKakaoV4Command =
  | Readonly<{ domain: "PARTY"; action: "CREATE"; payload: KakaoV4PartyCreatePayload }>
  | Readonly<{ domain: "PARTY"; action: "STATUS" }>
  | Readonly<{ domain: "PARTY"; action: "DETAIL"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "PARTY"; action: "SYNC"; target: KakaoV4PartySyncTarget; payload: KakaoV4PartySyncPayload }>
  | Readonly<{ domain: "PARTY"; action: "FINISH"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "SCRIM"; action: "CREATE"; payload: ScrimFormCommandPayload }>
  | Readonly<{ domain: "SCRIM"; action: "TEMPLATE"; recruitDate: string }>
  | Readonly<{ domain: "SCRIM"; action: "UPSERT"; payload: KakaoV4ScrimUpsertPayload }>
  | Readonly<{ domain: "SCRIM"; action: "STATUS" }>
  | Readonly<{ domain: "SCRIM"; action: "DETAIL"; target: KakaoV4RecruitTarget }>
  | Readonly<{ domain: "SCRIM"; action: "SYNC"; target: KakaoV4RecruitTarget; payload: SyncScrimCommandPayload }>
  | Readonly<{ domain: "SCRIM"; action: "DEPRECATED_JOIN" | "DEPRECATED_CONFIRM" | "DEPRECATED_CANCEL" | "DEPRECATED_FINISH" }>
  | Readonly<{
      domain: "SEASON";
      action: "TEMPLATE";
      applyDate: string;
      recruitNumber: number;
      capacity: number;
      time: string;
      mode: KakaoV4InhouseMode | null;
    }>
  | Readonly<{ domain: "SEASON"; action: "JOIN_GUIDE" }>
  | Readonly<{ domain: "SEASON"; action: "STATUS"; seasonId: string | null; applyDate: string }>
  | Readonly<{ domain: "SEASON"; action: "DETAIL"; seasonId: string | null; applyDate: string; recruitNumber: number }>
  | Readonly<{
      domain: "SEASON";
      action: "SYNC";
      seasonId: string | null;
      applyDate: string;
      recruitNumber: number;
      mode: KakaoV4InhouseMode;
      participants: readonly KakaoV4SeasonParticipant[];
    }>
  | Readonly<{ domain: "PLAYER"; action: "RECORD" | "RECENT"; query: string }>
  | Readonly<{ domain: "PLAYER"; action: "RANKING" }>
  | Readonly<{ domain: "OPERATIONS"; action: "REGISTRATION_HUB" | "INHOUSE_RESULT" | "INHOUSE_RESULT_STATUS" | "DISCIPLINE_CREATE" | "DISCIPLINE_EVIDENCE" | "DISCIPLINE_STATUS" }>
  | Readonly<{ domain: "OPERATIONS"; action: "SCHEDULE_NOTICE"; slot: string | null }>
  | Readonly<{ domain: "OPERATIONS"; action: "SUBMIT_FORM"; formType: OperationFormType; payload: OperationFormPayloadByType[OperationFormType] }>
  | Readonly<{ domain: "OPERATIONS"; action: "INVALID_FORM"; formType: OperationFormType; missingFields: readonly string[] }>;

export function requiredProfileForKakaoV4Command(command: CanonicalKakaoV4Command) {
  return command.domain === "SEASON" || command.domain === "PLAYER" || command.domain === "OPERATIONS" ? "FEATURES" as const : "RECRUIT" as const;
}

function kstDate(timestamp: number) {
  return new Date((timestamp + 9 * 60 * 60) * 1_000).toISOString().slice(0, 10);
}

function numberParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function textParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function snapshotMembers(text: string): readonly RecruitMember[] {
  const members: RecruitMember[] = [];
  const occupied = new Set<string>();
  const positions = new Map<string, Readonly<{ position: "TOP" | "JGL" | "MID" | "ADC" | "SUP"; slotNo: number }>>([
    ["TOP", { position: "TOP", slotNo: 1 }], ["탑", { position: "TOP", slotNo: 1 }],
    ["JUG", { position: "JGL", slotNo: 2 }], ["JGL", { position: "JGL", slotNo: 2 }], ["JG", { position: "JGL", slotNo: 2 }], ["정글", { position: "JGL", slotNo: 2 }],
    ["MID", { position: "MID", slotNo: 3 }], ["미드", { position: "MID", slotNo: 3 }],
    ["ADC", { position: "ADC", slotNo: 4 }], ["AD", { position: "ADC", slotNo: 4 }], ["원딜", { position: "ADC", slotNo: 4 }],
    ["SUP", { position: "SUP", slotNo: 5 }], ["서폿", { position: "SUP", slotNo: 5 }], ["서포터", { position: "SUP", slotNo: 5 }],
  ]);
  for (const line of text.split("\n")) {
    const positionRow = /^\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]\s*(.*?)\s*$/iu.exec(line);
    if (positionRow) {
      const definition = positions.get(positionRow[1]!.toUpperCase()) ?? positions.get(positionRow[1]!);
      const name = positionRow[2]!.trim().replace(/\s+/gu, " ");
      if (!definition || !name || name.length > 80 || occupied.has(`position:${definition.position}`)) continue;
      occupied.add(`position:${definition.position}`);
      members.push(Object.freeze({ slotNo: definition.slotNo, name, position: definition.position, substitute: false }));
      continue;
    }
    const reserveRow = /^\s*(?:예비|후보|대기)\s*(\d{1,2})?\s*[.):：]?\s*(.*?)\s*$/u.exec(line);
    if (reserveRow) {
      const firstSlot = Number(reserveRow[1] ?? 1);
      const names = reserveRow[2]!.split(/[,/]+/u).map((value) => value.trim().replace(/\s+/gu, " ")).filter(Boolean);
      for (const [index, name] of names.entries()) {
        const slotNo = firstSlot + index;
        if (slotNo < 1 || slotNo > 99 || name.length > 80 || occupied.has(`reserve:${slotNo}`)) continue;
        occupied.add(`reserve:${slotNo}`);
        members.push(Object.freeze({ slotNo, name, position: null, substitute: true }));
      }
      continue;
    }
    const match = /^\s*(\d{1,2})\s*[.)]\s*(.*?)\s*$/u.exec(line);
    if (!match?.[2]) continue;
    const slotNo = Number(match[1]);
    const name = match[2].trim().replace(/\s+/gu, " ");
    if (slotNo < 1 || slotNo > 99 || !name || name.length > 80 || occupied.has(`slot:${slotNo}`)) continue;
    occupied.add(`slot:${slotNo}`);
    members.push(Object.freeze({ slotNo, name, position: null, substitute: false }));
  }
  return Object.freeze(members);
}

function partyCreateTitle(partyType: RecruitPartyType, maximumMembers: number, canonicalText: string) {
  if (partyType === "PARTY_NUMBER") return `${maximumMembers}인 파티 구인`;
  if (partyType === "PARTY_RIFT") return "5인 협곡 파티 구인";
  if (partyType === "FLEX_RANK") return "자랭 하실분!";
  if (partyType === "NORMAL_GAME") return "일반 하실분!";
  if (partyType === "SOLO_RANK") return "솔랭 하실분!";
  if (partyType === "ARAM") return canonicalText.includes("증바람") ? "증바람 하실분!" : "칼바람 하실분!";
  if (partyType === "TFT_NORMAL") return "롤체 일반 하실분!";
  if (partyType === "TFT_RANK") return "롤체 랭크 하실분!";
  if (partyType === "DOUBLE_UP") return "더블업 하실분!";
  return "기타게임 하실분!";
}

function partySnapshotDefinition(text: string) {
  const header = /^\s*📢\s*(.*?)\s*$/mu.exec(text)?.[1]?.trim() ?? "";
  const definitions = [
    [/롤체\s*일반/u, "TFT_NORMAL", "롤체 일반 하실분!", 8],
    [/롤체\s*랭크/u, "TFT_RANK", "롤체 랭크 하실분!", 3],
    [/더블업/u, "DOUBLE_UP", "더블업 하실분!", 2],
    [/솔랭/u, "SOLO_RANK", "솔랭 하실분!", 2],
    [/자랭/u, "FLEX_RANK", "자랭 하실분!", 5],
    [/일반/u, "NORMAL_GAME", "일반 하실분!", 5],
    [/증바람/u, "ARAM", "증바람 하실분!", 5],
    [/칼바람/u, "ARAM", "칼바람 하실분!", 5],
    [/기타게임/u, "OTHER_GAME", "기타게임 하실분!", 8],
    [/협곡/u, "PARTY_RIFT", "5인 협곡 파티 구인", 5],
  ] as const;
  for (const [pattern, partyType, title, maximumMembers] of definitions) {
    if (pattern.test(header)) return { partyType, title, maximumMembers } as const;
  }
  const numbered = /(\d{1,2})\s*인\s*(?:파티\s*)?구인/u.exec(header);
  const maximumMembers = Number(numbered?.[1] ?? 0);
  if (maximumMembers < 1 || maximumMembers > 99) return null;
  return { partyType: "PARTY_NUMBER" as const, title: `${maximumMembers}인 파티 구인`, maximumMembers };
}

function partySnapshotMeta(text: string) {
  let startTimeText: string | undefined;
  let gameInfo: string | undefined;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^[》>]\s*/u, "");
    const start = /^(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]\s*(.*?)\s*$/u.exec(line)?.[1]?.trim();
    const game = /^게임\s*정보\s*[:：]\s*(.*?)\s*$/u.exec(line)?.[1]?.trim();
    if (start) startTimeText = start.slice(0, 160);
    if (game) gameInfo = game.slice(0, 500);
  }
  return { startTimeText, gameInfo } as const;
}

function validDateKey(value: string | null, fallback: string) {
  if (!value) return fallback;
  const match = /^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/u.exec(value);
  if (!match) return null;
  const normalized = `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? null : normalized;
}

function inhouseTemplateCommand(parameters: Readonly<Record<string, string | number | boolean | null>>, fallbackDate: string) {
  const argumentsText = textParameter(parameters, "argumentsText") ?? "";
  const dateMatch = /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/u.exec(argumentsText)?.[0] ?? null;
  const applyDate = validDateKey(dateMatch, fallbackDate);
  if (!applyDate) return null;
  const clock = /(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/u.exec(` ${argumentsText} `);
  const koreanClock = clock ? null : /(?:^|\s)([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분?)?(?:\s|$)/u.exec(` ${argumentsText} `);
  const hour = Number(clock?.[1] ?? koreanClock?.[1] ?? 21);
  const minute = Number(clock?.[2] ?? koreanClock?.[2] ?? 0);
  const capacityValue = /(?:^|\s)(\d{1,2})\s*명(?:\s|$)/u.exec(` ${argumentsText} `)?.[1];
  const recruitValue = /(?:^|\s)#\s*(\d{1,3})(?:\s|$)/u.exec(` ${argumentsText} `)?.[1];
  const modeValue = textParameter(parameters, "mode");
  const mode = modeValue === "RIFT" || modeValue === "ARAM" || modeValue === "AUGMENT_ARAM" ? modeValue : null;
  return Object.freeze({
    domain: "SEASON" as const,
    action: "TEMPLATE" as const,
    applyDate,
    recruitNumber: recruitValue ? Number(recruitValue) : 1,
    capacity: capacityValue ? Math.min(Math.max(Number(capacityValue), 2), 20) : 10,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    mode,
  });
}

function seasonPosition(value: string): SeasonApplicationPosition | null {
  const token = value.trim().toUpperCase();
  if (token === "탑" || token === "T") return "TOP";
  if (token === "정글" || token === "JG" || token === "JUG") return "JGL";
  if (token === "미드" || token === "MD" || token === "M") return "MID";
  if (token === "원딜" || token === "AD" || token === "원딜러") return "ADC";
  if (token === "서폿" || token === "서포터" || token === "S") return "SUP";
  if (token === "올" || token === "전체" || token === "FILL") return "ALL";
  return ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"].includes(token) ? token as SeasonApplicationPosition : null;
}

function inhouseSnapshot(text: string, fallbackDate: string) {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  const recruitNumber = Number(/^\s*📢\s*내전하실분\s*#\s*(\d{1,3})\s*$/mu.exec(normalized)?.[1] ?? 0);
  const dateValue = /^\s*》\s*(20\d{2}-\d{2}-\d{2})(?:\s|$)/mu.exec(normalized)?.[1] ?? null;
  const applyDate = validDateKey(dateValue, fallbackDate);
  const capacity = Number(/^\s*👥\s*\d{1,3}\s*\/\s*(\d{1,3})\s*명\s*$/mu.exec(normalized)?.[1] ?? 0);
  const modeLabel = /^\s*》\s*(협곡|칼바람|증바람|증강칼바람)\s*$/mu.exec(normalized)?.[1] ?? null;
  const mode: KakaoV4InhouseMode | null = modeLabel === "협곡"
    ? "RIFT"
    : modeLabel === "칼바람"
      ? "ARAM"
      : modeLabel === "증바람" || modeLabel === "증강칼바람"
        ? "AUGMENT_ARAM"
        : null;
  if (!recruitNumber || !applyDate || capacity < 1 || capacity > 99 || !mode) return null;

  const slots = new Set<number>();
  const participants: KakaoV4SeasonParticipant[] = [];
  for (const line of normalized.split("\n")) {
    const row = /^\s*(\d{1,2})\s*[.)]\s*(.*?)\s*$/u.exec(line);
    if (!row) continue;
    const slotNo = Number(row[1]);
    if (slotNo < 1 || slotNo > capacity || slots.has(slotNo)) return null;
    slots.add(slotNo);
    if (!row[2]) continue;
    const fields = row[2].split("/").map((field) => field.trim());
    if (!fields[0] || (mode === "RIFT" && fields.length < 4)) return null;
    const mainPosition = mode === "RIFT" ? seasonPosition(fields[3] ?? "") : "ALL";
    if (!mainPosition) return null;
    const subPositions = mode === "RIFT"
      ? fields.slice(4).flatMap((field) => field.split(/[,，]/u)).map(seasonPosition).filter((position): position is SeasonApplicationPosition => Boolean(position && position !== "ALL" && position !== mainPosition))
      : [];
    const uniqueSubPositions = [...new Set(subPositions)];
    if (mainPosition === "ALL" && uniqueSubPositions.length > 0) return null;
    participants.push(Object.freeze({
      slotNo,
      name: fields[0],
      riotId: null,
      mainPosition,
      subPositions: Object.freeze(uniqueSubPositions),
      reserve: /(?:예비|대기)/u.test(row[2]),
    }));
  }
  if (slots.size !== capacity) return null;
  return Object.freeze({
    domain: "SEASON" as const,
    action: "SYNC" as const,
    seasonId: null,
    applyDate,
    recruitNumber,
    mode,
    participants: Object.freeze(participants),
  });
}

function cleanScrimValue(value: string | null) {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
  if (!normalized || /^(?:미정|없음|상대구함|상대\s*구함|모집중|비워두기|공란|-)$/u.test(normalized)) return null;
  return normalized;
}

function scrimSnapshot(text: string, fallbackDate: string): KakaoV4ScrimUpsertPayload | null {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  const lines = normalized.split("\n");
  const field = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = lines.map((line) => line.trim()).find((line) => new RegExp(`^${escaped}\\s*[:：]`, "u").test(line));
    return match ? match.replace(new RegExp(`^${escaped}\\s*[:：]\\s*`, "u"), "").trim() : null;
  };
  const applyDate = validDateKey(field("운영일"), fallbackDate);
  if (!applyDate) return null;
  const numberText = field("번호");
  const scrimNumberMatch = /^#?\s*(\d{1,2})$/u.exec(numberText ?? "");
  const automaticNumber = /^#?\s*자동배정$/u.test(numberText ?? "");
  if (!scrimNumberMatch && !automaticNumber) return null;
  const legacyText = field("멸망전번호");
  const legacyTournamentNumber = legacyText === null ? null : Number(/^#?\s*(\d{1,4})$/u.exec(legacyText)?.[1] ?? 0);
  if (legacyTournamentNumber !== null && (legacyTournamentNumber < 1 || legacyTournamentNumber > 9999)) return null;

  const requesterIndex = lines.findIndex((line) => /^\s*우리팀\s*[:：]/u.test(line));
  const opponentIndex = lines.findIndex((line) => /^\s*상대팀\s*[:：]/u.test(line));
  if (requesterIndex < 0 || opponentIndex <= requesterIndex) return null;
  const sectionLineup = (start: number, end: number): ScrimLineup | null => {
    const output: Record<"top" | "jungle" | "mid" | "adc" | "support", string | null> = {
      top: null, jungle: null, mid: null, adc: null, support: null,
    };
    const keys = { TOP: "top", JUG: "jungle", JGL: "jungle", JG: "jungle", MID: "mid", ADC: "adc", AD: "adc", SUP: "support" } as const;
    for (const line of lines.slice(start, end)) {
      const match = /^\s*(TOP|JUG|JGL|JG|MID|ADC|AD|SUP)\s*[:：.]\s*(.*?)\s*$/iu.exec(line);
      if (!match) continue;
      output[keys[match[1]!.toUpperCase() as keyof typeof keys]] = cleanScrimValue(match[2] ?? null);
    }
    return Object.values(output).some(Boolean) ? Object.freeze(output) : null;
  };
  const requesterTeamName = cleanScrimValue(lines[requesterIndex]!.replace(/^\s*우리팀\s*[:：]\s*/u, ""));
  if (!requesterTeamName) return null;
  const opponentTeamName = cleanScrimValue(lines[opponentIndex]!.replace(/^\s*상대팀\s*[:：]\s*/u, ""));
  const ruleText = cleanScrimValue(field("방식"));
  const bestOf = Number(/(\d{1,2})\s*(?:판|전)/u.exec(ruleText ?? "")?.[1] ?? /BO\s*(\d{1,2})/iu.exec(ruleText ?? "")?.[1] ?? 3);
  if (bestOf < 1 || bestOf > 20) return null;
  const timeText = field("일시");
  const clock = /(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/u.exec(` ${timeText ?? ""} `);
  const scheduledAt = clock ? new Date(`${applyDate}T${String(Number(clock[1])).padStart(2, "0")}:${clock[2]}:00+09:00`).toISOString() : null;
  return Object.freeze({
    recruitDate: applyDate,
    scrimNumber: scrimNumberMatch ? Number(scrimNumberMatch[1]) : null,
    legacyTournamentNumber,
    title: `${requesterTeamName} 스크림 구인`,
    requesterTeamName,
    opponentTeamName,
    requesterLineup: sectionLineup(requesterIndex + 1, opponentIndex),
    opponentLineup: sectionLineup(opponentIndex + 1, lines.length),
    memo: cleanScrimValue(field("메모")),
    seriesRuleText: ruleText,
    scheduledAt,
    bestOf,
  });
}

export function canonicalizeKakaoV4Command(classification: KakaoV4CommandClassification, envelope: KakaoV4CommandEnvelope): CanonicalKakaoV4Command | null {
  if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") return null;
  const date = kstDate(envelope.timestamp);
  const parameters = classification.parameters;
  if (classification.command === "PARTY_CREATE") {
    const partyType = (textParameter(parameters, "partyType") ?? "PARTY_NUMBER") as RecruitPartyType;
    const maximumMembers = numberParameter(parameters, "maximumMembers") ?? 5;
    return Object.freeze({ domain: "PARTY" as const, action: "CREATE" as const, payload: Object.freeze({
      recruitDate: date, preferredRecruitNumber: numberParameter(parameters, "explicitRecruitNumber"), partyType,
      title: partyCreateTitle(partyType, maximumMembers, classification.canonicalText),
      maximumMembers, members: Object.freeze([]), startTimeText: null, gameInfo: null,
      scheduledStartAt: null, protectedUntil: null,
    }) });
  }
  if (classification.command === "PARTY_STATUS") return Object.freeze({ domain: "PARTY" as const, action: "STATUS" as const });
  if (classification.command === "PARTY_DETAIL" || classification.command === "PARTY_FINISH") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    if (!recruitNumber) return null;
    return Object.freeze({ domain: "PARTY" as const, action: classification.command === "PARTY_DETAIL" ? "DETAIL" as const : "FINISH" as const, target: Object.freeze({ recruitDate: date, recruitNumber }) });
  }
  if (classification.command === "PARTY_SNAPSHOT") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    const definition = partySnapshotDefinition(envelope.text);
    if (!definition) return null;
    const meta = partySnapshotMeta(envelope.text);
    return Object.freeze({
      domain: "PARTY" as const,
      action: "SYNC" as const,
      target: Object.freeze({ recruitDate: date, recruitNumber }),
      payload: Object.freeze({
        recruitDate: date,
        preferredRecruitNumber: recruitNumber,
        partyType: definition.partyType,
        title: definition.title,
        maximumMembers: definition.maximumMembers,
        members: snapshotMembers(envelope.text),
        startTimeText: meta.startTimeText,
        gameInfo: meta.gameInfo,
        scheduledStartAt: null,
        protectedUntil: null,
      }),
    });
  }
  if (classification.command === "INHOUSE_CREATE") return inhouseTemplateCommand(parameters, date);
  if (classification.command === "INHOUSE_JOIN_GUIDE") {
    return Object.freeze({ domain: "SEASON" as const, action: "JOIN_GUIDE" as const });
  }
  if (classification.command === "INHOUSE_STATUS" || classification.command === "INHOUSE_DETAIL") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    if (classification.command === "INHOUSE_DETAIL" && recruitNumber === null) return null;
    return recruitNumber === null
      ? Object.freeze({ domain: "SEASON" as const, action: "STATUS" as const, seasonId: null, applyDate: date })
      : Object.freeze({ domain: "SEASON" as const, action: "DETAIL" as const, seasonId: null, applyDate: date, recruitNumber });
  }
  if (classification.command === "INHOUSE_SNAPSHOT") return inhouseSnapshot(classification.canonicalText, date);
  if (classification.command === "SCRIM_CREATE") {
    return Object.freeze({ domain: "SCRIM" as const, action: "TEMPLATE" as const, recruitDate: date });
  }
  if (classification.command === "SCRIM_SNAPSHOT") {
    const payload = scrimSnapshot(classification.canonicalText, date);
    return payload ? Object.freeze({ domain: "SCRIM" as const, action: "UPSERT" as const, payload }) : null;
  }
  if (classification.command === "SCRIM_STATUS") return Object.freeze({ domain: "SCRIM" as const, action: "STATUS" as const });
  if (classification.command === "SCRIM_DETAIL") {
    const recruitNumber = numberParameter(parameters, "scrimNumber");
    return recruitNumber ? Object.freeze({ domain: "SCRIM" as const, action: "DETAIL" as const, target: Object.freeze({ recruitDate: date, recruitNumber }) }) : null;
  }
  if (classification.command.startsWith("SCRIM_LEGACY_")) {
    const action = classification.command.slice("SCRIM_LEGACY_".length) as "JOIN" | "CONFIRM" | "CANCEL" | "FINISH";
    return Object.freeze({ domain: "SCRIM" as const, action: `DEPRECATED_${action}` as const });
  }
  if (classification.command === "PLAYER_RECORD" || classification.command === "PLAYER_RECENT") {
    const query = textParameter(parameters, "riotId");
    return query ? Object.freeze({ domain: "PLAYER" as const, action: classification.command === "PLAYER_RECORD" ? "RECORD" as const : "RECENT" as const, query }) : null;
  }
  if (classification.command === "PLAYER_RANKING") return Object.freeze({ domain: "PLAYER" as const, action: "RANKING" as const });
  const staticOperation = {
    OPERATIONS_REGISTRATION_HUB: "REGISTRATION_HUB",
    OPERATIONS_INHOUSE_RESULT: "INHOUSE_RESULT",
    OPERATIONS_INHOUSE_RESULT_STATUS: "INHOUSE_RESULT_STATUS",
    OPERATIONS_DISCIPLINE_CREATE: "DISCIPLINE_CREATE",
    OPERATIONS_DISCIPLINE_EVIDENCE: "DISCIPLINE_EVIDENCE",
    OPERATIONS_DISCIPLINE_STATUS: "DISCIPLINE_STATUS",
  } as const;
  if (classification.command in staticOperation) {
    return Object.freeze({
      domain: "OPERATIONS" as const,
      action: staticOperation[classification.command as keyof typeof staticOperation],
    });
  }
  if (classification.command === "OPERATIONS_SCHEDULE_NOTICE") {
    const hour = numberParameter(parameters, "hour");
    return Object.freeze({ domain: "OPERATIONS" as const, action: "SCHEDULE_NOTICE" as const, slot: hour ? String(hour) : null });
  }
  if (classification.command === "OPERATIONS_FORM_SUBMIT") {
    const formType = textParameter(parameters, "formType");
    if (!isOperationFormType(formType)) return null;
    const parsed = parseKakaoV4OperationForm({ formType, text: classification.canonicalText, senderFallback: envelope.senderId });
    return parsed.valid
      ? Object.freeze({ domain: "OPERATIONS" as const, action: "SUBMIT_FORM" as const, formType: parsed.formType, payload: parsed.payload })
      : Object.freeze({ domain: "OPERATIONS" as const, action: "INVALID_FORM" as const, formType: parsed.formType, missingFields: parsed.missingFields });
  }
  return null;
}
