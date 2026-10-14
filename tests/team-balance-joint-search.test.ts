import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTeamBalanceCandidates,
  evaluateTeamBalanceLayout,
  TEAM_BALANCE_POSITIONS,
  TeamBalanceDomainError,
  validateTeamBalancePlayers,
  type TeamBalancePlayer,
} from "../src/modules/team-tools/domain/team-balance";
import {
  evaluateInhouseFairness,
  type InhouseFairnessAssignment,
  type InhouseFairnessReport,
} from "../src/modules/team-tools/domain/inhouse-fairness";
import { selectInhouseJointLayouts } from "../src/modules/team-tools/domain/inhouse-joint-search";

function neutralPlayers(): TeamBalancePlayer[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: `player-${index}`,
    eligiblePositions: [{ position: TEAM_BALANCE_POSITIONS[index % 5]!, preference: "MAIN" }],
    rating: { overall: 50, confidence: 1, sampleSize: 20, positions: null, v1: {
      legacyPlayerId: index, currentTier: "골드1", peakTier: "골드1", season: null,
      internalGames: 0, internalPositionGames: {}, recentSolo: null,
      balanceOverrideScore: 0, mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [],
    } },
  }));
}

test("joint role search repairs opposing jungle/mid stomps even when it needs two sub-role assignments", () => {
  const fixed: TeamBalancePlayer[] = ["TOP", "ADC", "SUP"].flatMap((position) => [0, 1].map((copy) => ({
    playerId: `${position}-${copy}`,
    eligiblePositions: [{ position: position as "TOP" | "ADC" | "SUP", preference: "MAIN" }],
    rating: { overall: 50, confidence: 1, sampleSize: 20, positions: null },
  })));
  const flex: TeamBalancePlayer[] = [80, 20, 20, 80].map((score, index) => ({
    playerId: `flex-${index}`,
    eligiblePositions: [{ position: "JGL", preference: index % 2 ? "SUB" : "MAIN" },
      { position: "MID", preference: index % 2 ? "MAIN" : "SUB" }],
    rating: { overall: score, confidence: 1, sampleSize: 20, positions: null },
  }));
  const players = [...fixed, ...flex];
  const snapshot = JSON.stringify(players);
  const result = calculateTeamBalanceCandidates(players).candidates[0]!;
  assert.equal(result.score.fairness?.qualityViolationCount, 0);
  assert.equal(result.score.fairness?.maxLaneGap, 0);
  assert.equal(result.score.preference.subCount, 2, "both teams' preferred roles cannot hide two 60-point gaps");
  assert.equal(result.score.preference.autoCount, 0);
  assert.equal(result.score.fairness?.status, "REVIEW_REQUIRED", "missing tier is disclosed separately from good numeric balance");
  assert.equal(JSON.stringify(players), snapshot);
});

test("current-tier bottom cap is enforced in both generation and manual evaluation", () => {
  const players = neutralPlayers();
  players[3] = { ...players[3]!, rating: { ...players[3]!.rating!, v1: {
    ...players[3]!.rating!.v1!, currentTier: "DIAMOND IV", peakTier: "골드1",
  } }, eligiblePositions: [{ position: "ADC", preference: "SUB" }] };
  const layout = players.map((player, index) => ({ playerId: player.playerId,
    team: index < 5 ? "RED" as const : "BLUE" as const, position: TEAM_BALANCE_POSITIONS[index % 5]! }));
  assert.throws(() => calculateTeamBalanceCandidates(players),
    (error) => error instanceof TeamBalanceDomainError && error.code === "NO_FEASIBLE_LAYOUT");
  assert.throws(() => evaluateTeamBalanceLayout(players, layout), (error) =>
    error instanceof TeamBalanceDomainError && error.code === "FAIRNESS_CONSTRAINT" &&
    error.fairness?.status === "INVALID" && error.fairness.checks.some((check) => check.code === "BOTTOM_TIER_ADC" && check.status === "FAIL"));
  players[3] = { ...players[3], rating: { ...players[3].rating!, v1: { ...players[3].rating!.v1!, currentTier: "EMERALD IV" } } };
  assert.equal(calculateTeamBalanceCandidates(players).candidates[0]!.score.fairness?.hardViolations.length, 0);
});

