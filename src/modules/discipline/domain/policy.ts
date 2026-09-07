export const CAUTIONS_PER_WARNING = 3;
export const WARNINGS_PER_BAN_REVIEW = 3;
export const DISCIPLINE_RESOLUTION_DAYS = 30;

export type DisciplineType = "CAUTION" | "WARNING" | "BAN";
export type DisciplineCategory = "GENERAL" | "INHOUSE";

export type DisciplineIdentity = Readonly<{
  userAccountId: string | null;
  playerId: string | null;
  directName: string | null;
  directNickname: string | null;
  directTagLine: string | null;
}>;

export type ActiveDisciplineRecord = Readonly<{
  id: string;
  identityKey: string;
  type: DisciplineType;
  active: boolean;
  createdAt: Date;
  convertedToWarningId: string | null;
}>;

function requireIdentifier(value: string, code: string): string {
  if (!value || value !== value.trim() || value.length > 200) throw new Error(code);
  return value;
}

function normalizeIdentity(value: string | null): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

export function disciplineIdentityKey(identity: DisciplineIdentity): string {
  if (identity.userAccountId) return `account:${requireIdentifier(identity.userAccountId, "INVALID_ACCOUNT_ID")}`;
  if (identity.playerId) return `player:${requireIdentifier(identity.playerId, "INVALID_PLAYER_ID")}`;
  const name = normalizeIdentity(identity.directName);
  const nickname = normalizeIdentity(identity.directNickname);
  const tagLine = normalizeIdentity(identity.directTagLine);
  if (!name || name.length > 100 || nickname.length > 100 || tagLine.length > 40) {
    throw new Error("INVALID_DIRECT_IDENTITY");
  }
  return `direct:${name}|${nickname}|${tagLine}`;
}

export function requiredResolutionGameCount(category: DisciplineCategory): number {
  return category === "INHOUSE" ? 15 : 10;
}

export function disciplineResolutionDueAt(issuedAt: Date): Date {
  if (!Number.isFinite(issuedAt.getTime())) throw new Error("INVALID_ISSUED_AT");
  return new Date(issuedAt.getTime() + DISCIPLINE_RESOLUTION_DAYS * 24 * 60 * 60 * 1_000);
}

/** Oldest active, unconverted cautions are consumed exactly once. */
export function planCautionConversion(
  records: readonly ActiveDisciplineRecord[],
  identityKey: string,
): Readonly<{ cautionRecordIds: readonly string[] }> | null {
  requireIdentifier(identityKey, "INVALID_IDENTITY_KEY");
  const eligible = records
    .filter((record) =>
      record.identityKey === identityKey &&
      record.type === "CAUTION" &&
      record.active &&
      record.convertedToWarningId === null,
    )
    .sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  if (eligible.length < CAUTIONS_PER_WARNING) return null;
  return { cautionRecordIds: eligible.slice(0, CAUTIONS_PER_WARNING).map((record) => record.id) };
}

export function planBanReview(
  records: readonly ActiveDisciplineRecord[],
  identityKey: string,
  hasPendingReview: boolean,
): Readonly<{ warningRecordIds: readonly string[] }> | null {
  if (hasPendingReview) return null;
  const warnings = records
    .filter((record) => record.identityKey === identityKey && record.type === "WARNING" && record.active)
    .sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  if (warnings.length < WARNINGS_PER_BAN_REVIEW) return null;
  return { warningRecordIds: warnings.map((record) => record.id) };
}
