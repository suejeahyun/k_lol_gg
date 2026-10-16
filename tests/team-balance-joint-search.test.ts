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
  parseInhouseMajorTier,
  type InhouseFairnessAssignment,
  type InhouseFairnessReport,
} from "../src/modules/team-tools/domain/inhouse-fairness";
import { compareInhousePriority, selectInhouseJointLayouts } from "../src/modules/team-tools/domain/inhouse-joint-search";

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

test("automatic fallback repairs a bottom-tier conflict while ordinary manual evaluation stays strict", () => {
  const players = neutralPlayers();
  players[3] = { ...players[3]!, rating: { ...players[3]!.rating!, v1: {
    ...players[3]!.rating!.v1!, currentTier: "DIAMOND IV", peakTier: "골드1",
  } }, eligiblePositions: [{ position: "ADC", preference: "SUB" }] };
  const layout = players.map((player, index) => ({ playerId: player.playerId,
    team: index < 5 ? "RED" as const : "BLUE" as const, position: TEAM_BALANCE_POSITIONS[index % 5]! }));
  const generated = calculateTeamBalanceCandidates(players).candidates[0]!;
  assert.equal(generated.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 0);
  assert.equal(generated.score.fairness?.constraintRelaxation?.roleDeviationCount, 2);
  assert.deepEqual(generated.score.fairness?.hardViolations, []);
  assert.equal(generated.score.fairness?.status, "REVIEW_REQUIRED");
  assert.throws(() => evaluateTeamBalanceLayout(players, layout), (error) =>
    error instanceof TeamBalanceDomainError && error.code === "FAIRNESS_CONSTRAINT" &&
    error.fairness?.status === "INVALID" && error.fairness.checks.some((check) => check.code === "BOTTOM_TIER_ADC" && check.status === "FAIL"));
  const manual = evaluateTeamBalanceLayout(players, layout, { allowConstraintRelaxation: true });
  assert.equal(manual.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 1);
  assert.equal(manual.score.fairness?.constraintRelaxation?.roleDeviationCount, 0);
  assert.equal(manual.score.fairness?.status, "REVIEW_REQUIRED");
  players[3] = { ...players[3], rating: { ...players[3].rating!, v1: { ...players[3].rating!.v1!, currentTier: "EMERALD IV" } } };
  const strict = calculateTeamBalanceCandidates(players).candidates[0]!;
  assert.equal(strict.score.fairness?.hardViolations.length, 0);
  assert.equal(strict.score.fairness?.constraintRelaxation, undefined);
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
  const warns = (code: string) => report.checks.some((check) => check.code === code && check.status === "WARN");
  const fails = (code: string) => report.checks.some((check) => check.code === code && check.status === "FAIL");
  // Derive the numbered priorities from the detailed checks independently of
  // both the fast metric's tuple and the production comparator.
  return [report.qualityViolationCount, excess, report.unknownTierCount, report.autoCount, report.autoImbalance,
    Number(warns("TOP_PLAYERS_SPLIT")) + Number(warns("TOP_PLAYERS_MID_JUNGLE")),
    Number(warns("BOTTOM_SPLIT")), Number(warns("JUNGLE_CARRY_LANE") || warns("BOTH_WIN_PATHS")),
    Number(fails("BOTTOM_TIER_ADC")) + Number(fails("BOTTOM_TIER_SUP")),
    Number(warns("SUPPORT_JUNGLE")), Number(warns("TOP_MID_SPLIT")),
    report.totalGap * 1.4 + report.lineGapTotal * 0.6 + report.maxLaneGap + report.bottomGap * 0.8 +
    red.subCount + blue.subCount, blue.signature, red.signature];
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

function relaxedOracleKey(report: InhouseFairnessReport, red: SearchTeam, blue: SearchTeam) {
  let bottomViolations = 0;
  let excess = 0;
  for (const position of ["ADC", "SUP"] as const) {
    const r = parseInhouseMajorTier(red.assignments.find((entry) => entry.position === position)!.currentTier);
    const b = parseInhouseMajorTier(blue.assignments.find((entry) => entry.position === position)!.currentTier);
    if (r !== null && b !== null && Math.abs(r - b) >= 3) { bottomViolations += 1; excess += Math.abs(r - b) - 2; }
  }
  const offRoles = [...red.assignments, ...blue.assignments].filter((entry) => entry.allowedPositions && !entry.allowedPositions.includes(entry.position)).length;
  return [bottomViolations, excess, offRoles, ...oracleKey(report, red, blue)];
}

test("relaxed joint search matches the independent bottom-risk, off-role and numbered-rule oracle", () => {
  let seed = 812;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 20; trial += 1) {
    const layouts = (team: "RED" | "BLUE") => Array.from({ length: 5 }, (_, variant) => {
      const entry = searchTeam(team, variant, Array.from({ length: 5 }, () => 35 + Math.floor(random() * 35)));
      entry.assignments.forEach((assignment) => {
        assignment.currentTier = ["골드1", "다이아4", "아이언1", "마스터"][Math.floor(random() * 4)]!;
        if (random() < 0.5) { assignment.allowedPositions = ["TOP"]; assignment.roleType = assignment.position === "TOP" ? "MAIN" : "AUTO"; }
      });
      return entry;
    });
    const red = layouts("RED"), blue = layouts("BLUE");
    const oracle = red.flatMap((r) => blue.map((b) => ({ red: r, blue: b,
      key: relaxedOracleKey(evaluateInhouseFairness([...r.assignments, ...b.assignments]), r, b) })))
      .sort((a, b) => compareKeys(a.key, b.key));
    const result = selectInhouseJointLayouts([...red].reverse(), [...blue].reverse(), { allowConstraintRelaxation: true });
    assert.equal(result.feasibleLayoutCount, 25);
    assert.deepEqual(result.pairs.map((pair) => [pair.blue.signature, pair.red.signature]),
      oracle.slice(0, 3).map((pair) => [pair.blue.signature, pair.red.signature]));
  }
});

// Independent assignment DP over ten role seats proves the global minimum
// number of unregistered-role players, without using the production team split.
function minimumOffRoles(players: readonly TeamBalancePlayer[]) {
  let costs = new Map([[0, 0]]);
  for (const player of players) {
    const next = new Map<number, number>();
    for (const [mask, cost] of costs) for (let seat = 0; seat < 10; seat += 1) {
      if (mask & (1 << seat)) continue;
      const assigned = mask | (1 << seat);
      const nextCost = cost + Number(!player.eligiblePositions.some((entry) => entry.position === TEAM_BALANCE_POSITIONS[seat % 5]));
      next.set(assigned, Math.min(next.get(assigned) ?? Infinity, nextCost));
    }
    costs = next;
  }
  return costs.get((1 << 10) - 1)!;
}

test("global fallback uses the fewest off-role players and is deterministic with original preferences intact", () => {
  const players = neutralPlayers();
  players[0] = { ...players[0]!, eligiblePositions: [{ position: "MID", preference: "MAIN" }] };
  const original = JSON.stringify(players);
  assert.equal(minimumOffRoles(players), 1);
  const baseline = calculateTeamBalanceCandidates(players);
  const chosen = baseline.candidates[0]!;
  assert.equal(chosen.score.fairness?.constraintRelaxation?.roleDeviationCount, minimumOffRoles(players));
  assert.equal(chosen.score.fairness?.constraintRelaxation?.bottomTierViolationCount, 0);
  assert.equal(chosen.assignments.filter((entry) => entry.preference === "AUTO").length, 1);
  assert.equal(baseline.search.feasibleLayoutCount, 126 * 120 * 120);
  assert.deepEqual(calculateTeamBalanceCandidates([...players].reverse()).candidates, baseline.candidates);
  assert.deepEqual(calculateTeamBalanceCandidates([...players.slice(3), ...players.slice(0, 3)]).candidates, baseline.candidates);
  const layout = chosen.assignments.map(({ playerId, team, position }) => ({ playerId, team, position }));
  assert.deepEqual(evaluateTeamBalanceLayout(players, layout, { allowConstraintRelaxation: true }).score, chosen.score);
  assert.equal(JSON.stringify(players), original);
});

test("strict feasible generation keeps registered assignments and the exact pre-fallback selection order", () => {
  const players = neutralPlayers();
  const generated = calculateTeamBalanceCandidates(players);
  assert.equal(generated.search.feasibleLayoutCount, 16, "no relaxed second pass is visited when strict layouts exist");
  const selected = generated.candidates[0]!;
  assert.equal(selected.score.fairness?.constraintRelaxation, undefined);
  assert.ok(selected.assignments.every((assignment) => players.find((player) => player.playerId === assignment.playerId)!.eligiblePositions.some((entry) => entry.position === assignment.position)));
  const oracle: { signature: string; key: (number | string)[] }[] = [];
  for (let mask = 0; mask < 16; mask += 1) {
    const layout = TEAM_BALANCE_POSITIONS.flatMap((position, index) => {
      const swap = index > 0 && Boolean(mask & (1 << (index - 1)));
      return [{ playerId: players[index + (swap ? 5 : 0)]!.playerId, team: "RED" as const, position },
        { playerId: players[index + (swap ? 0 : 5)]!.playerId, team: "BLUE" as const, position }];
    });
    const evaluated = evaluateTeamBalanceLayout(players, layout);
    const searchSide = (team: "RED" | "BLUE"): SearchTeam => {
      const assignments = TEAM_BALANCE_POSITIONS.map((position) => {
        const assignment = evaluated.assignments.find((entry) => entry.team === team && entry.position === position)!;
        return { ...assignment, roleType: assignment.preference, score: assignment.rating.effectiveScore,
          finalBaseScore: 46.4, currentTier: "골드1", peakTier: "골드1", mainPositions: [position], subPositions: [] };
      });
      return { assignments, subCount: 0, signature: assignments.map((entry) => entry.playerId).join(",") };
    };
    oracle.push({ signature: evaluated.signature, key: oracleKey(evaluated.score.fairness!, searchSide("RED"), searchSide("BLUE")) });
  }
  oracle.sort((a, b) => compareKeys(a.key, b.key));
  assert.equal(selected.signature, oracle[0]!.signature);
});

test("rule 1 cannot be traded for several lower rules or a better numeric gap", () => {
  const blue = searchTeam("BLUE", 0, [50, 50, 50, 50, 50]);
  blue.assignments[2]!.finalBaseScore = 99;
  const preferred = searchTeam("RED", 0, [54, 42, 54, 54, 54]);
  preferred.assignments[1]!.finalBaseScore = 100;
  const reordered = [preferred.assignments[1]!, preferred.assignments[0]!, ...preferred.assignments.slice(2)]
    .map((entry, index) => ({ ...entry, position: TEAM_BALANCE_POSITIONS[index]!, score: 50 }));
  const lowerRules = { assignments: reordered, subCount: 0, signature: reordered.map((entry) => entry.playerId).join(",") };
  const good = evaluateInhouseFairness([...preferred.assignments, ...blue.assignments]);
  const alternative = evaluateInhouseFairness([...lowerRules.assignments, ...blue.assignments]);
  assert.equal(good.qualityViolationCount, 0);
  assert.equal(alternative.qualityViolationCount, 0);
  assert.deepEqual(good.ruleViolations, [0, 1, 1, 0, 0, 1]);
  assert.deepEqual(alternative.ruleViolations, [1, 0, 0, 0, 0, 0]);
  assert.ok(good.directionalPenalty > alternative.directionalPenalty, "legacy weighted scoring prefers the wrong layout");
  assert.ok(good.totalGap > alternative.totalGap);
  assert.equal(selectInhouseJointLayouts([lowerRules, preferred], [blue]).pairs[0]!.red.signature, preferred.signature);
});

test("rule 2 wins over rules 3, 5 and 6 together after equal safety and role burden", () => {
  const blue = searchTeam("BLUE", 0, [50, 50, 50, 50, 50]);
  const preferred = searchTeam("RED", 0, [54, 42, 54, 54, 46]);
  const lowerRules = searchTeam("RED", 2, [46, 50, 50, 54, 54]);
  const good = evaluateInhouseFairness([...preferred.assignments, ...blue.assignments]);
  const alternative = evaluateInhouseFairness([...lowerRules.assignments, ...blue.assignments]);
  assert.deepEqual(good.ruleViolations, [0, 0, 1, 0, 1, 1]);
  assert.deepEqual(alternative.ruleViolations, [0, 1, 0, 0, 0, 0]);
  assert.equal(good.qualityViolationCount, 0);
  assert.equal(alternative.qualityViolationCount, 0);
  assert.ok(good.directionalPenalty > alternative.directionalPenalty);
  assert.equal(selectInhouseJointLayouts([lowerRules, preferred], [blue]).pairs[0]!.red.signature, preferred.signature);
});

test("rule 5 takes precedence over rule 6 even though the legacy weight of rule 6 was larger", () => {
  const blue = searchTeam("BLUE", 0, [50, 50, 50, 50, 50]);
  const preferred = searchTeam("RED", 0, [54, 46, 54, 50, 54]);
  const lowerRule = searchTeam("RED", 2, [54, 54, 46, 50, 54]);
  const good = evaluateInhouseFairness([...preferred.assignments, ...blue.assignments]);
  const alternative = evaluateInhouseFairness([...lowerRule.assignments, ...blue.assignments]);
  assert.deepEqual(good.ruleViolations, [0, 0, 0, 0, 0, 1]);
  assert.deepEqual(alternative.ruleViolations, [0, 0, 0, 0, 1, 0]);
  assert.equal(good.qualityViolationCount, 0);
  assert.equal(alternative.qualityViolationCount, 0);
  assert.ok(good.directionalPenalty > alternative.directionalPenalty);
  assert.equal(selectInhouseJointLayouts([lowerRule, preferred], [blue]).pairs[0]!.red.signature, preferred.signature);
});

test("rule 4 remains a hard exclusion and cannot be relaxed to satisfy higher numbered priorities", () => {
  const blue = searchTeam("BLUE", 0, [50, 50, 50, 50, 50]);
  const forbidden = searchTeam("RED", 0, [50, 50, 50, 50, 50]);
  forbidden.assignments[3]!.currentTier = "다이아4";
  const permitted = searchTeam("RED", 2, [54, 46, 54, 50, 54]);
  const selected = selectInhouseJointLayouts([forbidden, permitted], [blue]);
  assert.equal(selected.feasibleLayoutCount, 1);
  assert.equal(selected.pairs[0]!.red.signature, permitted.signature);
});

test("each earlier soft rule outranks all later soft rules while safety and AUTO burden remain first", () => {
  const common = { qualityViolationCount: 0, unknownTierCount: 0, autoCount: 0, autoImbalance: 0,
    maxLaneGap: 0, totalGap: 0, bottomGap: 0, largeLaneCount: 0 };
  const priorities = [0, 1, 2, 4, 5];
  for (const index of priorities.slice(0, -1)) {
    const earlier: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    const later: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
    later[index] = 1;
    for (const lower of priorities.filter((value) => value > index)) earlier[lower] = 1;
    assert.ok(compareInhousePriority({ ...common, ruleViolations: earlier }, { ...common, ruleViolations: later }) < 0);
  }
  const allRulesMet = { ...common, ruleViolations: [0, 0, 0, 0, 0, 0] as const };
  const firstRuleBroken = { ...common, ruleViolations: [1, 0, 0, 0, 0, 0] as const };
  assert.ok(compareInhousePriority({ ...allRulesMet, qualityViolationCount: 1 }, firstRuleBroken) > 0);
  assert.ok(compareInhousePriority({ ...allRulesMet, autoCount: 1, autoImbalance: 1 }, firstRuleBroken) > 0);
});
