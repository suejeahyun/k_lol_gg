import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

const PAGE_SIZE = 10;

type RouteContext = {
  params: {
    playerId: string;
  };
};

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const id = Number(params.playerId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid playerId" },
        { status: 400 }
      );
    }

    const page = Math.max(
      1,
      Number(req.nextUrl.searchParams.get("page") ?? "1") || 1
    );

    const totalCount = await prisma.matchParticipant.count({
      where: {
        playerId: id,
      },
    });

    const records = await prisma.matchParticipant.findMany({
      where: {
        playerId: id,
      },
      orderBy: [
        {
          game: {
            series: {
              matchDate: "desc",
            },
          },
        },
        {
          game: {
            gameNumber: "desc",
          },
        },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        team: true,
        position: true,
        kills: true,
        deaths: true,
        assists: true,
        cs: true,
        gold: true,
        champion: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
        game: {
          select: {
            id: true,
            gameNumber: true,
            winnerTeam: true,
            durationMin: true,
            series: {
              select: {
                id: true,
                title: true,
                matchDate: true,
              },
            },
          },
        },
      },
    });

    const items = records.map((record) => ({
      id: record.id,
      matchId: record.game.series.id,
      matchTitle: record.game.series.title,
      matchDate: record.game.series.matchDate,
      gameId: record.game.id,
      gameNumber: record.game.gameNumber,
      durationMin: record.game.durationMin,
      team: record.team,
      position: record.position,
      result: record.team === record.game.winnerTeam ? "WIN" : "LOSE",
      kills: record.kills,
      deaths: record.deaths,
      assists: record.assists,
      cs: record.cs,
      gold: record.gold,
      champion: record.champion,
    }));

    return NextResponse.json({
      items,
      pagination: {
        currentPage: page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages: Math.ceil(totalCount / PAGE_SIZE),
      },
    });
  } catch (error) {
    console.error("[PLAYER_RECENT_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch recent matches" },
      { status: 500 }
    );
  }
}