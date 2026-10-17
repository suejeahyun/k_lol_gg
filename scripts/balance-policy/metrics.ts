import assert from "node:assert/strict";
import { TEAM_BALANCE_POSITIONS, type EvaluatedTeamBalanceLayout, type TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { independentMetrics as frozenMetrics, METRIC_KEYS as BASE_KEYS } from "../balance-severity/metrics";
import { distribution } from "../balance-research/metrics";

export const EPS = 1e-8;
const round = (n: number) => Math.sign(n) * Math.round(Math.abs(n) * 10000) / 10000;
export function independentMetrics(players: readonly TeamBalancePlayer[], layout: EvaluatedTeamBalanceLayout) {
  assert.equal(layout.assignments.length, 10);
  assert.equal(new Set(layout.assignments.map(a => a.playerId)).size, 10);
  const positions = TEAM_BALANCE_POSITIONS.map(position => {
    const blue = layout.assignments.filter(a => a.position === position && a.team === "BLUE");
    const red = layout.assignments.filter(a => a.position === position && a.team === "RED");
    assert.equal(blue.length, 1); assert.equal(red.length, 1);
    const blueScore = blue[0].rating.effectiveScore; const redScore = red[0].rating.effectiveScore;
    assert.ok(Number.isFinite(blueScore) && Number.isFinite(redScore));
    const reported = layout.score.positions.find(p => p.position === position)!;
    assert.equal(reported.blueScore, blueScore); assert.equal(reported.redScore, redScore);
    return { position, blueScore, redScore, difference: Math.round(Math.abs(blueScore - redScore) * 100) / 100 };
  });
  const assignedConfidence = layout.assignments.reduce((sum, a) => sum + a.rating.confidence, 0) / 10;
  assert.equal(layout.score.uncertainty.averageConfidence, Math.round(assignedConfidence * 100) / 100);
  const base = frozenMetrics(players, { ...layout, score: { ...layout.score, positions } });
  assert.equal(base.qualityViolationCount, Number(base.teamGap > 15) + Number(base.maxLaneGap > 25) + Number(base.bottomGap > 10) + Number(base.largeLaneCount > 1));
  assert.equal(base.zeroSampleCount, layout.score.uncertainty.noSampleCount);
  const burden = (team: string) => layout.assignments.filter(a => a.team === team).reduce((sum, a) => sum + (a.preference === "MAIN" ? 0 : a.preference === "SUB" ? 1 : 2), 0);
  const blueViableCarryLanes = [0, 2, 3].filter(i => base.signedLaneGaps[i] >= -3).length;
  const redViableCarryLanes = [0, 2, 3].filter(i => base.signedLaneGaps[i] <= 3).length;
  const autoCount = (team: string) => layout.assignments.filter(a => a.team === team && a.preference === "AUTO").length;
  return { ...base, reportedConfidence: base.confidence, confidence: assignedConfidence, topGap: base.lanes[0], jungleGap: base.lanes[1], midGap: base.lanes[2], totalBurden: base.subCount + 2 * base.autoCount, maxTeamBurden: Math.max(burden("BLUE"), burden("RED")), nonMainCount: base.subCount + base.autoCount, autoImbalance: Math.abs(autoCount("BLUE") - autoCount("RED")), adcUnknownSlots: base.verification.ADC.missingPlayerCount, supportUnknownSlots: base.verification.SUP.missingPlayerCount, blueViableCarryLanes, redViableCarryLanes, minViableCarryLanes: Math.min(blueViableCarryLanes, redViableCarryLanes), totalEffectiveScore: round(layout.assignments.reduce((sum, a) => sum + a.rating.effectiveScore, 0)) };
}
export type Metrics = ReturnType<typeof independentMetrics>;
export const LOWER_PROTECTED = ["topGap", "jungleGap", "midGap", "adcGap", "supportGap", "teamGap", "bottomGap", "autoCount", "subCount", "totalBurden", "maxTeamBurden", "burdenImbalance", "adcUnknownSlots", "supportUnknownSlots"] as const;
export const HIGHER_PROTECTED = ["minViableCarryLanes", "totalEffectiveScore"] as const;
export const DERIVED_PROTECTED = ["maxLaneGap", "laneSum", "largeLaneCount", "qualityViolationCount", "nonMainCount"] as const;
export const METRIC_KEYS = [...new Set([...BASE_KEYS, ...LOWER_PROTECTED, ...HIGHER_PROTECTED, ...DERIVED_PROTECTED, "autoImbalance", "blueViableCarryLanes", "redViableCarryLanes"] as const)];
export function isMaterial(b: Metrics, c: Metrics) { return b.laneSum - c.laneSum >= 3 - EPS || b.nonMainCount - c.nonMainCount >= 1 - EPS || b.burdenImbalance - c.burdenImbalance >= 1 - EPS; }
export function classifyPareto(b: Metrics, c: Metrics) {
  const differences = [...LOWER_PROTECTED.map(key => c[key] - b[key]), ...HIGHER_PROTECTED.map(key => b[key] - c[key])];
  const better = differences.some(d => d < -EPS); const worse = differences.some(d => d > EPS);
  return better && worse ? "mixed" : better ? "improved" : worse ? "worsened" : "identical";
}
export function summarize(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return { count: values.length, ...distribution(values), p05: sorted[Math.max(0, Math.ceil(sorted.length * 0.05) - 1)] ?? 0, min: sorted[0] ?? 0 }; }
