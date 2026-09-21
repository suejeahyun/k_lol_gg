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
