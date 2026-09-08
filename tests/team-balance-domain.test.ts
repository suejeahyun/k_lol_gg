import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTeamBalanceCandidates,
  DEFAULT_TEAM_BALANCE_CONFIDENCE,
  DEFAULT_TEAM_BALANCE_SCORE,
  evaluateTeamBalanceLayout,
  TEAM_BALANCE_PLAYER_COUNT,
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_PREFERENCES,
  TEAM_BALANCE_TEAMS,
  TeamBalanceDomainError,
  type TeamBalanceLayoutEntry,
  type TeamBalancePlayer,
  type TeamBalancePosition,
} from "../src/modules/team-tools";

function pairedPlayers(withRatings = true): TeamBalancePlayer[] {
  return Array.from({ length: TEAM_BALANCE_PLAYER_COUNT }, (_, index) => ({
    playerId: `player-${String(index).padStart(2, "0")}`,
    eligiblePositions: [
      { position: TEAM_BALANCE_POSITIONS[index % TEAM_BALANCE_POSITIONS.length]!, preference: "MAIN" },
    ],
    rating: withRatings
      ? {
          overall: 35 + index * 5,
          confidence: 1,
          sampleSize: 20 + index,
          positions: null,
        }
      : null,
  }));
}

function assertCode(code: TeamBalanceDomainError["code"]) {
  return (error: unknown) => error instanceof TeamBalanceDomainError && error.code === code;
}

function layoutSignature(layout: readonly TeamBalanceLayoutEntry[]) {
  return TEAM_BALANCE_TEAMS.map((team) =>
    TEAM_BALANCE_POSITIONS.map(
      (position) => layout.find((entry) => entry.team === team && entry.position === position)!.playerId,
    ).join(","),
  ).join("|");
}

function exhaustivePairedLayouts(players: readonly TeamBalancePlayer[]) {
  const pairs = TEAM_BALANCE_POSITIONS.map((position) =>
    players.filter((player) => player.eligiblePositions[0]!.position === position),
  );
  const layouts: TeamBalanceLayoutEntry[][] = [];

  // player-00 is the symmetry anchor and must remain BLUE. The other four
  // position pairs independently select one BLUE player: all 2^4 layouts.
  for (let mask = 0; mask < 1 << 4; mask += 1) {
    const layout: TeamBalanceLayoutEntry[] = [];
    for (let positionIndex = 0; positionIndex < TEAM_BALANCE_POSITIONS.length; positionIndex += 1) {
      const pair = pairs[positionIndex]!;
      const blueIndex = positionIndex === 0 ? 0 : (mask >> (positionIndex - 1)) & 1;
      layout.push(
        { playerId: pair[blueIndex]!.playerId, team: "BLUE", position: TEAM_BALANCE_POSITIONS[positionIndex]! },
        { playerId: pair[1 - blueIndex]!.playerId, team: "RED", position: TEAM_BALANCE_POSITIONS[positionIndex]! },
      );
    }
    layouts.push(layout);
  }
  return layouts;
}

function compareOracle(
  left: ReturnType<typeof evaluateTeamBalanceLayout>,
  right: ReturnType<typeof evaluateTeamBalanceLayout>,
) {
  return (
    left.score.totalPenalty - right.score.totalPenalty ||
    left.score.teamStrength.difference - right.score.teamStrength.difference ||
    left.score.positionDifferenceTotal - right.score.positionDifferenceTotal ||
    left.score.preference.rawPenalty - right.score.preference.rawPenalty ||
    left.score.uncertainty.rawPenalty - right.score.uncertainty.rawPenalty ||
    (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0)
  );
}

function comparePositionOracle(
  left: ReturnType<typeof evaluateTeamBalanceLayout>,
  right: ReturnType<typeof evaluateTeamBalanceLayout>,
) {
  return (
    left.score.positionDifferenceTotal - right.score.positionDifferenceTotal ||
    left.score.teamStrength.difference - right.score.teamStrength.difference ||
    left.score.preference.rawPenalty - right.score.preference.rawPenalty ||
    left.score.uncertainty.rawPenalty - right.score.uncertainty.rawPenalty ||
    left.score.totalPenalty - right.score.totalPenalty ||
    (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0)
  );
}

