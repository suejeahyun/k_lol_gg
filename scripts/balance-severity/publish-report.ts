import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { distribution } from "../balance-research/metrics";
import { DIRECTORY, PUBLIC_DIRECTORY, BASELINE_COMMIT, SNAPSHOT_SHA256, readInputs, hash } from "./study";
import { METRIC_KEYS, type Metrics } from "./metrics";
import type { Result } from "./run";

const { manifest } = await readInputs();
const summaries = await Promise.all(["tuning", "validation", "final"].map(async stage => JSON.parse(await readFile(`${DIRECTORY}/${stage}-summary.json`, "utf8"))));
const rows: (Result & { stage: string })[] = (await Promise.all(["tuning", "validation", "final"].flatMap(stage => Array.from({ length: 4 }, async (_, worker) => (await readFile(`${DIRECTORY}/results/${stage}-${worker}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => ({ ...JSON.parse(line), stage })))))).flat();
assert.equal(rows.length, 1000); assert.equal(new Set(rows.map(row => row.id)).size, 1000);
assert.deepEqual(rows.map(r => r.id).sort(), manifest.rosters.map(r => r.id).sort());
const candidateRows = rows.filter(r => r.candidate !== null);
function verification(metrics: Metrics[]) {
  return { bothBottomRolesVerified: metrics.filter(m => m.verification.ADC.known && m.verification.SUP.known).length, atLeastOneBottomRoleUnverifiable: metrics.filter(m => !m.verification.ADC.known || !m.verification.SUP.known).length, roles: Object.fromEntries((["ADC", "SUP"] as const).map(role => [role, { verified: metrics.filter(m => m.verification[role].known).length, unverified: metrics.filter(m => !m.verification[role].known).length, knownPass: metrics.filter(m => m.verification[role].passes === true).length, knownViolation: metrics.filter(m => m.verification[role].passes === false).length, missingAssignedPlayerSlots: metrics.reduce((sum, m) => sum + m.verification[role].missingPlayerCount, 0) }])) };
}
const lock = JSON.parse(await readFile(`${DIRECTORY}/input-lock.json`, "utf8"));
for (const summary of summaries) assert.equal(summary.inputLockSha256, hash(JSON.stringify(lock)));
const pilot = JSON.parse(await readFile(`${DIRECTORY}/pilot-final.json`, "utf8"));
const report = {
  study: "ONE_PREDECLARED_EXCESS_FIRST_CANDIDATE", baselineCommit: BASELINE_COMMIT, baselineFormula: "V2_INHOUSE_RELAXED_2026_10_16", candidate: "EXCESS_FIRST", adopted: summaries.every(s => s.accepted), retainedFormula: summaries.every(s => s.accepted) ? "PENDING_RUNTIME_ACTIVATION_AND_RELEASE_VERIFICATION" : "V2_INHOUSE_RELAXED_2026_10_16",
  data: { snapshotSha256: SNAPSHOT_SHA256, capturedAt: "2026-10-17T16:09:33.538Z", eligiblePlayers: 138, sourceInventory: "../balance-research-2026-10-18/data-inventory.json", newProductionReads: 0, scoresOrSourcePositionsChanged: false, temporalValidationAvailable: false, playerIndependent: false, interpretation: "New combinations within the same real-player pool and fixed snapshot. Novel layouts have no observed outcomes; these measurements do not establish win-rate improvement." },
  samples: { uniqueRosters: 1000, observed: 0, recombinedRealPlayers: 1000, syntheticCountedAsReal: 0, comparedCandidateRosters: candidateRows.length, baselineOnlyAuditedRosters: rows.length - candidateRows.length, uniqueCandidatePlacements: rows.reduce((sum, r) => sum + r.uniqueLayouts, 0), rawInspections: rows.reduce((sum, r) => sum + r.rawInspections, 0), feasiblePlacements: rows.reduce((sum, r) => sum + r.feasibleLayouts, 0), relaxedRosters: rows.filter(r => r.relaxed).length, variantCount: 2, priorStudyExactOverlap: 0, ninePlayerOverlapWithPriorOrWithinNewStudy: 0, stageCounts: Object.fromEntries(summaries.map(s => [s.stage, s.uniqueRosters])) },
  bottomTierVerification: { baseline: verification(rows.map(r => r.baseline)), candidate: verification(candidateRows.map(r => r.candidate!.metrics)), interpretation: "Zero known violations does not imply verification when either assigned player's current tier is missing." },
  baselineMetrics: Object.fromEntries(METRIC_KEYS.map(key => [key, distribution(rows.map(r => r.baseline[key]))])),
  stages: summaries,
  timing: { singleProcessFinalPilot: pilot, contendedSharedEnumeration: { workers: 4, ...distribution(rows.map(r => r.sharedMs)) } },
  checks: { baselineFullSearchOracleComparisons: summaries.reduce((sum, s) => sum + s.baselineOracleComparisons, 0), independentCandidateFullSearchOracleComparisons: summaries.reduce((sum, s) => sum + s.candidateOracleComparisons, 0), independentFrozenLayoutReevaluations: summaries.reduce((sum, s) => sum + s.independentLayoutReevaluations, 0), frozenCurrentScoreComparisons: summaries.reduce((sum, s) => sum + s.frozenCurrentScoreComparisons, 0), inputOrderAndColorVerifiedRosters: summaries.reduce((sum, s) => sum + s.inputOrderAndColorVerifiedRosters, 0), inputsPreservedRosters: summaries.reduce((sum, s) => sum + s.inputsPreservedRosters, 0), pilotOracleRepetitionsExcludedFromRosterAndPlacementCounts: true },
  inputLock: lock,
};
const publicCase = (row: Result & { stage: string }) => ({ id: row.id, stage: row.stage, stratum: row.stratum, relaxed: row.relaxed, baseline: row.baseline, candidate: row.candidate ? { metrics: row.candidate.metrics, changed: row.candidate.changed, classification: row.candidate.classification } : null });
const cases = { maximumLaneImprovementExamples: [...candidateRows].filter(r => r.candidate!.metrics.maxLaneGap < r.baseline.maxLaneGap).sort((a, b) => (b.baseline.maxLaneGap - b.candidate!.metrics.maxLaneGap) - (a.baseline.maxLaneGap - a.candidate!.metrics.maxLaneGap)).slice(0, 3).map(publicCase), mixedExamples: candidateRows.filter(r => r.candidate!.classification === "mixed").slice(0, 3).map(publicCase), maximumLaneRegressionExamples: [...candidateRows].filter(r => r.candidate!.metrics.maxLaneGap - r.baseline.maxLaneGap > 1e-8).sort((a, b) => (b.candidate!.metrics.maxLaneGap - b.baseline.maxLaneGap) - (a.candidate!.metrics.maxLaneGap - a.baseline.maxLaneGap)).slice(0, 3).map(publicCase), worstRemainingBaseline: [...rows].sort((a, b) => b.baseline.maxLaneGap - a.baseline.maxLaneGap).slice(0, 3).map(publicCase) };
await mkdir(PUBLIC_DIRECTORY, { recursive: true });
await writeFile(`${PUBLIC_DIRECTORY}/experiment-report.json`, JSON.stringify(report, null, 2) + "\n");
await writeFile(`${PUBLIC_DIRECTORY}/representative-cases.json`, JSON.stringify(cases, null, 2) + "\n");
console.log(JSON.stringify({ adopted: report.adopted, samples: report.samples, bottomTierVerification: report.bottomTierVerification, gateFailuresByStage: summaries.map(s => ({ stage: s.stage, failures: s.gates?.failures.length ?? 0, mode: s.mode })) }, null, 2));
