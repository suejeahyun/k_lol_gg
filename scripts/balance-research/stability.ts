import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import * as current from "../../src/modules/team-tools/domain/team-balance";
import type { TeamBalancePlayer, TeamBalancePosition, EvaluatedTeamBalanceLayout } from "../../src/modules/team-tools/domain/team-balance";

// Synthetic stress cases are deliberately separate from real-player rates.
// Nothing in this program connects to a database or changes player records.
const roles = current.TEAM_BALANCE_POSITIONS;
const baseline = await import(pathToFileURL(resolve(".private/balance-research/baseline/team-balance.ts")).href) as typeof current;
const output = resolve(process.argv[2] ?? "docs/qa-evidence/balance-research-2026-10-18/synthetic-stability.json");
function players(tiers: (string | null)[] = Array(10).fill("GOLD I")): TeamBalancePlayer[] {
  return tiers.map((tier, i) => ({ playerId: `synthetic-${i}`, eligiblePositions: [
    { position: roles[i % 5], preference: "MAIN" },
    { position: roles[(i + 1) % 5], preference: "SUB" },
  ], rating: { overall: 50, confidence: 1, sampleSize: 20, positions: null,
    v1: { legacyPlayerId: i + 1, currentTier: tier, peakTier: tier, season: null,
      internalGames: 20, internalPositionGames: { [roles[i % 5]]: 20 }, recentSolo: null,
      balanceOverrideScore: 0, mmr: { overall: 50, confidence: 1,
        positions: Object.fromEntries(roles.map(role => [role, 50])) }, missingSources: ["RECENT_SOLO", "BALANCE_OVERRIDE"] } } }));
}
function onlyRole(input: TeamBalancePlayer[], role: TeamBalancePosition): TeamBalancePlayer[] {
  return input.map(player => ({ ...player, eligiblePositions: [{ position: role, preference: "MAIN" }] }));
}
const cases: { name: string; players: TeamBalancePlayer[] }[] = [
  { name: "similar-tier", players: players() },
  { name: "mixed-extreme-tiers", players: players(["MASTER 100", "IRON IV", "DIAMOND I", "SILVER IV", "GOLD I", "MASTER 0", "BRONZE IV", "EMERALD I", "SILVER I", "PLATINUM I"]) },
  { name: "main-role-congestion", players: players().map((p, i) => i < 5 ? { ...p, eligiblePositions: [{ position: "MID", preference: "MAIN" }, { position: roles[(i + 3) % 5], preference: "SUB" }].filter((p, j, all) => all.findIndex(q => q.position === p.position) === j) as TeamBalancePlayer["eligiblePositions"] } : p) },
  { name: "jungle-support-shortage", players: players().map((p, i) => ({ ...p, eligiblePositions: [{ position: (["TOP", "MID", "ADC"] as const)[i % 3], preference: "MAIN" }] })) },
  { name: "unregistered-unavoidable", players: onlyRole(players(), "TOP") },
  { name: "bottom-tier-conflict", players: players(["GOLD I", "GOLD I", "GOLD I", "DIAMOND I", "IRON IV", "GOLD I", "GOLD I", "GOLD I", "IRON IV", "DIAMOND I"]).map((p, i) => ({ ...p, eligiblePositions: [{ position: roles[i % 5], preference: "MAIN" }] })) },
  { name: "new-sparse-missing-tier", players: players([null, "GOLD I", "SILVER IV", "PLATINUM IV", null, "GOLD I", "GOLD I", "SILVER IV", "PLATINUM IV", "GOLD I"]).map((p, i) => ({ ...p, rating: { ...p.rating!, sampleSize: i < 7 ? 0 : 2, confidence: i < 7 ? 0 : 0.1, v1: { ...p.rating!.v1!, internalGames: i < 7 ? 0 : 2, internalPositionGames: {}, mmr: { ...p.rating!.v1!.mmr, confidence: 0 } } } })) },
  { name: "equal-total-multiple-large-lanes", players: players(["DIAMOND I", "GOLD I", "IRON IV", "GOLD I", "GOLD I", "IRON IV", "GOLD I", "DIAMOND I", "GOLD I", "GOLD I"]).map((p, i) => ({ ...p, eligiblePositions: [{ position: roles[i % 5], preference: "MAIN" }] })) },
  { name: "high-tier-role-swap-sensitivity", players: players(Array(10).fill("MASTER 0")).map((p, i) => ({ ...p, eligiblePositions: roles.map((position, j) => ({ position, preference: j === i % 5 ? "MAIN" : j === (i + 1) % 5 ? "SUB" : "AUTO" })) })) },
];
function signature(layout: EvaluatedTeamBalanceLayout): string {
  const side = (team: string) => roles.map(role => layout.assignments.find(a => a.team === team && a.position === role)!.playerId).join(",");
  return [side("RED"), side("BLUE")].sort().join("|");
}
function metrics(layout: EvaluatedTeamBalanceLayout) {
  const red = layout.assignments.filter(a => a.team === "RED");
  const blue = layout.assignments.filter(a => a.team === "BLUE");
  assert.equal(red.length, 5); assert.equal(blue.length, 5);
  assert.equal(new Set(layout.assignments.map(a => a.playerId)).size, 10);
  const signedLanes = roles.map(role => red.find(a => a.position === role)!.rating.effectiveScore - blue.find(a => a.position === role)!.rating.effectiveScore);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const totalGap = round(Math.abs(signedLanes.reduce((a, b) => a + b, 0)));
  const laneGaps = signedLanes.map(n => round(Math.abs(n)));
  const bottomGap = round(Math.abs(signedLanes[3] + signedLanes[4]));
  const fairness = layout.score.fairness!;
  assert.equal(totalGap, fairness.totalGap); assert.equal(Math.max(...laneGaps), fairness.maxLaneGap);
  assert.equal(bottomGap, fairness.bottomGap);
  const burden = (team: typeof red) => team.reduce((n, a) => n + (a.preference === "MAIN" ? 0 : a.preference === "SUB" ? 1 : 2), 0);
  return { totalGap, laneGaps, maximumLaneGap: Math.max(...laneGaps), largeLaneCount: laneGaps.filter(n => n >= 15).length,
    bottomGap, burdenImbalance: Math.abs(burden(red) - burden(blue)), rules: fairness.ruleViolations,
    unknownTierCount: fairness.unknownTierCount, status: fairness.status,
    roleDeviations: fairness.constraintRelaxation?.roleDeviationCount ?? 0,
    bottomTierViolations: fairness.constraintRelaxation?.bottomTierViolationCount ?? 0 };
}
const results = [];
const times = { baseline: [] as number[], current: [] as number[] };
for (const scenario of cases) {
  const immutable = JSON.stringify(scenario.players);
  const started = performance.now();
  const old = baseline.calculateTeamBalanceCandidates(scenario.players).candidates[0];
  times.baseline.push(performance.now() - started);
  const before = performance.now();
  const calculation = current.calculateTeamBalanceCandidates(scenario.players);
  const selected = calculation.candidates[0];
  times.current.push(performance.now() - before);
  const measured = metrics(selected);
  const reverse = current.calculateTeamBalanceCandidates([...scenario.players].reverse()).candidates[0];
  assert.equal(signature(selected), signature(reverse), scenario.name + " input-order invariance");
  const relaxed = !!selected.score.fairness?.constraintRelaxation;
  const colors = current.evaluateTeamBalanceLayout(scenario.players, selected.assignments.map(a => ({ playerId: a.playerId, position: a.position, team: a.team === "RED" ? "BLUE" : "RED" })), { allowConstraintRelaxation: relaxed });
  assert.deepEqual(metrics(colors), measured, scenario.name + " color invariance");
  const swaps = { considered: 0, accepted: 0, rejectedByPolicy: 0, maxTeamGapChange: 0, maxLaneGapChange: 0, worstPair: [] as number[] };
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    swaps.considered++;
    const layout = selected.assignments.map((a, k) => ({ team: a.team, position: a.position, playerId: selected.assignments[k === i ? j : k === j ? i : k].playerId }));
    try {
      const result = current.evaluateTeamBalanceLayout(scenario.players, layout, { allowConstraintRelaxation: relaxed });
      const m = metrics(result); swaps.accepted++;
      const delta = Math.abs(m.totalGap - measured.totalGap);
      if (delta > swaps.maxTeamGapChange) { swaps.maxTeamGapChange = delta; swaps.worstPair = [i, j]; }
      swaps.maxLaneGapChange = Math.max(swaps.maxLaneGapChange, Math.abs(m.maximumLaneGap - measured.maximumLaneGap));
    } catch (error) {
      if (!(error instanceof current.TeamBalanceDomainError) || error.code !== "FAIRNESS_CONSTRAINT") throw error;
      swaps.rejectedByPolicy++;
    }
  }
  // Only a synthetic in-memory MMR component is perturbed; with full confidence
  // this increases all five effective role scores of one player by 0.1.
  const perturbed = structuredClone(scenario.players);
  const first = perturbed[0].rating!.v1!;
  perturbed[0] = { ...perturbed[0], rating: { ...perturbed[0].rating!, v1: { ...first, mmr: {
    ...first.mmr, overall: first.mmr.overall + 0.5,
    positions: Object.fromEntries(roles.map(role => [role, (first.mmr.positions[role] ?? first.mmr.overall) + 0.5])) } } } };
  const noisy = current.calculateTeamBalanceCandidates(perturbed).candidates[0];
  const changes = current.evaluateTeamBalancePlayerScore(perturbed[0]).positions.map((p, i) => Number((p.effectiveScore - current.evaluateTeamBalancePlayerScore(scenario.players[0]).positions[i].effectiveScore).toFixed(4)));
  assert.equal(JSON.stringify(scenario.players), immutable, "inputs must remain untouched");
  results.push({ name: scenario.name, source: "SYNTHETIC_BOUNDARY", baseline: metrics(old), current: measured,
    selectedLayoutChanged: signature(old) !== signature(selected), feasibleLayoutCount: calculation.search.feasibleLayoutCount,
    reverseOrderPassed: true, teamColorPassed: true, swaps,
    perturbation: { effectiveRoleScoreDeltas: changes, layoutChanged: signature(noisy) !== signature(selected), metrics: metrics(noisy) } });
}
function timing(values: number[]) { const v = [...values].sort((a, b) => a - b); return { n: v.length, medianMs: v[Math.floor(v.length / 2)], p95Ms: v[Math.ceil(v.length * .95) - 1], maxMs: v.at(-1) }; }
const report = { at: new Date().toISOString(), baselineFormula: baseline.TEAM_BALANCE_V1_FORMULA_VERSION,
  currentFormula: current.TEAM_BALANCE_V1_FORMULA_VERSION, syntheticCases: cases.length, uniqueRealRosters: 0,
  pairSwaps: results.reduce((n, r) => n + r.swaps.considered, 0), timing: { baseline: timing(times.baseline), current: timing(times.current) },
  notes: ["Synthetic stress outcomes are excluded from real-data improvement rates.", "No outcome probabilities are estimated.", "Timing is sequential single-process, after no explicit JIT warmup; small synthetic sample only.", "Low-confidence perturbation can produce an actual score delta of zero; report the measured delta rather than counting it as a meaningful perturbation."], results };
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
await readFile(output, "utf8");
console.log(JSON.stringify({ status: "PASS", syntheticCases: cases.length, pairSwaps: report.pairSwaps, output }));
