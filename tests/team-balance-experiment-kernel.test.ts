import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadBalanceExperimentKernel, EXPERIMENT_VARIANTS } from "../scripts/balance-research/kernel";
import { TEAM_BALANCE_POSITIONS, type TeamBalancePlayer } from "../src/modules/team-tools/domain/team-balance";

function roster(): TeamBalancePlayer[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: `synthetic-${index}`,
    eligiblePositions: [{ position: TEAM_BALANCE_POSITIONS[index % 5]!, preference: index % 3 === 0 ? "SUB" : "MAIN" }],
    rating: { overall: 50, confidence: 0, sampleSize: 0, positions: null,
      v1: { legacyPlayerId: index + 1, currentTier: "GOLD I", peakTier: "GOLD I",
        season: null, internalGames: 0, internalPositionGames: {}, recentSolo: null,
        balanceOverrideScore: 0, mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [] } },
  }));
}

test("shared experiment enumeration matches frozen production and full 16-layout independent oracle", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "klol-balance-kernel-"));
  try {
    const kernel = await loadBalanceExperimentKernel(path.resolve("src/modules/team-tools/domain"), scratch);
    const players = roster();
    const result = kernel.calculate(players);
    const baseline = kernel.calculateBaseline(players);
    assert.deepEqual({ ...result.variants.BASELINE, rank: 1 }, baseline.candidates[0]);
    assert.equal(result.search.feasibleLayoutCount, baseline.search.feasibleLayoutCount);
    assert.equal(result.search.feasibleLayoutCount, 16);
    assert.equal(result.search.uniqueEvaluatedLayoutCount, 16);
    const oracle = Array.from({ length: 16 }, (_, mask) => {
      const layout = TEAM_BALANCE_POSITIONS.flatMap((position, index) => {
        const flipped = index > 0 && Boolean(mask & (1 << (index - 1)));
        return [{ playerId: players[index + (flipped ? 5 : 0)]!.playerId, team: "RED" as const, position },
          { playerId: players[index + (flipped ? 0 : 5)]!.playerId, team: "BLUE" as const, position }];
      });
      // Scoring remains frozen; the ordering oracle below spells out the independently registered objective.
      return kernel.evaluateFrozenLayout(players, layout, {});
    });
    for (const variant of EXPERIMENT_VARIANTS) {
      const key = (candidate: typeof oracle[number]): (number | string)[] => {
        const report = candidate.score.fairness!;
        const sub = (team: "RED" | "BLUE") => candidate.assignments.filter((entry) => entry.team === team && entry.preference === "SUB").length;
        const imbalance = Math.abs(sub("RED") - sub("BLUE"));
        const cost = report.totalGap * 1.4 + report.lineGapTotal * 0.6 + report.maxLaneGap + report.bottomGap * 0.8 + sub("RED") + sub("BLUE");
        const excess = Math.max(0, report.maxLaneGap - 25) + Math.max(0, report.totalGap - 15)
          + Math.max(0, report.bottomGap - 10) + Math.max(0, report.largeLaneCount - 1) * 15;
        return [report.qualityViolationCount, excess, report.unknownTierCount, report.autoCount, report.autoImbalance,
          ...report.ruleViolations!, cost + (variant === "SUB_SOFT_1" ? imbalance : 0),
          ...(variant === "SUB_TIE" ? [imbalance] : []), ...candidate.signature.split("|")];
      };
      const sorted = [...oracle].sort((a, b) => {
        const left = key(a), right = key(b);
        for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return left[i]! < right[i]! ? -1 : 1;
        return 0;
      });
      assert.equal(result.variants[variant].signature, sorted[0]!.signature, variant);
    }
    assert.deepEqual(kernel.calculate([...players].reverse()).variants, result.variants);

    // Equal frozen role scores isolate burden from strength. Canonical ordering
    // otherwise puts three SUB players on one side and only one on the other.
    const equalScores = players.map((player, index) => ({ ...player,
      eligiblePositions: [{ position: TEAM_BALANCE_POSITIONS[index % 5]!, preference: index < 4 ? "SUB" as const : "MAIN" as const }],
      rating: { overall: 50, confidence: 1, sampleSize: 20, positions: null },
    }));
    const burden = kernel.calculate(equalScores).variants;
    const subImbalance = (candidate: typeof burden.BASELINE) => Math.abs(candidate.assignments.reduce((sum, entry) =>
      sum + (entry.preference === "SUB" ? entry.team === "RED" ? 1 : -1 : 0), 0));
    assert.equal(subImbalance(burden.BASELINE), 2);
    assert.equal(subImbalance(burden.SUB_TIE), 0);
    assert.equal(subImbalance(burden.SUB_SOFT_1), 0);
    assert.deepEqual(burden.SUB_TIE.score.fairness, burden.BASELINE.score.fairness);
    assert.deepEqual(burden.SUB_TIE.score.teamStrength, burden.BASELINE.score.teamStrength);
    assert.deepEqual(burden.SUB_TIE.score.positions, burden.BASELINE.score.positions);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("shared experiment fallback preserves the full production optimum and exact unique count", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "klol-balance-kernel-"));
  try {
    const kernel = await loadBalanceExperimentKernel(path.resolve("src/modules/team-tools/domain"), scratch);
    const players = roster().map((player) => ({ ...player,
      eligiblePositions: [{ position: "TOP" as const, preference: "MAIN" as const }],
    }));
    const result = kernel.calculate(players);
    const baseline = kernel.calculateBaseline(players);
    assert.deepEqual({ ...result.variants.BASELINE, rank: 1 }, baseline.candidates[0]);
    assert.equal(result.search.relaxed, true);
    assert.equal(result.search.evaluatedLayoutCount, 1_814_400);
    assert.equal(result.search.uniqueEvaluatedLayoutCount, 1_814_400);
    assert.equal(result.search.feasibleLayoutCount, baseline.search.feasibleLayoutCount);
    assert.equal(result.variants.BASELINE.score.fairness?.constraintRelaxation?.roleDeviationCount, 8);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