function comparePreferenceOracle(
  left: ReturnType<typeof evaluateTeamBalanceLayout>,
  right: ReturnType<typeof evaluateTeamBalanceLayout>,
) {
  return (
    left.score.preference.rawPenalty - right.score.preference.rawPenalty ||
    left.score.teamStrength.difference - right.score.teamStrength.difference ||
    left.score.positionDifferenceTotal - right.score.positionDifferenceTotal ||
    left.score.uncertainty.rawPenalty - right.score.uncertainty.rawPenalty ||
    left.score.totalPenalty - right.score.totalPenalty ||
    (left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0)
  );
}

test("team balance vocabulary and neutral provider defaults are explicit", () => {
  assert.deepEqual(TEAM_BALANCE_POSITIONS, ["TOP", "JGL", "MID", "ADC", "SUP"]);
  assert.deepEqual(TEAM_BALANCE_TEAMS, ["BLUE", "RED"]);
  assert.deepEqual(TEAM_BALANCE_PREFERENCES, ["MAIN", "SUB", "AUTO"]);
  assert.equal(DEFAULT_TEAM_BALANCE_SCORE, 50);
  assert.equal(DEFAULT_TEAM_BALANCE_CONFIDENCE, 0);

  const result = calculateTeamBalanceCandidates(pairedPlayers(false), 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.score.teamStrength.blueTotal, 250);
  assert.equal(candidate.score.teamStrength.redTotal, 250);
  assert.equal(candidate.score.positionDifferenceTotal, 0);
  assert.equal(candidate.score.uncertainty.averageConfidence, 0);
  assert.equal(candidate.score.uncertainty.noSampleCount, 10);
  assert.ok(candidate.assignments.every((entry) => entry.rating.source === "DEFAULT"));
});

test("input rejects oversized, duplicate, missing-position, and invalid-score cases", () => {
  const base = pairedPlayers();
  assert.throws(
    () => calculateTeamBalanceCandidates([...base, { ...base[0]!, playerId: "player-10" }]),
    assertCode("PARTICIPANT_COUNT"),
  );
  assert.throws(
    () => calculateTeamBalanceCandidates(base.map((player, index) => index === 9 ? { ...player, playerId: "player-00" } : player)),
    assertCode("DUPLICATE_PLAYER_ID"),
  );
  assert.throws(
    () => calculateTeamBalanceCandidates(base.map((player, index) => index === 4 ? { ...player, eligiblePositions: [] } : player)),
    assertCode("MISSING_ELIGIBLE_POSITION"),
  );
  assert.throws(
    () => calculateTeamBalanceCandidates(base.map((player, index) => index === 2 ? { ...player, rating: { ...player.rating!, overall: 101 } } : player)),
    assertCode("INVALID_SCORE"),
  );
  assert.throws(
    () => calculateTeamBalanceCandidates(base.map((player, index) => index === 2 ? { ...player, rating: { ...player.rating!, confidence: Number.NaN } } : player)),
    assertCode("INVALID_SCORE"),
  );
  assert.throws(
    () => calculateTeamBalanceCandidates(base.map((player, index) => index === 2 ? { ...player, rating: { ...player.rating!, sampleSize: -1 } } : player)),
    assertCode("INVALID_SCORE"),
  );
});

test("each candidate is a lossless 5:5 layout with every position exactly once", () => {
  const players = pairedPlayers();
  const result = calculateTeamBalanceCandidates(players);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.search.symmetryAnchorPlayerId, "player-00");
  assert.equal(result.search.teamCombinationCount, 126);
  assert.equal(result.search.feasibleLayoutCount, 16);

  for (const candidate of result.candidates) {
    assert.equal(candidate.assignments.length, 10);
    assert.equal(new Set(candidate.assignments.map((entry) => entry.playerId)).size, 10);
    for (const team of TEAM_BALANCE_TEAMS) {
      const assignments = candidate.assignments.filter((entry) => entry.team === team);
      assert.equal(assignments.length, 5);
      assert.deepEqual(assignments.map((entry) => entry.position), TEAM_BALANCE_POSITIONS);
    }
    assert.equal(candidate.assignments.find((entry) => entry.playerId === "player-00")?.team, "BLUE");
  }
});

