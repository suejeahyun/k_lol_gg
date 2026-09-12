import type {
  AccountStatus,
  UserRole,
} from "@/modules/auth/domain/auth-records";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { canonicalRiotId } from "@/modules/riot/domain/riot-integration";
import { containsUnsafeText } from "@/platform/security/input-safety";

const loginIdPattern = /^[\p{L}\p{N}._-]{4,64}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textEncoder = new TextEncoder();

export type SignupInput = Readonly<{
  loginId: string;
  loginIdNormalized: string;
  password: string;
  memberName: string;
  memberNameNormalized: string;
  nickname: string;
  nicknameNormalized: string;
  tagLine: string;
  tagLineNormalized: string;
}>;

export type UserLoginInput = Readonly<{ loginId: string; password: string }>;
export type PasswordChangeInput = Readonly<{
  currentPassword: string;
  newPassword: string;
}>;
export type AccountReasonInput = Readonly<{
  publicReason: string | null;
  internalReason: string;
}>;
export type AccountStatusInput = AccountReasonInput &
  Readonly<{
    expectedClaimId?: string | null;
    claimOwnershipReviewed?: boolean;
    confirmLoginId?: string;
  }>;

export type AdminAccountListQuery = Readonly<{
  query: string;
  status: AccountStatus | "ALL";
  role: UserRole | "ALL";
  deleted: "ACTIVE" | "DELETED" | "ALL";
  page: number;
  pageSize: number;
}>;

export type AccountPlayerDto = Readonly<{
  id: string;
  nickname: string;
  tagLine: string;
  riotId: string;
  peakTier: string | null;
  currentTier: string | null;
  status: "ACTIVE" | "INACTIVE";
  revision: number;
}>;

export type OwnPlayerInput = Readonly<{
  nickname: string;
  tagLine: string;
  peakTier: string | null;
  currentTier: string | null;
}>;

export type AccountSelfDto = Readonly<{
  id: string;
  legacyId: number | null;
  loginId: string;
  role: UserRole;
  status: AccountStatus;
  revision: number;
  mustChangePassword: boolean;
  statusChangedAt: string | null;
  statusReason: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  player: AccountPlayerDto | null;
  playerClaim: Readonly<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    requestedRiotId: string;
    ownershipVerified: false;
  }> | null;
}>;

export type AdminAccountDto = Omit<AccountSelfDto, "player"> &
  Readonly<{
    player: (AccountPlayerDto & Readonly<{ memberName: string }>) | null;
    playerClaimReview: Readonly<{
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      createdAt: string;
      requestedMemberName: string;
      requestedRiotId: string;
      ownershipVerified: false;
      targetPlayer: Readonly<{
        id: string;
        memberName: string;
        riotId: string;
        status: "ACTIVE" | "INACTIVE";
        userAccountId: string | null;
      }>;
    }> | null;
    passwordConfigured: boolean;
    adminTotpConfigured: boolean;
    adminTotpEnabledAt: string | null;
    adminTotpSetupPending: boolean;
    deletedAt: string | null;
    resetRequestPending: boolean;
    updatedAt: string;
  }>;

export type AdminAccountListDto = Readonly<{
  items: readonly AdminAccountDto[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}>;

export type AccountMutationCommand = Readonly<{
  actorUserAccountId: string | null;
  actorSession?: TransactionSessionActor;
  principalKeyMaterial: Uint8Array;
  idempotencyKeyMaterial: Uint8Array;
  requestFingerprint: string;
  requestId: string;
  now: Date;
}>;

export type SafeAccountMutationResponse = Readonly<{
  message: string;
  account?: AccountSelfDto | AdminAccountDto;
  playerRevision?: number;
}>;

export type AccountParticipationDto = Readonly<{
  kind: "MATCH" | "EVENT" | "DESTRUCTION";
  id: string;
  title: string;
  status: string;
  occurredOn: string;
}>;

export const ACCOUNT_CONFLICT_REASONS = [
  "ACCOUNT_DELETED",
  "ACTIVE_PLAYER_REQUIRED",
  "ADMIN_ELIGIBILITY",
  "ALREADY_DELETED",
  "IDEMPOTENCY_KEY_REUSED",
  "LOGIN_ID_EXISTS",
  "NOT_DELETED",
  "ONE_TIME_SECRET_ALREADY_ISSUED",
  "PLAYER_CLAIM_ACK_REQUIRED",
  "PLAYER_CLAIM_PENDING",
  "PLAYER_CLAIM_STATE_CHANGED",
  "PLAYER_CLAIM_TAKEN",
  "RIOT_ID_ALREADY_LINKED",
  "ROLE_UNCHANGED",
  "STATUS_UNCHANGED",
  "TARGET_CONFIRMATION_MISMATCH",
  "TOTP_NOT_CONFIGURED",
] as const;

export type AccountConflictReason = (typeof ACCOUNT_CONFLICT_REASONS)[number];
export type AccountForbiddenReason = "SUPER_REQUIRED" | "TARGET_POLICY";

export type AccountMutationOutcome =
  | Readonly<{
      type: "success";
      status: 200 | 201 | 202;
      response: SafeAccountMutationResponse;
      revision?: number;
      replayed: boolean;
      oneTimeSecret?: string;
    }>
  | Readonly<{ type: "not-found" }>
  | Readonly<{ type: "forbidden"; reason: AccountForbiddenReason }>
  | Readonly<{ type: "conflict"; reason: AccountConflictReason }>
  | Readonly<{ type: "precondition-failed"; currentRevision: number }>
  | Readonly<{ type: "invalid-current-password" }>
  | Readonly<{ type: "session-stale" }>;

type ParseResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false }>;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return null;
  }
  return record;
}

