import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTeamBalanceCandidates,
  DEFAULT_TEAM_BALANCE_CONFIDENCE,
  DEFAULT_TEAM_BALANCE_SCORE,
  evaluateTeamBalanceLayout,
  formatTeamBalanceShareText,
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

test("the V1 global recommendation is one lossless 5:5 layout with every position exactly once", () => {
  const players = pairedPlayers();
  const result = calculateTeamBalanceCandidates(players);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.search.symmetryAnchorPlayerId, "player-00");
  assert.equal(result.search.teamCombinationCount, 126);
  assert.equal(result.search.feasibleLayoutCount, 126);

  for (const candidate of result.candidates) {
    assert.equal(candidate.assignments.length, 10);
    assert.equal(new Set(candidate.assignments.map((entry) => entry.playerId)).size, 10);
    for (const team of TEAM_BALANCE_TEAMS) {
      const assignments = candidate.assignments.filter((entry) => entry.team === team);
      assert.equal(assignments.length, 5);
      assert.deepEqual(assignments.map((entry) => entry.position), TEAM_BALANCE_POSITIONS);
    }
    assert.equal(candidate.assignments.find((entry) => entry.playerId === "player-00")?.team, "RED");
  }
});

test("V1 global recommendation is deterministic regardless of request order", () => {
  const players = pairedPlayers();
  const forward = calculateTeamBalanceCandidates(players);
  const reverse = calculateTeamBalanceCandidates([...players].reverse());

  assert.equal(forward.candidates.length, 1);
  assert.deepEqual(reverse.candidates, forward.candidates);
});

test("mixed legacy and new player ids keep a total order across forward, reverse and rotate", () => {
  const legacyIds = [null, 4, 1, null, 5, 2, null, 6, 3, null] as const;
  const players = pairedPlayers().map((player, index) => ({
    ...player,
    rating: {
      ...player.rating!,
      v1: {
        legacyPlayerId: legacyIds[index]!,
        currentTier: null,
        peakTier: null,
        season: null,
        internalGames: 0,
        internalPositionGames: {},
        recentSolo: null,
        balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0, positions: {} },
        missingSources: ["RECENT_SOLO", "BALANCE_OVERRIDE"] as const,
      },
    },
  }));
  const forward = calculateTeamBalanceCandidates(players);
  const reverse = calculateTeamBalanceCandidates([...players].reverse());
  const rotate = calculateTeamBalanceCandidates([...players.slice(3), ...players.slice(0, 3)]);

  assert.equal(forward.search.symmetryAnchorPlayerId, "player-02");
  assert.deepEqual(reverse.candidates, forward.candidates);
  assert.deepEqual(rotate.candidates, forward.candidates);
});

test("V1 search evaluates 126 anchored team splits and each team's best permutation", () => {
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
  assert.equal(result.search.feasibleLayoutCount, 126);
  assert.equal(result.candidates.length, 1);
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

test("positions omitted from the request remain legal V1 AUTO assignments", () => {
  const topOnly = pairedPlayers(false).map((player) => ({
    ...player,
    eligiblePositions: [{ position: "TOP" as TeamBalancePosition, preference: "AUTO" as const }],
  }));
  const result = calculateTeamBalanceCandidates(topOnly);
  assert.equal(result.candidates[0]?.assignments.length, 10);
  assert.ok(result.candidates[0]?.assignments.every((entry) => entry.preference === "AUTO"));
});

test("[V1 blueblack golden] score uses tier, inhouse, position experience and the data-missing path", () => {
  const players = pairedPlayers().map((player, index) => index === 0 ? {
    ...player,
    rating: {
      overall: 50,
      confidence: 1,
      sampleSize: 20,
      positions: { TOP: { score: 50, confidence: 1, sampleSize: 10 } },
      v1: {
        legacyPlayerId: 1,
        currentTier: "골드1",
        peakTier: "다이아2",
        season: { totalGames: 20, wins: 10, mvpCount: 2 },
        internalGames: 20,
        internalPositionGames: { TOP: 10 },
        recentSolo: null,
        balanceOverrideScore: 0,
        mmr: { overall: 50, confidence: 0, positions: { TOP: 50 } },
        missingSources: ["RECENT_SOLO", "BALANCE_OVERRIDE"] as const,
      },
    },
  } : player);
  const evaluated = evaluateTeamBalanceLayout(players, exhaustivePairedLayouts(players)[0]!);
  const player = evaluated.assignments.find((entry) => entry.playerId === "player-00")!;

  assert.equal(player.rating.source, "V1");
  assert.equal(player.rating.effectiveScore, 66.7);
  assert.equal(evaluated.score.v1?.formulaVersion, "V1_BLUEBLACK_AI_GLOBAL_2026_09_11");
  assert.deepEqual(evaluated.score.v1?.missingSources, ["RECENT_SOLO", "BALANCE_OVERRIDE"]);
});

test("share text keeps the V1 line order and excludes draft ids, account ids and links", () => {
  const candidate = calculateTeamBalanceCandidates(pairedPlayers(), 1).candidates[0]!;
  const text = formatTeamBalanceShareText(
    { ...candidate, source: "AUTO" },
    pairedPlayers().map((player, ordinal) => ({ playerId: player.playerId, displayName: ordinal === 0 ? "닉네임\n0" : `닉네임${ordinal}` })),
  );

  assert.match(text, /^BLUE .+\nRED .+\n밸런스 판단: AI 전체탐색 최고안 \/ RED \d+\.\d% vs BLUE \d+\.\d%$/u);
  assert.doesNotMatch(text, /https?:|draft|account|player-/u);
  assert.match(text, /닉네임 0/u);
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
