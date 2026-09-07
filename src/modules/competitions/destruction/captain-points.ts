import { requireCompetition } from "../core/error";

export const DESTRUCTION_CAPTAIN_BASE_POINTS = 2_000;
export const DESTRUCTION_CAPTAIN_MIN_POINTS = 0;

export function calculateCaptainAuctionPoints(
  baselineValue: number,
  options: Readonly<{ basePoints?: number; minimumPoints?: number }> = {},
) {
  const basePoints = options.basePoints ?? DESTRUCTION_CAPTAIN_BASE_POINTS;
  const minimumPoints = options.minimumPoints ?? DESTRUCTION_CAPTAIN_MIN_POINTS;
  requireCompetition(Number.isFinite(baselineValue) && baselineValue >= 0, "PRECONDITION_FAILED", "The captain baseline value must be non-negative and finite.");
  requireCompetition(Number.isSafeInteger(basePoints) && basePoints >= 0, "PRECONDITION_FAILED", "The base point value must be a non-negative safe integer.");
  requireCompetition(Number.isSafeInteger(minimumPoints) && minimumPoints >= 0 && minimumPoints <= basePoints, "PRECONDITION_FAILED", "The minimum point value must be between zero and the base point value.");
  const rounded = Math.round((basePoints - baselineValue * 10) / 10) * 10;
  return Math.min(basePoints, Math.max(minimumPoints, rounded));
}
