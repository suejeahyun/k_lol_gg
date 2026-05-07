import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import { getWinRate } from "@/lib/stats/season-performance";

export type StatsTopSeasonDto = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
} | null;

export type StatsTopPlayerDto = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participation: number;
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

export type StatsTopData = {
  currentSeason: StatsTopSeasonDto;
  previousSeason: StatsTopSeasonDto;
  currentPlayers: StatsTopPlayerDto[];
  previousPlayers: StatsTopPlayerDto[];
};

type SeasonRow = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
};

function toSeasonDto(season: SeasonRow | null): StatsTopSeasonDto {
  if (!season) return null;

  return {
    id: season.id,
    name: season.name,
    isActive: season.isActive,
    createdAt: season.createdAt.toISOString(),
  };
}

function sortByWinRate(a: StatsTopPlayerDto, b: StatsTopPlayerDto) {
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
  return b.participation - a.participation;
}

function sortByParticipation(a: StatsTopPlayerDto, b: StatsTopPlayerDto) {
  if (b.participation !== a.participation) return b.participation - a.participation;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  return b.mvpCount - a.mvpCount;
}

function sortByMvp(a: StatsTopPlayerDto, b: StatsTopPlayerDto) {
  if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
  if (b.winRate !== a.winRate) return b.winRate - a.winRate;
  return b.participation - a.participation;
}

function mergeTopPlayers(players: StatsTopPlayerDto[]) {
  const topPlayerMap = new Map<number, StatsTopPlayerDto>();

  const addTop3 = (sorter: (a: StatsTopPlayerDto, b: StatsTopPlayerDto) => number) => {
    [...players]
      .sort(sorter)
      .slice(0, 3)
      .forEach((player) => {
        topPlayerMap.set(player.playerId, player);
      });
  };

  addTop3(sortByWinRate);
  addTop3(sortByParticipation);
  addTop3(sortByMvp);

  return Array.from(topPlayerMap.values());
}

async function getCurrentAndPreviousSeasonForTop() {
  const seasons = await prisma.season.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 2,
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });

  const currentSeason = seasons.find((season) => season.isActive) ?? seasons[0] ?? null;
  const previousSeason = currentSeason
    ? seasons.find((season) => season.id !== currentSeason.id) ?? null
    : null;

  return { currentSeason, previousSeason };
}

export async function getSeasonTopPlayers(seasonId: number): Promise<StatsTopPlayerDto[]> {
  const stats = await prisma.playerSeasonStat.findMany({
    where: {
      seasonId,
      totalGames: { gt: 0 },
    },
    select: {
      playerId: true,
      totalGames: true,
      participationCount: true,
      wins: true,
      losses: true,
      mvpCount: true,
      player: {
        select: {
          name: true,
          nickname: true,
          tag: true,
        },
      },
    },
  });

  const players = stats.map((stat) => {
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

  return mergeTopPlayers(players);
}

export async function getStatsTopData(): Promise<StatsTopData> {
  const { currentSeason, previousSeason } = await getCurrentAndPreviousSeasonForTop();

  if (!currentSeason) {
    return {
      currentSeason: null,
      previousSeason: null,
      currentPlayers: [],
      previousPlayers: [],
    };
  }

  const [currentPlayers, previousPlayers] = await Promise.all([
    getSeasonTopPlayers(currentSeason.id),
    previousSeason ? getSeasonTopPlayers(previousSeason.id) : Promise.resolve([]),
  ]);

  return {
    currentSeason: toSeasonDto(currentSeason),
    previousSeason: toSeasonDto(previousSeason),
    currentPlayers,
    previousPlayers,
  };
}

export const getCachedStatsTopData = unstable_cache(
  getStatsTopData,
  ["stats-top-data-v2"],
  {
    revalidate: 60,
    tags: ["stats-top"],
  },
);
