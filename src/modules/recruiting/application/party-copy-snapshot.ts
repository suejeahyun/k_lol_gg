import type { JsonObject } from "@/modules/competitions/core";
import type { RecruitMember, RecruitParty } from "../domain/recruiting";

export const isPartyFormCode = (value: string | null | undefined): value is string => typeof value === "string" && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(value);

type CopyParty = Pick<RecruitParty, "id" | "revision" | "status" | "type" | "maximumMembers" | "members" | "startTimeText" | "gameInfo" | "organizerText">;

const memberIdentity = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const memberKey = (member: RecruitMember) => `${member.substitute ? "SUB" : "MAIN"}:${member.slotNo}`;
function validCopyText(value: unknown, maximum: number): value is string {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= maximum;
}

export function partyCopySnapshot(party: CopyParty): JsonObject {
  return { version: 1, id: party.id, revision: party.revision, status: party.status, type: party.type,
    maximumMembers: party.maximumMembers, members: party.members.map((member) => ({ ...member })),
    startTimeText: party.startTimeText, gameInfo: party.gameInfo, organizerText: party.organizerText ?? null };
}

export function readPartyCopySnapshot(state: JsonObject | null, current: RecruitParty): RecruitParty {
  if (!state || state.version !== 1 || state.id !== current.id || state.type !== current.type || state.maximumMembers !== current.maximumMembers ||
      !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || Number(state.revision) > current.revision ||
      (state.status !== "DRAFT" && state.status !== "IN_PROGRESS") ||
      !validCopyText(state.startTimeText, 160) || !validCopyText(state.gameInfo, 500) ||
      (state.organizerText !== null && !validCopyText(state.organizerText, 100)) || !Array.isArray(state.members) || state.members.length > 99) throw new Error("PARTY_COPY_CONFLICT");
  const names = new Set<string>();
  const slots = new Set<string>();
  const positions = new Set<string>();
  const members = state.members.map((entry): RecruitMember => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !validCopyText(entry.name, 80) || !Number.isSafeInteger(entry.slotNo) ||
        Number(entry.slotNo) < 1 || Number(entry.slotNo) > 99 || (!entry.substitute && Number(entry.slotNo) > current.maximumMembers) ||
        typeof entry.substitute !== "boolean" || (entry.position !== null && !["TOP", "JGL", "MID", "ADC", "SUP"].includes(String(entry.position)))) throw new Error("PARTY_COPY_CONFLICT");
    const member: RecruitMember = { name: entry.name, slotNo: Number(entry.slotNo), substitute: entry.substitute, position: entry.position as RecruitMember["position"] };
    const identity = memberIdentity(member.name);
    const slot = memberKey(member);
    const position = member.position === null ? null : `${member.substitute ? "SUB" : "MAIN"}:${member.position}`;
    if (names.has(identity) || slots.has(slot) || (position !== null && positions.has(position))) throw new Error("PARTY_COPY_CONFLICT");
    names.add(identity);
    slots.add(slot);
    if (position !== null) positions.add(position);
    return member;
  });
  return { ...current, revision: Number(state.revision), status: state.status, members, startTimeText: state.startTimeText, gameInfo: state.gameInfo, organizerText: state.organizerText };
}

export function mergePartyCopyAdditions(base: RecruitParty, current: RecruitParty, submitted: readonly RecruitMember[]) {
  const original = new Map(base.members.map((member) => [memberKey(member), member]));
  const names = submitted.map((member) => memberIdentity(member.name));
  if (new Set(names).size !== names.length) throw new Error("PARTY_COPY_DUPLICATE_NAME");
  for (const member of base.members) {
    if (!submitted.some((row) => memberKey(row) === memberKey(member) && row.name === member.name && row.position === member.position)) throw new Error("PARTY_COPY_REMOVAL");
  }
  const merged = [...current.members];
  const lineParty = ["FLEX_RANK", "NORMAL_GAME", "PARTY_RIFT"].includes(current.type);
  for (const member of submitted.filter((row) => !original.has(memberKey(row)))) {
    if (merged.some((row) => memberIdentity(row.name) === memberIdentity(member.name))) continue;
    let slotNo = member.slotNo;
    if (merged.some((row) => row.substitute === member.substitute && row.slotNo === slotNo)) {
      if (!member.substitute && lineParty) throw new Error("PARTY_COPY_POSITION_TAKEN");
      slotNo = 1;
      while (merged.some((row) => row.substitute === member.substitute && row.slotNo === slotNo)) slotNo += 1;
    }
    if (!member.substitute && slotNo > current.maximumMembers) throw new Error("PARTY_COPY_FULL");
    if (slotNo > 99 || merged.length >= 99) throw new Error("PARTY_COPY_FULL");
    merged.push({ ...member, slotNo });
  }
  return merged;
}

