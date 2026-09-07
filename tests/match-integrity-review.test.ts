import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMatchIntegrity } from "../src/modules/matches/domain/match-integrity-review";
import type { MatchGameInput } from "../src/modules/matches/domain/match";

const ids = Array.from({ length: 10 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const game: MatchGameInput = {
  gameNumber: 1,
  durationSeconds: 1_800,
  winnerTeam: "BLUE",
  participants: ids.map((playerId, index) => ({
    playerId,
    championKey: `champion-${index}`,
    team: index < 5 ? "BLUE" : "RED",
    position: positions[index % 5],
    kills: index < 5 ? 2 : 1,
    deaths: index < 5 ? 1 : 2,
    assists: 3,
  })),
};

test("deterministic match review passes a structurally consistent series", () => {
  const review = analyzeMatchIntegrity({ status: "PUBLISHED", gameCount: 1, blueWins: 1, redWins: 0, teamBalanceDraftId: ids[0], games: [game] });
  assert.equal(review.grade, "PASS");
  assert.equal(review.errorCount, 0);
  assert.equal(review.warningCount, 0);
});

test("deterministic match review blocks stale aggregates and duplicate roster entries", () => {
  const broken = { ...game, participants: game.participants.map((participant, index) => index === 9 ? { ...participant, playerId: ids[0] } : participant) };
  const review = analyzeMatchIntegrity({ status: "PUBLISHED", gameCount: 2, blueWins: 0, redWins: 2, teamBalanceDraftId: null, games: [broken] });
  assert.equal(review.grade, "BLOCK");
  assert.ok(review.errorCount >= 2);
});
