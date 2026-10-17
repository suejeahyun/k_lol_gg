import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { loadBalanceExperimentKernel, type ExperimentVariant } from "./kernel";
import { classify, compareRisk, distribution, independentMetrics, METRIC_KEYS, type Metrics } from "./metrics";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";

type Roster = { id: string; source: string; stratum: string; split: string; playerIds: string[]; eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]> };
type Result = { id: string; source: string; stratum: string; subgroups: string[]; relaxed: boolean; uniqueLayouts: number; rawInspections: number; feasibleLayouts: number; sharedMs: number; oracleMs: number | null; baseline: Metrics; candidates: Partial<Record<ExperimentVariant, { metrics: Metrics; changed: boolean; classification: string }>> };
const directory = ".private/balance-research";
const stage = process.argv[2];
const audit = process.argv.includes("--audit");
if (!["tuning", "validation", "final"].includes(stage)) throw new Error("STAGE_REQUIRED");
const workerIndex = process.argv.indexOf("--worker");
const worker = workerIndex < 0 ? null : Number(process.argv[workerIndex + 1]);
const workers = 4;
const rawSnapshot = await readFile(`${directory}/snapshot.json`, "utf8");
const snapshot = JSON.parse(rawSnapshot);
const manifest = JSON.parse(await readFile(`${directory}/rosters.json`, "utf8"));
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
assert.equal(digest(rawSnapshot), manifest.snapshotSha256);
const protocolSha256 = digest(await readFile("scripts/balance-research/PROTOCOL.md", "utf8"));
const rosterManifestSha256 = digest(await readFile(`${directory}/rosters.json`, "utf8"));
let variants: ExperimentVariant[] = ["SUB_TIE", "SUB_SOFT_1"];
if (stage !== "tuning") {
  const previous = JSON.parse(await readFile(`${directory}/${stage === "validation" ? "tuning" : "validation"}-summary.json`, "utf8"));
  assert.equal(previous.protocolSha256, protocolSha256, "PREREGISTERED_PROTOCOL_CHANGED");
  assert.equal(previous.snapshotSha256, manifest.snapshotSha256, "SNAPSHOT_CHANGED_BETWEEN_STAGES");
  const locked = JSON.parse(await readFile(`${directory}/protocol-lock.json`, "utf8"));
  assert.equal(locked.protocolSha256, protocolSha256, "LOCKED_PROTOCOL_CHANGED");
  assert.equal(locked.rosterManifestSha256, rosterManifestSha256, "LOCKED_MANIFEST_CHANGED");
  variants = stage === "final" ? previous.selected ? [previous.selected] : [] : previous.survivors;
  if (!variants.length && !audit) throw new Error("NO_PREDECLARED_SURVIVOR_RETAIN_BASELINE");
  if (audit) { assert.equal(previous.survivors.length, 0); variants = []; }
}
const rosters: Roster[] = manifest.rosters.filter((r: Roster) => r.split === stage);
if (stage === "tuning" && worker === null) await writeFile(`${directory}/protocol-lock.json`, JSON.stringify({ protocolSha256, rosterManifestSha256, snapshotSha256: manifest.snapshotSha256 }, null, 2) + "\n");
if (worker !== null) {
  await mkdir(`${directory}/results`, { recursive: true });
  const filename = `${directory}/results/${stage}-${worker}.jsonl`;
  await writeFile(filename, "");
  const kernel = await loadBalanceExperimentKernel(`${directory}/baseline`, `${directory}/kernel-${stage}-${worker}`);
  const byId = new Map<string, TeamBalancePlayer>(snapshot.players.map((p: TeamBalancePlayer) => [p.playerId, p]));
  let processed = 0;
  for (const [index, roster] of rosters.entries()) {
    if (index % workers !== worker) continue;
    const players = roster.playerIds.map(id => ({ ...byId.get(id)!, eligiblePositions: roster.eligibility?.[id] ?? byId.get(id)!.eligiblePositions }));
    const calculated = kernel.calculate(players);
    let oracleMs: number | null = null;
    if (processed < 2) {
      const start = performance.now();
      const oracle = kernel.calculateBaseline(players);
      oracleMs = performance.now() - start;
      assert.equal(calculated.variants.BASELINE.signature, oracle.candidates[0].signature);
      assert.deepEqual(calculated.variants.BASELINE.score, oracle.candidates[0].score);
      assert.equal(calculated.search.feasibleLayoutCount, oracle.search.feasibleLayoutCount);
    }
    const baseline = independentMetrics(players, kernel.evaluateFrozenLayout(players, calculated.variants.BASELINE.assignments, { allowConstraintRelaxation: calculated.search.relaxed }));
    const candidates: Result["candidates"] = {};
    for (const variant of variants) {
      const candidate = calculated.variants[variant];
      const reevaluated = kernel.evaluateFrozenLayout(players, candidate.assignments, { allowConstraintRelaxation: calculated.search.relaxed });
      assert.deepEqual(candidate.score, reevaluated.score);
      const metrics = independentMetrics(players, reevaluated);
      candidates[variant] = { metrics, changed: candidate.signature !== calculated.variants.BASELINE.signature, classification: classify(baseline, metrics) };
    }
    const tiers = players.map(p => parseInhouseMajorTier(p.rating?.v1?.currentTier));
    const subgroups = [roster.stratum, ...(tiers.some(t => t !== null && t <= 2) ? ["INCLUDES_LOW_TIER"] : []), ...(tiers.some(t => t !== null && t >= 6) ? ["INCLUDES_HIGH_TIER"] : []), ...(tiers.some(t => t === null) ? ["INCLUDES_UNKNOWN_TIER"] : []), ...(players.some(p => !p.rating?.v1?.internalGames) ? ["INCLUDES_NEW_PLAYER"] : []), ...(players.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length >= 6 ? ["ACTUAL_LOW_SAMPLE_MAJORITY"] : [])];
    const result: Result = { id: roster.id, source: roster.source, stratum: roster.stratum, subgroups, relaxed: calculated.search.relaxed, uniqueLayouts: calculated.search.uniqueEvaluatedLayoutCount, rawInspections: calculated.search.evaluatedLayoutCount, feasibleLayouts: calculated.search.feasibleLayoutCount, sharedMs: calculated.elapsedMs, oracleMs, baseline, candidates };
    await appendFile(filename, JSON.stringify(result) + "\n");
    if (++processed % 25 === 0) console.log(JSON.stringify({ stage, worker, processed }));
  }
} else {
  const started = performance.now();
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/balance-research/run.ts", stage, "--worker", String(index), ...(audit ? ["--audit"] : [])], { stdio: "inherit" });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`WORKER_${index}_FAILED`)));
  })));
  const rows: Result[] = (await Promise.all(Array.from({ length: workers }, async (_, index) => (await readFile(`${directory}/results/${stage}-${index}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))))).flat();
  assert.equal(rows.length, rosters.length);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  const summaries = variants.map(variant => {
    const metricChanges = Object.fromEntries(METRIC_KEYS.map(key => {
      const deltas = rows.map(r => r.candidates[variant]!.metrics[key] - r.baseline[key]);
      const direction = key === "mainCount" || key === "confidence" ? -1 : 1;
      return [key, { baseline: distribution(rows.map(r => r.baseline[key])), candidate: distribution(rows.map(r => r.candidates[variant]!.metrics[key])), improved: deltas.filter(d => d * direction < -1e-8).length, maintained: deltas.filter(d => Math.abs(d) <= 1e-8).length, worsened: deltas.filter(d => d * direction > 1e-8).length, largestIncrease: Math.max(...deltas), largestDecrease: Math.min(...deltas) }];
    }));
    const strata = [...new Set(rows.flatMap(r => r.subgroups))].map(name => {
      const group = rows.filter(r => r.subgroups.includes(name));
      const keys = ["maxLaneGap", "adcGap", "supportGap", "burdenImbalance", "subImbalance", "unregistered"] as const;
      const regressions = keys.filter(key => {
        const b = distribution(group.map(r => r.baseline[key])); const c = distribution(group.map(r => r.candidates[variant]!.metrics[key]));
        return c.mean - b.mean > 1e-8 || c.max - b.max > 1e-8;
      });
      return { name, count: group.length, worse: group.filter(r => r.candidates[variant]!.classification === "worse").length, improved: group.filter(r => r.candidates[variant]!.classification === "improved").length, meanOrMaximumRegressions: regressions, gateApplies: group.length >= 10 };
    });
    const count = (label: string) => rows.filter(r => r.candidates[variant]!.classification === label).length;
    const riskRegressions = rows.filter(r => compareRisk(r.candidates[variant]!.metrics, r.baseline) > 0).length;
    const subgroupRegressions = strata.filter(g => g.gateApplies && g.meanOrMaximumRegressions.length).length;
    const accepted = count("improved") > 0 && riskRegressions === 0 && subgroupRegressions === 0 && count("worse") === 0;
    return { variant, accepted, improved: count("improved"), maintained: count("maintained"), worse: count("worse"), assignmentChanges: rows.filter(r => r.candidates[variant]!.changed).length, riskRegressions, subgroupRegressions, metricChanges, strata,
      representativeChanges: rows.filter(r => r.candidates[variant]!.changed).slice(0, 5), worstCases: [...rows].sort((a, b) => (b.candidates[variant]!.metrics.maxLaneGap - b.baseline.maxLaneGap) - (a.candidates[variant]!.metrics.maxLaneGap - a.baseline.maxLaneGap)).slice(0, 3) };
  });
  const survivors = summaries.filter(s => s.accepted).map(s => s.variant);
  const selected = survivors.includes("SUB_TIE") ? "SUB_TIE" : survivors[0] ?? null;
  const summary = { stage, mode: audit ? "BASELINE_COVERAGE_AUDIT_AFTER_CANDIDATE_REJECTION" : "PREDECLARED_CANDIDATE_EVALUATION", snapshotSha256: manifest.snapshotSha256, protocolSha256, rosterManifestSha256, uniqueRosters: rows.length, observed: rows.filter(r => r.source !== "RECOMBINED_REAL_PLAYERS").length, recombined: rows.filter(r => r.source === "RECOMBINED_REAL_PLAYERS").length, uniqueCandidatePlacements: rows.reduce((s, r) => s + r.uniqueLayouts, 0), rawInspections: rows.reduce((s, r) => s + r.rawInspections, 0), feasiblePlacements: rows.reduce((s, r) => s + r.feasibleLayouts, 0), relaxedRosters: rows.filter(r => r.relaxed).length, baselineMetrics: Object.fromEntries(METRIC_KEYS.map(key => [key, distribution(rows.map(r => r.baseline[key]))])), sharedEnumerationTiming: { workers, ...distribution(rows.map(r => r.sharedMs)), note: "Contended multi-process shared-enumeration timing; production single-process timings are reported separately from pilot." }, elapsedWallMs: performance.now() - started, baselineOracleComparisons: rows.filter(r => r.oracleMs !== null).length, independentLayoutReevaluations: rows.length * (variants.length + 1), survivors, selected, summaries };
  await writeFile(`${directory}/${stage}-summary.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, summaries: summaries.map(s => ({ variant: s.variant, accepted: s.accepted, improved: s.improved, maintained: s.maintained, worse: s.worse, riskRegressions: s.riskRegressions, subgroupRegressions: s.subgroupRegressions })) }, null, 2));
}
