import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EXCESS_FIRST_SELECTOR, frozenExcessRisk } from "../scripts/balance-severity/selector";
import { loadSeverityCandidateOracle } from "../scripts/balance-severity/oracle";
import { loadBalanceExperimentKernel, type ExperimentSelectionValue } from "../scripts/balance-research/kernel";
import * as current from "../src/modules/team-tools/domain/team-balance";
import { measureInhouseMatchup, type InhouseFairnessAssignment } from "../src/modules/team-tools/domain/inhouse-fairness";
import { compareInhousePriority } from "../src/modules/team-tools/domain/inhouse-joint-search";

function metrics(gaps: number[]): ExperimentSelectionValue {
  const team = (name: "RED" | "BLUE"): InhouseFairnessAssignment[] => current.TEAM_BALANCE_POSITIONS.map((position, index) => ({
    playerId: `${name}-${position}`, team: name, position, roleType: "MAIN", score: 50 + (name === "RED" ? gaps[index]! : 0),
    currentTier: "GOLD I", peakTier: "GOLD I", finalBaseScore: 50,
    mainPositions: current.TEAM_BALANCE_POSITIONS, subPositions: [], allowedPositions: current.TEAM_BALANCE_POSITIONS,
  }));
  return { metrics: measureInhouseMatchup(team("RED"), team("BLUE")), cost: 0, subImbalance: 0 };
}

test("severity candidate preserves every zero-violation boundary and changes only count-versus-size ordering", () => {
  for (const gaps of [[0, 0, 0, 0, 0], [15, 0, 0, 0, 0], [15.0001, 0, 0, 0, 0], [25, -10, 0, 0, 0],
    [25.0001, -10.0001, 0, 0, 0], [0, 0, 0, 10, 0], [0, 0, 0, 10.0001, 0], [14.9999, -14.9999, 0, 0, 0], [15, -15, 0, 0, 0]]) {
    const value = metrics(gaps).metrics;
    assert.equal(value.qualityViolationCount === 0, frozenExcessRisk(value) === 0, gaps.join(","));
  }
  const fewerHugeWarnings = metrics([65, -50, 0, 0, 0]);
  const moreSmallWarnings = metrics([26, -16, 0, 11, 0]);
  assert.equal(fewerHugeWarnings.metrics.qualityViolationCount, 2);
  assert.equal(moreSmallWarnings.metrics.qualityViolationCount, 4);
  assert.equal(frozenExcessRisk(fewerHugeWarnings.metrics), 55);
  assert.equal(frozenExcessRisk(moreSmallWarnings.metrics), 23);
  assert.ok(compareInhousePriority(fewerHugeWarnings.metrics, moreSmallWarnings.metrics) < 0);
  assert.ok(EXCESS_FIRST_SELECTOR.compare(fewerHugeWarnings, moreSmallWarnings) > 0);
  assert.ok(EXCESS_FIRST_SELECTOR.compare(metrics([0, 0, 0, 0, 0]), moreSmallWarnings) < 0);
});

test("severity candidate retains unknown-data, AUTO burden and numbered-rule lexicographic priorities", () => {
  const base = metrics([0, 0, 0, 0, 0]);
  const worse = (changes: Partial<typeof base.metrics>) => ({ ...base, metrics: { ...base.metrics, ...changes } });
  assert.ok(EXCESS_FIRST_SELECTOR.compare(worse({ unknownTierCount: 1 }), worse({ autoCount: 10, autoImbalance: 0 })) > 0);
  assert.ok(EXCESS_FIRST_SELECTOR.compare(worse({ autoCount: 1 }), worse({ autoCount: 2, autoImbalance: 0 })) < 0);
  assert.ok(EXCESS_FIRST_SELECTOR.compare(worse({ autoImbalance: 1 }), worse({ autoImbalance: 2 })) < 0);
  for (let index = 0; index < 5; index++) {
    const highViolation: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    const lowerViolations: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    highViolation[index] = 1;
    for (let later = index + 1; later < 6; later++) lowerViolations[later] = 2;
    assert.ok(EXCESS_FIRST_SELECTOR.compare(worse({ ruleViolations: highViolation }), worse({ ruleViolations: lowerViolations })) > 0);
  }
  assert.equal(EXCESS_FIRST_SELECTOR.compare({ ...base, cost: 5 }, { ...base, cost: 4 }), 1);
});

function roster(): current.TeamBalancePlayer[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: `synthetic-${index}`,
    eligiblePositions: [{ position: current.TEAM_BALANCE_POSITIONS[index % 5]!, preference: index % 3 === 0 ? "SUB" : "MAIN" }],
    rating: { overall: 50, confidence: 0.5, sampleSize: 10, positions: null,
      v1: { legacyPlayerId: index + 1, currentTier: "GOLD I", peakTier: ["GOLD I", "MASTER 100", "DIAMOND I", "GOLD I", "EMERALD I"][index % 5]!,
        season: null, internalGames: 10, internalPositionGames: {}, recentSolo: null, balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0.5, positions: {} }, missingSources: [] } },
  }));
}

