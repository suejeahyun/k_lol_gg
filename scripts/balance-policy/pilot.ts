import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loadAnchoredParetoKernel } from "./kernel";
import { loadAnchoredParetoOracle } from "./oracle";
import { checkedMetrics, assertColorSymmetry } from "./checks";
import { isMaterial, summarize } from "./metrics";
import { DIRECTORY, readInputs, assertLock, hash, type Roster } from "./study";

const phase = process.argv[2]; assert.ok(phase === "initial" || phase === "final", "PILOT_PHASE_REQUIRED");
const locked = await assertLock(); const inputLockSha256 = hash(JSON.stringify(locked));
if (phase === "final") { const tuning = JSON.parse(await readFile(`${DIRECTORY}/tuning-summary.json`, "utf8")); assert.equal(tuning.inputLockSha256, inputLockSha256); }
await writeFile(`${DIRECTORY}/pilot-${phase}-started.json`, JSON.stringify({ phase, inputLockSha256 }) + "\n", { flag: "wx" });
const selection = JSON.parse(await readFile(`${DIRECTORY}/pilot-rosters.json`, "utf8")) as { rosters: Roster[] };
assert.equal(selection.rosters.length, 16); const { snapshot } = await readInputs();
const byId = new Map(snapshot.players.map(p => [p.playerId, p]));
const kernel = await loadAnchoredParetoKernel(`${DIRECTORY}/baseline`, `${DIRECTORY}/pilot-${phase}-kernel`);
const oracle = await loadAnchoredParetoOracle(`${DIRECTORY}/baseline`, `${DIRECTORY}/pilot-${phase}-oracle`);
const warmupPlayers = selection.rosters[0].playerIds.map(id => byId.get(id)!);
const warmupInputs = JSON.stringify(warmupPlayers);
kernel.calculateBaseline(warmupPlayers); kernel.calculate(warmupPlayers);
assert.equal(JSON.stringify(warmupPlayers), warmupInputs);
const rows = [];
for (const [index, roster] of selection.rosters.entries()) {
  const players = roster.playerIds.map(id => byId.get(id)!); const inputs = JSON.stringify(players);
  const measureBaseline = () => { const started = performance.now(); const original = kernel.calculateBaseline(players); return { original, baselineMs: performance.now() - started }; };
  const baselineFirst = index % 2 === 0;
  const first = baselineFirst ? measureBaseline() : kernel.calculate(players);
  const second = baselineFirst ? kernel.calculate(players) : measureBaseline();
  const { original, baselineMs } = (baselineFirst ? first : second) as ReturnType<typeof measureBaseline>;
  const result = (baselineFirst ? second : first) as ReturnType<typeof kernel.calculate>;
  const baseline = checkedMetrics(kernel, players, result.baseline, result.search.relaxed); const candidate = checkedMetrics(kernel, players, result.candidate, result.search.relaxed);

  assert.equal(result.baseline.signature, original.candidates[0].signature); assert.deepEqual(result.baseline.score, original.candidates[0].score);
  const independent = oracle.calculate(players); assert.equal(result.candidate.signature, independent.candidate.signature); assert.deepEqual(result.candidate.score, independent.candidate.score);
  assert.equal(result.search.eligibleLayoutCount, independent.search.eligibleLayouts);
  assertColorSymmetry(kernel, players, result.baseline, result.search.relaxed); assertColorSymmetry(kernel, players, result.candidate, result.search.relaxed);
  assert.equal(JSON.stringify(players), inputs);
  rows.push({ id: roster.id, stratum: roster.stratum, measuredOrder: baselineFirst ? "BASELINE_THEN_CANDIDATE" : "CANDIDATE_THEN_BASELINE", relaxed: result.search.relaxed, uniqueLayouts: result.search.uniqueEvaluatedLayoutCount, baselineMs, candidateMs: result.elapsedMs, firstPassMs: result.baselineElapsedMs, selectionMs: result.selectionElapsedMs, changed: result.changed, material: isMaterial(baseline, candidate), baseline, candidate });
  console.log(JSON.stringify({ phase, processed: rows.length, total: 16 }));
}
assert.ok(rows.some(r => r.relaxed && r.uniqueLayouts === 1814400), "PILOT_MUST_INCLUDE_FULL_FALLBACK");
const baseline = summarize(rows.map(r => r.baselineMs)); const candidate = summarize(rows.map(r => r.candidateMs)); const p95Ratio = candidate.p95 / baseline.p95;
const report = { phase, inputLockSha256, source: "PREVIOUS_STUDY_ROSTERS_EXCLUDED_FROM_NEW_EVALUATION", sampleCount: rows.length, uniqueNewStudyRosters: 0, countedStudyPlacements: 0, warmup: { source: "FIRST_FIXED_PILOT_ROSTER", callsPerEngine: 1, includedInTimingStatistics: false }, measuredOrder: "ALTERNATING_BASELINE_FIRST_AND_CANDIDATE_FIRST", baselineKind: "UNCHANGED_PUBLIC_PRODUCTION_FUNCTION", candidateKind: "COMPLETE_ANCHORED_TWO_PASS", runtimeAccepted: p95Ratio <= 2.5 + 1e-8, baseline, candidate, p95Ratio, assignmentChanges: rows.filter(r => r.changed).length, materialCount: rows.filter(r => r.material).length, rows };
await assertLock(); await writeFile(`${DIRECTORY}/pilot-${phase}.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
