import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as current from "../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier, type InhouseFairnessAssignment } from "../src/modules/team-tools/domain/inhouse-fairness";
import { hasMaterialPolicyGain, isAnchoredParetoImprovement, loadAnchoredParetoKernel, measurePolicyProtection, type PolicyVector } from "../scripts/balance-policy/kernel";
import { loadAnchoredParetoOracle } from "../scripts/balance-policy/oracle";

function vector(changes: Partial<PolicyVector> = {}): PolicyVector {
  return { lanes: [10, 10, 10, 10, 10], teamGap: 10, bottomGap: 10, autoCount: 2, subCount: 2,
    totalBurden: 6, maxTeamBurden: 4, burdenImbalance: 2, adcUnknownSlots: 1, supportUnknownSlots: 1,
    minViableCarryLanes: 1, totalEffectiveScore: 500, ...changes };
}

test("anchored protection forbids compensation for every individual coordinate", () => {
  const baseline = vector();
  assert.equal(isAnchoredParetoImprovement(baseline, baseline), false, "equal vectors do not change the recommendation");
  assert.equal(isAnchoredParetoImprovement(vector({ lanes: [9, 10, 10, 10, 10] }), baseline), true);
  for (let lane = 0; lane < 5; lane++) {
    const gaps = [1, 1, 1, 1, 1]; gaps[lane] = 10.0001;
    assert.equal(isAnchoredParetoImprovement(vector({ lanes: gaps }), baseline), false, `lane ${lane} cannot be compensated`);
  }
  for (const key of ["teamGap", "bottomGap", "autoCount", "subCount", "totalBurden", "maxTeamBurden", "burdenImbalance", "adcUnknownSlots", "supportUnknownSlots"] as const) {
    assert.equal(isAnchoredParetoImprovement(vector({ lanes: [1, 1, 1, 1, 1], [key]: baseline[key] + 1 }), baseline), false, key);
  }
  for (const key of ["minViableCarryLanes", "totalEffectiveScore"] as const) {
    assert.equal(isAnchoredParetoImprovement(vector({ lanes: [1, 1, 1, 1, 1], [key]: baseline[key] - 1 }), baseline), false, key);
  }
  assert.equal(isAnchoredParetoImprovement(vector({ adcUnknownSlots: 2, supportUnknownSlots: 0 }), baseline), false, "bottom missing tiers are separate");
  assert.throws(() => isAnchoredParetoImprovement(vector({ totalEffectiveScore: NaN }), baseline), /FINITE/);
});

test("material thresholds and a fixed final anchor cannot be replaced by a moving reference", () => {
  const baseline = vector();
  assert.equal(hasMaterialPolicyGain(vector({ lanes: [7.0001, 10, 10, 10, 10] }), baseline), false);
  assert.equal(hasMaterialPolicyGain(vector({ lanes: [7, 10, 10, 10, 10] }), baseline), true);
  assert.equal(hasMaterialPolicyGain(vector({ subCount: 1 }), baseline), true);
  assert.equal(hasMaterialPolicyGain(vector({ burdenImbalance: 1 }), baseline), true);
  assert.equal(hasMaterialPolicyGain(vector({ totalEffectiveScore: 501, minViableCarryLanes: 2 }), baseline), false);
  const interim = vector({ lanes: [1, 10, 10, 10, 10] });
  const finalBaseline = vector({ lanes: [3, 10, 10, 10, 10] });
  const earlyCandidate = vector({ lanes: [2, 10, 10, 10, 10] });
  assert.equal(isAnchoredParetoImprovement(earlyCandidate, interim), false);
  assert.equal(isAnchoredParetoImprovement(earlyCandidate, finalBaseline), true, "earlier rejection cannot be reused against a later anchor");
});

function fairTeam(team: "RED" | "BLUE", gaps: number[]) {
  const assignments: InhouseFairnessAssignment[] = current.TEAM_BALANCE_POSITIONS.map((position, index) => ({
    playerId: `${team}-${position}`, team, position, roleType: "MAIN", score: 50 + (team === "RED" ? gaps[index]! : 0),
    currentTier: "GOLD I", peakTier: "GOLD I", finalBaseScore: 50, mainPositions: [position], subPositions: [], allowedPositions: [position],
  }));
  return { signature: assignments.map(a => a.playerId).join(","), assignments, autoCount: 0, subCount: 0 };
}

test("viable-line equality, bottom information and burden are computed symmetrically", () => {
  const red = fairTeam("RED", [3, -3, 0, 4, -4]); const blue = fairTeam("BLUE", []);
  const equal = measurePolicyProtection(red, blue, parseInhouseMajorTier);
  assert.equal(equal.minViableCarryLanes, 2);
  assert.equal(equal.totalEffectiveScore, 500);
  assert.deepEqual(measurePolicyProtection(blue, red, parseInhouseMajorTier), equal);
  const edge = fairTeam("RED", [3.0001, -3, 0, 4, -4]);
  assert.equal(measurePolicyProtection(edge, blue, parseInhouseMajorTier).minViableCarryLanes, 1);
  edge.assignments[3]!.currentTier = "";
  const unknown = measurePolicyProtection(edge, blue, parseInhouseMajorTier);
  assert.equal(unknown.adcUnknownSlots, 1); assert.equal(unknown.supportUnknownSlots, 0);
  const burden = measurePolicyProtection({ ...red, subCount: 3, autoCount: 1 }, { ...blue, subCount: 1, autoCount: 1 }, parseInhouseMajorTier);
  assert.equal(burden.totalBurden, 8); assert.equal(burden.maxTeamBurden, 5); assert.equal(burden.burdenImbalance, 2);
});