/** Independent list ordering uses detailed frozen reports, not the experiment comparator. */
function oracleKey(candidate: current.EvaluatedTeamBalanceLayout): (number | string)[] {
  const f = candidate.score.fairness!;
  const excess = Math.max(0, f.maxLaneGap - 25) + Math.max(0, f.totalGap - 15)
    + Math.max(0, f.bottomGap - 10) + Math.max(0, f.largeLaneCount - 1) * 15;
  const cost = f.totalGap * 1.4 + f.lineGapTotal * 0.6 + f.maxLaneGap + f.bottomGap * 0.8 + candidate.score.preference.subCount;
  return [excess, f.qualityViolationCount, f.unknownTierCount, f.autoCount, f.autoImbalance,
    ...f.ruleViolations!, cost, ...candidate.signature.split("|")];
}
function compareKeys(a: (number | string)[], b: (number | string)[]) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
}

test("custom shared scan retains baseline and matches all sixteen independently ordered strict layouts", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "klol-severity-"));
  try {
    const kernel = await loadBalanceExperimentKernel(path.resolve("src/modules/team-tools/domain"), scratch);
    const players = roster();
    const original = JSON.stringify(players);
    const result = kernel.calculateWithSelectors(players, [EXCESS_FIRST_SELECTOR]);
    assert.deepEqual(Object.keys(result.variants), ["BASELINE", "EXCESS_FIRST"]);
    assert.deepEqual({ ...result.variants.BASELINE, rank: 1 }, current.calculateTeamBalanceCandidates(players).candidates[0]);
    assert.deepEqual(result.variants.BASELINE, kernel.calculate(players).variants.BASELINE, "legacy three-variant API remains unchanged");
    const oracle = Array.from({ length: 16 }, (_, mask) => current.evaluateTeamBalanceLayout(players,
      current.TEAM_BALANCE_POSITIONS.flatMap((position, i) => {
        const flip = i > 0 && Boolean(mask & (1 << (i - 1)));
        return [{ playerId: players[i + (flip ? 5 : 0)]!.playerId, team: "RED" as const, position },
          { playerId: players[i + (flip ? 0 : 5)]!.playerId, team: "BLUE" as const, position }];
      })));
    oracle.sort((a, b) => compareKeys(oracleKey(a), oracleKey(b)));
    assert.deepEqual(result.variants.EXCESS_FIRST, oracle[0]);
    assert.equal(result.search.uniqueEvaluatedLayoutCount, 16);
    assert.equal(result.search.relaxed, false);
    assert.deepEqual(kernel.calculateWithSelectors([...players].reverse(), [EXCESS_FIRST_SELECTOR]).variants, result.variants);
    assert.equal(JSON.stringify(players), original);
    assert.ok(result.variants.EXCESS_FIRST.assignments.every(a => players.find(p => p.playerId === a.playerId)!.eligiblePositions.some(e => e.position === a.position)));
    const unknown = players.map((player, index) => index === 3 ? { ...player,
      rating: { ...player.rating!, v1: { ...player.rating!.v1!, currentTier: null } },
    } : player);
    const review = kernel.calculateWithSelectors(unknown, [EXCESS_FIRST_SELECTOR]).variants.EXCESS_FIRST;
    assert.equal(review.score.fairness!.status, "REVIEW_REQUIRED");
    assert.equal(review.score.fairness!.checks.find(check => check.code === "BOTTOM_TIER_ADC")!.status, "WARN");
    assert.throws(() => kernel.calculateWithSelectors(players, [{ name: "BASELINE", compare: () => 0 }]), /may not replace BASELINE/);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("severity fallback matches a separately patched full production search across 1814400 layouts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "klol-severity-full-"));
  try {
    const source = path.resolve("src/modules/team-tools/domain");
    const independent = await loadSeverityCandidateOracle(source, path.join(root, "candidate-source"));
    const kernel = await loadBalanceExperimentKernel(source, path.join(root, "kernel"));
    const players = roster().map((player, index) => ({ ...player,
      rating: { ...player.rating!, v1: { ...player.rating!.v1!, currentTier: index < 5 ? "DIAMOND I" : "GOLD I" } },
      eligiblePositions: [{ position: "TOP" as const, preference: "MAIN" as const }],
    }));
    const result = kernel.calculateWithSelectors(players, [EXCESS_FIRST_SELECTOR]);
    assert.equal(result.search.uniqueEvaluatedLayoutCount, 1_814_400);
    assert.equal(result.search.relaxed, true);
    const expected = independent.calculateTeamBalanceCandidates(players);
    assert.deepEqual({ ...result.variants.EXCESS_FIRST, rank: 1 }, expected.candidates[0]);
    assert.deepEqual({ ...result.variants.BASELINE, rank: 1 }, current.calculateTeamBalanceCandidates(players).candidates[0]);
    assert.equal(result.variants.EXCESS_FIRST.score.fairness?.constraintRelaxation?.roleDeviationCount, 8);
    assert.equal(result.variants.EXCESS_FIRST.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
