import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const page = Math.max(
      1,
      Number(req.nextUrl.searchParams.get("page") ?? "1") || 1
    );
    const pageSize = 5;
    const skip = (page - 1) * pageSize;

    const [totalCount, participants] = await Promise.all([
      prisma.matchParticipant.count({
        where: {
          playerId: id,
        },
      }),
      prisma.matchParticipant.findMany({
        where: {
          playerId: id,
        },
        include: {
          champion: true,
          game: {
            include: {
              series: true,
            },
          },
        },
        orderBy: {
          game: {
            series: {
              matchDate: "desc",
            },
          },
        },
        skip,
        take: pageSize,
      }),
    ]);

    const items = participants.map((participant: (typeof participants)[number]) => {
      const isWin = participant.team === participant.game.winnerTeam;

      return {
        id: participant.id,
        matchId: participant.game.seriesId,
        matchTitle: participant.game.series.title,
        matchDate: participant.game.series.matchDate,
        gameId: participant.gameId,
        gameNumber: participant.game.gameNumber,
        durationMin: participant.game.durationMin,
        team: participant.team,
        position: participant.position,
        result: isWin ? "WIN" : "LOSE",
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        cs: participant.cs,
        gold: participant.gold,
        champion: {
          id: participant.champion.id,
          name: participant.champion.name,
          imageUrl: participant.champion.imageUrl,
        },
      };
    });

    return NextResponse.json({
      items,
      pagination: {
        currentPage: page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error("[PLAYER_RECENT_GET_ERROR]", error);

    return NextResponse.json(
      { message: "최근 경기 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}