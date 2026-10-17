import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { EvaluatedTeamBalanceLayout, TeamBalanceLayoutEntry, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { loadAnchoredParetoKernel } from "./kernel";
import { checkedMetrics, assertColorSymmetry } from "./checks";
import { EPS, LOWER_PROTECTED, HIGHER_PROTECTED, independentMetrics, type Metrics } from "./metrics";
import { DIRECTORY, STRATA, readInputs, assertLock, hash } from "./study";
import type { Result } from "./run";

const locked = await assertLock(); const inputLockSha256 = hash(JSON.stringify(locked));
const tuning = JSON.parse(await readFile(`${DIRECTORY}/tuning-summary.json`, "utf8")); assert.equal(tuning.inputLockSha256, inputLockSha256); assert.equal(tuning.uniqueRosters, 500);
await writeFile(`${DIRECTORY}/stability-started.json`, JSON.stringify({ inputLockSha256 }) + "\n", { flag: "wx" });
const { snapshot, manifest } = await readInputs(); const byId = new Map(snapshot.players.map(p => [p.playerId, p]));
const selected = STRATA.flatMap(stratum => manifest.rosters.filter(r => r.split === "tuning" && r.stratum === stratum).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2)); assert.equal(selected.length, 16);
const saved: Result[] = (await Promise.all([0, 1, 2, 3].map(async worker => (await readFile(`${DIRECTORY}/results/tuning-${worker}.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line))))).flat();
assert.equal(saved.length, 500);
const kernel = await loadAnchoredParetoKernel(`${DIRECTORY}/baseline`, `${DIRECTORY}/stability-kernel`);
const source = await readFile(`${DIRECTORY}/baseline/team-balance.ts`, "utf8");
const needle = "effectiveScore: resolvePlayerPositionScore(player, position).effectiveScore,"; assert.equal(source.split(needle).length, 2);
function canonical(layout: readonly TeamBalanceLayoutEntry[]) { return ["BLUE", "RED"].map(team => ["TOP", "JGL", "MID", "ADC", "SUP"].map(position => layout.find(a => a.team === team && a.position === position)!.playerId).join(",")).sort().join("|"); }
function deterioration(before: Metrics, after: Metrics) { return Object.fromEntries([...LOWER_PROTECTED.map(key => [key, Math.max(0, after[key] - before[key])] as const), ...HIGHER_PROTECTED.map(key => [key, Math.max(0, before[key] - after[key])] as const)]); }
async function perturbed(players: readonly TeamBalancePlayer[], id: string, delta: number, label: string) {
  const directory = `${DIRECTORY}/stability-source-${label}`; await mkdir(directory, { recursive: true });
  for (const file of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) await copyFile(`${DIRECTORY}/baseline/${file}`, `${directory}/${file}`);
  assert.ok(/^P\d+$/.test(id)); assert.ok(delta === 0.1 || delta === -0.1);
  await writeFile(`${directory}/team-balance.ts`, source.replace(needle, `effectiveScore: round(resolvePlayerPositionScore(player, position).effectiveScore + (player.playerId === "${id}" ? ${delta} : 0)),`));
  const engine = await loadAnchoredParetoKernel(directory, `${DIRECTORY}/stability-perturbed-${label}`);
  return { engine, result: engine.calculate(players) };
}
type EngineRecord = { name: "baseline" | "candidate"; inputOrderPassed: boolean; teamColorPassed: boolean; swaps: { considered: number; accepted: number; rejectedByPolicy: number; largestSwapTeamGapIncrease: number; largestSwapLaneGapIncrease: number }; perturbations: { delta: number; changed: boolean; deterioration: Record<string, number>; before: Metrics; after: Metrics }[] };
const rows: { id: string; stratum: string; engines: EngineRecord[] }[] = [];
for (const roster of selected) {
  const players = roster.playerIds.map(id => byId.get(id)!); const originalInputs = JSON.stringify(players); const record = saved.find(r => r.id === roster.id)!;
  const options = { allowConstraintRelaxation: record.search.relaxed };
  const initial = { baseline: kernel.evaluateFrozenLayout(players, record.baselineLayout, options), candidate: kernel.evaluateFrozenLayout(players, record.candidateLayout, options) };
  const reverse = kernel.calculate([...players].reverse());
  const engines: EngineRecord[] = [];
  const noise = await Promise.all([0.1, -0.1].map(async delta => ({ delta, ...await perturbed(players, [...roster.playerIds].sort()[0], delta, `${roster.id}-${delta > 0 ? "plus" : "minus"}`) })));
  for (const name of ["baseline", "candidate"] as const) {
    const chosen = initial[name]; assert.equal(reverse[name].signature, chosen.signature); assert.deepEqual(reverse[name].score, chosen.score);
    const before = checkedMetrics(kernel, players, chosen, record.search.relaxed); assertColorSymmetry(kernel, players, chosen, record.search.relaxed);
    let acceptedSwaps = 0; let policyRejectedSwaps = 0; let largestSwapTeamGapIncrease = 0; let largestSwapLaneGapIncrease = 0;
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      const layout = chosen.assignments.map((a, index) => ({ team: a.team, position: a.position, playerId: chosen.assignments[index === i ? j : index === j ? i : index].playerId }));
      let swapped: EvaluatedTeamBalanceLayout;
      try { swapped = kernel.evaluateFrozenLayout(players, layout, options); }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "FAIRNESS_CONSTRAINT") { policyRejectedSwaps++; continue; } throw error; }
      acceptedSwaps++; const measured = independentMetrics(players, swapped); largestSwapTeamGapIncrease = Math.max(largestSwapTeamGapIncrease, measured.teamGap - before.teamGap); largestSwapLaneGapIncrease = Math.max(largestSwapLaneGapIncrease, measured.maxLaneGap - before.maxLaneGap);
    }
    const perturbations = noise.map(({ delta, engine, result }) => {
      const sameSlots = engine.evaluateFrozenLayout(players, chosen.assignments, options);
      for (const assignment of sameSlots.assignments) { const previous = chosen.assignments.find(a => a.playerId === assignment.playerId)!; assert.ok(Math.abs((assignment.rating.effectiveScore - previous.rating.effectiveScore) - (assignment.playerId === [...roster.playerIds].sort()[0] ? delta : 0)) < EPS); }
      const measured = independentMetrics(players, kernel.evaluateFrozenLayout(players, result[name].assignments, { allowConstraintRelaxation: true }));
      return { delta, changed: canonical(result[name].assignments) !== canonical(chosen.assignments), deterioration: deterioration(before, measured), before, after: measured };
    });
    engines.push({ name, inputOrderPassed: true, teamColorPassed: true, swaps: { considered: 45, accepted: acceptedSwaps, rejectedByPolicy: policyRejectedSwaps, largestSwapTeamGapIncrease, largestSwapLaneGapIncrease }, perturbations });
  }
  assert.equal(JSON.stringify(players), originalInputs, "PLAYER_INPUTS_MUTATED"); rows.push({ id: roster.id, stratum: roster.stratum, engines });
  console.log(JSON.stringify({ stabilityProcessed: rows.length, total: 16 }));
}
const engineSummaries = (["baseline", "candidate"] as const).map(name => {
  const entries = rows.map(r => r.engines.find(e => e.name === name)!); const noise = entries.flatMap(e => e.perturbations);
  return { name, rosters: entries.length, perturbations: noise.length, changedRecommendations: noise.filter(n => n.changed).length, worstDeterioration: Object.fromEntries([...LOWER_PROTECTED, ...HIGHER_PROTECTED].map(key => [key, Math.max(0, ...noise.map(n => n.deterioration[key]))])), swapScenarios: entries.length * 45, acceptedSwaps: entries.reduce((sum, e) => sum + e.swaps.accepted, 0), rejectedSwaps: entries.reduce((sum, e) => sum + e.swaps.rejectedByPolicy, 0) };
});
const [baseline, candidate] = engineSummaries; const failures: string[] = [];
if (candidate.changedRecommendations > baseline.changedRecommendations) failures.push("PERTURBATION_CHANGED_RECOMMENDATIONS_INCREASED");
for (const key of [...LOWER_PROTECTED, ...HIGHER_PROTECTED]) if (candidate.worstDeterioration[key] - baseline.worstDeterioration[key] > EPS) failures.push(`WORST_PERTURBATION_DETERIORATION_INCREASED:${key}`);
const report = { inputLockSha256, method: "FIRST_TWO_TUNING_IDS_PER_STRATUM_FIXED_BEFORE_OUTCOMES", uniqueRosters: 16, newlyCountedStudyRosters: 0, effectivePerturbations: [0.1, -0.1], accepted: failures.length === 0, failures, engineSummaries, rows };
await assertLock(); await writeFile(`${DIRECTORY}/stability.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
