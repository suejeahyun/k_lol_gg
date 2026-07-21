import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings } from "@/lib/site/settings";

function getKoreaDayRange(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");

  return {
    start: new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0, 0)),
  };
}

async function loadHomePublicData() {
  const [winnerImages, recentMatches, latestDestruction, latestMvpSeries, siteSettings] =
    await Promise.all([
      prisma.galleryImage.findMany({
        where: { showOnHome: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
        },
      }),
      prisma.matchSeries.findMany({
        orderBy: { matchDate: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          matchDate: true,
          games: {
            orderBy: { gameNumber: "asc" },
            select: { winnerTeam: true },
          },
        },
      }),
      prisma.destructionTournament.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          title: true,
          status: true,
          _count: {
            select: { participants: true, teams: true },
          },
        },
      }),
      prisma.matchSeries.findFirst({
        where: { games: { some: { participants: { some: {} } } } },
        orderBy: { matchDate: "desc" },
        select: { matchDate: true },
      }),
      getSiteSettings(),
    ]);

  const latestMvpDateRange = latestMvpSeries
    ? getKoreaDayRange(latestMvpSeries.matchDate)
    : null;
  const latestMvpMatches = latestMvpDateRange
    ? await prisma.matchSeries.findMany({
        where: {
          matchDate: {
            gte: latestMvpDateRange.start,
            lt: latestMvpDateRange.end,
          },
          games: { some: { participants: { some: {} } } },
        },
        orderBy: [{ matchDate: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          matchDate: true,
          games: {
            orderBy: { gameNumber: "asc" },
            select: {
              id: true,
              gameNumber: true,
              winnerTeam: true,
              mvpPlayerId: true,
              mvpScore: true,
              participants: {
                select: {
                  kills: true,
                  deaths: true,
                  assists: true,
                  team: true,
                  player: {
                    select: {
                      id: true,
                      name: true,
                      nickname: true,
                      tag: true,
                    },
                  },
                  champion: {
                    select: { name: true, imageUrl: true },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  return {
    winnerImages,
    recentMatches: recentMatches.map((match) => ({
      ...match,
      matchDate: match.matchDate.toISOString(),
    })),
    latestDestruction,
    latestMvpSeries: latestMvpSeries
      ? { matchDate: latestMvpSeries.matchDate.toISOString() }
      : null,
    latestMvpMatches: latestMvpMatches.map((match) => ({
      ...match,
      matchDate: match.matchDate.toISOString(),
    })),
    siteSettings,
  };
}

export const getCachedHomePublicData = unstable_cache(
  loadHomePublicData,
  ["home-public-data-v2"],
  { revalidate: 60, tags: ["home-public"] },
);

export const getCachedHomeSeasonSummary = unstable_cache(
  async (seasonId: number) => {
    const [matchCount, gameCount, participants] = await Promise.all([
      prisma.matchSeries.count({ where: { seasonId } }),
      prisma.matchGame.count({ where: { series: { seasonId } } }),
      prisma.matchParticipant.findMany({
        where: { game: { series: { seasonId } } },
        distinct: ["playerId"],
        select: { playerId: true },
      }),
    ]);

    return { matchCount, gameCount, participantCount: participants.length };
  },
  ["home-season-summary-v1"],
  { revalidate: 60, tags: ["home-public", "stats-top"] },
);

export const getCachedHomePlayerTiers = unstable_cache(
  async (playerIds: number[]) => {
    if (playerIds.length === 0) return [];
    return prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, currentTier: true, peakTier: true },
    });
  },
  ["home-player-tiers-v1"],
  { revalidate: 60, tags: ["home-public", "stats-top"] },
);
