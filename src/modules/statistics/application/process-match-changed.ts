import { compareCodeUnits } from "../domain/season-statistics";
import type {
  ClaimedMatchChangedEvent,
  MatchChangedApplyResult,
  StatisticsProjectionRepository,
} from "./ports/statistics-projection-repository";

function hasExpectedScope(event: ClaimedMatchChangedEvent): boolean {
  if (event.action === "CREATED") {
    return event.oldSeasonId === null && event.newSeasonId === null;
  }
  if (event.action === "PUBLISHED" || event.action === "RESTORED") {
    return event.oldSeasonId === null && event.newSeasonId !== null;
  }
  if (event.action === "VOIDED") {
    return event.oldSeasonId !== null && event.newSeasonId === null;
  }
  return (
    (event.oldSeasonId === null && event.newSeasonId === null) ||
    (event.oldSeasonId !== null && event.newSeasonId !== null)
  );
}

export function affectedSeasonIdsForMatchChanged(
  event: ClaimedMatchChangedEvent,
): readonly string[] {
  if (event.eventType !== "MATCH_CHANGED" || !hasExpectedScope(event)) {
    throw new Error("INVALID_MATCH_CHANGED_SCOPE");
  }
  if (event.inputDigest.length !== 32 || event.matchRevision < 0) {
    throw new Error("INVALID_MATCH_CHANGED_PROVENANCE");
  }

  return [...new Set([event.oldSeasonId, event.newSeasonId].filter((value): value is string => Boolean(value)))]
    .sort(compareCodeUnits);
}

function boundedFailureCode(error: unknown): string {
  const raw = error instanceof Error && error.message ? error.message : "STATISTICS_PROJECTION_FAILED";
  const canonical = raw.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 64);
  return canonical || "STATISTICS_PROJECTION_FAILED";
}

export type ProcessStatisticsEventResult =
  | Readonly<{ kind: "IDLE" }>
  | MatchChangedApplyResult
  | Readonly<{ kind: "FAILED"; eventId: string; failureCode: string }>;

export async function processNextMatchChanged(
  repository: StatisticsProjectionRepository,
  now = new Date(),
): Promise<ProcessStatisticsEventResult> {
  const event = await repository.claimNextMatchChanged(now);
  if (!event) return { kind: "IDLE" };

  try {
    const affectedSeasonIds = affectedSeasonIdsForMatchChanged(event);
    return await repository.applyClaimedMatchChanged({ event, affectedSeasonIds, now });
  } catch (error) {
    const failureCode = boundedFailureCode(error);
    await repository.failClaimedMatchChanged({ event, failureCode, now });
    return { kind: "FAILED", eventId: event.eventId, failureCode };
  }
}
