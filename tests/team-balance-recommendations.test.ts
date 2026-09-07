import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTeamBalanceRecommendation,
  type BuildTeamBalanceRecommendationInput,
  type TeamRecommendationAssignment,
  type TeamRecommendationChampionStat,
} from "../src/modules/team-tools/domain/team-recommendations";
import { TEAM_BALANCE_POSITIONS } from "../src/modules/team-tools/domain/team-balance";

const assignments: TeamRecommendationAssignment[] = ["BLUE", "RED"].flatMap((team) =>
  TEAM_BALANCE_POSITIONS.map((position, index) => ({
    playerId: `${team.toLowerCase()}-${index}`,
    displayName: `${team} ${position}`,
    team: team as "BLUE" | "RED",
    position,
  })),
);

const stats: TeamRecommendationChampionStat[] = [
  { playerId: "red-0", championKey: "ahri", championName: "아리", games: 10, wins: 7, losses: 3, mvpCount: 2 },
  { playerId: "red-0", championKey: "lux", championName: "럭스", games: 4, wins: 4, losses: 0, mvpCount: 0 },
  { playerId: "blue-0", championKey: "jinx", championName: "징크스", games: 12, wins: 8, losses: 4, mvpCount: 3 },
  { playerId: "blue-1", championKey: "jinx", championName: "징크스", games: 2, wins: 2, losses: 0, mvpCount: 0 },
  { playerId: "blue-2", championKey: "sona", championName: "소나", games: 1, wins: 0, losses: 1, mvpCount: 0 },
];

const base: BuildTeamBalanceRecommendationInput = {
  draft: { id: "draft", title: "저장 팀", status: "SAVED", revision: 3 },
  projection: { seasonId: "season", seasonName: "시즌", generation: 7, calculatedAt: "2026-09-07T00:00:00.000Z" },
  assignments,
  championStats: stats,
  team: "RED",
};

test("team recommendations are deterministic, position ordered, and ban champions are unique", () => {
  const first = buildTeamBalanceRecommendation(base);
  const second = buildTeamBalanceRecommendation({ ...base, assignments: [...assignments].reverse(), championStats: [...stats].reverse() });
  assert.deepEqual(second, first);
  assert.equal(first.state, "READY");
  assert.deepEqual(first.picks.map((pick) => pick.position), TEAM_BALANCE_POSITIONS);
  assert.deepEqual(first.picks[0]?.champions.map((champion) => champion.championKey), ["ahri", "lux"]);
  assert.equal(new Set(first.bans.map((ban) => ban.championKey)).size, first.bans.length);
  assert.equal(first.bans.find((ban) => ban.championKey === "jinx")?.targetPlayerId, "blue-0");
});

test("team recommendations keep selected lineup for an unavailable projection", () => {
  const result = buildTeamBalanceRecommendation({ ...base, projection: null, championStats: [] });
  assert.equal(result.state, "NO_PROJECTION");
  assert.equal(result.picks.length, 5);
  assert.equal(result.bans.length, 0);
});

test("team recommendations do not infer an unselected candidate", () => {
  const result = buildTeamBalanceRecommendation({ ...base, assignments: null, championStats: [] });
  assert.equal(result.state, "NO_SELECTION");
  assert.equal(result.picks.length, 0);
});
