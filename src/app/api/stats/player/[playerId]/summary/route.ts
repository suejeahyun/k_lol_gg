import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

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

    const totalKills = records.reduce(
      (sum: number, record: (typeof records)[number]) => sum + record.kills,
      0
    );

    const totalDeaths = records.reduce(
      (sum: number, record: (typeof records)[number]) => sum + record.deaths,
      0
    );

    const totalAssists = records.reduce(
      (sum: number, record: (typeof records)[number]) => sum + record.assists,
      0
    );

    const winRate =
      totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

    const kda =
      totalDeaths === 0
        ? Number((totalKills + totalAssists).toFixed(2))
        : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));


    const mostChampions = championStatsRaw.map(
      (item: (typeof championStatsRaw)[number]) => {
        const champion = championMap.get(item.championId);
        const games = item._count.championId;
        const kills = item._sum.kills ?? 0;
        const deaths = item._sum.deaths ?? 0;
        const assists = item._sum.assists ?? 0;

        const championKda =
          deaths === 0
            ? Number((kills + assists).toFixed(2))
            : Number(((kills + assists) / deaths).toFixed(2));

        return {
          championId: item.championId,
          championName: champion?.name ?? "Unknown",
          championImageUrl: champion?.imageUrl ?? "",
          games,
          kda: championKda,
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
        kda,
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