import {
  RECRUIT_PARTY_TYPES,
  type RecruitMember,
} from "../domain/recruiting";
import type { RecruitingCommand } from "../application/commands";

const COMMAND_TYPES = new Set<RecruitingCommand["type"]>([
  "CREATE_PARTY", "SYNC_PARTY", "GET_PARTY_STATUS", "FINISH_PARTY", "CANCEL_PARTY", "RESET_PARTY",
  "CREATE_SCRIM", "JOIN_SCRIM", "REOPEN_SCRIM", "CONFIRM_SCRIM", "COMPLETE_SCRIM", "CANCEL_SCRIM",
]);
const POSITIONS = new Set(["TOP", "JGL", "MID", "ADC", "SUP"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function integer(value: unknown, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" && value === value.trim() && value.length >= 1 && value.length <= maximum;
}

function nullableInstant(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function member(value: unknown): value is RecruitMember {
  const item = record(value);
  return item !== null && exactKeys(item, ["name", "position", "slotNo", "substitute"]) &&
    text(item.name, 80) &&
    (item.position === null || (typeof item.position === "string" && POSITIONS.has(item.position))) &&
    integer(item.slotNo, 1, 99) && typeof item.substitute === "boolean";
}

function payloadFor(type: RecruitingCommand["type"], value: unknown): RecruitingCommand["payload"] | null {
  const payload = record(value);
  if (!payload) return null;
  switch (type) {
    case "CREATE_PARTY":
      if (!exactKeys(payload, ["recruitDate", "resetSequence", "recruitNumber", "partyType", "title", "maximumMembers", "members", "scheduledStartAt", "protectedUntil"])) return null;
      if (
        typeof payload.recruitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(payload.recruitDate) ||
        !integer(payload.resetSequence, 0, 999) || !integer(payload.recruitNumber, 1, 99) ||
        typeof payload.partyType !== "string" || !RECRUIT_PARTY_TYPES.includes(payload.partyType as (typeof RECRUIT_PARTY_TYPES)[number]) ||
        !text(payload.title, 160) || !integer(payload.maximumMembers, 1, 99) ||
        !Array.isArray(payload.members) || !payload.members.every(member) ||
        !nullableInstant(payload.scheduledStartAt) || !nullableInstant(payload.protectedUntil)
      ) return null;
      return payload as RecruitingCommand["payload"];
    case "SYNC_PARTY":
      return exactKeys(payload, ["members"]) && Array.isArray(payload.members) && payload.members.every(member)
        ? payload as RecruitingCommand["payload"] : null;
    case "GET_PARTY_STATUS":
    case "FINISH_PARTY":
    case "CANCEL_PARTY":
    case "RESET_PARTY":
    case "REOPEN_SCRIM":
    case "CONFIRM_SCRIM":
    case "COMPLETE_SCRIM":
    case "CANCEL_SCRIM":
      return exactKeys(payload, []) ? {} : null;
    case "CREATE_SCRIM":
      if (!exactKeys(payload, ["recruitDate", "scrimNumber", "tournamentId", "requesterTeamId", "scheduledAt", "bestOf"])) return null;
      if (
        typeof payload.recruitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(payload.recruitDate) ||
        !integer(payload.scrimNumber, 1, 99) || !uuid(payload.tournamentId) || !uuid(payload.requesterTeamId) ||
        !nullableInstant(payload.scheduledAt) || ![1, 3, 5].includes(Number(payload.bestOf))
      ) return null;
      return payload as RecruitingCommand["payload"];
    case "JOIN_SCRIM":
      return exactKeys(payload, ["opponentTeamId"]) && uuid(payload.opponentTeamId)
        ? payload as RecruitingCommand["payload"] : null;
  }
}

export type ParsedRecruitingCommandBody = Readonly<{
  type: RecruitingCommand["type"];
  aggregateId: string | null;
  payload: RecruitingCommand["payload"];
}>;

export function parseRecruitingCommandBody(
  value: unknown,
  allowedTypes: ReadonlySet<RecruitingCommand["type"]>,
  aggregateIdOverride?: string,
): ParsedRecruitingCommandBody | null {
  const body = record(value);
  if (!body || !exactKeys(body, ["type", "payload"], aggregateIdOverride ? [] : ["aggregateId"])) return null;
  if (typeof body.type !== "string" || !COMMAND_TYPES.has(body.type as RecruitingCommand["type"])) return null;
  const type = body.type as RecruitingCommand["type"];
  if (!allowedTypes.has(type)) return null;
  const aggregateId = aggregateIdOverride ?? body.aggregateId ?? null;
  if (aggregateId !== null && !uuid(aggregateId)) return null;
  const payload = payloadFor(type, body.payload);
  return payload ? { type, aggregateId, payload } : null;
}
