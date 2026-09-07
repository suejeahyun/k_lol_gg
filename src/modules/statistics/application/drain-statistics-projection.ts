import { processNextMatchChanged } from "./process-match-changed";
import type { StatisticsProjectionRepository } from "./ports/statistics-projection-repository";

export type StatisticsDrainResult = Readonly<{
  processed: number;
  applied: number;
  replayed: number;
  failed: number;
  stopped: "IDLE" | "FAILED" | "LIMIT";
}>;

/**
 * Bounded single-process worker primitive. It never schedules itself and stops
 * after the first failure so an immediately retryable FAILED row cannot spin.
 */
export async function drainStatisticsProjection(
  repository: StatisticsProjectionRepository,
  options: Readonly<{ maximumEvents: number; now?: () => Date }>,
): Promise<StatisticsDrainResult> {
  if (!Number.isSafeInteger(options.maximumEvents) || options.maximumEvents < 1 || options.maximumEvents > 100) {
    throw new RangeError("maximumEvents must be between 1 and 100");
  }
  let applied = 0;
  let replayed = 0;
  for (let processed = 0; processed < options.maximumEvents; processed += 1) {
    const result = await processNextMatchChanged(repository, options.now?.() ?? new Date());
    if (result.kind === "IDLE") {
      return { processed, applied, replayed, failed: 0, stopped: "IDLE" };
    }
    if (result.kind === "FAILED") {
      return { processed: processed + 1, applied, replayed, failed: 1, stopped: "FAILED" };
    }
    if (result.kind === "APPLIED") applied += 1;
    else replayed += 1;
  }
  return {
    processed: options.maximumEvents,
    applied,
    replayed,
    failed: 0,
    stopped: "LIMIT",
  };
}
