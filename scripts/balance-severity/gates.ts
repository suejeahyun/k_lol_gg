import assert from "node:assert/strict";
import { distribution } from "../balance-research/metrics";
import type { Metrics } from "./metrics";

export type ComparisonRow = { id: string; subgroups: string[]; baseline: Metrics; candidate: Metrics };
const EPS = 1e-8;
const STRENGTH = ["maxLaneGap", "teamGap", "adcGap", "supportGap", "bottomGap"] as const;
const BURDEN = ["autoCount", "burdenImbalance", "subImbalance"] as const;
export function evaluateAdoption(rows: readonly ComparisonRow[]) {
  assert.ok(rows.length > 0, "ADOPTION_REQUIRES_OBSERVATIONS");
  const failures: string[] = [];
  for (const row of rows) for (const metrics of [row.baseline, row.candidate]) {
    for (const key of [...STRENGTH, ...BURDEN, "largeLaneCount", "bottomViolations", "bottomExcess", "unregistered", "qualityViolationCount"] as const) assert.ok(Number.isFinite(metrics[key]), `FINITE_METRIC_REQUIRED:${key}`);
  }
  type Key = typeof STRENGTH[number] | typeof BURDEN[number] | "largeLaneCount";
  function regressedStats(group: readonly ComparisonRow[], key: Key, stats: readonly ("mean" | "p95" | "max")[]) {
    const b = distribution(group.map(r => r.baseline[key])); const c = distribution(group.map(r => r.candidate[key]));
    return stats.filter(stat => c[stat] - b[stat] > EPS);
  }
  for (const row of rows) {
    if (row.baseline.qualityViolationCount === 0 && row.candidate.qualityViolationCount !== 0) failures.push(`QUALITY_COMPLIANCE_LOST:${row.id}`);
    for (const key of ["bottomViolations", "bottomExcess", "unregistered"] as const) if (Math.abs(row.candidate[key] - row.baseline[key]) > EPS) failures.push(`RELAXATION_PREFIX_CHANGED:${key}:${row.id}`);
    for (const key of STRENGTH) if (row.candidate[key] - row.baseline[key] > 3 + EPS) failures.push(`INDIVIDUAL_INCREASE_OVER_3:${key}:${row.id}`);
    for (const key of [...BURDEN, "largeLaneCount"] as const) if (row.candidate[key] - row.baseline[key] > 1 + EPS) failures.push(`INDIVIDUAL_INCREASE_OVER_1:${key}:${row.id}`);
  }
  const primaryB = distribution(rows.map(r => r.baseline.maxLaneGap)); const primaryC = distribution(rows.map(r => r.candidate.maxLaneGap));
  if (primaryC.mean - primaryB.mean >= -EPS) failures.push("PRIMARY_MEAN_NOT_STRICTLY_IMPROVED");
  if (!rows.some(r => r.baseline.maxLaneGap - r.candidate.maxLaneGap >= 3 - EPS)) failures.push("NO_MAX_LANE_IMPROVEMENT_AT_LEAST_3");
  for (const key of [...STRENGTH, ...BURDEN, "largeLaneCount"] as const) for (const stat of regressedStats(rows, key, ["mean", "p95", "max"])) failures.push(`OVERALL_REGRESSION:${key}:${stat}`);
  const groups = [...new Set(rows.flatMap(r => r.subgroups))].sort().map(name => {
    const group = rows.filter(r => r.subgroups.includes(name));
    const regressions = [...STRENGTH.flatMap(key => regressedStats(group, key, ["mean", "p95", "max"]).map(stat => `${key}:${stat}`)), ...BURDEN.flatMap(key => regressedStats(group, key, ["mean", "max"]).map(stat => `${key}:${stat}`))];
    if (group.length >= 10) regressions.forEach(regression => failures.push(`PROTECTED_GROUP_REGRESSION:${name}:${regression}`));
    return { name, count: group.length, gateApplies: group.length >= 10, regressions, metrics: Object.fromEntries([...STRENGTH, ...BURDEN].map(key => [key, { baseline: distribution(group.map(r => r.baseline[key])), candidate: distribution(group.map(r => r.candidate[key])) }])) };
  });
  return { accepted: failures.length === 0, failures, groups };
}
