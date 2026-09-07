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
export type ScrimRecruitStatus = "RECRUITING" | "MATCHED" | "CONFIRMED" | "COMPLETED" | "CANCELED";
export type RecruitPosition = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

export type RecruitMember = Readonly<{
  name: string;
  position: RecruitPosition | null;
  slotNo: number;
  substitute: boolean;
}>;

export type RecruitParty = Readonly<{
  id: string;
  revision: number;
  recruitDate: string;
  resetSequence: number;
  recruitNumber: number;
  type: RecruitPartyType;
  status: RecruitPartyStatus;
  title: string;
  maximumMembers: number;
  members: readonly RecruitMember[];
  scheduledStartAt: Date | null;
  protectedUntil: Date | null;
  lastActivityAt: Date;
}>;

export type ScrimRecruit = Readonly<{
  id: string;
  revision: number;
  recruitDate: string;
  scrimNumber: number;
  tournamentId: string;
  requesterTeamId: string | null;
  opponentTeamId: string | null;
  legacyTitle?: string | null;
  requesterTeamName?: string | null;
  opponentTeamName?: string | null;
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
  maximumMembers: number;
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
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
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

export function canonicalRecruitRequestFingerprint(input: Readonly<{
  actor: "BOT" | "ACCOUNT" | "ADMIN" | "JOB";
  action: string;
  requestKey: string;
  payloadDigestHex: string;
}>): string {
  const action = cleanText(input.action, "INVALID_RECRUIT_ACTION", 60).toUpperCase();
  const requestKey = identifier(input.requestKey, "INVALID_RECRUIT_REQUEST_KEY");
  if (!/^[a-f0-9]{64}$/.test(input.payloadDigestHex)) throw new Error("INVALID_RECRUIT_PAYLOAD_DIGEST");
  return `${input.actor}:${action}:${requestKey}:${input.payloadDigestHex}`;
}

function normalizeMembers(members: readonly RecruitMember[], maximumMembers: number): readonly RecruitMember[] {
  if (members.length > maximumMembers) throw new Error("RECRUIT_CAPACITY_EXCEEDED");
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

export function createRecruitParty(input: Readonly<{
  id: string;
  recruitDate: string;
  resetSequence: number;
  recruitNumber: number;
  type: RecruitPartyType;
  title: string;
  maximumMembers: number;
  members?: readonly RecruitMember[];
  scheduledStartAt?: Date | null;
  protectedUntil?: Date | null;
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
    recruitDate: input.recruitDate,
    resetSequence: input.resetSequence,
    recruitNumber: input.recruitNumber,
    type: input.type,
    status: "IN_PROGRESS",
    title: cleanText(input.title, "INVALID_RECRUIT_TITLE", 160),
    maximumMembers: input.maximumMembers,
    members: normalizeMembers(input.members ?? [], input.maximumMembers),
    scheduledStartAt: input.scheduledStartAt ?? null,
    protectedUntil: input.protectedUntil ?? null,
    lastActivityAt: input.now,
  };
}

export function syncRecruitParty(input: Readonly<{
  party: RecruitParty;
  expectedRevision: number;
  members: readonly RecruitMember[];
  now: Date;
}>): RecruitParty {
  expectedRevision(input.party.revision, input.expectedRevision);
  if (input.party.status !== "IN_PROGRESS") throw new Error("RECRUIT_NOT_MUTABLE");
  validDate(input.now, "INVALID_RECRUIT_TIME");
  return {
    ...input.party,
    revision: input.party.revision + 1,
    members: normalizeMembers(input.members, input.party.maximumMembers),
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
    maximumMembers: party.maximumMembers,
    scheduledStartAt: party.scheduledStartAt?.toISOString() ?? null,
  };
}

export function transitionScrimRecruit(input: Readonly<{
  scrim: ScrimRecruit;
  expectedRevision: number;
  command: "JOIN" | "CONFIRM" | "COMPLETE" | "CANCEL" | "REOPEN";
  opponentTeamId?: string | null;
}>): ScrimRecruit {
  expectedRevision(input.scrim.revision, input.expectedRevision);
  let status: ScrimRecruitStatus;
  let opponentTeamId = input.scrim.opponentTeamId;
  if (input.command === "JOIN" && input.scrim.status === "RECRUITING") {
    const candidate = identifier(input.opponentTeamId ?? "", "INVALID_SCRIM_OPPONENT");
    if (candidate === input.scrim.requesterTeamId) throw new Error("SAME_SCRIM_TEAM");
    opponentTeamId = candidate;
    status = "MATCHED";
  } else if (input.command === "CONFIRM" && input.scrim.status === "MATCHED" && opponentTeamId) {
    status = "CONFIRMED";
  } else if (input.command === "COMPLETE" && input.scrim.status === "CONFIRMED") {
    status = "COMPLETED";
  } else if (input.command === "CANCEL" && !["COMPLETED", "CANCELED"].includes(input.scrim.status)) {
    status = "CANCELED";
  } else if (input.command === "REOPEN" && input.scrim.status === "MATCHED") {
    status = "RECRUITING";
    opponentTeamId = null;
  } else {
    throw new Error("INVALID_SCRIM_TRANSITION");
  }
  return { ...input.scrim, revision: input.scrim.revision + 1, opponentTeamId, status };
}
