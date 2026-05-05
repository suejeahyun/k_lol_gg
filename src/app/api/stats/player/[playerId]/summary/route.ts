import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getGameMvpParticipant } from "@/lib/mvp";

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

    const records = await prisma.matchParticipant.findMany({
      where: {
        playerId: id,
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

    const totalGames = records.length;

    const wins = records.filter(
      (record: (typeof records)[number]) =>
        record.team === record.game.winnerTeam
    ).length;

    const losses = totalGames - wins;

    const winRate =
      totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

    const mvpCount = records.filter((record) => {
      const mvp = getGameMvpParticipant(
        record.game.participants,
        record.game.winnerTeam,
      );

      return mvp?.playerId === id;
    }).length;


    const mostChampions = championStatsRaw.map(
      (item: (typeof championStatsRaw)[number]) => {
        const champion = championMap.get(item.championId);
        const games = item._count.championId;
        const mvpCount = records.filter((record) => {
          if (record.championId !== item.championId) return false;

          const mvp = getGameMvpParticipant(
            record.game.participants,
            record.game.winnerTeam,
          );

          return mvp?.playerId === id;
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
    console.error("[PLAYER_SUMMARY_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch player summary" },
      { status: 500 }
    );
  }
}