function fixedRoster(subs = false): current.TeamBalancePlayer[] {
  return Array.from({ length: 10 }, (_, index) => ({ playerId: `synthetic-${index}`,
    eligiblePositions: [{ position: current.TEAM_BALANCE_POSITIONS[index % 5]!, preference: subs && index < 4 ? "SUB" : "MAIN" }],
    rating: { overall: 50, confidence: 1, sampleSize: 20, positions: null },
  }));
}

test("sixteen complete layouts preserve the original baseline and independently confirm burden improvement", async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "klol-policy-small-"));
  try {
    const source = path.resolve("src/modules/team-tools/domain");
    const kernel = await loadAnchoredParetoKernel(source, path.join(scratch, "kernel"));
    const oracle = await loadAnchoredParetoOracle(source, path.join(scratch, "oracle"));
    const noGain = kernel.calculate(fixedRoster());
    assert.equal(noGain.changed, false);
    assert.equal(noGain.candidate, noGain.baseline, "no strict improvement returns the exact baseline object");
    assert.equal(noGain.search.eligibleLayoutCount, 0);
    assert.equal(noGain.search.uniqueEvaluatedLayoutCount, 16);
    assert.equal(noGain.search.firstPassInspections, 16); assert.equal(noGain.search.secondPassInspections, 16);
    assert.equal(noGain.search.evaluatedLayoutCount, 32);

    const players = fixedRoster(true); const original = JSON.stringify(players);
    const calculated = kernel.calculate(players); const independent = oracle.calculate(players);
    assert.deepEqual({ ...calculated.baseline, rank: 1 }, current.calculateTeamBalanceCandidates(players).candidates[0]);
    assert.deepEqual(calculated.candidate, independent.candidate);
    assert.equal(independent.search.inspections, 16);
    assert.equal(calculated.search.eligibleLayoutCount, independent.search.eligibleLayouts);
    assert.equal(calculated.changed, true); assert.equal(calculated.materialGain, true);
    assert.equal(calculated.baselineVector.burdenImbalance, 2); assert.equal(calculated.candidateVector.burdenImbalance, 0);
    assert.equal(calculated.baselineVector.maxTeamBurden, 3); assert.equal(calculated.candidateVector.maxTeamBurden, 2);
    assert.deepEqual(kernel.calculate([...players].reverse()).candidate, calculated.candidate);
    const flipped = kernel.evaluateFrozenLayout(players, calculated.candidate.assignments.map(a => ({ playerId: a.playerId, position: a.position,
      team: a.team === "BLUE" ? "RED" : "BLUE" })), {});
    assert.equal(flipped.score.fairness!.totalGap, calculated.candidate.score.fairness!.totalGap);
    assert.equal(flipped.score.fairness!.maxLaneGap, calculated.candidate.score.fairness!.maxLaneGap);
    assert.equal(flipped.score.fairness!.checks.find(check => check.code === "BOTTOM_TIER_ADC")!.status, "WARN");
    assert.equal(JSON.stringify(players), original);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("full fallback enumerator independently agrees on all 1814400 placements and the optimal bottom prefix", { timeout: 120000 }, async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "klol-policy-full-"));
  try {
    const source = path.resolve("src/modules/team-tools/domain");
    const kernel = await loadAnchoredParetoKernel(source, path.join(scratch, "kernel"));
    const oracle = await loadAnchoredParetoOracle(source, path.join(scratch, "oracle"));
    const players: current.TeamBalancePlayer[] = fixedRoster().map((player, index) => ({ ...player,
      eligiblePositions: [{ position: "TOP", preference: "MAIN" }],
      rating: { overall: 50, confidence: 0.5, sampleSize: 10, positions: null, v1: {
        legacyPlayerId: 10 - index, currentTier: index < 5 ? "DIAMOND I" : "GOLD I", peakTier: index < 5 ? "DIAMOND I" : "GOLD I",
        season: null, internalGames: 10, internalPositionGames: {}, recentSolo: null, balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0.5, positions: {} }, missingSources: [] } },
    }));
    const original = JSON.stringify(players);
    const calculated = kernel.calculate(players); const independent = oracle.calculate(players);
    assert.deepEqual({ ...calculated.baseline, rank: 1 }, independent.baseline);
    assert.deepEqual({ ...calculated.candidate, ...(calculated.changed ? {} : { rank: 1 }) }, independent.candidate);
    assert.equal(calculated.search.relaxed, true);
    assert.equal(calculated.search.uniqueEvaluatedLayoutCount, 1_814_400);
    assert.equal(calculated.search.secondPassInspections, 1_814_400);
    assert.equal(calculated.search.evaluatedLayoutCount, 3_628_800);
    assert.equal(independent.search.inspections, 1_814_400);
    assert.equal(calculated.search.feasibleLayoutCount, independent.search.feasibleLayouts);
    assert.equal(calculated.search.optimalPrefixLayoutCount, independent.search.optimalPrefixLayouts);
    assert.equal(calculated.search.eligibleLayoutCount, independent.search.eligibleLayouts);
    assert.equal(calculated.candidate.score.fairness!.constraintRelaxation!.roleDeviationCount, 8);
    assert.equal(calculated.candidate.score.fairness!.constraintRelaxation!.bottomTierViolationCount, 0);
    assert.equal(JSON.stringify(players), original);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
