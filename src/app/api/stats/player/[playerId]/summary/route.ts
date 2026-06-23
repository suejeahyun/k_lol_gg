export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getGameMvpParticipant } from "@/lib/mvp";
import { ensureSeasonStats, getWinRate } from "@/lib/stats/season-performance";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (Number.isNaN(id)) {
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

    const records = await prisma.matchParticipant.findMany({
      where: {
        playerId: id,
        ...(currentSeason
          ? {
              game: {
                series: {
                  seasonId: currentSeason.id,
                },
              },
            }
          : { id: -1 }),
      },
      select: {
        kills: true,
        deaths: true,
        assists: true,
        team: true,
        championId: true,
        game: {
          select: {
            winnerTeam: true,
            mvpPlayerId: true,
            participants: {
              select: {
                playerId: true,
                kills: true,
                deaths: true,
                assists: true,
                team: true,
              },
            },
          },
        },
      },
    });

    const championStatsRaw = await prisma.matchParticipant.groupBy({
      by: ["championId"],
      where: {
        playerId: id,
        ...(currentSeason
          ? {
              game: {
                series: {
                  seasonId: currentSeason.id,
                },
              },
            }
          : { id: -1 }),
      },
      _count: {
        championId: true,
      },
      _sum: {
        kills: true,
        deaths: true,
        assists: true,
      },
      orderBy: {
        _count: {
          championId: "desc",
        },
      },
      take: 3,
    });

    const championIds = championStatsRaw.map(
      (item: (typeof championStatsRaw)[number]) => item.championId
    );

    const champions = championIds.length
      ? await prisma.champion.findMany({
          where: {
            id: {
              in: championIds,
            },
          },
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        })
      : [];

    type ChampionType = (typeof champions)[number];

    const championMap = new Map<number, ChampionType>(
      champions.map((champion: ChampionType) => [champion.id, champion])
    );

    const totalGames = seasonStat?.totalGames ?? records.length;

    const wins = seasonStat?.wins ?? records.filter(
      (record: (typeof records)[number]) =>
        record.team === record.game.winnerTeam
    ).length;

    const losses = seasonStat?.losses ?? totalGames - wins;

    const winRate = getWinRate(wins, totalGames);

    const getMvpPlayerId = (record: (typeof records)[number]) => {
      if (record.game.mvpPlayerId) return record.game.mvpPlayerId;

      const mvp = getGameMvpParticipant(
        record.game.participants,
        record.game.winnerTeam,
      );

      return mvp?.playerId ?? null;
    };

    const mvpCount = seasonStat?.mvpCount ?? records.filter((record) => {
      return getMvpPlayerId(record) === id;
    }).length;


    const mostChampions = championStatsRaw.map(
      (item: (typeof championStatsRaw)[number]) => {
        const champion = championMap.get(item.championId);
        const games = item._count.championId;
        const mvpCount = records.filter((record) => {
          if (record.championId !== item.championId) return false;

          return getMvpPlayerId(record) === id;
        }).length;

        return {
          championId: item.championId,
          championName: champion?.name ?? "Unknown",
          championImageUrl: champion?.imageUrl ?? "",
          games,
          mvpCount,
        };
      }
    );

    return NextResponse.json({
      player,
      summary: {
        totalGames,
        wins,
        losses,
        winRate,
        mvpCount,
      },
      mostChampions,
    });
  } catch (error) {
    logServerError("[PLAYER_SUMMARY_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch player summary" },
      { status: 500 }
    );
  }
}
