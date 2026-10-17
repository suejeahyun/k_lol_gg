import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { evaluateTeamBalanceLayout, type TeamBalanceLayoutEntry } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { loadBalanceExperimentKernel } from "../balance-research/kernel";
import { compareRisk, distribution } from "../balance-research/metrics";
import { EXCESS_FIRST_SELECTOR } from "./selector";
import { loadSeverityCandidateOracle } from "./oracle";
import { evaluateAdoption } from "./gates";
import { METRIC_KEYS, independentMetrics, classifyPareto, type Metrics } from "./metrics";
import { DIRECTORY, STRATA, assertLock, readInputs, hash, type Stage } from "./study";

export type Result = { id: string; source: string; stratum: string; subgroups: string[]; relaxed: boolean; uniqueLayouts: number; rawInspections: number; feasibleLayouts: number; sharedMs: number; oracleMs: number | null; candidateOracleMs: number | null; inputOrderAndColorVerified: boolean; baseline: Metrics; baselineLayout: TeamBalanceLayoutEntry[]; candidate: null | { metrics: Metrics; layout: TeamBalanceLayoutEntry[]; changed: boolean; classification: ReturnType<typeof classifyPareto> } };
const stage = process.argv[2] as Stage;
const audit = process.argv.includes("--audit");
if (!["tuning", "validation", "final"].includes(stage)) throw new Error("STAGE_REQUIRED");
assert.ok(stage !== "tuning" || !audit, "TUNING_REQUIRES_PREDECLARED_CANDIDATE");
const workerIndex = process.argv.indexOf("--worker");
const worker = workerIndex < 0 ? null : Number(process.argv[workerIndex + 1]);
const workers = 4;
const locked = await assertLock(); const lockSha256 = hash(JSON.stringify(locked));
const { snapshot, manifest } = await readInputs();
if (stage !== "tuning") {
  const previous = JSON.parse(await readFile(`${DIRECTORY}/${stage === "validation" ? "tuning" : "validation"}-summary.json`, "utf8"));
  assert.equal(previous.inputLockSha256, lockSha256, "INPUTS_CHANGED_BETWEEN_STAGES");
  assert.equal(audit, !previous.accepted, "STAGE_NOT_AUTHORIZED_BY_PREVIOUS_RESULT");
}
const rosters = manifest.rosters.filter(r => r.split === stage);
const oracleIds = new Set(STRATA.map(stratum => rosters.find(r => r.stratum === stratum)!.id));
await mkdir(`${DIRECTORY}/results`, { recursive: true });
if (worker !== null) {
  assert.ok(Number.isInteger(worker) && worker >= 0 && worker < workers);
  const launched = JSON.parse(await readFile(`${DIRECTORY}/${stage}-started.json`, "utf8"));
  assert.deepEqual(launched, { stage, audit, inputLockSha256: lockSha256 });
  const filename = `${DIRECTORY}/results/${stage}-${worker}.jsonl`;
  await writeFile(filename, "", { flag: "wx" });
  const kernel = await loadBalanceExperimentKernel(`${DIRECTORY}/baseline`, `${DIRECTORY}/kernel-${stage}-${worker}`);
  const candidateOracle = audit ? null : await loadSeverityCandidateOracle(`${DIRECTORY}/baseline`, `${DIRECTORY}/oracle-${stage}-${worker}`);
  const byId = new Map(snapshot.players.map(p => [p.playerId, p])); let processed = 0;
  const checkedModes = new Set<boolean>();
  for (const [index, roster] of rosters.entries()) {
    if (index % workers !== worker) continue;
    const players = roster.playerIds.map(id => byId.get(id)!);
    const originalPlayers = JSON.stringify(players);
    const calculated = kernel.calculateWithSelectors(players, audit ? [] : [EXCESS_FIRST_SELECTOR]);
    let oracleMs: number | null = null;
    let candidateOracleMs: number | null = null;
    const oracleChecked = oracleIds.has(roster.id) || !checkedModes.has(calculated.search.relaxed);
    if (oracleChecked) {
      checkedModes.add(calculated.search.relaxed);
      const started = performance.now(); const oracle = kernel.calculateBaseline(players); oracleMs = performance.now() - started;
      assert.equal(calculated.variants.BASELINE.signature, oracle.candidates[0].signature);
      assert.deepEqual(calculated.variants.BASELINE.score, oracle.candidates[0].score);
      assert.equal(calculated.search.feasibleLayoutCount, oracle.search.feasibleLayoutCount);
      if (candidateOracle) {
        const start = performance.now(); const candidate = candidateOracle.calculateTeamBalanceCandidates(players); candidateOracleMs = performance.now() - start;
        assert.equal(calculated.variants.EXCESS_FIRST.signature, candidate.candidates[0].signature);
        assert.deepEqual(calculated.variants.EXCESS_FIRST.score, candidate.candidates[0].score);
        assert.equal(calculated.search.feasibleLayoutCount, candidate.search.feasibleLayoutCount);
      }
    }
    const options = { allowConstraintRelaxation: calculated.search.relaxed };
    const baselineLayout = calculated.variants.BASELINE.assignments.map(({ playerId, position, team }) => ({ playerId, position, team }));
    const baselineScored = kernel.evaluateFrozenLayout(players, baselineLayout, options);
    assert.deepEqual(calculated.variants.BASELINE.score, baselineScored.score);
    const currentBaseline = evaluateTeamBalanceLayout(players, baselineLayout, options);
    assert.deepEqual(currentBaseline.score, baselineScored.score);
    assert.deepEqual(currentBaseline.assignments, baselineScored.assignments);
    const baseline = independentMetrics(players, baselineScored);
    let candidate: Result["candidate"] = null;
    if (!audit) {
      const selected = calculated.variants.EXCESS_FIRST;
      const layout = selected.assignments.map(({ playerId, position, team }) => ({ playerId, position, team }));
      const scored = kernel.evaluateFrozenLayout(players, layout, options);
      assert.deepEqual(selected.score, scored.score);
      const currentCandidate = evaluateTeamBalanceLayout(players, layout, options);
      assert.deepEqual(currentCandidate.score, scored.score);
      assert.deepEqual(currentCandidate.assignments, scored.assignments);
      const metrics = independentMetrics(players, scored);
      candidate = { metrics, layout, changed: selected.signature !== calculated.variants.BASELINE.signature, classification: classifyPareto(baseline, metrics) };
    }
    if (oracleChecked) {
      const reverse = kernel.calculateWithSelectors([...players].reverse(), audit ? [] : [EXCESS_FIRST_SELECTOR]);
      for (const name of (audit ? ["BASELINE"] : ["BASELINE", "EXCESS_FIRST"]) as ("BASELINE" | "EXCESS_FIRST")[]) {
        const selected = calculated.variants[name];
        assert.equal(reverse.variants[name].signature, selected.signature, "INPUT_ORDER_CHANGED_ASSIGNMENT");
        assert.deepEqual(reverse.variants[name].score, selected.score, "INPUT_ORDER_CHANGED_SCORE");
        const measured = independentMetrics(players, selected);
        const flipped = kernel.evaluateFrozenLayout(players, selected.assignments.map(a => ({ playerId: a.playerId, position: a.position, team: a.team === "BLUE" ? "RED" : "BLUE" })), options);
        const colorMetrics = independentMetrics(players, flipped);
        for (const key of METRIC_KEYS) if (key !== "blueSeverelyDisadvantagedLanes" && key !== "redSeverelyDisadvantagedLanes") assert.ok(Math.abs(colorMetrics[key] - measured[key]) < 1e-8, `TEAM_COLOR_METRIC_CHANGED:${key}`);
        assert.deepEqual(colorMetrics.rules, measured.rules);
        assert.deepEqual(colorMetrics.verification, measured.verification);
        assert.equal(colorMetrics.blueSeverelyDisadvantagedLanes, measured.redSeverelyDisadvantagedLanes);
        assert.equal(colorMetrics.redSeverelyDisadvantagedLanes, measured.blueSeverelyDisadvantagedLanes);
        for (let i = 0; i < 5; i++) assert.ok(Math.abs(colorMetrics.signedLaneGaps[i] + measured.signedLaneGaps[i]) < 1e-8);
      }
    }
    assert.equal(JSON.stringify(players), originalPlayers, "PLAYER_INPUTS_MUTATED");
    const tiers = players.map(p => parseInhouseMajorTier(p.rating?.v1?.currentTier));
    const subgroups = [roster.stratum, ...(tiers.some(t => t !== null && t <= 2) ? ["INCLUDES_LOW_TIER"] : []), ...(tiers.some(t => t !== null && t >= 6) ? ["INCLUDES_HIGH_TIER"] : []), ...(tiers.some(t => t === null) ? ["INCLUDES_UNKNOWN_TIER"] : []), ...(players.some(p => (p.rating?.v1?.internalGames ?? 0) === 0) ? ["INCLUDES_NEW_PLAYER"] : []), ...(players.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length >= 6 ? ["ACTUAL_LOW_SAMPLE_MAJORITY"] : [])];
    const result: Result = { id: roster.id, source: roster.source, stratum: roster.stratum, subgroups, relaxed: calculated.search.relaxed, uniqueLayouts: calculated.search.uniqueEvaluatedLayoutCount, rawInspections: calculated.search.evaluatedLayoutCount, feasibleLayouts: calculated.search.feasibleLayoutCount, sharedMs: calculated.elapsedMs, oracleMs, candidateOracleMs, inputOrderAndColorVerified: oracleChecked, baseline, baselineLayout, candidate };
    await appendFile(filename, JSON.stringify(result) + "\n");
    if (++processed % 25 === 0) console.log(JSON.stringify({ stage, worker, processed }));
  }
} else {
  await writeFile(`${DIRECTORY}/${stage}-started.json`, JSON.stringify({ stage, audit, inputLockSha256: lockSha256 }) + "\n", { flag: "wx" });
  const started = performance.now();
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/balance-severity/run.ts", stage, "--worker", String(index), ...(audit ? ["--audit"] : [])], { stdio: "inherit", windowsHide: true });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`WORKER_${index}_FAILED`)));
  })));
  const rows: Result[] = (await Promise.all(Array.from({ length: workers }, async (_, index) => (await readFile(`${DIRECTORY}/results/${stage}-${index}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))))).flat();
  assert.equal(rows.length, rosters.length); assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  assert.deepEqual(rows.map(r => r.id).sort(), rosters.map(r => r.id).sort(), "STAGE_ROSTER_IDS_DIFFER");
  for (const relaxed of new Set(rows.map(r => r.relaxed))) {
    assert.ok(rows.some(r => r.relaxed === relaxed && r.oracleMs !== null), "BASELINE_ORACLE_MISSING_SEARCH_MODE");
    if (!audit) assert.ok(rows.some(r => r.relaxed === relaxed && r.candidateOracleMs !== null), "CANDIDATE_ORACLE_MISSING_SEARCH_MODE");
  }
  const comparisons = rows.filter(r => r.candidate !== null).map(r => ({ id: r.id, subgroups: r.subgroups, baseline: r.baseline, candidate: r.candidate!.metrics }));
  assert.equal(comparisons.length, audit ? 0 : rosters.length);
  const gates = comparisons.length ? evaluateAdoption(comparisons) : null;
  const metricChanges = comparisons.length ? Object.fromEntries(METRIC_KEYS.map(key => {
    const deltas = comparisons.map(r => r.candidate[key] - r.baseline[key]); const direction = key === "mainCount" || key === "confidence" ? -1 : 1;
    return [key, { baseline: distribution(comparisons.map(r => r.baseline[key])), candidate: distribution(comparisons.map(r => r.candidate[key])), improved: deltas.filter(d => d * direction < -1e-8).length, identical: deltas.filter(d => Math.abs(d) <= 1e-8).length, worsened: deltas.filter(d => d * direction > 1e-8).length, largestIncrease: Math.max(...deltas), largestDecrease: Math.min(...deltas) }];
  })) : null;
  const summary = { stage, mode: audit ? "BASELINE_COVERAGE_AUDIT_AFTER_REJECTION" : "PREDECLARED_EXCESS_FIRST_EVALUATION", inputLockSha256: lockSha256, snapshotSha256: locked.snapshotSha256, protocolSha256: locked.sources["scripts/balance-severity/PROTOCOL.md"], uniqueRosters: rows.length, observed: 0, recombined: rows.length, uniqueCandidatePlacements: rows.reduce((s, r) => s + r.uniqueLayouts, 0), rawInspections: rows.reduce((s, r) => s + r.rawInspections, 0), feasiblePlacements: rows.reduce((s, r) => s + r.feasibleLayouts, 0), relaxedRosters: rows.filter(r => r.relaxed).length, accepted: gates?.accepted ?? false, gates, metricChanges, pareto: comparisons.length ? Object.fromEntries(["improved", "identical", "mixed", "worsened"].map(label => [label, rows.filter(r => r.candidate?.classification === label).length])) : null, assignmentChanges: rows.filter(r => r.candidate?.changed).length, oldRankingDiagnostic: comparisons.length ? { improved: comparisons.filter(r => compareRisk(r.candidate, r.baseline) < 0).length, identical: comparisons.filter(r => compareRisk(r.candidate, r.baseline) === 0).length, worsened: comparisons.filter(r => compareRisk(r.candidate, r.baseline) > 0).length, adoptionGate: false } : null, ruleChanges: comparisons.length ? Array.from({ length: 6 }, (_, i) => ({ rule: i + 1, baseline: distribution(comparisons.map(r => r.baseline.rules[i])), candidate: distribution(comparisons.map(r => r.candidate.rules[i])), improved: comparisons.filter(r => r.candidate.rules[i] < r.baseline.rules[i]).length, identical: comparisons.filter(r => r.candidate.rules[i] === r.baseline.rules[i]).length, worsened: comparisons.filter(r => r.candidate.rules[i] > r.baseline.rules[i]).length })) : null, baselineMetrics: Object.fromEntries(METRIC_KEYS.map(key => [key, distribution(rows.map(r => r.baseline[key]))])), sharedEnumerationTiming: { workers, ...distribution(rows.map(r => r.sharedMs)), note: "Contended worker timing; see separate single-process pilot." }, elapsedWallMs: performance.now() - started, baselineOracleComparisons: rows.filter(r => r.oracleMs !== null).length, candidateOracleComparisons: rows.filter(r => r.candidateOracleMs !== null).length, oracleModes: [...new Set(rows.filter(r => r.oracleMs !== null).map(r => r.relaxed ? "RELAXED" : "STRICT"))], inputOrderAndColorVerifiedRosters: rows.filter(r => r.inputOrderAndColorVerified).length, inputsPreservedRosters: rows.length, independentLayoutReevaluations: rows.length + comparisons.length, frozenCurrentScoreComparisons: rows.length + comparisons.length };
  await assertLock();
  await writeFile(`${DIRECTORY}/${stage}-summary.json`, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ stage, uniqueRosters: rows.length, uniqueCandidatePlacements: summary.uniqueCandidatePlacements, accepted: summary.accepted, pareto: summary.pareto, gateFailures: gates?.failures.length ?? 0, mode: summary.mode }, null, 2));
}
