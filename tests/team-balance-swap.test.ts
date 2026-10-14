import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTeamBalanceLayout,
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_TEAMS,
  type TeamBalanceLayoutEntry,
  type TeamBalancePlayer,
} from "../src/modules/team-tools/domain/team-balance";

function masterRoster(otherPreference: "SUB" | "AUTO") {
  const layout: TeamBalanceLayoutEntry[] = TEAM_BALANCE_TEAMS.flatMap((team) =>
    TEAM_BALANCE_POSITIONS.map((position) => ({ playerId: `${team}-${position}`, team, position })));
  const players: TeamBalancePlayer[] = layout.map(({ playerId, position: main }) => ({
    playerId,
    eligiblePositions: TEAM_BALANCE_POSITIONS.map((position) => ({
      position, preference: position === main ? "MAIN" : otherPreference,
    })),
    rating: {
      overall: 50, confidence: 0, sampleSize: 0, positions: null,
      v1: {
        legacyPlayerId: null, currentTier: "MASTER", peakTier: "MASTER", season: null,
        internalGames: 0, internalPositionGames: {}, recentSolo: null,
        balanceOverrideScore: 0, mmr: { overall: 50, confidence: 0, positions: {} }, missingSources: [],
      },
    },
  }));
  return { players, layout };
}

function swap(layout: readonly TeamBalanceLayoutEntry[], first: string, second: string) {
  return layout.map((entry) => ({ ...entry,
    playerId: entry.playerId === first ? second : entry.playerId === second ? first : entry.playerId,
  }));
}

for (const [preference, blueAfter, legacyRedRate] of [["SUB", 358, 88.8], ["AUTO", 324, 98.3]] as const) {
  test(`same-team two-player ${preference} swap explains legacy percentage without changing the roster or ratings`, () => {
    const { players, layout } = masterRoster(preference);
    const beforeInput = JSON.stringify({ players, layout });
    const before = evaluateTeamBalanceLayout(players, layout);
    const exchanged = swap(layout, "BLUE-TOP", "BLUE-MID");
    const after = evaluateTeamBalanceLayout(players, exchanged);

    assert.equal(before.score.teamStrength.blueTotal, 394);
    assert.equal(before.score.teamStrength.redTotal, 394);
    assert.equal(before.score.v1?.predictedRedWinRate, 50);
    assert.equal(after.score.teamStrength.blueTotal, blueAfter);
    assert.equal(after.score.teamStrength.redTotal, 394);
    // Historical compatibility values are retained, but no longer presented as
    // measured win probabilities in the UI or copied result.
    assert.equal(after.score.v1?.predictedRedWinRate, legacyRedRate);
    const changed = after.assignments.filter((assignment) => assignment.rating.effectiveScore !==
      before.assignments.find((original) => original.playerId === assignment.playerId)!.rating.effectiveScore);
    assert.deepEqual(changed.map((entry) => entry.playerId).sort(), ["BLUE-MID", "BLUE-TOP"]);
    assert.equal(JSON.stringify({ players, layout }), beforeInput);
    assert.deepEqual(evaluateTeamBalanceLayout(players, swap(exchanged, "BLUE-TOP", "BLUE-MID")), before);
    const mirrored = evaluateTeamBalanceLayout(players, exchanged.map((entry) => ({
      ...entry, team: entry.team === "BLUE" ? "RED" : "BLUE",
    })));
    assert.equal(mirrored.score.teamStrength.redTotal, blueAfter);
    assert.equal(mirrored.score.teamStrength.blueTotal, 394);
    assert.equal(mirrored.score.v1?.predictedBlueWinRate, legacyRedRate);
  });
}

test("cross-team same-role exchange changes the signed team gap by twice the player score difference", () => {
  const { layout } = masterRoster("SUB");
  const players: TeamBalancePlayer[] = layout.map(({ playerId, position }) => ({
    playerId, eligiblePositions: [{ position, preference: "MAIN" }],
    rating: { overall: playerId === "BLUE-TOP" || playerId === "RED-MID" ? 70 : 50,
      confidence: 1, sampleSize: 20, positions: null },
  }));
  const before = evaluateTeamBalanceLayout(players, layout);
  const after = evaluateTeamBalanceLayout(players, swap(layout, "BLUE-TOP", "RED-TOP"));
  assert.equal(before.score.teamStrength.blueTotal, 270);
  assert.equal(before.score.teamStrength.redTotal, 270);
  assert.equal(after.score.teamStrength.blueTotal, 250);
  assert.equal(after.score.teamStrength.redTotal, 290);
  assert.equal(after.score.teamStrength.difference, 40);
  assert.equal(after.score.v1?.predictedRedWinRate, 90.9);
  assert.equal(after.score.preference.mainCount, 10);
});
