import assert from "node:assert/strict";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import type * as BalanceModule from "../../src/modules/team-tools/domain/team-balance";
import type { EvaluatedTeamBalanceLayout, TeamBalanceLayoutEntry, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { compareRisk, distribution } from "../balance-research/metrics";
import { classifyPareto, independentMetrics, type Metrics } from "./metrics";
import { loadSeverityCandidateOracle } from "./oracle";
import type { Result } from "./run";
import { BASELINE_COMMIT, DIRECTORY, PUBLIC_DIRECTORY, STRATA, assertLock, hash, readInputs } from "./study";

type Engine = typeof BalanceModule & { setStabilityScorePerturbation(playerId: string | null, delta: number): void };
type EngineName = "BASELINE" | "EXCESS_FIRST";
type Deltas = ReturnType<typeof metricDeltas>;
type SwapReport = { considered: number; accepted: number; rejectedByPolicy: number; maxTeamGapIncrease: number; maxTeamGapAbsoluteChange: number;
  maxLaneGapIncrease: number; maxBottomGapIncrease: number; worstPairAnonymousIds: string[]; worstDeltas: Deltas | null };
type EngineReport = { engine: EngineName; frozenScoreFormula: string; elapsedMs: number; metrics: Metrics; inputOrderPassed: true; teamColorPassed: true;
  tuningSelectionMatched: true; swaps: SwapReport; perturbation: { subjectAnonymousId: string; effectiveAssignedRoleScoreDelta: number;
    layoutChanged: boolean; seatsChangedIgnoringColors: number; frozenRiskComparison: number; independentClassification: ReturnType<typeof classifyPareto>;
    unperturbedFrozenMetricDeltas: Deltas; frozenBefore: Metrics; frozenAfter: Metrics } };
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const output = resolve(PUBLIC_DIRECTORY, "stability.json");
const locked = await assertLock();
const inputLockSha256 = hash(JSON.stringify(locked));
const { snapshot, manifest } = await readInputs();

// A completed, hash-matched tuning stage is a prerequisite, regardless of adoption.
// Reading sealed validation/final results, or changing selections after inspection, is prohibited.
const tuningSummary = JSON.parse(await readFile(`${DIRECTORY}/tuning-summary.json`, "utf8")) as {
  inputLockSha256: string; uniqueRosters: number; mode: string; accepted: boolean;
};
assert.equal(tuningSummary.inputLockSha256, inputLockSha256, "TUNING_INPUT_LOCK_MISMATCH");
assert.equal(tuningSummary.mode, "PREDECLARED_EXCESS_FIRST_EVALUATION");
const tuningRosters = manifest.rosters.filter(roster => roster.split === "tuning");
assert.equal(tuningRosters.length, 500, "COMPLETE_TUNING_STAGE_REQUIRED");
assert.equal(tuningSummary.uniqueRosters, tuningRosters.length);
const tuningRows: Result[] = (await Promise.all(Array.from({ length: 4 }, async (_, worker) =>
  (await readFile(`${DIRECTORY}/results/tuning-${worker}.jsonl`, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Result)))).flat();
assert.equal(tuningRows.length, tuningRosters.length);
assert.equal(new Set(tuningRows.map(row => row.id)).size, tuningRows.length);
assert.deepEqual(tuningRows.map(row => row.id).sort(), tuningRosters.map(roster => roster.id).sort());
assert.ok(tuningRows.every(row => row.candidate !== null), "COMPLETED_CANDIDATE_TUNING_REQUIRED");
const sorted = [...tuningRosters].sort((a, b) => a.id.localeCompare(b.id));
const selected = STRATA.flatMap(stratum => {
  const matches = sorted.filter(roster => roster.stratum === stratum).slice(0, 2);
  assert.equal(matches.length, 2, `MISSING_TUNING_STRATUM:${stratum}`);
  return matches;
});
assert.equal(new Set(selected.map(roster => roster.id)).size, 16);
try { await access(output); throw new Error("STABILITY_REPORT_ALREADY_EXISTS"); }
catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }

const selectionRecord = { method: "Lexicographically first two anonymous tuning roster IDs in each of eight preregistered strata, independent of outcomes.",
  selected: selected.map(({ id, source, stratum, split }) => ({ id, source, stratum, split })), uniqueRealRosters: selected.length,
  observedRosters: 0, recombinedRosters: selected.length, uniquePairSwapScenarios: selected.length * 45, enginesPerScenario: 2,
  effectiveScorePerturbation: 0.1, tuningCandidateAccepted: tuningSummary.accepted,
  purpose: "Sensitivity audit of already opened tuning inputs; no extra tuning, held-out observations or outcome prediction." };
const baseline = await loadEngine(resolve(DIRECTORY, "baseline"), "baseline");
const oracleDirectory = resolve(DIRECTORY, "stability-candidate-oracle");
await loadSeverityCandidateOracle(resolve(DIRECTORY, "baseline"), oracleDirectory);
const candidateEngine = await loadEngine(oracleDirectory, "excess-first");
const byId = new Map(snapshot.players.map(player => [player.playerId, player]));
const results: { anonymousRosterId: string; source: string; stratum: string; split: "tuning"; engines: EngineReport[] }[] = [];
for (const roster of selected) {
  const players = roster.playerIds.map(id => {
    const original = byId.get(id);
    assert.ok(original && /^P\d+$/.test(id), "ONLY_FROZEN_ANONYMOUS_PLAYERS_ALLOWED");
    return original;
  });
  const inputBefore = JSON.stringify(players);
  const subject = [...roster.playerIds].sort()[0]!;
  const tuningRow = tuningRows.find(row => row.id === roster.id)!;
  const engines: EngineReport[] = [];
  for (const [name, engine] of [["BASELINE", baseline], ["EXCESS_FIRST", candidateEngine]] as const) {
    const started = performance.now();
    const calculation = engine.calculateTeamBalanceCandidates(players);
    const selectedLayout = calculation.candidates[0]!;
    const elapsedMs = performance.now() - started;
    const expected = name === "BASELINE" ? { metrics: tuningRow.baseline, layout: tuningRow.baselineLayout } : tuningRow.candidate!;
    assert.equal(signature(selectedLayout.assignments), signature(expected.layout), `${roster.id}:${name}:TUNING_SELECTION_CHANGED`);
    const measured = measure(players, selectedLayout);
    assert.deepEqual(measured, expected.metrics, `${roster.id}:${name}:TUNING_METRICS_CHANGED`);
    const options = { allowConstraintRelaxation: tuningRow.relaxed };
    assert.equal(Boolean(selectedLayout.score.fairness?.constraintRelaxation), tuningRow.relaxed);
    const reverse = engine.calculateTeamBalanceCandidates([...players].reverse()).candidates[0]!;
    assert.equal(signature(reverse.assignments), signature(selectedLayout.assignments), `${roster.id}:${name}:INPUT_ORDER_CHANGED`);
    assert.deepEqual(reverse.score, selectedLayout.score, `${roster.id}:${name}:INPUT_ORDER_SCORE_CHANGED`);
    const flipped = engine.evaluateTeamBalanceLayout(players, selectedLayout.assignments.map(a => ({ playerId: a.playerId, position: a.position,
      team: a.team === "RED" ? "BLUE" : "RED" })), options);
    assertColorSymmetry(measured, measure(players, flipped));

    const swaps: SwapReport = { considered: 0, accepted: 0, rejectedByPolicy: 0, maxTeamGapIncrease: 0, maxTeamGapAbsoluteChange: 0,
      maxLaneGapIncrease: 0, maxBottomGapIncrease: 0, worstPairAnonymousIds: [], worstDeltas: null };
    const playerIds = [...roster.playerIds].sort();
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
      const left = playerIds[i]!; const right = playerIds[j]!;
      swaps.considered++;
      const layout = selectedLayout.assignments.map(a => ({ team: a.team, position: a.position,
        playerId: a.playerId === left ? right : a.playerId === right ? left : a.playerId }));
      try {
        const swapped = engine.evaluateTeamBalanceLayout(players, layout, options);
        const delta = metricDeltas(measured, measure(players, swapped));
        swaps.accepted++;
        swaps.maxTeamGapAbsoluteChange = Math.max(swaps.maxTeamGapAbsoluteChange, Math.abs(delta.teamGap));
        swaps.maxLaneGapIncrease = Math.max(swaps.maxLaneGapIncrease, delta.maxLaneGap);
        swaps.maxBottomGapIncrease = Math.max(swaps.maxBottomGapIncrease, delta.bottomGap);
        if (delta.teamGap > swaps.maxTeamGapIncrease) {
          swaps.maxTeamGapIncrease = delta.teamGap;
          swaps.worstPairAnonymousIds = [left, right];
          swaps.worstDeltas = delta;
        }
      } catch (error) {
        if (!(error instanceof engine.TeamBalanceDomainError) || error.code !== "FAIRNESS_CONSTRAINT") throw error;
        swaps.rejectedByPolicy++;
      }
    }
    assert.equal(swaps.considered, 45);
    assert.equal(swaps.accepted + swaps.rejectedByPolicy, 45);

    engine.setStabilityScorePerturbation(subject, 0.1);
    let perturbed: EvaluatedTeamBalanceLayout;
    try {
      const sameLayout = engine.evaluateTeamBalanceLayout(players, selectedLayout.assignments, options);
      for (const assignment of sameLayout.assignments) {
        const old = selectedLayout.assignments.find(entry => entry.playerId === assignment.playerId)!;
        assert.equal(round(assignment.rating.effectiveScore - old.rating.effectiveScore), assignment.playerId === subject ? 0.1 : 0,
          "PERTURBATION_MUST_CHANGE_ACTUAL_EFFECTIVE_SCORE_ONLY");
      }
      perturbed = engine.calculateTeamBalanceCandidates(players).candidates[0]!;
    } finally { engine.setStabilityScorePerturbation(null, 0); }
    const frozenBefore = measure(players, baseline.evaluateTeamBalanceLayout(players, selectedLayout.assignments, { allowConstraintRelaxation: true }));
    const frozenAfter = measure(players, baseline.evaluateTeamBalanceLayout(players, perturbed.assignments, { allowConstraintRelaxation: true }));
    assert.equal(JSON.stringify(players), inputBefore, "PLAYER_MMR_OVERRIDES_OR_ROLES_MUTATED");
    engines.push({ engine: name, frozenScoreFormula: engine.TEAM_BALANCE_V1_FORMULA_VERSION, elapsedMs, metrics: measured,
      inputOrderPassed: true, teamColorPassed: true, tuningSelectionMatched: true, swaps,
      perturbation: { subjectAnonymousId: subject, effectiveAssignedRoleScoreDelta: 0.1,
        layoutChanged: signature(selectedLayout.assignments) !== signature(perturbed.assignments), seatsChangedIgnoringColors: changedSeats(selectedLayout, perturbed),
        frozenRiskComparison: compareRisk(frozenAfter, frozenBefore), independentClassification: classifyPareto(frozenBefore, frozenAfter),
        unperturbedFrozenMetricDeltas: metricDeltas(frozenBefore, frozenAfter), frozenBefore, frozenAfter } });
  }
  results.push({ anonymousRosterId: roster.id, source: roster.source, stratum: roster.stratum, split: "tuning", engines });
  console.log(JSON.stringify({ status: "STABILITY_ROSTER_VERIFIED", anonymousRosterId: roster.id, completed: results.length, total: selected.length }));
}