test("unknown current tier is reviewable and malformed layouts remain distinct from rule violations", () => {
  const players = neutralPlayers();
  players[3] = { ...players[3]!, rating: { ...players[3]!.rating!, v1: { ...players[3]!.rating!.v1!, currentTier: null, peakTier: "챌린저" } } };
  const result = calculateTeamBalanceCandidates(players).candidates[0]!;
  assert.equal(result.score.fairness?.status, "REVIEW_REQUIRED");
  const layout = result.assignments.map(({ playerId, team, position }) => ({ playerId, team, position }));
  const top = layout.findIndex((entry) => entry.team === "RED" && entry.position === "TOP");
  const jungle = layout.findIndex((entry) => entry.team === "RED" && entry.position === "JGL");
  const swap = layout.map((entry, index) => index === top ? { ...entry, position: "JGL" as const } :
    index === jungle ? { ...entry, position: "TOP" as const } : entry);
  assert.throws(() => evaluateTeamBalanceLayout(players, swap), (error) =>
    error instanceof TeamBalanceDomainError && error.code === "FAIRNESS_CONSTRAINT" && !!error.fairness?.hardViolations.length);
  assert.throws(() => evaluateTeamBalanceLayout(players, layout.slice(1)),
    (error) => error instanceof TeamBalanceDomainError && error.code === "INVALID_LAYOUT");
});

test("request validation performs no combinatorial search and detects duplicates across legacy sorting", () => {
  const players = neutralPlayers().map((player) => ({ ...player,
    eligiblePositions: TEAM_BALANCE_POSITIONS.map((position) => ({ position, preference: "AUTO" as const })),
  }));
  validateTeamBalancePlayers(players);
  const duplicate = players.map((player, index) => index === 9 ? { ...player, playerId: players[0]!.playerId } : player);
  assert.throws(() => validateTeamBalancePlayers(duplicate),
    (error) => error instanceof TeamBalanceDomainError && error.code === "DUPLICATE_PLAYER_ID");
});

type SearchTeam = { assignments: InhouseFairnessAssignment[]; signature: string; subCount: number };
function searchTeam(team: "RED" | "BLUE", variant: number, scores: number[]): SearchTeam {
  const assignments = TEAM_BALANCE_POSITIONS.map((position, index) => ({
    playerId: `${team}-${(index + variant) % 5}`, team, position,
    score: scores[index]!, finalBaseScore: 50, currentTier: "골드1", peakTier: "골드1",
    roleType: variant % 2 && index === 0 ? "SUB" as const : "MAIN" as const,
    mainPositions: TEAM_BALANCE_POSITIONS, subPositions: [], allowedPositions: TEAM_BALANCE_POSITIONS,
  }));
  return { assignments, signature: assignments.map((entry) => entry.playerId).join(","),
    subCount: assignments.filter((entry) => entry.roleType === "SUB").length };
}

// Intentionally written separately from the production comparator: this is the
// approved lexicographic objective, followed by the one shared weighted cost.
function oracleKey(report: InhouseFairnessReport, red: SearchTeam, blue: SearchTeam): (number | string)[] {
  const excess = Math.max(0, report.maxLaneGap - 25) + Math.max(0, report.totalGap - 15) +
    Math.max(0, report.bottomGap - 10) + Math.max(0, report.largeLaneCount - 1) * 15;
  return [report.qualityViolationCount, excess, report.unknownTierCount, report.autoCount, report.autoImbalance,
    report.totalGap * 1.4 + report.lineGapTotal * 0.6 + report.maxLaneGap + report.bottomGap * 0.8 +
    report.directionalPenalty * 4 + red.subCount + blue.subCount, blue.signature, red.signature];
}
function compareKeys(a: (number | string)[], b: (number | string)[]) {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    return a[index]! < b[index]! ? -1 : 1;
  }
  return 0;
}

test("joint shortlist is the exact oracle optimum including canonical tie-breaking, not a recommendation-score rerank", () => {
  let seed = 31;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 20; trial += 1) {
    const red = Array.from({ length: 5 }, (_, index) => searchTeam("RED", index,
      Array.from({ length: 5 }, () => trial === 0 ? 50 : 30 + Math.floor(random() * 41))));
    const blue = Array.from({ length: 5 }, (_, index) => searchTeam("BLUE", index,
      Array.from({ length: 5 }, () => trial === 0 ? 50 : 30 + Math.floor(random() * 41))));
    if (trial % 3 === 0) red[0]!.assignments[3]!.currentTier = "다이아4";
    const oracle = red.flatMap((r) => blue.map((b) => {
      const report = evaluateInhouseFairness([...r.assignments, ...b.assignments]);
      return { red: r, blue: b, report, key: oracleKey(report, r, b) };
    })).filter((pair) => !pair.report.hardViolations.length).sort((a, b) => compareKeys(a.key, b.key));
    const selected = selectInhouseJointLayouts([...red].reverse(), [...blue].reverse());
    assert.equal(selected.feasibleLayoutCount, oracle.length);
    assert.deepEqual(selected.pairs.map((pair) => [pair.blue.signature, pair.red.signature]),
      oracle.slice(0, 3).map((pair) => [pair.blue.signature, pair.red.signature]));
  }
});
