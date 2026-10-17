import assert from "node:assert/strict";
import { EPS, LOWER_PROTECTED, HIGHER_PROTECTED, DERIVED_PROTECTED, isMaterial, summarize, type Metrics } from "./metrics";
export type ComparisonRow = { id: string; subgroups: string[]; baseline: Metrics; candidate: Metrics; baselineMs: number; candidateMs: number };
export function evaluateAdoption(rows: readonly ComparisonRow[]) {
  assert.ok(rows.length > 0, "ADOPTION_REQUIRES_OBSERVATIONS");
  const failures: string[] = [];
  const lower = [...LOWER_PROTECTED, ...DERIVED_PROTECTED];
  for (const row of rows) {
    for (const m of [row.baseline, row.candidate]) for (const key of [...lower, ...HIGHER_PROTECTED, "zeroSampleCount", "confidence", "bottomViolations", "bottomExcess", "unregistered"] as const) assert.ok(Number.isFinite(m[key]), `FINITE_METRIC_REQUIRED:${key}`);
    assert.ok(Number.isFinite(row.baselineMs) && row.baselineMs > 0 && Number.isFinite(row.candidateMs) && row.candidateMs > 0, "POSITIVE_FINITE_TIMING_REQUIRED");
    for (const key of lower) if (row.candidate[key] - row.baseline[key] > EPS) failures.push(`INDIVIDUAL_PROTECTION_REGRESSION:${key}:${row.id}`);
    for (const key of HIGHER_PROTECTED) if (row.baseline[key] - row.candidate[key] > EPS) failures.push(`INDIVIDUAL_PROTECTION_REGRESSION:${key}:${row.id}`);
    for (const key of ["bottomViolations", "bottomExcess", "unregistered"] as const) if (Math.abs(row.candidate[key] - row.baseline[key]) > EPS) failures.push(`RELAXATION_PREFIX_CHANGED:${key}:${row.id}`);
  }
  const materialCount = rows.filter(r => isMaterial(r.baseline, r.candidate)).length;
  const requiredMaterialCount = Math.ceil(rows.length * 0.01);
  if (materialCount < requiredMaterialCount) failures.push("MATERIAL_RATE_BELOW_ONE_PERCENT");
  function measureGroup(group: readonly ComparisonRow[]) {
    const metrics = Object.fromEntries([...lower, ...HIGHER_PROTECTED, "zeroSampleCount", "confidence"].map(key => [key, { baseline: summarize(group.map(r => r.baseline[key as keyof Metrics] as number)), candidate: summarize(group.map(r => r.candidate[key as keyof Metrics] as number)) }]));
    const regressions: string[] = [];
    for (const key of lower) for (const stat of ["mean", "p95", "max"] as const) if (metrics[key].candidate[stat] - metrics[key].baseline[stat] > EPS) regressions.push(`${key}:${stat}`);
    for (const key of HIGHER_PROTECTED) for (const stat of ["mean", "p05", "min"] as const) if (metrics[key].baseline[stat] - metrics[key].candidate[stat] > EPS) regressions.push(`${key}:${stat}`);
    if (metrics.zeroSampleCount.candidate.mean - metrics.zeroSampleCount.baseline.mean > EPS) regressions.push("zeroSampleCount:mean");
    if (metrics.confidence.baseline.mean - metrics.confidence.candidate.mean > EPS) regressions.push("confidence:mean");
    return { metrics, regressions };
  }
  const overall = measureGroup(rows);
  overall.regressions.forEach(r => failures.push(`OVERALL_REGRESSION:${r}`));
  const groups = [...new Set(rows.flatMap(r => r.subgroups))].sort().map(name => {
    const group = rows.filter(r => r.subgroups.includes(name)); const measured = measureGroup(group);
    if (group.length >= 10) measured.regressions.forEach(r => failures.push(`PROTECTED_GROUP_REGRESSION:${name}:${r}`));
    return { name, count: group.length, gateApplies: group.length >= 10, ...measured };
  });
  const baselineTiming = summarize(rows.map(r => r.baselineMs)); const candidateTiming = summarize(rows.map(r => r.candidateMs));
  const p95Ratio = candidateTiming.p95 / baselineTiming.p95;
  return { accepted: failures.length === 0, failures, materialCount, requiredMaterialCount, materialRate: materialCount / rows.length, overall, groups, timing: { baseline: baselineTiming, candidate: candidateTiming, p95Ratio, baselineKind: "EXACT_STREAMING_FIRST_PASS", environment: "CONTENDED_WORKERS", diagnosticOnly: true, standalonePublicBaselineGateStillRequired: true } };
}
