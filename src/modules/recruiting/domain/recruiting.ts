export const RECRUIT_PARTY_TYPES = [
  "FLEX_RANK",
  "NORMAL_GAME",
  "SOLO_RANK",
  "ARAM",
  "TFT_NORMAL",
  "TFT_RANK",
  "DOUBLE_UP",
  "PARTY_NUMBER",
  "PARTY_RIFT",
  "OTHER_GAME",
] as const;

export type RecruitPartyType = (typeof RECRUIT_PARTY_TYPES)[number];
export type RecruitPartyStatus = "DRAFT" | "IN_PROGRESS" | "FINISHED" | "CANCELED" | "RESET";
export type ScrimRecruitStatus = "DRAFT" | "RECRUITING" | "MATCHED" | "CONFIRMED" | "COMPLETED" | "CANCELED";
export type RecruitPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
export type ScrimParticipantTeam = "REQUESTER" | "OPPONENT";

export type RecruitMember = Readonly<{
  name: string;
  position: RecruitPosition | null;
  slotNo: number;
  substitute: boolean;
}>;

export type RecruitPartyMemberMutation = Readonly<{
  action: "ADD" | "REMOVE";
  name: string;
}>;

export type RecruitPartyMemberMutationResult = Readonly<{
  party: RecruitParty;
  action: RecruitPartyMemberMutation["action"];
  outcome: "APPLIED" | "ALREADY_PRESENT" | "NOT_FOUND";
  name: string;
  slotNo: number | null;
  substitute: boolean | null;
}>;

export type RecruitPartyPatchState = "PRESENT_VALUE" | "PRESENT_EMPTY" | "ABSENT";

export function hasRecruitingMetadataActivationSignal(
  fields: readonly Readonly<{ state?: RecruitPartyPatchState; value?: string | null }>[],
) {
  return fields.every(({ state, value }) => state === "PRESENT_VALUE" ||
    (state === undefined && typeof value === "string" && value.trim().length > 0));
}

export type RecruitPartySlotPatch = Readonly<{
  slotNo: number;
  substitute: boolean;
  state: RecruitPartyPatchState;
  value: string | null;
}>;

export type ScrimLineup = Readonly<{
  top: string | null;
  jungle: string | null;
  mid: string | null;
  adc: string | null;
  support: string | null;
}>;

export type RecruitParty = Readonly<{
  id: string;
  revision: number;
  sourceRoomId: string | null;
  sourceSenderId: string | null;
  recruitDate: string;
  resetSequence: number;
  recruitNumber: number;
  type: RecruitPartyType;
  status: RecruitPartyStatus;
  title: string;
  maximumMembers: number;
  members: readonly RecruitMember[];
  startTimeText: string;
  gameInfo: string;
  organizerText: string | null;
  scheduledStartAt: Date | null;
  protectedUntil: Date | null;
  lastActivityAt: Date;
}>;

export type ScrimRecruit = Readonly<{
  id: string;
  revision: number;
  sourceRoomId: string | null;
  sourceSenderId: string | null;
  opponentSenderId: string | null;
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string | null;
  legacyTournamentNumber: number | null;
  requesterTeamId: string | null;
  opponentTeamId: string | null;
  legacyTitle?: string | null;
  requesterTeamName?: string | null;
  opponentTeamName?: string | null;
  requesterLineup: ScrimLineup | null;
  opponentLineup: ScrimLineup | null;
  legacyMemo: string | null;
  legacySeriesRuleText: string | null;
  organizerText?: string | null;
  status: ScrimRecruitStatus;
  scheduledAt: Date | null;
  bestOf: number | null;
}>;

export type PublicRecruitPartyDto = Readonly<{
  id: string;
  recruitNumber: number;
  type: RecruitPartyType;
  status: RecruitPartyStatus;
  title: string;
  memberCount: number;
  members: readonly Readonly<{
    name: string;
    position: RecruitPosition | null;
    slotNo: number;
    substitute: boolean;
  }>[];
  maximumMembers: number;
  startTimeText: string;
  gameInfo: string;
  organizerText: string | null;
  scheduledStartAt: string | null;
}>;

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identifier(value: string, code: string): string {
  if (!value || value !== value.trim() || value.length > 200) throw new Error(code);
  return value;
}

