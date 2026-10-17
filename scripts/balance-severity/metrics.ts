import type { EvaluatedTeamBalanceLayout, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { independentMetrics as baselineMetrics, METRIC_KEYS as BASELINE_METRIC_KEYS } from "../balance-research/metrics";

const round = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 10000) / 10000;
export function independentMetrics(players: readonly TeamBalancePlayer[], layout: EvaluatedTeamBalanceLayout) {
  const base = baselineMetrics(players, layout);
  const byId = new Map(players.map(p => [p.playerId, p]));
  const signedLaneGaps = layout.score.positions.map(p => round(p.blueScore - p.redScore));
  const verification = Object.fromEntries((["ADC", "SUP"] as const).map(position => {
    const assignments = layout.assignments.filter(a => a.position === position);
    const ranks = assignments.map(a => parseInhouseMajorTier(byId.get(a.playerId)?.rating?.v1?.currentTier));
    const known = ranks.every(r => r !== null);
    const gap = known ? Math.abs(ranks[0]! - ranks[1]!) : null;
    return [position, { known, currentMajorTierGap: gap, passes: gap === null ? null : gap < 3, missingPlayerCount: ranks.filter(r => r === null).length }];
  })) as Record<"ADC" | "SUP", { known: boolean; currentMajorTierGap: number | null; passes: boolean | null; missingPlayerCount: number }>;
  return { ...base, signedLaneGaps, blueSeverelyDisadvantagedLanes: signedLaneGaps.filter(n => n <= -15).length, redSeverelyDisadvantagedLanes: signedLaneGaps.filter(n => n >= 15).length, lanesOver25: base.lanes.filter(n => n > 25).length, laneExcessOver25: base.lanes.reduce((sum, n) => sum + Math.max(0, n - 25), 0), qualityViolationCount: layout.score.fairness!.qualityViolationCount, excessRisk: base.risk[4], verification };
}
export type Metrics = ReturnType<typeof independentMetrics>;
export const METRIC_KEYS = [...BASELINE_METRIC_KEYS, "qualityViolationCount", "excessRisk", "lanesOver25", "laneExcessOver25", "blueSeverelyDisadvantagedLanes", "redSeverelyDisadvantagedLanes"] as const;
export const PARETO_KEYS = ["maxLaneGap", "teamGap", "adcGap", "supportGap", "bottomGap", "largeLaneCount", "autoCount", "burdenImbalance", "subImbalance", "unregistered"] as const;
export function classifyPareto(baseline: Metrics, candidate: Metrics) {
  const differences = PARETO_KEYS.map(key => candidate[key] - baseline[key]);
  const better = differences.some(n => n < -1e-8); const worse = differences.some(n => n > 1e-8);
  return better && worse ? "mixed" : better ? "improved" : worse ? "worsened" : "identical";
}
