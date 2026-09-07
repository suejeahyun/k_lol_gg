export type CompetitionCoreErrorCode =
  | "DUPLICATE_ID"
  | "INVALID_BRACKET"
  | "INVALID_COMMAND_CONTRACT"
  | "INVALID_FIXTURE"
  | "INVALID_IDENTIFIER"
  | "INVALID_RESULT"
  | "INVALID_ROSTER"
  | "INVALID_TRANSITION"
  | "PRECONDITION_FAILED";

export class CompetitionCoreError extends Error {
  constructor(
    readonly code: CompetitionCoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CompetitionCoreError";
  }
}

export function requireCompetition(
  condition: unknown,
  code: CompetitionCoreErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new CompetitionCoreError(code, message);
}

export function canonicalIdentifier(value: string, label: string) {
  requireCompetition(
    typeof value === "string" && value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(value),
    "INVALID_IDENTIFIER",
    `${label} must be a canonical identifier.`,
  );
  return value;
}

export function compareCanonicalIdentifiers(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
