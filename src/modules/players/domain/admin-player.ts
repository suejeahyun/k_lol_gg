import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { containsUnsafeText } from "@/platform/security/input-safety";

export const PLAYER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const MAXIMUM_LEGACY_PLAYER_ID = 2_147_483_647;

export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export type AdminPlayerAccount = Readonly<{
  id: string;
  loginId: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
}>;

export type AdminPlayer = Readonly<{
  id: string;
  legacyId: number | null;
  memberName: string;
  nickname: string;
  tagLine: string;
  riotId: string;
  peakTier: string | null;
  currentTier: string | null;
  status: PlayerStatus;
  revision: number;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: AdminPlayerAccount | null;
}>;

export type AdminPlayerPage = Readonly<{
  items: readonly AdminPlayer[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>;

export type AdminPlayerListQuery = Readonly<{
  query: string;
  status: PlayerStatus | "ALL";
  page: number;
  pageSize: number;
}>;

export type AdminPlayerDataResult<T> =
  | Readonly<{ state: "ready"; data: T }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;

export type PlayerWriteInput = Readonly<{
  legacyId: number | null;
  memberName: string;
  nickname: string;
  tagLine: string;
  peakTier: string | null;
  currentTier: string | null;
}>;

export type PlayerWriteValidationResult =
  | Readonly<{ ok: true; value: PlayerWriteInput }>
  | Readonly<{ ok: false; field: string; reason: "INVALID" | "MISSING" | "UNKNOWN" }>;

const writeFields = new Set([
  "legacyId",
  "memberName",
  "nickname",
  "tagLine",
  "peakTier",
  "currentTier",
]);
const divisionTierPattern = /^(?:(?:아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아) [1-4]|(?:IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND) (?:I|II|III|IV))$/i;
const masterTierPattern = /^(?:마스터 (?:10|[1-9])층|MASTER(?: [0-9]{1,4})?)$/i;
const highTierPattern = /^(?:(?:그랜드마스터|챌린저) [0-9]{1,4}|(?:GRANDMASTER|CHALLENGER)(?: [0-9]{1,4})?)$/i;

function normalizeRequiredText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maximumLength || containsUnsafeText(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeTier(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const normalized = normalizeRequiredText(value, 32);
  if (!normalized) return undefined;
  if (
    !divisionTierPattern.test(normalized) &&
    !masterTierPattern.test(normalized) &&
    !highTierPattern.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function parseLegacyPlayerId(value: unknown): number | null {
  const parsed = typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value)
    ? Number(value)
    : value;
  return Number.isSafeInteger(parsed) && Number(parsed) > 0 && Number(parsed) <= MAXIMUM_LEGACY_PLAYER_ID
    ? Number(parsed)
    : null;
}

export function parsePlayerWriteInput(value: unknown): PlayerWriteValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, field: "body", reason: "INVALID" };
  }

  const record = value as Record<string, unknown>;
  const unknownField = Object.keys(record).find((field) => !writeFields.has(field));
  if (unknownField) return { ok: false, field: unknownField, reason: "UNKNOWN" };

  const memberName = normalizeRequiredText(record.memberName, 100);
  const nickname = normalizeRequiredText(record.nickname, 64);
  const tagLine = normalizeRequiredText(record.tagLine, 32);
  if (!memberName) return { ok: false, field: "memberName", reason: "MISSING" };
  if (!nickname || nickname.includes("#")) {
    return { ok: false, field: "nickname", reason: nickname ? "INVALID" : "MISSING" };
  }
  if (!tagLine || tagLine.includes("#")) {
    return { ok: false, field: "tagLine", reason: tagLine ? "INVALID" : "MISSING" };
  }

  const legacyIdWasOmitted = record.legacyId === null || record.legacyId === undefined || record.legacyId === "";
  const legacyId = legacyIdWasOmitted
    ? null
    : parseLegacyPlayerId(record.legacyId);
  if (legacyId === null && !legacyIdWasOmitted) {
    return { ok: false, field: "legacyId", reason: "INVALID" };
  }

  const peakTier = normalizeTier(record.peakTier);
  const currentTier = normalizeTier(record.currentTier);
  if (peakTier === undefined) return { ok: false, field: "peakTier", reason: "INVALID" };
  if (currentTier === undefined) return { ok: false, field: "currentTier", reason: "INVALID" };

  return {
    ok: true,
    value: { legacyId, memberName, nickname, tagLine, peakTier, currentTier },
  };
}

export function normalizePlayerIdentity(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

export type PlayerMutationResponse = Readonly<{
  message: string;
  player: AdminPlayer;
}>;

export type PlayerMutationCommand = Readonly<{
  actorUserAccountId: string;
  actorSession: TransactionSessionActor;
  requestId: string;
  idempotencyKeyMaterial: Uint8Array;
  requestFingerprint: string;
  now: Date;
}>;

export type PlayerMutationOutcome =
  | Readonly<{
      type: "success";
      status: 200 | 201;
      response: PlayerMutationResponse;
      revision: number;
      replayed: boolean;
    }>
  | Readonly<{ type: "not-found" }>
  | Readonly<{
      type: "conflict";
      reason:
        | "ACCOUNT_LIFECYCLE_MANAGED"
        | "DUPLICATE_LEGACY_ID"
        | "DUPLICATE_RIOT_ID"
        | "IDEMPOTENCY_KEY_REUSED";
    }>
  | Readonly<{ type: "precondition-failed"; currentRevision: number }>
  | Readonly<{ type: "session-stale" }>;

export function playerMutationScope(
  action: "create" | "update" | "deactivate" | "reactivate",
  playerId?: string,
): string {
  return playerId ? `players:${action}:${playerId}` : `players:${action}`;
}

export function playerMutationFingerprint(input: {
  action: "create" | "update" | "deactivate" | "reactivate";
  playerId?: string;
  expectedRevision?: number;
  player?: PlayerWriteInput;
}): string {
  return JSON.stringify({
    action: input.action,
    playerId: input.playerId ?? null,
    expectedRevision: input.expectedRevision ?? null,
    player: input.player ?? null,
  });
}
