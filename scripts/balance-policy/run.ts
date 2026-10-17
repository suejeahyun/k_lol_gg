import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { TeamBalanceLayoutEntry } from "../../src/modules/team-tools/domain/team-balance";
import { loadAnchoredParetoKernel, type AnchoredParetoCalculation } from "./kernel";
import { loadAnchoredParetoOracle } from "./oracle";
import { evaluateAdoption } from "./gates";
import { METRIC_KEYS, HIGHER_PROTECTED, classifyPareto, isMaterial, summarize, type Metrics } from "./metrics";
import { checkedMetrics, assertColorSymmetry, subgroups } from "./checks";
import { DIRECTORY, STRATA, readInputs, assertLock, hash, type Stage } from "./study";

export type Result = { id: string; source: string; stratum: string; subgroups: string[]; baseline: Metrics; candidate: Metrics; baselineLayout: TeamBalanceLayoutEntry[]; candidateLayout: TeamBalanceLayoutEntry[]; changed: boolean; material: boolean; classification: ReturnType<typeof classifyPareto>; search: AnchoredParetoCalculation["search"]; baselineMs: number; selectionMs: number; candidateMs: number; oracleBaselineMs: number | null; oracleCandidateMs: number | null; inputOrderColorVerified: boolean };
const stage = process.argv[2] as Stage; assert.ok(["tuning", "validation", "final"].includes(stage), "STAGE_REQUIRED");
const workerIndex = process.argv.indexOf("--worker"); const worker = workerIndex < 0 ? null : Number(process.argv[workerIndex + 1]); const workers = 4;
const locked = await assertLock(); const inputLockSha256 = hash(JSON.stringify(locked));
const { snapshot, manifest } = await readInputs();
const initial = JSON.parse(await readFile(`${DIRECTORY}/pilot-initial.json`, "utf8")); assert.equal(initial.inputLockSha256, inputLockSha256);
if (stage !== "tuning") {
  const prior = JSON.parse(await readFile(`${DIRECTORY}/${stage === "validation" ? "tuning" : "validation"}-summary.json`, "utf8"));
  assert.equal(prior.inputLockSha256, inputLockSha256); assert.equal(prior.accepted, true, "PREVIOUS_STAGE_REJECTED_CANDIDATE");
  const stability = JSON.parse(await readFile(`${DIRECTORY}/stability.json`, "utf8"));
  assert.equal(stability.inputLockSha256, inputLockSha256); assert.equal(stability.accepted, true, "STABILITY_GATE_REJECTED_CANDIDATE");
}
const rosters = manifest.rosters.filter(r => r.split === stage); const oracleIds = new Set(STRATA.map(s => rosters.find(r => r.stratum === s)!.id));
await mkdir(`${DIRECTORY}/results`, { recursive: true });
if (worker !== null) {
  assert.ok(Number.isInteger(worker) && worker >= 0 && worker < workers);
  assert.deepEqual(JSON.parse(await readFile(`${DIRECTORY}/${stage}-started.json`, "utf8")), { stage, inputLockSha256 });
  const output = `${DIRECTORY}/results/${stage}-${worker}.jsonl`; await writeFile(output, "", { flag: "wx" });
  const kernel = await loadAnchoredParetoKernel(`${DIRECTORY}/baseline`, `${DIRECTORY}/kernel-${stage}-${worker}`);
  const oracle = await loadAnchoredParetoOracle(`${DIRECTORY}/baseline`, `${DIRECTORY}/oracle-${stage}-${worker}`);
  const byId = new Map(snapshot.players.map(p => [p.playerId, p])); const checkedModes = new Set<boolean>(); let processed = 0;
  for (const [index, roster] of rosters.entries()) {
    if (index % workers !== worker) continue;
    const players = roster.playerIds.map(id => byId.get(id)!); const before = JSON.stringify(players);
    const calculated = kernel.calculate(players);
    const baseline = checkedMetrics(kernel, players, calculated.baseline, calculated.search.relaxed);
    const candidate = checkedMetrics(kernel, players, calculated.candidate, calculated.search.relaxed);
    const classification = classifyPareto(baseline, candidate); assert.ok(classification === "improved" || classification === "identical", "SELECTOR_PROTECTION_VIOLATION");
    assert.equal(calculated.changed, classification === "improved"); assert.equal(calculated.materialGain, isMaterial(baseline, candidate));
    if (!calculated.changed) assert.deepEqual(calculated.candidate, calculated.baseline, "NO_GAIN_MUST_RETURN_BASELINE_EXACTLY");
    let oracleBaselineMs: number | null = null; let oracleCandidateMs: number | null = null;
    const oracleChecked = oracleIds.has(roster.id) || !checkedModes.has(calculated.search.relaxed);
    if (oracleChecked) {
      checkedModes.add(calculated.search.relaxed);
      let start = performance.now(); const original = kernel.calculateBaseline(players); oracleBaselineMs = performance.now() - start;
      assert.equal(original.candidates[0].signature, calculated.baseline.signature); assert.deepEqual(original.candidates[0].score, calculated.baseline.score);
      assert.equal(original.search.feasibleLayoutCount, calculated.search.feasibleLayoutCount);
      start = performance.now(); const independent = oracle.calculate(players); oracleCandidateMs = performance.now() - start;
      assert.equal(independent.candidate.signature, calculated.candidate.signature); assert.deepEqual(independent.candidate.score, calculated.candidate.score);
      assert.equal(independent.search.eligibleLayouts, calculated.search.eligibleLayoutCount); assert.equal(independent.search.optimalPrefixLayouts, calculated.search.optimalPrefixLayoutCount);
      const reversed = kernel.calculate([...players].reverse());
      for (const name of ["baseline", "candidate"] as const) { assert.equal(reversed[name].signature, calculated[name].signature); assert.deepEqual(reversed[name].score, calculated[name].score); assertColorSymmetry(kernel, players, calculated[name], calculated.search.relaxed); }
    }
    assert.equal(JSON.stringify(players), before, "PLAYER_INPUTS_CHANGED");
    const slots = (layout: typeof calculated.baseline) => layout.assignments.map(({ playerId, position, team }) => ({ playerId, position, team }));
    const result: Result = { id: roster.id, source: roster.source, stratum: roster.stratum, subgroups: subgroups(players, roster.stratum), baseline, candidate, baselineLayout: slots(calculated.baseline), candidateLayout: slots(calculated.candidate), changed: calculated.changed, material: isMaterial(baseline, candidate), classification, search: calculated.search, baselineMs: calculated.baselineElapsedMs, selectionMs: calculated.selectionElapsedMs, candidateMs: calculated.elapsedMs, oracleBaselineMs, oracleCandidateMs, inputOrderColorVerified: oracleChecked };
    await appendFile(output, JSON.stringify(result) + "\n"); if (++processed % 25 === 0) console.log(JSON.stringify({ stage, worker, processed }));
  }
} else {
  await writeFile(`${DIRECTORY}/${stage}-started.json`, JSON.stringify({ stage, inputLockSha256 }) + "\n", { flag: "wx" }); const started = performance.now();
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/balance-policy/run.ts", stage, "--worker", String(index)], { stdio: "inherit", windowsHide: true });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`WORKER_${index}_FAILED`)));
  })));
  const rows: Result[] = (await Promise.all(Array.from({ length: workers }, async (_, i) => (await readFile(`${DIRECTORY}/results/${stage}-${i}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))))).flat();
  assert.deepEqual(rows.map(r => r.id).sort(), rosters.map(r => r.id).sort()); assert.equal(new Set(rows.map(r => r.id)).size, rosters.length);
  for (const mode of new Set(rows.map(r => r.search.relaxed))) assert.ok(rows.some(r => r.search.relaxed === mode && r.oracleBaselineMs !== null && r.oracleCandidateMs !== null));
  const gates = evaluateAdoption(rows);
  const higher = new Set<string>([...HIGHER_PROTECTED, "mainCount", "confidence", "blueViableCarryLanes", "redViableCarryLanes"]);
  const metricChanges = Object.fromEntries(METRIC_KEYS.map(key => { const delta = rows.map(r => r.candidate[key] - r.baseline[key]); const direction = higher.has(key) ? -1 : 1; return [key, { baseline: summarize(rows.map(r => r.baseline[key])), candidate: summarize(rows.map(r => r.candidate[key])), improved: delta.filter(d => d * direction < -1e-8).length, identical: delta.filter(d => Math.abs(d) <= 1e-8).length, worsened: delta.filter(d => d * direction > 1e-8).length, largestIncrease: Math.max(...delta), largestDecrease: Math.min(...delta) }]; }));
  const summary = { stage, inputLockSha256, snapshotSha256: locked.snapshotSha256, protocolSha256: locked.sources["scripts/balance-policy/PROTOCOL.md"], mode: "PREDECLARED_ANCHORED_PARETO_COMPARISON", uniqueRosters: rows.length, observed: 0, recombined: rows.length, uniqueCandidatePlacements: rows.reduce((s, r) => s + r.search.uniqueEvaluatedLayoutCount, 0), rawInspections: rows.reduce((s, r) => s + r.search.evaluatedLayoutCount, 0), firstPassInspections: rows.reduce((s, r) => s + r.search.firstPassInspections, 0), secondPassInspections: rows.reduce((s, r) => s + r.search.secondPassInspections, 0), feasiblePlacements: rows.reduce((s, r) => s + r.search.feasibleLayoutCount, 0), eligiblePlacements: rows.reduce((s, r) => s + r.search.eligibleLayoutCount, 0), relaxedRosters: rows.filter(r => r.search.relaxed).length, accepted: gates.accepted, gates, materialCount: gates.materialCount, assignmentChanges: rows.filter(r => r.changed).length, pareto: Object.fromEntries(["improved", "identical", "mixed", "worsened"].map(label => [label, rows.filter(r => r.classification === label).length])), metricChanges, ruleChanges: Array.from({ length: 6 }, (_, index) => ({ rule: index + 1, baseline: summarize(rows.map(r => r.baseline.rules[index])), candidate: summarize(rows.map(r => r.candidate.rules[index])), improved: rows.filter(r => r.candidate.rules[index] < r.baseline.rules[index]).length, identical: rows.filter(r => r.candidate.rules[index] === r.baseline.rules[index]).length, worsened: rows.filter(r => r.candidate.rules[index] > r.baseline.rules[index]).length })), timing: gates.timing, elapsedWallMs: performance.now() - started, checks: { baselineFullSearchOracleComparisons: rows.filter(r => r.oracleBaselineMs !== null).length, independentCandidateOracleComparisons: rows.filter(r => r.oracleCandidateMs !== null).length, oracleModes: [...new Set(rows.filter(r => r.oracleBaselineMs !== null).map(r => r.search.relaxed ? "RELAXED" : "STRICT"))], frozenAndCurrentLayoutComparisons: rows.length * 2, inputOrderAndColorVerifiedRosters: rows.filter(r => r.inputOrderColorVerified).length, inputsPreservedRosters: rows.length } };
  await assertLock(); await writeFile(`${DIRECTORY}/${stage}-summary.json`, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ stage, uniqueRosters: rows.length, accepted: summary.accepted, materialCount: gates.materialCount, assignmentChanges: summary.assignmentChanges, uniqueCandidatePlacements: summary.uniqueCandidatePlacements, failures: gates.failures }, null, 2));
}
