import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import type * as CurrentModule from "../../src/modules/team-tools/domain/team-balance";
import type { EvaluatedTeamBalanceLayout, TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { compareRisk, distribution, independentMetrics, type Metrics } from "./metrics";

type Roster = { id: string; source: string; stratum: string; split: string; playerIds: string[]; eligibility?: Record<string, TeamBalancePlayer["eligiblePositions"]> };
type Snapshot = { inventory: { capturedAt: string; baselineCommit: string }; players: TeamBalancePlayer[] };
type Manifest = { snapshotSha256: string; rosters: Roster[] };
type Engine = typeof CurrentModule & { setStabilityScorePerturbation(playerId: string | null, delta: number): void };
type SwapReport = { considered: number; accepted: number; rejectedByPolicy: number; maxTeamGapIncrease: number; maxTeamGapAbsoluteChange: number;
  maxLaneGapIncrease: number; maxBottomGapIncrease: number; worstPairAnonymousIds: string[]; worstDeltas: ReturnType<typeof metricDeltas> | null };
type EngineReport = { engine: string; formulaVersion: string; elapsedMs: number; metrics: Metrics; inputOrderPassed: boolean; teamColorPassed: boolean;
  reportedNoSampleCount?: number;
  swaps: SwapReport; perturbation: { subjectAnonymousId: string; effectiveAssignedRoleScoreDelta: number; layoutChanged: boolean;
    seatsChangedIgnoringColors: number; frozenRiskComparison: number; unperturbedFrozenMetricDeltas: ReturnType<typeof metricDeltas>; frozenBefore: Metrics; frozenAfter: Metrics } };
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const directory = resolve(".private/balance-research");
const output = resolve(process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? "docs/qa-evidence/balance-research-2026-10-18/real-stability.json");
const prepareOnly = process.argv.includes("--prepare");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const snapshotText = await readFile(resolve(directory, "snapshot.json"), "utf8");
const snapshot = JSON.parse(snapshotText) as Snapshot;
const manifest = JSON.parse(await readFile(resolve(directory, "rosters.json"), "utf8")) as Manifest;
assert.equal(hash(snapshotText), manifest.snapshotSha256);
const sorted = [...manifest.rosters].sort((a, b) => a.id.localeCompare(b.id));
const selected: Roster[] = [];
const missingSelections: string[] = [];
const choose = (label: string, predicate: (roster: Roster) => boolean, count: number) => {
  const matches = sorted.filter(roster => predicate(roster) && !selected.some(row => row.id === roster.id)).slice(0, count);
  if (matches.length < count) missingSelections.push(`${label}: requested ${count}, available ${matches.length}`);
  selected.push(...matches);
};
for (const source of ["OBSERVED_MATCH", "OBSERVED_DRAFT", "OBSERVED_APPLICATION"]) choose(source, r => r.source === source, 2);
for (const stratum of ["SIMILAR_TIER", "MIXED_TIERS", "MAIN_CONGESTION", "JUNGLE_SHORTAGE", "SUPPORT_SHORTAGE", "LOW_SAMPLE", "UNKNOWN_TIER", "BROAD_POOL"]) {
  choose(stratum, r => r.source === "RECOMBINED_REAL_PLAYERS" && r.stratum === stratum, 1);
}
const rosterSelection = selected.map(({ id, source, stratum, split }) => ({ id, source, stratum, split }));
const selectionRecord = { snapshotSha256: manifest.snapshotSha256, method: "Lexicographically first anonymous roster IDs per prespecified source/stratum; independent of results.",
  selected: rosterSelection, missingSelections, intendedRosters: 14, uniqueRealRosters: selected.length,
  uniquePairSwapScenarios: selected.length * 45, enginesPerScenario: 2, effectiveScorePerturbation: 0.1,
  purpose: "Implementation and sensitivity audit only; excluded from tuning, adoption gates and outcome prediction." };
await writeFile(resolve(directory, "real-stability-selection.json"), JSON.stringify(selectionRecord, null, 2) + "\n");
if (prepareOnly) {
  console.log(JSON.stringify({ status: "PREPARED", ...selectionRecord }, null, 2));
} else if (process.argv.includes("--diagnostics-only")) {
  await annotateDiagnostics();
} else {
  await run();
}

/** The test seam changes only computed effective scores in disposable modules; input records never change. */
async function loadEngine(sourceDirectory: string, name: string): Promise<Engine> {
  const scratch = resolve(directory, `real-stability-${name}`);
  await mkdir(scratch, { recursive: true });
  for (const file of ["inhouse-fairness.ts", "inhouse-joint-search.ts"]) await copyFile(resolve(sourceDirectory, file), resolve(scratch, file));
  const source = await readFile(resolve(sourceDirectory, "team-balance.ts"), "utf8");
  const needle = "effectiveScore: resolvePlayerPositionScore(player, position).effectiveScore,";
  assert.equal(source.split(needle).length, 2, "The effective-score test seam must have exactly one known injection point.");
  const instrumented = source.replace(needle,
    "effectiveScore: round(resolvePlayerPositionScore(player, position).effectiveScore + (player.playerId === stabilityPlayerId ? stabilityDelta : 0)),")
    + "\nlet stabilityPlayerId: string | null = null; let stabilityDelta = 0;\nexport function setStabilityScorePerturbation(playerId: string | null, delta: number) { stabilityPlayerId = playerId; stabilityDelta = delta; }\n";
  const entry = resolve(scratch, "team-balance.ts");
  await writeFile(entry, instrumented, "utf8");
  return await import(pathToFileURL(entry).href) as Engine;
}

function signature(candidate: EvaluatedTeamBalanceLayout): string {
  return ["BLUE", "RED"].map(team => positions.map(position =>
    candidate.assignments.find(a => a.team === team && a.position === position)!.playerId).join(",")).sort().join("|");
}

function measure(players: readonly TeamBalancePlayer[], candidate: EvaluatedTeamBalanceLayout): Metrics {
  const metrics = independentMetrics(players, candidate);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const totals = { BLUE: 0, RED: 0 };
  for (const a of candidate.assignments) totals[a.team] += a.rating.effectiveScore;
  assert.equal(new Set(candidate.assignments.map(a => a.playerId)).size, 10);
  assert.equal(round(Math.abs(totals.BLUE - totals.RED)), metrics.teamGap);
  assert.equal(metrics.teamGap, candidate.score.fairness!.totalGap);
  assert.equal(metrics.maxLaneGap, candidate.score.fairness!.maxLaneGap);
  assert.equal(metrics.bottomGap, candidate.score.fairness!.bottomGap);
  return metrics;
}

function metricDeltas(before: Metrics, after: Metrics) {
  const delta = (key: "teamGap" | "laneSum" | "maxLaneGap" | "largeLaneCount" | "adcGap" | "supportGap" | "bottomGap" | "burdenImbalance" | "subImbalance" | "cost") =>
    Math.round((after[key] - before[key]) * 10000) / 10000;
  return { teamGap: delta("teamGap"), laneSum: delta("laneSum"), maxLaneGap: delta("maxLaneGap"), largeLaneCount: delta("largeLaneCount"),
    adcGap: delta("adcGap"), supportGap: delta("supportGap"), bottomGap: delta("bottomGap"), burdenImbalance: delta("burdenImbalance"), subImbalance: delta("subImbalance"), cost: delta("cost") };
}

function changedSeats(before: EvaluatedTeamBalanceLayout, after: EvaluatedTeamBalanceLayout): number {
  const count = (flip: boolean) => after.assignments.filter(a => {
    const previous = before.assignments.find(b => b.playerId === a.playerId)!;
    return previous.position !== a.position || previous.team !== (flip ? a.team === "RED" ? "BLUE" : "RED" : a.team);
  }).length;
  return Math.min(count(false), count(true));
}

async function run() {
  const baseline = await loadEngine(resolve(directory, "baseline"), "baseline");
  const current = await loadEngine(resolve("src/modules/team-tools/domain"), "current");
  const byId = new Map(snapshot.players.map(player => [player.playerId, player]));
  const results: { id: string; source: string; stratum: string; split: string; engines: EngineReport[] }[] = [];
  for (const roster of selected) {
    const players = roster.playerIds.map(id => {
      const original = byId.get(id);
      assert.ok(original && /^P\d+$/.test(id), "Only anonymous frozen players may enter this audit.");
      return { ...original, eligiblePositions: roster.eligibility?.[id] ?? original.eligiblePositions };
    });
    const original = JSON.stringify(players);
    const subject = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId))[0]!.playerId;
    const engineResults: EngineReport[] = [];
    for (const [name, engine] of [["baseline", baseline], ["current", current]] as const) {
      const started = performance.now();
      const calculation = engine.calculateTeamBalanceCandidates(players);
      const candidate = calculation.candidates[0]!;
      const elapsedMs = performance.now() - started;
      const measured = measure(players, candidate);
      const options = { allowConstraintRelaxation: !!candidate.score.fairness?.constraintRelaxation };
      const reverse = engine.calculateTeamBalanceCandidates([...players].reverse()).candidates[0]!;
      assert.equal(signature(reverse), signature(candidate), `${roster.id} ${name} input order`);
      const colors = engine.evaluateTeamBalanceLayout(players, candidate.assignments.map(a => ({ playerId: a.playerId, position: a.position,
        team: a.team === "RED" ? "BLUE" : "RED" })), options);
      assert.deepEqual(measure(players, colors), measured, `${roster.id} ${name} team colors`);
      const swaps: SwapReport = { considered: 0, accepted: 0, rejectedByPolicy: 0, maxTeamGapIncrease: 0, maxTeamGapAbsoluteChange: 0, maxLaneGapIncrease: 0, maxBottomGapIncrease: 0,
        worstPairAnonymousIds: [], worstDeltas: null };
      for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
        swaps.considered++;
        const layout = candidate.assignments.map((a, k) => ({ team: a.team, position: a.position,
          playerId: candidate.assignments[k === i ? j : k === j ? i : k]!.playerId }));
        try {
          const swapped = engine.evaluateTeamBalanceLayout(players, layout, options);
          const delta = metricDeltas(measured, measure(players, swapped));
          swaps.accepted++;
          swaps.maxTeamGapAbsoluteChange = Math.max(swaps.maxTeamGapAbsoluteChange, Math.abs(delta.teamGap));
          swaps.maxLaneGapIncrease = Math.max(swaps.maxLaneGapIncrease, delta.maxLaneGap);
          swaps.maxBottomGapIncrease = Math.max(swaps.maxBottomGapIncrease, delta.bottomGap);
          if (delta.teamGap > swaps.maxTeamGapIncrease) {
            swaps.maxTeamGapIncrease = delta.teamGap;
            swaps.worstPairAnonymousIds = [candidate.assignments[i]!.playerId, candidate.assignments[j]!.playerId];
            swaps.worstDeltas = delta;
          }
        } catch (error) {
          if (!(error instanceof engine.TeamBalanceDomainError) || error.code !== "FAIRNESS_CONSTRAINT") throw error;
          swaps.rejectedByPolicy++;
        }
      }
      engine.setStabilityScorePerturbation(subject, 0.1);
      let perturbed: EvaluatedTeamBalanceLayout;
      try {
        const sameLayout = engine.evaluateTeamBalanceLayout(players, candidate.assignments, options);
        for (const a of sameLayout.assignments) {
          const old = candidate.assignments.find(entry => entry.playerId === a.playerId)!;
          assert.equal(Math.round((a.rating.effectiveScore - old.rating.effectiveScore) * 100) / 100, a.playerId === subject ? 0.1 : 0);
        }
        perturbed = engine.calculateTeamBalanceCandidates(players).candidates[0]!;
      } finally { engine.setStabilityScorePerturbation(null, 0); }
      const originalFixed = measure(players, baseline.evaluateTeamBalanceLayout(players, candidate.assignments, { allowConstraintRelaxation: true }));
      const noisyFixed = measure(players, baseline.evaluateTeamBalanceLayout(players, perturbed.assignments, { allowConstraintRelaxation: true }));
      assert.equal(JSON.stringify(players), original, "Player scores, MMR, overrides and eligibility must remain untouched.");
      engineResults.push({ engine: name, formulaVersion: engine.TEAM_BALANCE_V1_FORMULA_VERSION, elapsedMs,
        metrics: measured, reportedNoSampleCount: candidate.score.uncertainty.noSampleCount, inputOrderPassed: true, teamColorPassed: true, swaps,
        perturbation: { subjectAnonymousId: subject, effectiveAssignedRoleScoreDelta: 0.1, layoutChanged: signature(candidate) !== signature(perturbed),
          seatsChangedIgnoringColors: changedSeats(candidate, perturbed), frozenRiskComparison: compareRisk(noisyFixed, originalFixed),
          unperturbedFrozenMetricDeltas: metricDeltas(originalFixed, noisyFixed), frozenBefore: originalFixed, frozenAfter: noisyFixed } });
    }
    results.push({ ...rosterSelection.find(row => row.id === roster.id)!, engines: engineResults });
    console.log(JSON.stringify({ status: "ROSTER_VERIFIED", anonymousRosterId: roster.id, completed: results.length, total: selected.length }));
  }
  const summaries = ["baseline", "current"].map(name => {
    const entries = results.map(row => ({ id: row.id, ...row.engines.find(engine => engine.engine === name)! }));
    return { engine: name, uniqueRosters: entries.length, swapEvaluations: entries.reduce((n, entry) => n + entry.swaps.considered, 0),
      acceptedSwaps: entries.reduce((n, entry) => n + entry.swaps.accepted, 0), rejectedSwaps: entries.reduce((n, entry) => n + entry.swaps.rejectedByPolicy, 0),
      nonzeroPerturbations: entries.length, perturbationLayoutChanges: entries.filter(entry => entry.perturbation.layoutChanged).length,
      frozenRiskWorsenedAfterPerturbation: entries.filter(entry => entry.perturbation.frozenRiskComparison > 0).length,
      maximumTeamGapIncreaseAfterPerturbation: Math.max(0, ...entries.map(entry => entry.perturbation.unperturbedFrozenMetricDeltas.teamGap)),
      maximumLaneGapIncreaseAfterPerturbation: Math.max(0, ...entries.map(entry => entry.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap)),
      maximumSwapTeamGapIncrease: Math.max(0, ...entries.map(entry => entry.swaps.maxTeamGapIncrease)),
      maximumSwapLaneGapIncrease: Math.max(0, ...entries.map(entry => entry.swaps.maxLaneGapIncrease)),
      timing: distribution(entries.map(entry => entry.elapsedMs)),
      worstPerturbationCases: [...entries].sort((a, b) => b.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap - a.perturbation.unperturbedFrozenMetricDeltas.maxLaneGap).slice(0, 3).map(entry => ({ anonymousRosterId: entry.id, ...entry.perturbation })) };
  });
  const report = { executedAt: new Date().toISOString(), snapshotCapturedAt: snapshot.inventory.capturedAt, baselineCommit: snapshot.inventory.baselineCommit,
    ...selectionRecord, summaries, notes: ["Each participant set counts once; engine evaluations and pair swaps are separate denominators.",
      "Observed matches are replayed at the frozen current snapshot; these are not historical predictions.",
      "The 0.1 perturbation is injected after player scoring in disposable modules; source ratings, personal MMR, admin overrides and roles are unchanged.",
      "Perturbed selections are reevaluated with unperturbed frozen scores to disclose discontinuities; this audit does not tune the algorithm.",
      "Swap changes reflect actual player strength and assigned-role penalties, not estimated win probabilities.",
      "Timings are sequential within this process, without warmup; other simultaneous processes may contend for CPU."], results };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  await annotateDiagnostics();
  console.log(JSON.stringify({ status: "PASS", uniqueRealRosters: selected.length, uniquePairSwapScenarios: selected.length * 45, summaries, output }, null, 2));
}