const summaries = (["BASELINE", "EXCESS_FIRST"] as const).map(name => {
  const entries = results.map(row => ({ id: row.anonymousRosterId, ...row.engines.find(engine => engine.engine === name)! }));
  return { engine: name, uniqueRosters: entries.length, swapEvaluations: entries.reduce((n, row) => n + row.swaps.considered, 0),
    acceptedSwaps: entries.reduce((n, row) => n + row.swaps.accepted, 0), rejectedSwaps: entries.reduce((n, row) => n + row.swaps.rejectedByPolicy, 0),
    inputOrderPasses: entries.length, teamColorPasses: entries.length, tuningSelectionMatches: entries.length,
    effectivePerturbationsVerified: entries.length, perturbationLayoutChanges: entries.filter(row => row.perturbation.layoutChanged).length,
    perturbationPareto: Object.fromEntries(["improved", "identical", "mixed", "worsened"].map(label => [label, entries.filter(row => row.perturbation.independentClassification === label).length])),
    frozenOldRiskWorsenedAfterPerturbation: entries.filter(row => row.perturbation.frozenRiskComparison > 0).length,
    maximumTeamGapIncreaseAfterPerturbation: Math.max(0, ...entries.map(row => row.perturbation.unperturbedFrozenMetricDeltas.teamGap)),
    maximumLaneGapIncreaseAfterPerturbation: Math.max(0, ...entries.map(row => row.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap)),
    maximumSwapTeamGapIncrease: Math.max(0, ...entries.map(row => row.swaps.maxTeamGapIncrease)),
    maximumSwapLaneGapIncrease: Math.max(0, ...entries.map(row => row.swaps.maxLaneGapIncrease)),
    timing: distribution(entries.map(row => row.elapsedMs)),
    worstPerturbationCases: [...entries].sort((a, b) => b.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap - a.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap)
      .slice(0, 3).map(row => ({ anonymousRosterId: row.id, ...row.perturbation })) };
});
await assertLock();
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, JSON.stringify({ executedAt: new Date().toISOString(), baselineCommit: BASELINE_COMMIT, inputLockSha256,
  snapshotSha256: locked.snapshotSha256, ...selectionRecord, summaries,
  notes: ["Each ten-player set is counted once. Pair swaps, repeated scans and both engines are separate evaluations, not new cases.",
    "Only completed tuning rosters are used; validation and final remain sealed by this script.",
    "EXCESS_FIRST is an isolated candidate selector. frozenScoreFormula identifies unchanged scoring, not candidate activation in production.",
    "The +0.1 test changes computed effective scores only in disposable modules. Snapshot players, personal MMR, administrator overrides and registered roles are untouched.",
    "Perturbed selections are reevaluated using unperturbed frozen scores; changes are sensitivity evidence, not new tuning signals or win probabilities.",
    "Swap sensitivity includes real strength differences and assigned-role penalties; policy-rejected swaps are reported separately.",
    "Timing is sequential without warmup; other processes may contend for CPU. The separate pilot is the timing reference."], results }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ status: "PASS", uniqueRealRosters: selected.length, uniquePairSwapScenarios: selected.length * 45, summaries, output }, null, 2));

