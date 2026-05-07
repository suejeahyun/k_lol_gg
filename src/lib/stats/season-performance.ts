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

export async function ensureSeasonStats(seasonId: number) {
  const [statCount, gameCount] = await Promise.all([
    prisma.playerSeasonStat.count({ where: { seasonId } }),
    prisma.matchGame.count({ where: { series: { seasonId } } }),
  ]);

  if (statCount === 0 && gameCount > 0) {
    await recalculateSeasonStats(seasonId);
  }
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
    const participationCount = stat.participationCount || stat.totalGames;
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

export async function getCurrentAndPreviousSeason() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, isActive: true, createdAt: true },
  });

  const currentSeason = seasons.find((season) => season.isActive) ?? seasons[0] ?? null;
  const previousSeason = currentSeason
    ? seasons.find((season) => season.id !== currentSeason.id) ?? null
    : null;

  return { currentSeason, previousSeason };
}
