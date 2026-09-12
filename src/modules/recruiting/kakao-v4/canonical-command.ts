import type { SeasonApplicationPosition } from "@/modules/seasons/domain/season";

import type { ScrimFormCommandPayload, SyncScrimCommandPayload } from "../application/commands";
import { recruitingOperatingDateKey } from "../domain/operating-day";
import type { RecruitMember, RecruitPartyType, ScrimLineup } from "../domain/recruiting";
import { encodeV1StrictScrimTimeText, parseV1StrictScrimTime } from "../domain/v1-strict-scrim-time";
import { isOperationFormType, type OperationFormPayloadByType, type OperationFormType } from "../operation-forms/domain";
import type { KakaoV4CommandClassification } from "./classifier";
import { usesKakaoV1StrictResponse, type KakaoV4CommandEnvelope } from "./domain";
import { parseKakaoV4InhouseParticipantRow, type KakaoV4InhouseParticipant } from "./inhouse-snapshot-parser";
import { parseKakaoV4OperationForm } from "./operation-form";
import { parsePartyForm, type ParsedPartyForm } from "./party-snapshot-parser";

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
  parsedForm?: ParsedPartyForm;
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
  reviewRequired?: true;
}>;

export type KakaoV4InhouseMode = "RIFT" | "ARAM" | "AUGMENT_ARAM";

export type KakaoV4InhouseRoundMetadata = Readonly<{
  capacity: number;
  startTimeText: string | null;
  scheduledStartAt: string | null;
  noticeText: string | null;
}>;

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
      roundMetadata?: KakaoV4InhouseRoundMetadata;
      participants: readonly KakaoV4SeasonParticipant[];
      preserveSlotNos?: readonly number[];
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

function partyOperatingDate(timestamp: number) {
  return recruitingOperatingDateKey(new Date(timestamp * 1_000));
}

function numberParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function textParameter(parameters: Readonly<Record<string, string | number | boolean | null>>, key: string) {
  const value = parameters[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function partySnapshotMembers(parsed: ParsedPartyForm): readonly RecruitMember[] {
  const members = parsed.slots.flatMap((slot): readonly RecruitMember[] => {
    if (slot.state !== "PRESENT_VALUE" || !slot.value) return [];
    return [Object.freeze({
      slotNo: slot.slotNo,
      name: slot.value,
      position: slot.kind === "POSITION" ? slot.position : null,
      substitute: slot.kind === "RESERVE",
    })];
  });
  members.sort((left, right) => Number(left.substitute) - Number(right.substitute) || left.slotNo - right.slotNo);
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

function inhouseSnapshot(text: string, fallbackDate: string) {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  const lines = normalized.split("\n");
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
  if (!recruitNumber || !applyDate || capacity < 2 || capacity > 20 || !mode) return null;

  const schedulePattern = /^\s*》\s*20\d{2}-\d{2}-\d{2}\s+([01]?\d|2[0-3])\s*:\s*([0-5]\d)\s*시작(?:\s+(.*?))?\s*$/u;
  const scheduleIndex = lines.findIndex((line) => schedulePattern.test(line));
  const scheduleLine = scheduleIndex < 0 ? null : schedulePattern.exec(lines[scheduleIndex]!) ?? null;
  const startTimeText = scheduleLine
    ? `${String(Number(scheduleLine[1])).padStart(2, "0")}:${scheduleLine[2]}`
    : null;
  const scheduledStartAt = startTimeText
    ? new Date(`${applyDate}T${startTimeText}:00+09:00`).toISOString()
    : null;
  const safeNoticeLine = (value: string) => value.normalize("NFKC").trim()
    .replace(/[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "");
  const noticeCandidates: string[] = [];
  if (scheduleLine?.[3]) {
    const tailNotice = safeNoticeLine(scheduleLine[3]);
    if (tailNotice) noticeCandidates.push(tailNotice);
  }
  const firstSlotOffset = scheduleIndex < 0
    ? -1
    : lines.slice(scheduleIndex + 1).findIndex((line) => /^\s*(?:예비\s*)?\d{1,3}\s*(?:[.)．）]|\\\.)/u.test(line.normalize("NFKC")));
  const noticeWindow = scheduleIndex < 0
    ? []
    : lines.slice(scheduleIndex + 1, firstSlotOffset < 0 ? lines.length : scheduleIndex + 1 + firstSlotOffset);
  for (const line of noticeWindow) {
    const candidate = safeNoticeLine(line);
    if (!candidate) continue;
    if (
      /^📢\s*내전하실분\s*#\s*\d{1,3}$/u.test(candidate) ||
      /^》\s*(?:협곡|칼바람|증바람|증강칼바람)$/u.test(candidate) ||
      /^》\s*20\d{2}-\d{2}-\d{2}\s+/u.test(candidate) ||
      /^👥\s*\d{1,3}\s*\/\s*\d{1,3}\s*명$/u.test(candidate) ||
      /^\*참가 신청 양식\*$/u.test(candidate) ||
      /^이름(?:\/현티어\/최고티어\/주라인\/부라인)?$/u.test(candidate) ||
      /^EX\)\s*/iu.test(candidate) ||
      /^(?:예비\s*)?\d{1,3}\s*(?:[.)．）]|\\\.)/u.test(candidate)
    ) continue;
    noticeCandidates.push(candidate);
  }
  const noticeLines = [...new Set(noticeCandidates)]
    .slice(0, 6)
    .map((line) => line.slice(0, 160));
  const noticeText = noticeLines.join("\n").slice(0, 600) || null;

  type SlotValue =
    | Readonly<{ state: "EMPTY" }>
    | Readonly<{ state: "PRESERVE" }>
    | Readonly<{ state: "PARTICIPANT"; participant: KakaoV4InhouseParticipant }>;
  const slots = new Map<number, SlotValue>();
  const observedSlotNos = new Set<number>();
  const requireReview = (participant: KakaoV4InhouseParticipant): KakaoV4InhouseParticipant => Object.freeze({
    ...participant,
    reviewRequired: true,
  });
  for (const line of normalized.split("\n")) {
    const row = parseKakaoV4InhouseParticipantRow(line, mode);
    if (!row.matched) continue;
    const slotNo = row.slotNo;
    if (slotNo < 1 || slotNo > capacity) continue;
    const next: SlotValue = row.participant
      ? Object.freeze({ state: "PARTICIPANT", participant: row.participant })
      : row.valid
        ? Object.freeze({ state: "EMPTY" })
        : Object.freeze({ state: "PRESERVE" });
    const current = slots.get(slotNo);
    if (
      observedSlotNos.size === capacity &&
      next.state === "PARTICIPANT" && next.participant.reviewRequired
    ) {
      // After a complete roster, a weaker numbered fragment is a copied
      // footer/comment. Still accept a later valid edit or explicit empty row
      // so the established V1 last-write-wins workflow remains intact.
      continue;
    }
    observedSlotNos.add(slotNo);
    if (
      current?.state === "PARTICIPANT" && !current.participant.reviewRequired &&
      next.state === "PARTICIPANT" && next.participant.reviewRequired
    ) {
      // A copied footer such as `1. 공지...` can look like an incomplete
      // participant row. Never let that weaker row replace an already valid
      // slot. Valid-to-valid edits and explicit empty cancellations remain
      // last-write-wins for the established V1 workflow.
      continue;
    }
    // Kakao copies can contain the same numbered row more than once. V1 users
    // edit top-to-bottom, so the final occurrence is authoritative; a final
    // empty occurrence is therefore an explicit cancellation.
    slots.set(slotNo, next);
  }
  const preserveSlotNos: number[] = [];
  const participants: KakaoV4SeasonParticipant[] = [];
  const seenNames = new Set<string>();
  for (let slotNo = 1; slotNo <= capacity; slotNo += 1) {
    const slot = slots.get(slotNo);
    if (!slot || slot.state === "PRESERVE") {
      preserveSlotNos.push(slotNo);
      continue;
    }
    if (slot.state !== "PARTICIPANT") continue;
    const nameKey = slot.participant.name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ko-KR");
    const participant = seenNames.has(nameKey) ? requireReview(slot.participant) : slot.participant;
    seenNames.add(nameKey);
    participants.push(participant);
  }
  return Object.freeze({
    domain: "SEASON" as const,
    action: "SYNC" as const,
    seasonId: null,
    applyDate,
    recruitNumber,
    mode,
    roundMetadata: Object.freeze({ capacity, startTimeText, scheduledStartAt, noticeText }),
    participants: Object.freeze(participants),
    ...(preserveSlotNos.length > 0 ? { preserveSlotNos: Object.freeze(preserveSlotNos) } : {}),
  });
}

function cleanScrimValue(value: string | null) {
  const normalized = value?.normalize("NFKC").trim().replace(/\s+/gu, " ") ?? "";
  if (!normalized || /^(?:미정|없음|상대구함|상대\s*구함|모집중|비워두기|공란|-)$/u.test(normalized)) return null;
  return normalized;
}

function scrimSnapshot(text: string, fallbackDate: string, v1Strict: boolean): KakaoV4ScrimUpsertPayload | null {
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
  const v1Schedule = v1Strict ? parseV1StrictScrimTime(cleanScrimValue(timeText), applyDate) : null;
  const scheduledAt = v1Schedule?.scheduledAt ??
    (clock ? new Date(`${applyDate}T${String(Number(clock[1])).padStart(2, "0")}:${clock[2]}:00+09:00`).toISOString() : null);
  return Object.freeze({
    recruitDate: applyDate,
    scrimNumber: scrimNumberMatch ? Number(scrimNumberMatch[1]) : null,
    legacyTournamentNumber,
    title: `${requesterTeamName} 스크림 구인`,
    requesterTeamName,
    opponentTeamName,
    requesterLineup: sectionLineup(requesterIndex + 1, opponentIndex),
    opponentLineup: sectionLineup(opponentIndex + 1, lines.length),
    memo: v1Strict && !scheduledAt
      ? encodeV1StrictScrimTimeText(v1Schedule?.startTimeText ?? null)
      : cleanScrimValue(field("메모")),
    seriesRuleText: ruleText,
    scheduledAt,
    bestOf,
  });
}

export function canonicalizeKakaoV4Command(classification: KakaoV4CommandClassification, envelope: KakaoV4CommandEnvelope): CanonicalKakaoV4Command | null {
  if (classification.kind === "UNKNOWN" || classification.kind === "WRONG_PROFILE") return null;
  const date = kstDate(envelope.timestamp);
  const partyDate = partyOperatingDate(envelope.timestamp);
  const parameters = classification.parameters;
  if (classification.command === "PARTY_CREATE") {
    const partyType = (textParameter(parameters, "partyType") ?? "PARTY_NUMBER") as RecruitPartyType;
    const maximumMembers = numberParameter(parameters, "maximumMembers") ?? 5;
    return Object.freeze({ domain: "PARTY" as const, action: "CREATE" as const, payload: Object.freeze({
      recruitDate: partyDate, preferredRecruitNumber: numberParameter(parameters, "explicitRecruitNumber"), partyType,
      title: partyCreateTitle(partyType, maximumMembers, classification.canonicalText),
      maximumMembers, members: Object.freeze([]), startTimeText: null, gameInfo: null,
      scheduledStartAt: null, protectedUntil: null,
    }) });
  }
  if (classification.command === "PARTY_STATUS") return Object.freeze({ domain: "PARTY" as const, action: "STATUS" as const });
  if (classification.command === "PARTY_DETAIL" || classification.command === "PARTY_FINISH") {
    const recruitNumber = numberParameter(parameters, "recruitNumber");
    if (!recruitNumber) return null;
    return Object.freeze({ domain: "PARTY" as const, action: classification.command === "PARTY_DETAIL" ? "DETAIL" as const : "FINISH" as const, target: Object.freeze({ recruitDate: partyDate, recruitNumber }) });
  }
  if (classification.command === "PARTY_SNAPSHOT") {
    const parsedForm = parsePartyForm(envelope.text);
    const definition = parsedForm.submittedTitle;
    if (parsedForm.decision !== "EXACT" || !definition) return null;
    const recruitNumber = parsedForm.recruitNumber;
    return Object.freeze({
      domain: "PARTY" as const,
      action: "SYNC" as const,
      target: Object.freeze({ recruitDate: partyDate, recruitNumber }),
      payload: Object.freeze({
        recruitDate: partyDate,
        preferredRecruitNumber: recruitNumber,
        partyType: definition.partyType,
        title: definition.canonicalTitle,
        maximumMembers: definition.maximumMembers,
        members: partySnapshotMembers(parsedForm),
        startTimeText: parsedForm.startTime.state === "ABSENT" ? undefined : parsedForm.startTime.value,
        gameInfo: parsedForm.gameInfo.state === "ABSENT" ? undefined : parsedForm.gameInfo.value,
        scheduledStartAt: null,
        protectedUntil: null,
        parsedForm,
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
    return Object.freeze({ domain: "SCRIM" as const, action: "TEMPLATE" as const, recruitDate: partyDate });
  }
  if (classification.command === "SCRIM_SNAPSHOT") {
    const payload = scrimSnapshot(classification.canonicalText, partyDate, usesKakaoV1StrictResponse(envelope));
    return payload ? Object.freeze({ domain: "SCRIM" as const, action: "UPSERT" as const, payload }) : null;
  }
  if (classification.command === "SCRIM_STATUS") return Object.freeze({ domain: "SCRIM" as const, action: "STATUS" as const });
  if (classification.command === "SCRIM_DETAIL") {
    const recruitNumber = numberParameter(parameters, "scrimNumber");
    return recruitNumber ? Object.freeze({ domain: "SCRIM" as const, action: "DETAIL" as const, target: Object.freeze({ recruitDate: partyDate, recruitNumber }) }) : null;
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
