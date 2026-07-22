export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { ensureSeasonStats, getWinRate } from "@/lib/stats/season-performance";
import { logServerError } from "@/lib/server/safe-log";
import { PUBLIC_SHORT_CACHE_HEADER } from "@/lib/http/cache";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "Invalid playerId" },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "Player not found" },
        { status: 404 }
      );
    }

    const currentSeason = await prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
      select: { id: true },
    });

    if (currentSeason) {
      await ensureSeasonStats(currentSeason.id);
    }

    const seasonStat = currentSeason
      ? await prisma.playerSeasonStat.findFirst({
          where: { playerId: id, seasonId: currentSeason.id },
          select: {
            totalGames: true,
            wins: true,
            losses: true,
            mvpCount: true,
          },
        })
      : null;

    const championStats = currentSeason
      ? await prisma.playerChampionStat.findMany({
          where: { playerId: id, seasonId: currentSeason.id },
          orderBy: [{ games: "desc" }, { wins: "desc" }, { mvpCount: "desc" }],
          take: 3,
          select: {
            championId: true,
            games: true,
            mvpCount: true,
            champion: {
              select: { name: true, imageUrl: true },
            },
          },
        })
      : [];

    const totalGames = seasonStat?.totalGames ?? 0;
    const wins = seasonStat?.wins ?? 0;

    const losses = seasonStat?.losses ?? totalGames - wins;

    const winRate = getWinRate(wins, totalGames);

    const mvpCount = seasonStat?.mvpCount ?? 0;

    const mostChampions = championStats.map((item) => ({
      championId: item.championId,
      championName: item.champion.name,
      championImageUrl: item.champion.imageUrl,
      games: item.games,
      mvpCount: item.mvpCount,
    }));

    return NextResponse.json(
      {
        player,
        summary: { totalGames, wins, losses, winRate, mvpCount },
        mostChampions,
      },
      { headers: { "Cache-Control": PUBLIC_SHORT_CACHE_HEADER } },
    );
  } catch (error) {
    logServerError("[PLAYER_SUMMARY_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch player summary" },
      { status: 500 }
    );
  }
}
