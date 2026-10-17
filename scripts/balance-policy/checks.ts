import assert from "node:assert/strict";
import { evaluateTeamBalanceLayout, type EvaluatedTeamBalanceLayout, type TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import type { loadAnchoredParetoKernel } from "./kernel";
import { EPS, METRIC_KEYS, independentMetrics } from "./metrics";
type Kernel = Awaited<ReturnType<typeof loadAnchoredParetoKernel>>;
export function checkedMetrics(kernel: Kernel, players: readonly TeamBalancePlayer[], selected: EvaluatedTeamBalanceLayout, relaxed: boolean) {
  const options = { allowConstraintRelaxation: relaxed };
  const frozen = kernel.evaluateFrozenLayout(players, selected.assignments, options);
  const current = evaluateTeamBalanceLayout(players, selected.assignments, options);
  assert.deepEqual(frozen.score, selected.score); assert.deepEqual(frozen.assignments, selected.assignments);
  assert.deepEqual(current.score, frozen.score); assert.deepEqual(current.assignments, frozen.assignments);
  return independentMetrics(players, frozen);
}
export function assertColorSymmetry(kernel: Kernel, players: readonly TeamBalancePlayer[], selected: EvaluatedTeamBalanceLayout, relaxed: boolean) {
  const before = independentMetrics(players, selected);
  const flipped = kernel.evaluateFrozenLayout(players, selected.assignments.map(a => ({ playerId: a.playerId, position: a.position, team: a.team === "BLUE" ? "RED" : "BLUE" })), { allowConstraintRelaxation: relaxed });
  const after = independentMetrics(players, flipped);
  for (const key of METRIC_KEYS) if (!["blueSeverelyDisadvantagedLanes", "redSeverelyDisadvantagedLanes", "blueViableCarryLanes", "redViableCarryLanes"].includes(key)) assert.ok(Math.abs(before[key] - after[key]) <= EPS, `COLOR_METRIC_CHANGED:${key}`);
  assert.deepEqual(before.rules, after.rules); assert.deepEqual(before.verification, after.verification);
  assert.equal(before.blueSeverelyDisadvantagedLanes, after.redSeverelyDisadvantagedLanes); assert.equal(before.redSeverelyDisadvantagedLanes, after.blueSeverelyDisadvantagedLanes);
  assert.equal(before.blueViableCarryLanes, after.redViableCarryLanes); assert.equal(before.redViableCarryLanes, after.blueViableCarryLanes);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(before.signedLaneGaps[i] + after.signedLaneGaps[i]) <= EPS);
}
export function subgroups(players: readonly TeamBalancePlayer[], stratum: string) {
  const tiers = players.map(p => parseInhouseMajorTier(p.rating?.v1?.currentTier));
  return [stratum, ...(tiers.some(t => t !== null && t <= 2) ? ["INCLUDES_LOW_TIER"] : []), ...(tiers.some(t => t !== null && t >= 6) ? ["INCLUDES_HIGH_TIER"] : []), ...(tiers.some(t => t === null) ? ["INCLUDES_UNKNOWN_TIER"] : []), ...(players.some(p => (p.rating?.v1?.internalGames ?? 0) === 0) ? ["INCLUDES_NEW_PLAYER"] : []), ...(players.filter(p => (p.rating?.v1?.internalGames ?? 0) < 5).length >= 6 ? ["ACTUAL_LOW_SAMPLE_MAJORITY"] : [])];
}
