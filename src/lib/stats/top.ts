import { unstable_cache } from "next/cache";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const MIN_TOP3_PARTICIPATIONS = 10;
function getWinRate(wins: number, totalGames: number) {
  return totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;
}

const STATS_TOP_CACHE_KEY = "stats:top:v13";
const STATS_TOP_CACHE_TTL_MS = 5 * 60 * 1000;

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

function isStatsTopData(value: unknown): value is StatsTopData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<StatsTopData>;
  return Array.isArray(data.currentPlayers) && Array.isArray(data.previousPlayers);
}

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
  const eligiblePlayers = players.filter((player) => player.participationCount >= MIN_TOP3_PARTICIPATIONS);

  const addTop3 = (
    sorter: (a: StatsTopPlayerDto, b: StatsTopPlayerDto) => number,
    filter?: (player: StatsTopPlayerDto) => boolean,
  ) => {
    eligiblePlayers
      .filter(filter ?? (() => true))
      .sort(sorter)
      .slice(0, 3)
      .forEach((player) => {
        topPlayerMap.set(player.playerId, player);
      });
  };

  addTop3(sortByWinRate);
  addTop3(sortByParticipation);
  addTop3(sortByMvp, (player) => player.mvpCount > 0);

  return Array.from(topPlayerMap.values());
}

async function getCurrentAndPreviousSeasonForTop(db: DbClient = prisma) {
  const seasons = await db.season.findMany({
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
  const previousSeason = currentSeason ? seasons.find((season) => season.id !== currentSeason.id) ?? null : null;

  return { currentSeason, previousSeason };
}

export async function getSeasonTopPlayers(seasonId: number, db: DbClient = prisma): Promise<StatsTopPlayerDto[]> {
  const stats = await db.playerSeasonStat.findMany({
    where: {
      seasonId,
      totalGames: { gt: 0 },
      participationCount: { gte: MIN_TOP3_PARTICIPATIONS },
      player: { isActive: true },
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

  return mergeTopPlayers(players);
}

export async function buildStatsTopData(db: DbClient = prisma): Promise<StatsTopData> {
  const { currentSeason, previousSeason } = await getCurrentAndPreviousSeasonForTop(db);

  if (!currentSeason) {
    return {
      currentSeason: null,
      previousSeason: null,
      currentPlayers: [],
      previousPlayers: [],
    };
  }

  const [currentPlayers, previousPlayers] = await Promise.all([
    getSeasonTopPlayers(currentSeason.id, db),
    previousSeason ? getSeasonTopPlayers(previousSeason.id, db) : Promise.resolve([]),
  ]);

  return {
    currentSeason: toSeasonDto(currentSeason),
    previousSeason: toSeasonDto(previousSeason),
    currentPlayers,
    previousPlayers,
  };
}

export async function refreshStatsTopDataCache(db: DbClient = prisma): Promise<StatsTopData> {
  const data = await buildStatsTopData(db);

  await (db as any).appDataCache.upsert({
    where: { key: STATS_TOP_CACHE_KEY },
    update: { value: data as unknown as Prisma.InputJsonValue, version: 13 },
    create: { key: STATS_TOP_CACHE_KEY, value: data as unknown as Prisma.InputJsonValue, version: 13 },
  });

  return data;
}

export async function getStatsTopData(): Promise<StatsTopData> {
  const cached = await (prisma as any).appDataCache.findUnique({
    where: { key: STATS_TOP_CACHE_KEY },
    select: { value: true, updatedAt: true },
  });

  if (
    cached &&
    Date.now() - cached.updatedAt.getTime() < STATS_TOP_CACHE_TTL_MS &&
    isStatsTopData(cached.value)
  ) {
    return cached.value;
  }

  return refreshStatsTopDataCache(prisma);
}

export const getCachedStatsTopData = unstable_cache(
  getStatsTopData,
  ["stats-top-data-v13-db-cache"],
  {
    revalidate: 60,
    tags: ["stats-top"],
  },
);
