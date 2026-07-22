import type { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings } from "@/lib/site/settings";

const APP_HOME_SUMMARY_KEY = "app:home-summary:v13";
const APP_HOME_SUMMARY_TTL_MS = 60 * 1000;

export type AppHomeSummary = {
  activeRecruitCount: number;
  matchCount: number;
  playerCount: number;
  updatedAt: string;
};

function isAppHomeSummary(value: unknown): value is AppHomeSummary {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppHomeSummary>;
  return (
    typeof data.activeRecruitCount === "number" &&
    typeof data.matchCount === "number" &&
    typeof data.playerCount === "number" &&
    typeof data.updatedAt === "string"
  );
}

export async function refreshAppHomeSummary(): Promise<AppHomeSummary> {
  const [activeRecruitCount, matchCount, playerCount] = await Promise.all([
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    prisma.player.count({ where: { isActive: true } }).catch(() => 0),
  ]);

  const summary = {
    activeRecruitCount,
    matchCount,
    playerCount,
    updatedAt: new Date().toISOString(),
  };

  await prisma.appDataCache.upsert({
    where: { key: APP_HOME_SUMMARY_KEY },
    update: { value: summary as Prisma.InputJsonValue, version: 13 },
    create: { key: APP_HOME_SUMMARY_KEY, value: summary as Prisma.InputJsonValue, version: 13 },
  });

  return summary;
}

export async function getAppHomeSummary(): Promise<AppHomeSummary> {
  const cached = await prisma.appDataCache.findUnique({
    where: { key: APP_HOME_SUMMARY_KEY },
    select: { value: true, updatedAt: true },
  });

  if (
    cached &&
    Date.now() - cached.updatedAt.getTime() < APP_HOME_SUMMARY_TTL_MS &&
    isAppHomeSummary(cached.value)
  ) {
    return cached.value;
  }

  return refreshAppHomeSummary();
}

async function loadAppHomePublicData() {
  const [summary, season, siteSettings] = await Promise.all([
    getAppHomeSummary(),
    prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
      select: { id: true, name: true },
    }),
    getSiteSettings(),
  ]);

  const [
    recentRecruits,
    recentMatches,
    topStats,
    recentMvp,
    recentEvents,
    recentDestructions,
  ] = await Promise.all([
    prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      take: 2,
      select: {
        id: true,
        recruitNo: true,
        title: true,
        type: true,
        startTimeText: true,
        note: true,
        tierText: true,
        maxMembers: true,
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
          take: 6,
          select: { name: true },
        },
      },
    }),
    prisma.matchSeries.findMany({
      orderBy: [{ matchDate: "desc" }, { id: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        matchDate: true,
        season: { select: { name: true } },
        games: {
          orderBy: { gameNumber: "asc" },
          select: { winnerTeam: true },
        },
      },
    }),
    season
      ? prisma.playerSeasonStat.findMany({
          where: { seasonId: season.id, participationCount: { gte: 1 } },
          orderBy: [{ wins: "desc" }, { participationCount: "desc" }, { mvpCount: "desc" }],
          take: 3,
          select: {
            id: true,
            wins: true,
            player: {
              select: { id: true, name: true, nickname: true, tag: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.matchGame.findFirst({
      where: { mvpPlayerId: { not: null } },
      orderBy: [
        { series: { matchDate: "desc" } },
        { seriesId: "desc" },
        { gameNumber: "desc" },
      ],
      select: {
        seriesId: true,
        mvpPlayerId: true,
        series: { select: { title: true } },
        participants: {
          select: {
            playerId: true,
            kills: true,
            deaths: true,
            assists: true,
            player: { select: { name: true } },
            champion: { select: { name: true } },
          },
        },
      },
    }),
    prisma.eventMatch.findMany({
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      take: 2,
      select: {
        id: true,
        title: true,
        status: true,
        eventDate: true,
        _count: { select: { participants: true, teams: true, matches: true } },
      },
    }),
    prisma.destructionTournament.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 2,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        _count: { select: { participants: true, teams: true, matches: true } },
      },
    }),
  ]);

  return {
    summary,
    season,
    siteSettings,
    recentRecruits,
    recentMatches: recentMatches.map((match) => ({
      ...match,
      matchDate: match.matchDate.toISOString(),
    })),
    topStats,
    recentMvp,
    recentEvents: recentEvents.map((event) => ({
      ...event,
      eventDate: event.eventDate.toISOString(),
    })),
    recentDestructions: recentDestructions.map((tournament) => ({
      ...tournament,
      startDate: tournament.startDate?.toISOString() ?? null,
    })),
  };
}

export const getCachedAppHomePublicData = unstable_cache(
  loadAppHomePublicData,
  ["app-home-public-data-v2"],
  { revalidate: 60, tags: ["app-home", "home-public", "stats-top"] },
);