/** Inject only a computed-score seam into disposable copies, never source ratings. */
async function loadEngine(sourceDirectory: string, name: string): Promise<Engine> {
  const scratch = resolve(DIRECTORY, `stability-${name}`);
  await mkdir(scratch, { recursive: true });
  for (const file of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) await copyFile(resolve(sourceDirectory, file), resolve(scratch, file));
  const source = await readFile(resolve(sourceDirectory, "team-balance.ts"), "utf8");
  const needle = "effectiveScore: resolvePlayerPositionScore(player, position).effectiveScore,";
  assert.equal(source.split(needle).length, 2, "EFFECTIVE_SCORE_SEAM_MUST_BE_UNIQUE");
  const instrumented = source.replace(needle,
    "effectiveScore: round(resolvePlayerPositionScore(player, position).effectiveScore + (player.playerId === stabilityPlayerId ? stabilityDelta : 0)),")
    + "\nlet stabilityPlayerId: string | null = null; let stabilityDelta = 0;\nexport function setStabilityScorePerturbation(playerId: string | null, delta: number) { stabilityPlayerId = playerId; stabilityDelta = delta; }\n";
  const entry = resolve(scratch, "team-balance.ts");
  await writeFile(entry, instrumented, "utf8");
  return await import(pathToFileURL(entry).href) as Engine;
}

