import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanonicalSeasonRanking,
  buildSeasonStatisticsProjection,
  compareWinRateDescending,
  toPublicRankingRowDto,
  type PublishedMatchSource,
  type RankingCandidate,
} from "../src/modules/statistics";

const seasonId = "10000000-0000-4000-8000-000000000000";
const otherSeasonId = "20000000-0000-4000-8000-000000000000";
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const playerIds = Array.from(
  { length: 10 },
  (_, index) => `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
);

function match(input: Readonly<{
  id: string;
  status?: PublishedMatchSource["status"];
  sourceSeasonId?: string;
  winnerTeam?: "BLUE" | "RED";
  mvpPlayerId?: string;
  gameId?: string;
  championSuffix?: string;
}>): PublishedMatchSource {
  return {
    id: input.id,
    seasonId: input.sourceSeasonId ?? seasonId,
    status: input.status ?? "PUBLISHED",
    games: [{
      id: input.gameId ?? `${input.id}-game-1`,
      winnerTeam: input.winnerTeam ?? "BLUE",
      mvpPlayerId: input.mvpPlayerId ?? playerIds[0]!,
      participants: playerIds.map((playerId, index) => ({
        playerId,
        championKey: `champion-${index + 1}-${input.championSuffix ?? "a"}`,
        team: index < 5 ? "BLUE" as const : "RED" as const,
        position: positions[index % 5]!,
      })),
    }],
  };
}

test("season projection deterministically counts games, distinct series, stored MVP and dimensions", () => {
  const first = match({ id: "series-a", winnerTeam: "BLUE", mvpPlayerId: playerIds[0] });
  const second = match({
    id: "series-b",
    winnerTeam: "RED",
    mvpPlayerId: playerIds[5],
    gameId: "series-b-game-1",
    championSuffix: "b",
  });
  const voided = match({ id: "series-voided", status: "VOIDED" });
  const other = match({ id: "series-other", sourceSeasonId: otherSeasonId });

  const projection = buildSeasonStatisticsProjection({
    seasonId,
    generation: 4,
    matches: [voided, second, other, first],
  });
  const reversed = buildSeasonStatisticsProjection({
    seasonId,
    generation: 4,
    matches: [first, other, second, voided],
  });

  assert.deepEqual(projection, reversed, "source order cannot change projection output");
  assert.equal(projection.sourceMatchCount, 2);
  assert.equal(projection.sourceGameCount, 2);
  assert.equal(projection.sourceParticipantCount, 20);
  assert.deepEqual(projection.playerStats[0], {
    seasonId,
    playerId: playerIds[0],
    generation: 4,
    totalGames: 2,
    participationCount: 2,
    wins: 1,
    losses: 1,
    mvpCount: 1,
  });
  assert.equal(projection.playerStats[5]?.mvpCount, 1);
  assert.equal(projection.championStats.length, 20);
  assert.equal(projection.positionStats.length, 10);
  assert.equal(projection.positionStats[0]?.games, 2);
  assert.equal(projection.positionStats[0]?.wins, 1);
  assert.equal(projection.positionStats[0]?.losses, 1);
});

test("participation counts a multi-game series once and S05 never derives a missing MVP", () => {
  const source = match({ id: "series-multi" });
  const multi: PublishedMatchSource = {
    ...source,
    games: [
      source.games[0]!,
      { ...source.games[0]!, id: "series-multi-game-2", winnerTeam: "RED", mvpPlayerId: playerIds[5]! },
    ],
  };
  const projection = buildSeasonStatisticsProjection({ seasonId, generation: 1, matches: [multi] });
  assert.equal(projection.playerStats[0]?.totalGames, 2);
  assert.equal(projection.playerStats[0]?.participationCount, 1);
  assert.throws(
    () => buildSeasonStatisticsProjection({
      seasonId,
      generation: 1,
      matches: [{ ...source, games: [{ ...source.games[0]!, mvpPlayerId: "not-in-roster" }] }],
    }),
    /MVP_NOT_IN_GAME_SOURCE/,
  );
});

function candidate(overrides: Partial<RankingCandidate> = {}): RankingCandidate {
  return {
    seasonId,
    playerId: "30000000-0000-4000-8000-000000000000",
    generation: 1,
    totalGames: 30,
    participationCount: 10,
    wins: 20,
    losses: 10,
    mvpCount: 2,
    playerStatus: "ACTIVE",
    nickname: "바람",
    nicknameNormalized: "바람",
    tagLine: "KR1",
    tagLineNormalized: "kr1",
    ...overrides,
  };
}

test("canonical ranking uses exact rational win rate, stable identity and sequential rank", () => {
  const exactHigher = candidate({
    playerId: "40000000-0000-4000-8000-000000000000",
    wins: 1_000_000_001,
    losses: 500_000_000,
    totalGames: 1_500_000_001,
    nickname: "가람",
    nicknameNormalized: "가람",
  });
  const exactLower = candidate({
    playerId: "50000000-0000-4000-8000-000000000000",
    wins: 2,
    losses: 1,
    totalGames: 3,
    nickname: "나래",
    nicknameNormalized: "나래",
  });
  assert.equal(compareWinRateDescending(exactHigher, exactLower), -1);

  const tieA = candidate({ playerId: "a0000000-0000-4000-8000-000000000000", nickname: "Z", nicknameNormalized: "z" });
  const tieB = candidate({ playerId: "b0000000-0000-4000-8000-000000000000", nickname: "A", nicknameNormalized: "a" });
  const inactive = candidate({ playerId: "c0000000-0000-4000-8000-000000000000", playerStatus: "INACTIVE", wins: 30, losses: 0 });
  const belowMinimum = candidate({ playerId: "d0000000-0000-4000-8000-000000000000", participationCount: 9, wins: 30, losses: 0 });
  const ranking = buildCanonicalSeasonRanking([tieB, inactive, belowMinimum, tieA]);

  assert.deepEqual(ranking.map((row) => [row.rank, row.playerId]), [
    [1, tieA.playerId],
    [2, tieB.playerId],
  ]);
});

test("public ranking DTO is an exact allowlist", () => {
  const row = buildCanonicalSeasonRanking([
    candidate({
      memberName: "비공개 회원명",
      userAccountId: "private-account",
      discordId: "private-discord",
      balanceOverrideReason: "private-reason",
    } as Partial<RankingCandidate> & Record<string, unknown>),
  ])[0]!;
  const dto = toPublicRankingRowDto(row);
  assert.deepEqual(Object.keys(dto).sort(), [
    "displayName",
    "losses",
    "mvpCount",
    "participationCount",
    "playerId",
    "rank",
    "riotId",
    "totalGames",
    "winRate",
    "wins",
  ]);
  assert.equal(JSON.stringify(dto).includes("비공개"), false);
  assert.equal(dto.displayName, "바람");
});
