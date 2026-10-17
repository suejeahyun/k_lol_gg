import type { EvaluatedTeamBalanceLayout, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";

export function independentMetrics(players: readonly TeamBalancePlayer[], layout: EvaluatedTeamBalanceLayout) {
  const round = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * 10000) / 10000;
  const playerById = new Map(players.map(p => [p.playerId, p]));
  const signed = layout.score.positions.map(p => round(p.blueScore - p.redScore));
  const lanes = signed.map(Math.abs);
  const counts = { MAIN: 0, SUB: 0, AUTO: 0, unregistered: 0 };
  const burdens = { BLUE: 0, RED: 0 };
  const subCounts = { BLUE: 0, RED: 0 };
  let bottomViolations = 0; let bottomExcess = 0; let unknownTier = 0;
  for (const a of layout.assignments) {
    counts[a.preference] += 1;
    const player = playerById.get(a.playerId)!;
    if (!player.eligiblePositions.some(e => e.position === a.position)) counts.unregistered += 1;
    burdens[a.team] += a.preference === "MAIN" ? 0 : a.preference === "SUB" ? 1 : 2;
    if (a.preference === "SUB") subCounts[a.team] += 1;
    if (parseInhouseMajorTier(player.rating?.v1?.currentTier) === null) unknownTier += 1;
  }
  for (const position of ["ADC", "SUP"]) {
    const assigned = layout.assignments.filter(a => a.position === position);
    const ranks = assigned.map(a => parseInhouseMajorTier(playerById.get(a.playerId)?.rating?.v1?.currentTier));
    if (ranks.every(r => r !== null)) { const gap = Math.abs(ranks[0]! - ranks[1]!); if (gap >= 3) { bottomViolations++; bottomExcess += gap - 2; } }
  }
  const teamGap = Math.abs(round(signed.reduce((a, b) => a + b, 0)));
  const bottomGap = Math.abs(round(signed[3] + signed[4]));
  const maxLaneGap = Math.max(...lanes);
  const largeLaneCount = lanes.filter(g => g >= 15).length;
  const autoImbalance = Math.abs(layout.assignments.filter(a => a.team === "BLUE" && a.preference === "AUTO").length - layout.assignments.filter(a => a.team === "RED" && a.preference === "AUTO").length);
  const fairness = layout.score.fairness!;
  const excess = Math.max(0, maxLaneGap - 25) + Math.max(0, teamGap - 15) + Math.max(0, bottomGap - 10) + Math.max(0, largeLaneCount - 1) * 15;
  const cost = teamGap * 1.4 + lanes.reduce((a, b) => a + b, 0) * 0.6 + maxLaneGap + bottomGap * 0.8 + counts.SUB;
  return { teamGap, lanes, laneSum: lanes.reduce((a, b) => a + b, 0), maxLaneGap, largeLaneCount, adcGap: lanes[3], supportGap: lanes[4], bottomGap, mainCount: counts.MAIN, subCount: counts.SUB, autoCount: counts.AUTO, registeredAutoCount: counts.AUTO - counts.unregistered, unregistered: counts.unregistered, burdenImbalance: Math.abs(burdens.BLUE - burdens.RED), subImbalance: Math.abs(subCounts.BLUE - subCounts.RED), rules: fairness.ruleViolations!, bottomViolations, bottomExcess, unknownTier, confidence: layout.score.uncertainty.averageConfidence, zeroSampleCount: layout.assignments.filter(a => a.rating.sampleSize === null || a.rating.sampleSize === 0).length, missingSourceCount: players.reduce((s, p) => s + (p.rating?.v1?.missingSources.length ?? 0), 0), cost,
    risk: [bottomViolations, bottomExcess, counts.unregistered, fairness.qualityViolationCount, excess, unknownTier, counts.AUTO, autoImbalance, ...fairness.ruleViolations!, cost] };
}
export type Metrics = ReturnType<typeof independentMetrics>;
export const METRIC_KEYS = ["teamGap", "laneSum", "maxLaneGap", "largeLaneCount", "adcGap", "supportGap", "bottomGap", "mainCount", "subCount", "autoCount", "registeredAutoCount", "unregistered", "burdenImbalance", "subImbalance", "bottomViolations", "bottomExcess", "unknownTier", "confidence", "zeroSampleCount", "cost"] as const;
export function compareRisk(a: Metrics, b: Metrics) { for (let i = 0; i < a.risk.length; i++) if (Math.abs(a.risk[i] - b.risk[i]) > 1e-8) return Math.sign(a.risk[i] - b.risk[i]); return 0; }
export function classify(baseline: Metrics, candidate: Metrics) {
  const risk = compareRisk(candidate, baseline);
  const worseBurden = candidate.burdenImbalance > baseline.burdenImbalance || candidate.subImbalance > baseline.subImbalance;
  const betterBurden = candidate.burdenImbalance < baseline.burdenImbalance || candidate.subImbalance < baseline.subImbalance;
  return risk > 0 || worseBurden ? "worse" : betterBurden ? "improved" : "maintained";
}
export function distribution(values: number[]) { const sorted = [...values].sort((a, b) => a - b); return { mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length), median: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0, p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0, max: sorted.at(-1) ?? 0 }; }