/** A stored short-code original permits edits without overwriting intervening changes. */
export function mergePartyCopyEdits(
  base: RecruitParty,
  current: RecruitParty,
  submitted: Pick<RecruitParty, "members" | "startTimeText" | "gameInfo" | "organizerText">,
) {
  const mergeText = <T extends string | null>(original: T, latest: T, value: T): T => {
    if (value === original || value === latest) return latest;
    if (latest === original) return value;
    throw new Error("PARTY_COPY_EDIT_CONFLICT");
  };
  const metadata = {
    startTimeText: mergeText(base.startTimeText, current.startTimeText, submitted.startTimeText),
    gameInfo: mergeText(base.gameInfo, current.gameInfo, submitted.gameInfo),
    organizerText: mergeText(base.organizerText, current.organizerText, submitted.organizerText),
  };
  const original = new Map(base.members.map((member) => [memberKey(member), member]));
  const latest = new Map(current.members.map((member) => [memberKey(member), member]));
  const values = new Map(submitted.members.map((member) => [memberKey(member), member]));
  const originalNames = new Map(base.members.map((member) => [memberIdentity(member.name), member]));
  const names = submitted.members.map((member) => memberIdentity(member.name));
  if (new Set(names).size !== names.length) throw new Error("PARTY_COPY_DUPLICATE_NAME");
  if (values.size !== submitted.members.length) throw new Error("PARTY_COPY_EDIT_CONFLICT");
  const same = (left: RecruitMember | undefined, right: RecruitMember | undefined) =>
    left === undefined || right === undefined ? left === right :
      left.name === right.name && left.position === right.position && memberKey(left) === memberKey(right);
  for (const member of submitted.members) {
    const before = originalNames.get(memberIdentity(member.name));
    if (before && memberKey(before) !== memberKey(member) &&
        !same(latest.get(memberKey(before)), before) && !same(latest.get(memberKey(member)), member)) {
      throw new Error("PARTY_COPY_EDIT_CONFLICT");
    }
  }
  const merged = new Map(latest);
  const additions: RecruitMember[] = [];
  for (const key of new Set([...original.keys(), ...values.keys()])) {
    const before = original.get(key);
    const after = values.get(key);
    const present = latest.get(key);
    if (same(before, after) || same(present, after)) continue;
    // An old empty slot must not erase a participant who joined after the copy.
    if (!before && after) {
      additions.push(after);
      continue;
    }
    if (!same(present, before)) throw new Error("PARTY_COPY_EDIT_CONFLICT");
    if (after) merged.set(key, after);
    else merged.delete(key);
  }
  for (const member of additions) {
    const originalMember = originalNames.get(memberIdentity(member.name));
    const existing = [...merged.values()].find((row) => memberIdentity(row.name) === memberIdentity(member.name));
    if (originalMember) {
      // Moving a member needs both ends to remain consistent. A cancellation or
      // another move after the original must never be turned into a new signup.
      const originalCurrent = latest.get(memberKey(originalMember));
      if (!same(originalCurrent, originalMember)) throw new Error("PARTY_COPY_EDIT_CONFLICT");
      if (existing || merged.has(memberKey(member))) throw new Error("PARTY_COPY_EDIT_CONFLICT");
    } else if (existing) {
      // The same concurrent signup may already occupy the next vacant slot.
      if (existing.substitute !== member.substitute || existing.position !== member.position) throw new Error("PARTY_COPY_DUPLICATE_NAME");
      continue;
    }
    let slotNo = member.slotNo;
    if (merged.has(memberKey(member))) {
      if (!member.substitute && current.type !== "PARTY_NUMBER") throw new Error("PARTY_COPY_POSITION_TAKEN");
      slotNo = 1;
      while (merged.has(memberKey({ ...member, slotNo }))) slotNo += 1;
    }
    if (slotNo < 1 || slotNo > 99 || (!member.substitute && slotNo > current.maximumMembers)) throw new Error("PARTY_COPY_FULL");
    merged.set(memberKey({ ...member, slotNo }), { ...member, slotNo });
  }
  const members = [...merged.values()];
  if (members.length > 99 || members.filter((member) => !member.substitute).length > current.maximumMembers) throw new Error("PARTY_COPY_FULL");
  if (new Set(members.map((member) => memberIdentity(member.name))).size !== members.length) throw new Error("PARTY_COPY_DUPLICATE_NAME");
  return { ...metadata, members };
}