function signature(layout: readonly TeamBalanceLayoutEntry[]) {
  return ["BLUE", "RED"].map(team => positions.map(position => layout.find(a => a.team === team && a.position === position)!.playerId).join(",")).sort().join("|");
}
function round(value: number) { return Math.round(value * 10000) / 10000; }
function measure(players: readonly TeamBalancePlayer[], layout: EvaluatedTeamBalanceLayout): Metrics {
  const metrics = independentMetrics(players, layout);
  const totals = { BLUE: 0, RED: 0 };
  for (const assignment of layout.assignments) totals[assignment.team] += assignment.rating.effectiveScore;
  assert.equal(new Set(layout.assignments.map(a => a.playerId)).size, 10);
  for (const team of ["BLUE", "RED"]) for (const position of positions) assert.equal(layout.assignments.filter(a => a.team === team && a.position === position).length, 1);
  assert.equal(round(Math.abs(totals.BLUE - totals.RED)), metrics.teamGap);
  assert.equal(metrics.teamGap, layout.score.fairness!.totalGap);
  assert.equal(metrics.maxLaneGap, layout.score.fairness!.maxLaneGap);
  assert.equal(metrics.bottomGap, layout.score.fairness!.bottomGap);
  return metrics;
}
function assertColorSymmetry(before: Metrics, flipped: Metrics) {
  const { signedLaneGaps: beforeSigned, blueSeverelyDisadvantagedLanes: beforeBlue, redSeverelyDisadvantagedLanes: beforeRed, ...beforeInvariant } = before;
  const { signedLaneGaps: afterSigned, blueSeverelyDisadvantagedLanes: afterBlue, redSeverelyDisadvantagedLanes: afterRed, ...afterInvariant } = flipped;
  assert.deepEqual(afterInvariant, beforeInvariant, "TEAM_COLOR_CHANGED_INVARIANT_METRICS");
  assert.equal(afterBlue, beforeRed); assert.equal(afterRed, beforeBlue);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(beforeSigned[i] + afterSigned[i]) < 1e-8, "TEAM_COLOR_SIGNED_GAP_NOT_REVERSED");
}
function metricDeltas(before: Metrics, after: Metrics) {
  const keys = ["teamGap", "laneSum", "maxLaneGap", "largeLaneCount", "adcGap", "supportGap", "bottomGap", "burdenImbalance", "subImbalance", "autoCount", "unregistered", "qualityViolationCount", "excessRisk", "cost"] as const;
  return Object.fromEntries(keys.map(key => [key, round(after[key] - before[key])])) as Record<typeof keys[number], number>;
}
function changedSeats(before: EvaluatedTeamBalanceLayout, after: EvaluatedTeamBalanceLayout) {
  const count = (flip: boolean) => after.assignments.filter(a => {
    const previous = before.assignments.find(b => b.playerId === a.playerId)!;
    return previous.position !== a.position || previous.team !== (flip ? a.team === "RED" ? "BLUE" : "RED" : a.team);
  }).length;
  return Math.min(count(false), count(true));
}
