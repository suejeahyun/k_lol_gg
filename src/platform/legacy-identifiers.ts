import { createHash } from "node:crypto";

export const MAXIMUM_LEGACY_INTEGER_ID = 2_147_483_647;

export type LegacyCompetitionEntityKind =
  | "competition.event_competitions"
  | "competition.destruction_competitions";

export function parseLegacyIntegerId(value: unknown): number | null {
  const parsed = typeof value === "string" && /^[1-9][0-9]{0,9}$/u.test(value)
    ? Number(value)
    : value;
  return Number.isSafeInteger(parsed) && Number(parsed) > 0 && Number(parsed) <= MAXIMUM_LEGACY_INTEGER_ID
    ? Number(parsed)
    : null;
}

/** Mirrors pg_temp.klol_legacy_uuid from the approved V1 cutover. */
export function deriveLegacyCompetitionUuid(
  entityKind: LegacyCompetitionEntityKind,
  value: unknown,
): string | null {
  const legacyId = parseLegacyIntegerId(value);
  if (legacyId === null) return null;

  // MD5 is an immutable identity recipe here, not a security primitive.
  const digest = createHash("md5")
    .update(`klol.gg:v2:${entityKind}:${legacyId}`)
    .digest("hex");
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `4${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}
