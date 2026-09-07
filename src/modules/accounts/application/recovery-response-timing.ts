import { randomInt } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

export const RECOVERY_RESPONSE_MINIMUM_MS = 180;
export const RECOVERY_RESPONSE_JITTER_MAX_MS = 60;

export type RecoveryResponseTimingDependencies = Readonly<{
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  jitter: (maximumExclusive: number) => number;
}>;

export type RecoveryResponseWindow = Readonly<{
  startedAt: number;
  targetDurationMs: number;
}>;

const runtimeDependencies: RecoveryResponseTimingDependencies = {
  now: () => performance.now(),
  sleep: async (milliseconds) => {
    await sleep(milliseconds);
  },
  jitter: (maximumExclusive) => randomInt(maximumExclusive),
};

/**
 * This response floor reduces the most obvious known-vs-unknown account timing
 * signal. It is deliberately bounded and is only entered after the durable
 * recovery limiter admits a request; it is not claimed to be a mathematical
 * timing-equality guarantee.
 */
export function beginRecoveryResponseWindow(
  dependencies: RecoveryResponseTimingDependencies = runtimeDependencies,
): RecoveryResponseWindow {
  const jitter = Math.max(
    0,
    Math.min(
      RECOVERY_RESPONSE_JITTER_MAX_MS - 1,
      Math.trunc(dependencies.jitter(RECOVERY_RESPONSE_JITTER_MAX_MS)),
    ),
  );
  return {
    startedAt: dependencies.now(),
    targetDurationMs: RECOVERY_RESPONSE_MINIMUM_MS + jitter,
  };
}

export async function finishRecoveryResponseWindow(
  window: RecoveryResponseWindow,
  dependencies: RecoveryResponseTimingDependencies = runtimeDependencies,
): Promise<void> {
  const elapsed = Math.max(0, dependencies.now() - window.startedAt);
  const remaining = Math.max(0, window.targetDurationMs - elapsed);
  if (remaining > 0) await dependencies.sleep(remaining);
}
