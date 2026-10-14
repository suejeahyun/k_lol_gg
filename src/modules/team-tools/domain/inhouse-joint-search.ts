import {
  INHOUSE_FAIRNESS_LIMITS,
  measureInhouseMatchup,
  type InhouseFairnessAssignment,
  type InhouseMatchupMetrics,
} from "./inhouse-fairness";

type Priority = Pick<InhouseMatchupMetrics, "qualityViolationCount" | "unknownTierCount" | "autoCount" | "autoImbalance" | "maxLaneGap" | "totalGap" | "bottomGap" | "largeLaneCount">;

function excessRisk(value: Priority) {
  return Math.max(0, value.maxLaneGap - INHOUSE_FAIRNESS_LIMITS.maxLaneGap)
    + Math.max(0, value.totalGap - INHOUSE_FAIRNESS_LIMITS.maxTeamAverageGap * 5)
    + Math.max(0, value.bottomGap - INHOUSE_FAIRNESS_LIMITS.maxBottomAverageGap * 2)
    + Math.max(0, value.largeLaneCount - INHOUSE_FAIRNESS_LIMITS.maxLargeLaneCount) * INHOUSE_FAIRNESS_LIMITS.largeLaneGap;
}

/** Quality violations cannot be purchased with role preference or directional rewards. */
export function compareInhousePriority(a: Priority, b: Priority) {
  return a.qualityViolationCount - b.qualityViolationCount
    || excessRisk(a) - excessRisk(b)
    || a.unknownTierCount - b.unknownTierCount
    || a.autoCount - b.autoCount
    || a.autoImbalance - b.autoImbalance;
}

export function inhouseJointCost(value: Pick<InhouseMatchupMetrics, "totalGap" | "lineGapTotal" | "maxLaneGap" | "bottomGap" | "directionalPenalty">, subCount: number) {
  return value.totalGap * 1.4 + value.lineGapTotal * 0.6 + value.maxLaneGap
    + value.bottomGap * 0.8 + value.directionalPenalty * 4 + subCount;
}

type SearchTeam = { assignments: readonly InhouseFairnessAssignment[]; subCount: number; signature: string };
export type InhouseJointPair<T extends SearchTeam> = { red: T; blue: T; metrics: InhouseMatchupMetrics };

/** Every permitted role pair is inspected; no independently optimal team is discarded first. */
export function selectInhouseJointLayouts<T extends SearchTeam>(redLayouts: readonly T[], blueLayouts: readonly T[]) {
  const pairs: InhouseJointPair<T>[] = [];
  let feasibleLayoutCount = 0;
  for (const red of redLayouts) for (const blue of blueLayouts) {
    const metrics = measureInhouseMatchup(red.assignments, blue.assignments);
    if (metrics.hardViolationCount > 0) continue;
    feasibleLayoutCount += 1;
    const cost = inhouseJointCost(metrics, red.subCount + blue.subCount);
    const before = pairs.findIndex((other) => {
      const priority = compareInhousePriority(metrics, other.metrics);
      if (priority) return priority < 0;
      const costDifference = cost - inhouseJointCost(other.metrics, other.red.subCount + other.blue.subCount);
      if (costDifference) return costDifference < 0;
      // The final selector uses this exact same canonical signature tie-break.
      return blue.signature < other.blue.signature ||
        (blue.signature === other.blue.signature && red.signature < other.red.signature);
    });
    if (before >= 0) pairs.splice(before, 0, { red, blue, metrics });
    else if (pairs.length < 3) pairs.push({ red, blue, metrics });
    if (pairs.length > 3) pairs.pop();
  }
  return { pairs, feasibleLayoutCount };
}
