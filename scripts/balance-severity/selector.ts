import type { ExperimentSelector } from "../balance-research/kernel";
import type { InhouseMatchupMetrics } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { compareInhouseSeverityPriority } from "../../src/modules/team-tools/domain/inhouse-joint-search";

type SeverityMetrics = Pick<InhouseMatchupMetrics, "maxLaneGap" | "totalGap" | "bottomGap" | "largeLaneCount">;

/** Frozen 2026-10-18 operational boundaries; this experiment changes their ordering, not their values. */
export function frozenExcessRisk(value: SeverityMetrics): number {
  return Math.max(0, value.maxLaneGap - 25) + Math.max(0, value.totalGap - 15)
    + Math.max(0, value.bottomGap - 10) + Math.max(0, value.largeLaneCount - 1) * 15;
}

/** One change only: excess amount precedes quality-violation count. All later priorities retain their order. */
export const EXCESS_FIRST_SELECTOR: ExperimentSelector<"EXCESS_FIRST"> = {
  name: "EXCESS_FIRST",
  compare(a, b) {
    return compareInhouseSeverityPriority(a.metrics, b.metrics) || a.cost - b.cost;
  },
};
