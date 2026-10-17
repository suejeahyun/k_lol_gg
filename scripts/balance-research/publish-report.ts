import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { distribution, METRIC_KEYS, type Metrics } from "./metrics";

const directory = ".private/balance-research";
const output = "docs/qa-evidence/balance-research-2026-10-18";
const read = async (name: string) => JSON.parse(await readFile(`${directory}/${name}`, "utf8"));
const inventory = await read("inventory-expanded.json");
const manifest = await read("rosters.json");
const pilot = await read("pilot.json");
const stages = await Promise.all(["tuning", "validation", "final"].map(stage => read(`${stage}-summary.json`)));
type Result = { id: string; source: string; stratum: string; baseline: Metrics; sharedMs: number; uniqueLayouts: number; relaxed: boolean };
const rows: Result[] = (await Promise.all(["tuning", "validation", "final"].flatMap(stage => Array.from({ length: 4 }, (_, index) => readFile(`${directory}/results/${stage}-${index}.jsonl`, "utf8"))))).flatMap(text => text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)));
assert.equal(rows.length, manifest.uniqueRosters);
assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
assert.ok(stages.every(s => s.snapshotSha256 === manifest.snapshotSha256));
assert.equal(pilot.snapshotSha256, manifest.snapshotSha256);
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const baselineFiles = await Promise.all(["team-balance.ts", "inhouse-fairness.ts", "inhouse-joint-search.ts"].map(async name => ({ name, normalizedSha256: digest((await readFile(`${directory}/baseline/${name}`, "utf8")).replaceAll("\r\n", "\n")) })));
const slim = (row: Result) => ({ roster: row.id, source: row.source, stratum: row.stratum, relaxed: row.relaxed, metrics: row.baseline });
const result = {
  baselineCommit: inventory.baselineCommit,
  baselineFormula: "V2_INHOUSE_RELAXED_2026_10_16",
  adoptedRankingFormula: stages[2].selected ?? "BASELINE_RETAINED",
  snapshotSha256: manifest.snapshotSha256,
  baselineFiles,
  protocolSha256: digest(await readFile("scripts/balance-research/PROTOCOL.md", "utf8")),
  capturedAt: inventory.capturedAt,
  counts: { uniqueRealRosters: rows.length, observedRosters: manifest.observed, recombinedRealRosters: manifest.recombined, syntheticIncludedInRealDenominator: 0, selectionFormulasTestedOnTuning: 3, personalRatingFormulasTested: 1, uniqueCandidatePlacements: stages.reduce((s, stage) => s + stage.uniqueCandidatePlacements, 0), repeatedPilotAndOraclePlacementsExcluded: true, baselineOracleComparisons: stages.reduce((s, stage) => s + stage.baselineOracleComparisons, 0) + pilot.results.length, independentLayoutReevaluations: stages.reduce((s, stage) => s + stage.independentLayoutReevaluations, 0) },
  sourceStratumSplitCounts: manifest.counts,
  baselineMetrics: Object.fromEntries(METRIC_KEYS.map(key => [key, distribution(rows.map(r => r.baseline[key]))])),
  baselineRuleViolations: Array.from({ length: 6 }, (_, index) => ({ rule: index + 1, violatingRosters: rows.filter(r => r.baseline.rules[index] > 0).length, totalViolations: rows.reduce((s, r) => s + r.baseline.rules[index], 0) })),
  relaxedRosters: rows.filter(r => r.relaxed).length,
  currentTierVerification: { rostersWithAnyMissingCurrentTier: rows.filter(r => r.baseline.unknownTier > 0).length, allParticipantsCurrentTierKnownRosters: rows.filter(r => r.baseline.unknownTier === 0).length, knownBottomViolations: rows.reduce((sum, r) => sum + r.baseline.bottomViolations, 0), bottomRolesVerifiedAcrossAllRosters: null, limitation: "Full-population stored metrics count all unknown tiers, not their assigned slots. Therefore zero known violations is not reported as all bottom restrictions verified. Exact ADC/SUP verification is supplied only for separately replayed representative cases." },
  timings: { singleProcessPilot: { n: pilot.results.length, baselineMs: distribution(pilot.results.map((r: { baselineMs: number }) => r.baselineMs)), sharedThreeVariantMs: distribution(pilot.results.map((r: { sharedMs: number }) => r.sharedMs)) }, fourWorkerSharedEnumeration: distribution(rows.map(r => r.sharedMs)) },
  stages,
  representativeBaselineCases: {
    worstLaneGap: [...rows].sort((a, b) => b.baseline.maxLaneGap - a.baseline.maxLaneGap).slice(0, 3).map(slim),
    balancedTotalLargeLanes: rows.filter(r => r.baseline.teamGap <= 5 && r.baseline.maxLaneGap >= 25).sort((a, b) => b.baseline.maxLaneGap - a.baseline.maxLaneGap).slice(0, 3).map(slim),
    unavoidableRoleDeviation: [...rows].sort((a, b) => b.baseline.unregistered - a.baseline.unregistered).slice(0, 3).map(slim),
  },
  exclusionsAndLimits: ["Tuning candidates are selected only by the preregistered gates. Rejected candidates are never reconsidered on held-out baseline audits.", "No original member names, UUIDs, legacy IDs, account IDs or credentials are contained in this artifact.", "Observed rosters use one present snapshot; no historical outcome-prediction claim is made.", "There are zero published series linked to pregame drafts, so temporal predictive validation is unavailable.", "All lane metrics use the frozen baseline formula, not candidate-specific rating scores. No empirical win-rate improvement is claimed.", "Aggregate largeLaneCount counts severe pairwise gaps across five roles; team-specific disadvantage counts are reported separately in stability/case replay evidence.", "The initial legacy-ordered anonymization pilot and two interrupted setup runs are excluded. Final counts use only corrected UUID-order anonymous labels."]
};
await mkdir(output, { recursive: true });
await writeFile(`${output}/data-inventory.json`, JSON.stringify(inventory, null, 2) + "\n");
await writeFile(`${output}/experiment-report.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ counts: result.counts, adoptedRankingFormula: result.adoptedRankingFormula, baselineMetrics: result.baselineMetrics, baselineRuleViolations: result.baselineRuleViolations, timings: result.timings }, null, 2));