test("three recommendations use distinct overall, position, and preference criteria", () => {
  const players = pairedPlayers();
  const evaluated = exhaustivePairedLayouts(players).map((layout) => evaluateTeamBalanceLayout(players, layout));
  const used = new Set<string>();
  const oracle = [compareOracle, comparePositionOracle, comparePreferenceOracle].map((compare) => {
    const candidate = [...evaluated].sort(compare).find((entry) => !used.has(entry.signature))!;
    used.add(candidate.signature);
    return candidate;
  });
  const calculated = calculateTeamBalanceCandidates([...players].reverse());

  assert.equal(new Set(calculated.candidates.map((candidate) => candidate.signature)).size, 3);
  assert.deepEqual(
    calculated.candidates.map((candidate) => candidate.signature),
    oracle.map((candidate) => candidate.signature),
  );
  assert.deepEqual(
    calculated.candidates.map((candidate) => candidate.score),
    oracle.map((candidate) => candidate.score),
  );
});

test("fully flexible ten-player search exhausts 1,814,400 layouts within the focused budget", () => {
  const flexible: TeamBalancePlayer[] = pairedPlayers().map((player, playerIndex) => ({
    ...player,
    eligiblePositions: TEAM_BALANCE_POSITIONS.map((position, positionIndex) => ({
      position,
      preference: positionIndex === playerIndex % TEAM_BALANCE_POSITIONS.length ? "MAIN" : "AUTO",
    })),
  }));
  const startedAt = performance.now();
  const result = calculateTeamBalanceCandidates(flexible);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.search.teamCombinationCount, 126);
  assert.equal(result.search.feasibleLayoutCount, 1_814_400);
  assert.equal(result.candidates.length, 3);
  assert.ok(elapsedMs < 5_000, `exhaustive search took ${Math.round(elapsedMs)}ms`);
});

test("automatic and manual paths return the exact same scoring-kernel breakdown", () => {
  const players = pairedPlayers();
  const automatic = calculateTeamBalanceCandidates(players, 1).candidates[0]!;
  const layout = automatic.assignments.map(({ playerId, team, position }) => ({ playerId, team, position }));
  const manual = evaluateTeamBalanceLayout(players, layout);

  assert.equal(manual.signature, automatic.signature);
  assert.deepEqual(manual.assignments, automatic.assignments);
  assert.deepEqual(manual.score, automatic.score);
});

test("position rating overrides overall and confidence shrinks unknown data toward 50", () => {
  const players = pairedPlayers().map((player, index) => index === 0
    ? {
        ...player,
        rating: {
          overall: 80,
          confidence: 0.5,
          sampleSize: 30,
          positions: { TOP: { score: 100, confidence: 1, sampleSize: 8 } },
        },
      }
    : player);
  const candidate = calculateTeamBalanceCandidates(players, 1).candidates[0]!;
  const player = candidate.assignments.find((entry) => entry.playerId === "player-00")!;

  assert.deepEqual(player.rating, {
    source: "POSITION",
    rawScore: 100,
    effectiveScore: 100,
    confidence: 1,
    sampleSize: 8,
  });
});

test("eligible positions may still have no feasible five-position lineup", () => {
  const impossible = pairedPlayers(false).map((player) => ({
    ...player,
    eligiblePositions: [{ position: "TOP" as TeamBalancePosition, preference: "AUTO" as const }],
  }));
  assert.throws(() => calculateTeamBalanceCandidates(impossible), assertCode("NO_FEASIBLE_LAYOUT"));
});

test("manual evaluation rejects duplicate players and incomplete team-position coverage", () => {
  const players = pairedPlayers();
  const layout = exhaustivePairedLayouts(players)[0]!;
  const duplicate = layout.map((entry, index) => index === 9 ? { ...entry, playerId: layout[0]!.playerId } : entry);
  const missingPosition = layout.map((entry, index) => index === 3 ? { ...entry, position: "TOP" as const } : entry);

  assert.throws(() => evaluateTeamBalanceLayout(players, duplicate), assertCode("INVALID_LAYOUT"));
  assert.throws(() => evaluateTeamBalanceLayout(players, missingPosition), assertCode("INVALID_LAYOUT"));
  assert.notEqual(layoutSignature(layout), "");
});
