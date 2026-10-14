import {
  INHOUSE_FAIRNESS_LIMITS,
  measureInhouseMatchup,
  type InhouseFairnessAssignment,
  type InhouseMatchupMetrics,
} from "./inhouse-fairness";

type Priority = Pick<InhouseMatchupMetrics, "qualityViolationCount" | "unknownTierCount" | "autoCount" | "autoImbalance" | "maxLaneGap" | "totalGap" | "bottomGap" | "largeLaneCount" | "ruleViolations">;

function excessRisk(value: Priority) {
  return Math.max(0, value.maxLaneGap - INHOUSE_FAIRNESS_LIMITS.maxLaneGap)
    + Math.max(0, value.totalGap - INHOUSE_FAIRNESS_LIMITS.maxTeamAverageGap * 5)
    + Math.max(0, value.bottomGap - INHOUSE_FAIRNESS_LIMITS.maxBottomAverageGap * 2)
    + Math.max(0, value.largeLaneCount - INHOUSE_FAIRNESS_LIMITS.maxLargeLaneCount) * INHOUSE_FAIRNESS_LIMITS.largeLaneGap;
}

/** Safety and off-role burden stay first; then rule 1 outranks 2, through rule 6. */
export function compareInhousePriority(a: Priority, b: Priority) {
  const safety = a.qualityViolationCount - b.qualityViolationCount
    || excessRisk(a) - excessRisk(b)
    || a.unknownTierCount - b.unknownTierCount
    || a.autoCount - b.autoCount
    || a.autoImbalance - b.autoImbalance;
  if (safety) return safety;
  for (let index = 0; index < a.ruleViolations.length; index += 1) {
    const difference = a.ruleViolations[index] - b.ruleViolations[index];
    if (difference) return difference;
  }
  return 0;
}

/** Numeric gaps only break ties after every numbered rule has been compared. */
export function inhouseJointCost(value: Pick<InhouseMatchupMetrics, "totalGap" | "lineGapTotal" | "maxLaneGap" | "bottomGap">, subCount: number) {
  return value.totalGap * 1.4 + value.lineGapTotal * 0.6 + value.maxLaneGap
    + value.bottomGap * 0.8 + subCount;
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
