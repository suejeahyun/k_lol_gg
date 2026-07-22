import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { recalculateSeasonStats } from "@/lib/stats/recalculate";

export type SeasonRankingPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participationCount: number;
  participation: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

export function getWinRate(wins: number, totalGames: number) {
  return totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;
}

const SEASON_STATS_VALIDATE_TTL_MS = 5 * 60 * 1000;

type SeasonStatsValidateCache = {
  seasonId: number;
  statCount: number;
  checkedAt: string;
};

type DistinctPlayerCountRow = {
  count: number;
};

function isSeasonStatsValidateCache(value: unknown, seasonId: number): value is SeasonStatsValidateCache {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<SeasonStatsValidateCache>;
  return data.seasonId === seasonId && typeof data.statCount === "number" && typeof data.checkedAt === "string";
}

async function saveSeasonStatsValidateCache(seasonId: number, statCount: number) {
  await prisma.appDataCache.upsert({
    where: { key: `season:stats:validated:${seasonId}` },
    update: {
      value: { seasonId, statCount, checkedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      version: 13,
    },
    create: {
      key: `season:stats:validated:${seasonId}`,
      value: { seasonId, statCount, checkedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      version: 13,
    },
  });
}

export async function ensureSeasonStats(seasonId: number) {
  const validationCache = await prisma.appDataCache.findUnique({
    where: { key: `season:stats:validated:${seasonId}` },
    select: { value: true, updatedAt: true },
  });

  if (
    validationCache &&
    Date.now() - validationCache.updatedAt.getTime() < SEASON_STATS_VALIDATE_TTL_MS &&
    isSeasonStatsValidateCache(validationCache.value, seasonId)
  ) {
    return;
  }

  const [statCount, gameCount, participantCount, statGamesAggregate, zeroParticipationCount, distinctPlayerCounts] = await Promise.all([
    prisma.playerSeasonStat.count({ where: { seasonId } }),
    prisma.matchGame.count({ where: { series: { seasonId } } }),
    prisma.matchParticipant.count({ where: { game: { series: { seasonId } } } }),
    prisma.playerSeasonStat.aggregate({
      where: { seasonId },
      _sum: { totalGames: true },
    }),
    prisma.playerSeasonStat.count({
      where: {
        seasonId,
        totalGames: { gt: 0 },
        participationCount: { lte: 0 },
      },
    }),
    prisma.$queryRaw<DistinctPlayerCountRow[]>`
      SELECT COUNT(DISTINCT participant."playerId")::int AS "count"
      FROM "MatchParticipant" AS participant
      INNER JOIN "MatchGame" AS game ON game."id" = participant."gameId"
      INNER JOIN "MatchSeries" AS series ON series."id" = game."seriesId"
      WHERE series."seasonId" = ${seasonId}
    `,
  ]);

  const statTotalGames = statGamesAggregate._sum.totalGames ?? 0;
  const expectedPlayerStatCount = distinctPlayerCounts[0]?.count ?? 0;
  const isInvalid =
    gameCount > 0 &&
    (statCount === 0 ||
      statCount !== expectedPlayerStatCount ||
      statTotalGames !== participantCount ||
      zeroParticipationCount > 0);

  if (isInvalid) {
    const result = await recalculateSeasonStats(seasonId);
    await saveSeasonStatsValidateCache(seasonId, result.playerStats);
    return;
  }

  await saveSeasonStatsValidateCache(seasonId, statCount);
}

export async function getSeasonRankingPlayers(seasonId: number): Promise<SeasonRankingPlayer[]> {
  await ensureSeasonStats(seasonId);

  const stats = await prisma.playerSeasonStat.findMany({
    where: {
      seasonId,
      totalGames: { gt: 0 },
      player: {
        isActive: true,
      },
    },
    include: {
      player: {
        select: { id: true, name: true, nickname: true, tag: true },
      },
    },
    orderBy: [{ wins: "desc" }, { totalGames: "desc" }, { mvpCount: "desc" }],
  });

  return stats.map((stat) => {
    const participationCount = stat.participationCount ?? 0;
    return {
      playerId: stat.playerId,
      name: stat.player.name,
      nickname: stat.player.nickname,
      tag: stat.player.tag,
      totalGames: stat.totalGames,
      participationCount,
      participation: participationCount,
      wins: stat.wins,
      losses: stat.losses,
      winRate: getWinRate(stat.wins, stat.totalGames),
      mvpCount: stat.mvpCount,
    };
  });
}

export const getCachedSeasonRankingPlayers = unstable_cache(
  async (seasonId: number) => getSeasonRankingPlayers(seasonId),
  ["season-ranking-players-v2-strict-participation-count"],
  {
    revalidate: 60,
    tags: ["rankings"],
  },
);

export async function getCurrentAndPreviousSeason() {
  const activeSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isActive: true, createdAt: true },
  });

  const currentSeason = activeSeason ?? await prisma.season.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isActive: true, createdAt: true },
  });
  const previousSeason = currentSeason
    ? await prisma.season.findFirst({
        where: { id: { not: currentSeason.id } },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, isActive: true, createdAt: true },
      })
    : null;

  return { currentSeason, previousSeason };
}
