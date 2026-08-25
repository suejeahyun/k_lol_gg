export const CAUTIONS_PER_WARNING = 3;
export const WARNINGS_PER_BAN_REVIEW = 3;
export const DISCIPLINE_RESOLUTION_DAYS = 30;

export function requiredResolutionGameCount(category: "GENERAL" | "INHOUSE") {
  return category === "INHOUSE" ? 15 : 10;
}

export function disciplineResolutionDueAt(issuedAt: Date) {
  return new Date(issuedAt.getTime() + DISCIPLINE_RESOLUTION_DAYS * 24 * 60 * 60 * 1000);
}