function cleanText(value: string, code: string, maximum: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function validDate(value: Date | null, code: string): void {
  if (value !== null && !Number.isFinite(value.getTime())) throw new Error(code);
}

function expectedRevision(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || actual !== expected) {
    throw new Error("STALE_RECRUIT_REVISION");
  }
}

export function kakaoRecruitDateKey(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_RECRUIT_TIME");
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

export function kakaoRecruitTimeText(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_RECRUIT_TIME");
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

function optionalPartyText(value: string | null | undefined, code: string, maximum: number): string | null {
  if (value === null || value === undefined || !value.trim()) return null;
  return cleanText(value, code, maximum);
}

export function canonicalRecruitRequestFingerprint(input: Readonly<{
  actor: "BOT" | "ACCOUNT" | "ADMIN" | "JOB";
  action: string;
  requestKey: string;
  payloadDigestHex: string;
}>): string {
  const action = cleanText(input.action.normalize("NFKC"), "INVALID_RECRUIT_ACTION", 60).toUpperCase();
  const requestKey = identifier(input.requestKey, "INVALID_RECRUIT_REQUEST_KEY");
  if (!/^[a-f0-9]{64}$/.test(input.payloadDigestHex)) throw new Error("INVALID_RECRUIT_PAYLOAD_DIGEST");
  return `${input.actor}:${action}:${requestKey}:${input.payloadDigestHex}`;
}

export function kakaoRoomOwnsRecruitAggregate(sourceRoomId: string | null, signedRoomId: string): boolean {
  return sourceRoomId !== null && sourceRoomId === signedRoomId;
}

export function kakaoSenderControlsRecruitAggregate(input: Readonly<{
  sourceSenderId: string | null;
  opponentSenderId?: string | null;
  signedSenderId: string;
  trustedSender: boolean;
}>): boolean {
  return input.trustedSender || input.sourceSenderId === input.signedSenderId || input.opponentSenderId === input.signedSenderId;
}

function normalizeMembers(members: readonly RecruitMember[], maximumMembers: number): readonly RecruitMember[] {
  if (members.length > 99) throw new Error("RECRUIT_MEMBER_LIMIT_EXCEEDED");
  if (members.filter((member) => !member.substitute).length > maximumMembers) throw new Error("RECRUIT_CAPACITY_EXCEEDED");
  const positions = new Set<string>();
  const slots = new Set<string>();
  return members.map((member) => {
    const name = cleanText(member.name, "INVALID_RECRUIT_MEMBER", 80);
    if (!Number.isSafeInteger(member.slotNo) || member.slotNo < 1 || member.slotNo > 99) {
      throw new Error("INVALID_RECRUIT_SLOT");
    }
    if (member.position) {
      const key = `${member.substitute ? "SUB" : "MAIN"}:${member.position}`;
      if (positions.has(key)) throw new Error("DUPLICATE_RECRUIT_POSITION");
      positions.add(key);
    }
    const slotKey = `${member.substitute ? "SUB" : "MAIN"}:${member.slotNo}`;
    if (slots.has(slotKey)) throw new Error("DUPLICATE_RECRUIT_SLOT");
    slots.add(slotKey);
    return { ...member, name };
  }).sort((left, right) => Number(left.substitute) - Number(right.substitute) || left.slotNo - right.slotNo || compareText(left.name, right.name));
}

const LINE_PARTY_TYPES: ReadonlySet<RecruitPartyType> = new Set(["FLEX_RANK", "NORMAL_GAME", "PARTY_RIFT"]);
const LINE_POSITIONS: readonly RecruitPosition[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function normalizedMemberIdentity(name: string): string {
  return cleanText(name, "INVALID_RECRUIT_MEMBER", 80).normalize("NFKC").toLocaleLowerCase("ko-KR");
}

/** Applies one name command to the locked aggregate without rebuilding its other slots. */
export function mutateRecruitPartyMember(input: Readonly<{
  party: RecruitParty;
  mutation: RecruitPartyMemberMutation;
  now: Date;
}>): RecruitPartyMemberMutationResult {
  if (input.party.status !== "IN_PROGRESS") throw new Error("RECRUIT_NOT_MUTABLE");
  validDate(input.now, "INVALID_RECRUIT_TIME");
  const name = cleanText(input.mutation.name, "INVALID_RECRUIT_MEMBER", 80);
  const identity = normalizedMemberIdentity(name);
  const matches = input.party.members.filter((member) => normalizedMemberIdentity(member.name) === identity);

  if (input.mutation.action === "REMOVE") {
    if (matches.length === 0) {
      return { party: input.party, action: "REMOVE", outcome: "NOT_FOUND", name, slotNo: null, substitute: null };
    }
    if (matches.length !== 1) throw new Error("AMBIGUOUS_MEMBER");
    const removed = matches[0]!;
    const party = syncRecruitParty({
      party: input.party,
      expectedRevision: input.party.revision,
      members: input.party.members.filter((member) => member !== removed),
      now: input.now,
    });
    return {
      party,
      action: "REMOVE",
      outcome: "APPLIED",
      name: removed.name,
      slotNo: removed.slotNo,
      substitute: removed.substitute,
    };
  }

  if (input.mutation.action !== "ADD") throw new Error("INVALID_RECRUIT_MEMBER_MUTATION");
  if (matches.length > 0) {
    const existing = matches[0]!;
    return {
      party: input.party,
      action: "ADD",
      outcome: "ALREADY_PRESENT",
      name: existing.name,
      slotNo: existing.slotNo,
      substitute: existing.substitute,
    };
  }
  if (input.party.members.length >= 99) throw new Error("RECRUIT_MEMBER_LIMIT_EXCEEDED");

  const occupiedPrimarySlots = new Set(
    input.party.members.filter((member) => !member.substitute).map((member) => member.slotNo),
  );
  let slotNo = 1;
  while (slotNo <= input.party.maximumMembers && occupiedPrimarySlots.has(slotNo)) slotNo += 1;
  const substitute = occupiedPrimarySlots.size >= input.party.maximumMembers || slotNo > input.party.maximumMembers;
  if (substitute) {
    const occupiedReserveSlots = new Set(
      input.party.members.filter((member) => member.substitute).map((member) => member.slotNo),
    );
    slotNo = 1;
    while (slotNo <= 99 && occupiedReserveSlots.has(slotNo)) slotNo += 1;
    if (slotNo > 99) throw new Error("RECRUIT_MEMBER_LIMIT_EXCEEDED");
  }
  const member: RecruitMember = {
    name,
    position: !substitute && LINE_PARTY_TYPES.has(input.party.type) ? LINE_POSITIONS[slotNo - 1] ?? null : null,
    slotNo,
    substitute,
  };
  const party = syncRecruitParty({
    party: input.party,
    expectedRevision: input.party.revision,
    members: [...input.party.members, member],
    now: input.now,
  });
  return { party, action: "ADD", outcome: "APPLIED", name, slotNo, substitute };
}

/** Applies only explicitly represented form slots; absent slots retain the stored member. */
export function mergeRecruitPartySlotPatches(
  party: RecruitParty,
  patches: readonly RecruitPartySlotPatch[],
): readonly RecruitMember[] {
  const members = new Map(party.members.map((member) => [`${member.substitute ? "SUB" : "MAIN"}:${member.slotNo}`, member]));
  const patched = new Set<string>();
  for (const patch of patches) {
    if (!Number.isSafeInteger(patch.slotNo) || patch.slotNo < 1 || patch.slotNo > 99) throw new Error("INVALID_RECRUIT_SLOT");
    if (!patch.substitute && patch.slotNo > party.maximumMembers) throw new Error("RECRUIT_CAPACITY_EXCEEDED");
    if (!patch.substitute && LINE_PARTY_TYPES.has(party.type) && patch.slotNo > LINE_POSITIONS.length) throw new Error("INVALID_RECRUIT_SLOT");
    const key = `${patch.substitute ? "SUB" : "MAIN"}:${patch.slotNo}`;
    if (patched.has(key)) throw new Error("DUPLICATE_RECRUIT_SLOT");
    patched.add(key);
    if (patch.state === "ABSENT") continue;
    if (patch.state === "PRESENT_EMPTY") {
      members.delete(key);
      continue;
    }
    if (patch.state !== "PRESENT_VALUE" || patch.value === null) throw new Error("INVALID_RECRUIT_MEMBER");
    // A copied unchanged row must not rewrite legacy position metadata.
    if (members.get(key)?.name === patch.value) continue;
    members.set(key, {
      slotNo: patch.slotNo,
      name: patch.value,
      position: !patch.substitute && LINE_PARTY_TYPES.has(party.type) ? LINE_POSITIONS[patch.slotNo - 1]! : null,
      substitute: patch.substitute,
    });
  }
  return Object.freeze([...members.values()]);
}

function sameMembers(left: readonly RecruitMember[], right: readonly RecruitMember[]) {
  return left.length === right.length && left.every((member, index) => {
    const candidate = right[index];
    return candidate !== undefined && member.name === candidate.name && member.position === candidate.position &&
      member.slotNo === candidate.slotNo && member.substitute === candidate.substitute;
  });
}

export function createRecruitParty(input: Readonly<{
  id: string;
  sourceRoomId?: string | null;
  sourceSenderId?: string | null;
  recruitDate: string;
  resetSequence: number;
  recruitNumber: number;
  type: RecruitPartyType;
  title: string;
  maximumMembers: number;
  members?: readonly RecruitMember[];
  startTimeText?: string | null;
  gameInfo?: string | null;
  organizerText?: string | null;
  scheduledStartAt?: Date | null;
  protectedUntil?: Date | null;
  initialStatus?: "DRAFT";
  now: Date;
}>): RecruitParty {
  identifier(input.id, "INVALID_RECRUIT_ID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recruitDate)) throw new Error("INVALID_RECRUIT_DATE");
  if (!Number.isSafeInteger(input.resetSequence) || input.resetSequence < 0) throw new Error("INVALID_RESET_SEQUENCE");
  if (!Number.isSafeInteger(input.recruitNumber) || input.recruitNumber < 1 || input.recruitNumber > 99) throw new Error("INVALID_RECRUIT_NUMBER");
  if (!RECRUIT_PARTY_TYPES.includes(input.type)) throw new Error("INVALID_RECRUIT_TYPE");
  if (!Number.isSafeInteger(input.maximumMembers) || input.maximumMembers < 1 || input.maximumMembers > 99) throw new Error("INVALID_RECRUIT_CAPACITY");
  validDate(input.now, "INVALID_RECRUIT_TIME");
  validDate(input.scheduledStartAt ?? null, "INVALID_RECRUIT_SCHEDULE");
  validDate(input.protectedUntil ?? null, "INVALID_RECRUIT_PROTECTION");
  if (input.protectedUntil && input.scheduledStartAt && input.protectedUntil < input.scheduledStartAt) {
    throw new Error("INVALID_RECRUIT_PROTECTION");
  }
  return {
    id: input.id,
    revision: 0,
    sourceRoomId: input.sourceRoomId ? identifier(input.sourceRoomId, "INVALID_RECRUIT_SOURCE_ROOM") : null,
    sourceSenderId: input.sourceSenderId ? identifier(input.sourceSenderId, "INVALID_RECRUIT_SOURCE_SENDER") : null,
    recruitDate: input.recruitDate,
    resetSequence: input.resetSequence,
    recruitNumber: input.recruitNumber,
    type: input.type,
    status: input.initialStatus ?? "IN_PROGRESS",
    title: cleanText(input.title, "INVALID_RECRUIT_TITLE", 160),
    maximumMembers: input.maximumMembers,
    members: normalizeMembers(input.members ?? [], input.maximumMembers),
    startTimeText: optionalPartyText(input.startTimeText, "INVALID_RECRUIT_START_TIME_TEXT", 160) ?? kakaoRecruitTimeText(input.now),
    gameInfo: optionalPartyText(input.gameInfo, "INVALID_RECRUIT_GAME_INFO", 500) ?? "미입력",
    organizerText: optionalPartyText(input.organizerText, "INVALID_RECRUIT_ORGANIZER_TEXT", 100),
    scheduledStartAt: input.scheduledStartAt ?? null,
    protectedUntil: input.protectedUntil ?? null,
    lastActivityAt: input.now,
  };
}

export function syncRecruitParty(input: Readonly<{
  party: RecruitParty;
  expectedRevision: number;
  members: readonly RecruitMember[];
  startTimeText?: string | null;
  startTimeState?: RecruitPartyPatchState;
  gameInfo?: string | null;
  gameInfoState?: RecruitPartyPatchState;
  organizerText?: string | null;
  organizerState?: RecruitPartyPatchState;
  scheduledStartAt?: Date | null;
  now: Date;
}>): RecruitParty {
  expectedRevision(input.party.revision, input.expectedRevision);
  if (input.party.status !== "IN_PROGRESS" && input.party.status !== "DRAFT") throw new Error("RECRUIT_NOT_MUTABLE");
  validDate(input.now, "INVALID_RECRUIT_TIME");
  const activatingDraft = input.party.status === "DRAFT";
  const metadataActivationSignal = hasRecruitingMetadataActivationSignal([
    { state: input.organizerState, value: input.organizerText },
  ]);
  const startTimeText = input.startTimeState === "ABSENT"
    ? activatingDraft ? kakaoRecruitTimeText(input.now) : input.party.startTimeText
    : input.startTimeState === "PRESENT_EMPTY"
      ? activatingDraft ? kakaoRecruitTimeText(input.now) : "미정"
      : input.startTimeState === "PRESENT_VALUE"
        ? cleanText(input.startTimeText ?? "", "INVALID_RECRUIT_START_TIME_TEXT", 160)
        : optionalPartyText(input.startTimeText, "INVALID_RECRUIT_START_TIME_TEXT", 160)
          ?? (activatingDraft ? kakaoRecruitTimeText(input.now) : input.party.startTimeText);
  const gameInfo = input.gameInfoState === "ABSENT"
    ? activatingDraft ? "미입력" : input.party.gameInfo
    : input.gameInfoState === "PRESENT_EMPTY"
      ? "미입력"
      : input.gameInfoState === "PRESENT_VALUE"
        ? cleanText(input.gameInfo ?? "", "INVALID_RECRUIT_GAME_INFO", 500)
        : optionalPartyText(input.gameInfo, "INVALID_RECRUIT_GAME_INFO", 500)
          ?? (activatingDraft ? "미입력" : input.party.gameInfo);
  const organizerText = input.organizerState === "ABSENT"
    ? input.party.organizerText
    : input.organizerState === "PRESENT_EMPTY"
      ? null
      : input.organizerState === "PRESENT_VALUE"
        ? cleanText(input.organizerText ?? "", "INVALID_RECRUIT_ORGANIZER_TEXT", 100)
        : optionalPartyText(input.organizerText, "INVALID_RECRUIT_ORGANIZER_TEXT", 100)
          ?? input.party.organizerText;
  const submittedMembers = normalizeMembers(input.members, input.party.maximumMembers);
  if (activatingDraft && submittedMembers.length === 0 && !metadataActivationSignal) throw new Error("EMPTY_DRAFT_ACTIVATION");
  // A metadata-only V1 form names the organizer but has no member rows. On the
  // first activation only, treat that organizer as the first participant.
  const members = activatingDraft && submittedMembers.length === 0 && organizerText
    ? normalizeMembers([{
        name: organizerText,
        position: LINE_PARTY_TYPES.has(input.party.type) ? LINE_POSITIONS[0]! : null,
        slotNo: 1,
        substitute: false,
      }], input.party.maximumMembers)
    : submittedMembers;
  const scheduledStartAt = input.startTimeState === "ABSENT" ||
    (input.startTimeState === undefined && (input.startTimeText === null || input.startTimeText === undefined))
    ? input.party.scheduledStartAt
    : input.scheduledStartAt ?? null;
  if (
    !activatingDraft && sameMembers(input.party.members, members) &&
    input.party.startTimeText === startTimeText && input.party.gameInfo === gameInfo &&
    input.party.organizerText === organizerText &&
    input.party.scheduledStartAt?.getTime() === scheduledStartAt?.getTime()
  ) return input.party;
  return {
    ...input.party,
    revision: input.party.revision + 1,
    status: "IN_PROGRESS",
    members,
    startTimeText,
    gameInfo,
    organizerText,
    scheduledStartAt,
    lastActivityAt: input.now,
  };
}

export function transitionRecruitParty(input: Readonly<{
  party: RecruitParty;
  expectedRevision: number;
  command: "FINISH" | "CANCEL" | "RESET";
  now: Date;
}>): RecruitParty {
  expectedRevision(input.party.revision, input.expectedRevision);
  validDate(input.now, "INVALID_RECRUIT_TIME");
  if (input.party.status === "DRAFT" && input.command === "FINISH") {
    return { ...input.party, revision: input.party.revision + 1, status: "CANCELED", lastActivityAt: input.now };
  }
  if (input.party.status !== "IN_PROGRESS") throw new Error("RECRUIT_NOT_MUTABLE");
  const status = input.command === "FINISH" ? "FINISHED" : input.command === "CANCEL" ? "CANCELED" : "RESET";
  return { ...input.party, revision: input.party.revision + 1, status, lastActivityAt: input.now };
}

export function shouldAutoFinishRecruit(input: Readonly<{
  party: RecruitParty;
  now: Date;
  idleMilliseconds: number;
}>): boolean {
  if (input.party.status !== "IN_PROGRESS") return false;
  validDate(input.now, "INVALID_RECRUIT_TIME");
  if (!Number.isSafeInteger(input.idleMilliseconds) || input.idleMilliseconds <= 0) throw new Error("INVALID_IDLE_WINDOW");
  if (input.party.protectedUntil && input.now < input.party.protectedUntil) return false;
  return input.now.getTime() - input.party.lastActivityAt.getTime() >= input.idleMilliseconds;
}

export function toPublicRecruitPartyDto(party: RecruitParty): PublicRecruitPartyDto {
  return {
    id: party.id,
    recruitNumber: party.recruitNumber,
    type: party.type,
    status: party.status,
    title: party.title,
    memberCount: party.members.filter((member) => !member.substitute).length,
    members: Object.freeze(party.members.map((member) => Object.freeze({
      name: member.name,
      position: member.position,
      slotNo: member.slotNo,
      substitute: member.substitute,
    }))),
    maximumMembers: party.maximumMembers,
    startTimeText: party.startTimeText,
    gameInfo: party.gameInfo,
    organizerText: party.organizerText,
    scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
  };
}

export function transitionScrimRecruit(input: Readonly<{
  scrim: ScrimRecruit;
  expectedRevision: number;
  command: "JOIN" | "CONFIRM" | "FINISH" | "COMPLETE" | "CANCEL" | "REOPEN";
  opponentTeamId?: string | null;
  opponentSenderId?: string | null;
}>): ScrimRecruit {
  expectedRevision(input.scrim.revision, input.expectedRevision);
  let status: ScrimRecruitStatus;
  let opponentTeamId = input.scrim.opponentTeamId;
  let opponentSenderId = input.scrim.opponentSenderId;
  if (input.command === "JOIN" && input.scrim.status === "RECRUITING") {
    const candidate = identifier(input.opponentTeamId ?? "", "INVALID_SCRIM_OPPONENT");
    if (candidate === input.scrim.requesterTeamId) throw new Error("SAME_SCRIM_TEAM");
    opponentTeamId = candidate;
    opponentSenderId = input.opponentSenderId ? identifier(input.opponentSenderId, "INVALID_SCRIM_OPPONENT_SENDER") : null;
    status = "MATCHED";
  } else if (input.command === "CONFIRM" && input.scrim.status === "MATCHED" && opponentTeamId) {
    status = "CONFIRMED";
  } else if (input.command === "FINISH" && ["RECRUITING", "MATCHED", "CONFIRMED"].includes(input.scrim.status)) {
    status = "COMPLETED";
  } else if (input.command === "COMPLETE" && input.scrim.status === "CONFIRMED") {
    status = "COMPLETED";
  } else if (input.command === "CANCEL" && !["COMPLETED", "CANCELED"].includes(input.scrim.status)) {
    status = "CANCELED";
  } else if (input.command === "REOPEN" && input.scrim.status === "MATCHED") {
    status = "RECRUITING";
    opponentTeamId = null;
    opponentSenderId = null;
  } else {
    throw new Error("INVALID_SCRIM_TRANSITION");
  }
  return { ...input.scrim, revision: input.scrim.revision + 1, opponentTeamId, opponentSenderId, status };
}

function normalizeScrimParticipantName(value: string): string {
  return cleanText(value, "INVALID_SCRIM_PARTICIPANT", 80);
}

const SCRIM_LINEUP_KEYS = ["top", "jungle", "mid", "adc", "support"] as const;
const SCRIM_POSITION_KEY = Object.freeze({ TOP: "top", JGL: "jungle", MID: "mid", ADC: "adc", SUP: "support" } as const);

function emptyScrimLineup(): ScrimLineup {
  return Object.freeze({ top: null, jungle: null, mid: null, adc: null, support: null });
}

/** Adds/removes a name from the existing V1 five-line lineups, which remain the single roster source of truth. */
export function mutateScrimParticipant(input: Readonly<{
  scrim: ScrimRecruit;
  expectedRevision: number;
  action: "ADD" | "REMOVE";
  name: string;
  team?: ScrimParticipantTeam;
  position?: RecruitPosition | "ALL";
}>): Readonly<{ scrim: ScrimRecruit; outcome: "APPLIED" | "ALREADY_PRESENT" | "NOT_FOUND" }> {
  expectedRevision(input.scrim.revision, input.expectedRevision);
  if (!["RECRUITING", "MATCHED", "CONFIRMED"].includes(input.scrim.status)) throw new Error("INVALID_SCRIM_TRANSITION");
  const name = normalizeScrimParticipantName(input.name);
  const normalizedName = name.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const teams = input.team ? [input.team] : ["REQUESTER", "OPPONENT"] as const;
  const lineups = {
    REQUESTER: input.scrim.requesterLineup ?? emptyScrimLineup(),
    OPPONENT: input.scrim.opponentLineup ?? emptyScrimLineup(),
  };
  const matches = teams.flatMap((team) => SCRIM_LINEUP_KEYS.flatMap((key) =>
    lineups[team][key]?.normalize("NFKC").toLocaleLowerCase("ko-KR") === normalizedName ? [{ team, key }] : []));
  if (input.action === "REMOVE") {
    if (matches.length === 0) return { scrim: input.scrim, outcome: "NOT_FOUND" };
    if (matches.length > 1) throw new Error("AMBIGUOUS_SCRIM_PARTICIPANT");
    const match = matches[0]!;
    const lineup = { ...lineups[match.team], [match.key]: null };
    return { scrim: {
      ...input.scrim,
      revision: input.scrim.revision + 1,
      ...(match.team === "REQUESTER" ? { requesterLineup: lineup } : { opponentLineup: lineup }),
    }, outcome: "APPLIED" };
  }
  const allMatches = (["REQUESTER", "OPPONENT"] as const).flatMap((candidateTeam) => SCRIM_LINEUP_KEYS.filter((key) =>
    lineups[candidateTeam][key]?.normalize("NFKC").toLocaleLowerCase("ko-KR") === normalizedName));
  if (allMatches.length > 0) return { scrim: input.scrim, outcome: "ALREADY_PRESENT" };
  const team = input.team ?? "REQUESTER";
  const requestedKey = input.position && input.position !== "ALL" ? SCRIM_POSITION_KEY[input.position] : null;
  const key = requestedKey ?? SCRIM_LINEUP_KEYS.find((candidate) => lineups[team][candidate] === null);
  if (!key || lineups[team][key] !== null) throw new Error("SCRIM_PARTICIPANT_LIMIT_EXCEEDED");
  const lineup = { ...lineups[team], [key]: name };
  return { scrim: {
    ...input.scrim,
    revision: input.scrim.revision + 1,
    ...(team === "REQUESTER" ? { requesterLineup: lineup } : { opponentLineup: lineup }),
  }, outcome: "APPLIED" };
}

function scrimLineupHasMember(lineup: ScrimLineup | null): boolean {
  return lineup !== null && Object.values(lineup).some((member) => member !== null);
}

/** Replaces one active V1-compatible form without allowing its date/number/tournament identity to drift. */
export function syncScrimRecruit(input: Readonly<{
  scrim: ScrimRecruit;
  expectedRevision: number;
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string | null;
  legacyTournamentNumber: number | null;
  requesterTeamId: string | null;
  opponentTeamId: string | null;
  legacyTitle: string | null;
  requesterTeamName: string | null;
  opponentTeamName: string | null;
  requesterLineup: ScrimLineup | null;
  opponentLineup: ScrimLineup | null;
  legacyMemo: string | null;
  legacySeriesRuleText: string | null;
  scheduledAt: Date | null;
  bestOf: number;
  organizerText?: string | null;
}>): ScrimRecruit {
  expectedRevision(input.scrim.revision, input.expectedRevision);
  if (["COMPLETED", "CANCELED"].includes(input.scrim.status)) throw new Error("INVALID_SCRIM_TRANSITION");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.recruitDate)) throw new Error("INVALID_RECRUIT_DATE");
  if (!Number.isSafeInteger(input.scrimNumber) || input.scrimNumber < 1 || input.scrimNumber > 99) throw new Error("INVALID_SCRIM_NUMBER");
  if (input.tournamentId !== null) identifier(input.tournamentId, "INVALID_SCRIM_TOURNAMENT");
  if (input.tournamentId === null && (!Number.isSafeInteger(input.legacyTournamentNumber) || input.legacyTournamentNumber === null || input.legacyTournamentNumber < 1 || input.legacyTournamentNumber > 9999)) {
    throw new Error("INVALID_SCRIM_TOURNAMENT");
  }
  if (input.scrim.status !== "DRAFT" && (
    input.recruitDate !== input.scrim.recruitDate ||
    input.scrimNumber !== input.scrim.scrimNumber ||
    input.tournamentId !== input.scrim.tournamentId ||
    input.legacyTournamentNumber !== input.scrim.legacyTournamentNumber
  )) throw new Error("SCRIM_IDENTITY_MISMATCH");
  if (input.requesterTeamId !== null) identifier(input.requesterTeamId, "INVALID_SCRIM_REQUESTER");
  if (input.requesterTeamId === null && input.requesterTeamName === null) throw new Error("INVALID_SCRIM_REQUESTER");
  if (input.opponentTeamId !== null) identifier(input.opponentTeamId, "INVALID_SCRIM_OPPONENT");
  if (input.opponentTeamId !== null && input.opponentTeamId === input.requesterTeamId) throw new Error("SAME_SCRIM_TEAM");
  validDate(input.scheduledAt, "INVALID_SCRIM_SCHEDULE");
  if (![1, 3, 5].includes(input.bestOf)) throw new Error("INVALID_BEST_OF");

  const hasOpponent = input.opponentTeamId !== null || input.opponentTeamName !== null || scrimLineupHasMember(input.opponentLineup);
  const status: ScrimRecruitStatus = hasOpponent
    ? input.scrim.status === "CONFIRMED" ? "CONFIRMED" : "MATCHED"
    : "RECRUITING";
  return {
    ...input.scrim,
    revision: input.scrim.revision + 1,
    tournamentId: input.tournamentId,
    legacyTournamentNumber: input.legacyTournamentNumber,
    requesterTeamId: input.requesterTeamId,
    opponentTeamId: input.opponentTeamId,
    opponentSenderId: hasOpponent ? input.scrim.opponentSenderId : null,
    legacyTitle: input.legacyTitle,
    requesterTeamName: input.requesterTeamName,
    opponentTeamName: input.opponentTeamName,
    requesterLineup: input.requesterLineup,
    opponentLineup: input.opponentLineup,
    legacyMemo: input.legacyMemo,
    legacySeriesRuleText: input.legacySeriesRuleText,
    organizerText: optionalPartyText(input.organizerText, "INVALID_SCRIM_ORGANIZER_TEXT", 100) ?? input.scrim.organizerText,
    status,
    scheduledAt: input.scheduledAt,
    bestOf: input.bestOf,
  };
}