function safeText(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFKC");
  if (
    normalized.length < minimum ||
    normalized.length > maximum ||
    containsUnsafeText(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function normalizeLoginId(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

export function normalizeAccountIdentity(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

export function isCanonicalAccountUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function parseLegacyAccountIntegerId(value: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : null;
}

export function validateNewPassword(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 10 || value.length > 128) return false;
  if (textEncoder.encode(value).byteLength > 512 || containsUnsafeText(value)) return false;
  return /\p{L}/u.test(value) && /\p{N}/u.test(value);
}

export function parseSignupInput(value: unknown): ParseResult<SignupInput> {
  const record = exactRecord(value, [
    "loginId",
    "password",
    "memberName",
    "riotId",
    "termsAccepted",
    "privacyAccepted",
  ]);
  if (!record || record.termsAccepted !== true || record.privacyAccepted !== true) {
    return { ok: false };
  }

  const loginId = safeText(record.loginId, 4, 64);
  const memberName = safeText(record.memberName, 2, 100);
  const riotId = safeText(record.riotId, 3, 22);
  if (!loginId || !loginIdPattern.test(loginId) || !memberName || !riotId) return { ok: false };
  if (!validateNewPassword(record.password)) return { ok: false };

  const separator = riotId.lastIndexOf("#");
  if (separator < 1 || separator === riotId.length - 1) return { ok: false };
  const nickname = safeText(riotId.slice(0, separator), 1, 16);
  const tagLine = safeText(riotId.slice(separator + 1), 1, 5);
  if (!nickname || !tagLine || nickname.includes("#") || tagLine.includes("#")) {
    return { ok: false };
  }
  let canonical;
  try {
    canonical = canonicalRiotId({ gameName: nickname, tagLine });
  } catch {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      loginId,
      loginIdNormalized: normalizeLoginId(loginId),
      password: record.password,
      memberName,
      memberNameNormalized: normalizeAccountIdentity(memberName),
      nickname: canonical.gameName,
      nicknameNormalized: normalizeAccountIdentity(canonical.gameName),
      tagLine: canonical.tagLine,
      tagLineNormalized: normalizeAccountIdentity(canonical.tagLine),
    },
  };
}

export function parseUserLoginInput(value: unknown): ParseResult<UserLoginInput> {
  const record = exactRecord(value, ["loginId", "password"]);
  const loginId = record ? safeText(record.loginId, 1, 64) : null;
  if (
    !record ||
    !loginId ||
    typeof record.password !== "string" ||
    record.password.length < 1 ||
    record.password.length > 256 ||
    textEncoder.encode(record.password).byteLength > 1024 ||
    containsUnsafeText(record.password)
  ) {
    return { ok: false };
  }
  return { ok: true, value: { loginId, password: record.password } };
}

export function parseRecoveryInput(value: unknown): ParseResult<{ loginId: string }> {
  const record = exactRecord(value, ["loginId"]);
  const loginId = record ? safeText(record.loginId, 1, 64) : null;
  return loginId ? { ok: true, value: { loginId } } : { ok: false };
}

export function parsePasswordChangeInput(value: unknown): ParseResult<PasswordChangeInput> {
  const record = exactRecord(value, ["currentPassword", "newPassword"]);
  if (
    !record ||
    typeof record.currentPassword !== "string" ||
    record.currentPassword.length < 1 ||
    record.currentPassword.length > 256 ||
    containsUnsafeText(record.currentPassword) ||
    !validateNewPassword(record.newPassword) ||
    record.currentPassword === record.newPassword
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: { currentPassword: record.currentPassword, newPassword: record.newPassword },
  };
}

const divisionTierPattern = /^(?:(?:아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아) [1-4]|(?:IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND) (?:I|II|III|IV))$/i;
const masterTierPattern = /^(?:마스터 (?:10|[1-9])층|MASTER(?: [0-9]{1,4})?)$/i;
const highTierPattern = /^(?:(?:그랜드마스터|챌린저) [0-9]{1,4}|(?:GRANDMASTER|CHALLENGER)(?: [0-9]{1,4})?)$/i;

function optionalTier(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const normalized = safeText(value, 2, 32);
  if (!normalized) return undefined;
  return divisionTierPattern.test(normalized) || masterTierPattern.test(normalized) || highTierPattern.test(normalized)
    ? normalized
    : undefined;
}

export function parseOwnPlayerInput(value: unknown): ParseResult<OwnPlayerInput> {
  const record = exactRecord(value, ["riotId", "peakTier", "currentTier"]);
  if (!record) return { ok: false };
  const riotId = safeText(record.riotId, 3, 22);
  if (!riotId) return { ok: false };
  const separator = riotId.lastIndexOf("#");
  if (separator < 1 || separator === riotId.length - 1) return { ok: false };
  const nickname = safeText(riotId.slice(0, separator), 1, 16);
  const tagLine = safeText(riotId.slice(separator + 1), 1, 5);
  const peakTier = optionalTier(record.peakTier);
  const currentTier = optionalTier(record.currentTier);
  if (!nickname || !tagLine || nickname.includes("#") || tagLine.includes("#") || peakTier === undefined || currentTier === undefined) {
    return { ok: false };
  }
  try {
    const canonical = canonicalRiotId({ gameName: nickname, tagLine });
    return { ok: true, value: { nickname: canonical.gameName, tagLine: canonical.tagLine, peakTier, currentTier } };
  } catch {
    return { ok: false };
  }
}

export function parseAccountReasonInput(value: unknown): ParseResult<AccountReasonInput> {
  const record = exactRecord(value, ["publicReason", "internalReason"]);
  if (!record) return { ok: false };
  const publicReason = record.publicReason === null
    ? null
    : safeText(record.publicReason, 2, 500);
  const internalReason = safeText(record.internalReason, 2, 1000);
  if ((record.publicReason !== null && !publicReason) || !internalReason) return { ok: false };
  return { ok: true, value: { publicReason, internalReason } };
}

export function parseConfirmedAccountReasonInput(value: unknown): ParseResult<AccountStatusInput> {
  const record = exactRecord(value, ["publicReason", "internalReason", "confirmLoginId"]);
  if (!record) return { ok: false };
  const reason = parseAccountReasonInput({
    publicReason: record.publicReason,
    internalReason: record.internalReason,
  });
  const confirmLoginId = safeText(record.confirmLoginId, 1, 64);
  return reason.ok && confirmLoginId
    ? { ok: true, value: { ...reason.value, confirmLoginId } }
    : { ok: false };
}

export function parseAccountApprovalInput(value: unknown): ParseResult<AccountStatusInput> {
  const record = exactRecord(value, [
    "publicReason",
    "internalReason",
    "expectedClaimId",
    "claimOwnershipReviewed",
  ]);
  if (!record) return { ok: false };
  const reason = parseAccountReasonInput({
    publicReason: record.publicReason,
    internalReason: record.internalReason,
  });
  if (!reason.ok) return reason;
  if (
    (record.expectedClaimId !== null &&
      (typeof record.expectedClaimId !== "string" || !isCanonicalAccountUuid(record.expectedClaimId))) ||
    typeof record.claimOwnershipReviewed !== "boolean"
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      ...reason.value,
      expectedClaimId: record.expectedClaimId,
      claimOwnershipReviewed: record.claimOwnershipReviewed,
    },
  };
}

export function parseRoleChangeInput(value: unknown): ParseResult<{
  role: "USER" | "ADMIN";
  internalReason: string;
  confirmLoginId: string;
}> {
  const record = exactRecord(value, ["role", "internalReason", "confirmLoginId"]);
  const internalReason = record ? safeText(record.internalReason, 2, 1000) : null;
  const confirmLoginId = record ? safeText(record.confirmLoginId, 1, 64) : null;
  if (!record || (record.role !== "USER" && record.role !== "ADMIN") || !internalReason || !confirmLoginId) {
    return { ok: false };
  }
  return { ok: true, value: { role: record.role, internalReason, confirmLoginId } };
}

export function parseInternalReasonInput(value: unknown): ParseResult<{ internalReason: string; confirmLoginId: string }> {
  const record = exactRecord(value, ["internalReason", "confirmLoginId"]);
  const internalReason = record ? safeText(record.internalReason, 2, 1000) : null;
  const confirmLoginId = record ? safeText(record.confirmLoginId, 1, 64) : null;
  return internalReason && confirmLoginId
    ? { ok: true, value: { internalReason, confirmLoginId } }
    : { ok: false };
}

export function fingerprintAccountMutation(value: unknown): string {
  // This canonical value is transient. buildAccountMutationCommand protects it
  // with a runtime pepper before it can enter a command, receipt, audit, or log.
  return JSON.stringify(value);
}

export function accountMutationScope(action: string, accountId?: string): string {
  const suffix = accountId ? `:${accountId.toLowerCase()}` : "";
  return `account:${action}${suffix}`;
}