async function annotateDiagnostics() {
  const report = JSON.parse(await readFile(output, "utf8")) as { snapshotSha256: string; results: { id: string; engines: EngineReport[] }[]; sampleDiagnostics?: unknown };
  assert.equal(report.snapshotSha256, manifest.snapshotSha256);
  const byId = new Map(snapshot.players.map(player => [player.playerId, player]));
  const rows = report.results.map(result => {
    const baseline = result.engines.find(engine => engine.engine === "baseline")!;
    const current = result.engines.find(engine => engine.engine === "current")!;
    const roster = manifest.rosters.find(row => row.id === result.id)!;
    let oldCount = baseline.reportedNoSampleCount;
    if (oldCount === undefined) {
      // Early reports retained the independently calculated correct count.
      // Recover the old null-only field without rerunning search only when
      // every role of each player has identical nullability; otherwise refuse.
      oldCount = roster.playerIds.reduce((sum, id) => {
        const rating = byId.get(id)!.rating;
        const absent = positions.map(position => {
          const role = rating?.positions?.[position];
          return role?.score !== null && role?.score !== undefined ? role.sampleSize === null : (rating?.sampleSize ?? null) === null;
        });
        assert.equal(new Set(absent).size, 1, "Cannot reconstruct an old diagnostic when sample nullability varies by assigned role.");
        return sum + Number(absent[0]);
      }, 0);
    }
    const correctedCount = current.reportedNoSampleCount ?? current.metrics.zeroSampleCount;
    assert.equal(correctedCount, current.metrics.zeroSampleCount);
    assert.deepEqual(current.metrics, baseline.metrics, "Diagnostic-only release must preserve every independent selected metric.");
    return { anonymousRosterId: result.id, source: roster.source, stratum: roster.stratum,
      beforeNoSampleCount: oldCount, afterNoSampleCount: correctedCount, previouslyOmittedZeroSampleAssignments: correctedCount - oldCount };
  });
  const diagnostics = { uniqueRosters: rows.length, participantAssignments: rows.length * 10,
    beforeReportedNoSampleAssignments: rows.reduce((sum, row) => sum + row.beforeNoSampleCount, 0),
    afterReportedNoSampleAssignments: rows.reduce((sum, row) => sum + row.afterNoSampleCount, 0),
    previouslyOmittedZeroSampleAssignments: rows.reduce((sum, row) => sum + row.previouslyOmittedZeroSampleAssignments, 0),
    affectedRosters: rows.filter(row => row.previouslyOmittedZeroSampleAssignments > 0).length,
    maximumOmittedPerRoster: Math.max(0, ...rows.map(row => row.previouslyOmittedZeroSampleAssignments)),
    independentMetricChanges: 0,
    countingUnit: "Participant-role assignment appearances across these 14 rosters, not unique players.",
    reconstruction: "Original null-only counts read from results, or exactly recovered only after asserting all five role sample fields share nullability for each participant. No team search is rerun.",
    worstCases: [...rows].sort((a, b) => b.previouslyOmittedZeroSampleAssignments - a.previouslyOmittedZeroSampleAssignments).slice(0, 3), rows };
  report.sampleDiagnostics = diagnostics;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: "DIAGNOSTICS_VERIFIED", ...diagnostics, rows: undefined }, null, 2));
}
