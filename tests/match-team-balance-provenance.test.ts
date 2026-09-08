import assert from "node:assert/strict";
import test from "node:test";

import { validTeamBalanceSubmissionAssignments } from "../src/modules/matches/infrastructure/postgres-match-repository";

const playerIds = Array.from(
  { length: 10 },
  (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
);
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const assignments = playerIds.map((playerId, index) => ({
  playerId,
  team: index < 5 ? "BLUE" : "RED",
  position: positions[index % 5],
  preference: "MAIN",
  rating: { source: "DEFAULT", rawScore: 50 },
}));

test("selected team-balance provenance requires the exact ten-player two-team layout", () => {
  assert.equal(validTeamBalanceSubmissionAssignments(assignments, playerIds), true);
  assert.equal(validTeamBalanceSubmissionAssignments(assignments.slice(0, 9), playerIds), false);
  assert.equal(validTeamBalanceSubmissionAssignments(
    assignments.map((entry, index) => index === 1 ? { ...entry, playerId: playerIds[0] } : entry),
    playerIds,
  ), false);
  assert.equal(validTeamBalanceSubmissionAssignments(
    assignments.map((entry, index) => index === 6 ? { ...entry, position: "TOP" } : entry),
    playerIds,
  ), false);
  assert.equal(validTeamBalanceSubmissionAssignments(
    assignments.map((entry, index) => index === 0 ? { ...entry, team: "GREEN" } : entry),
    playerIds,
  ), false);
  assert.equal(validTeamBalanceSubmissionAssignments(
    assignments,
    [...playerIds.slice(0, 9), "99999999-0000-4000-8000-000000000000"],
  ), false);
});
