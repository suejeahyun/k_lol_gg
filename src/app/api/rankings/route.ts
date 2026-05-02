import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const seasonIdParam = req.nextUrl.searchParams.get("seasonId");
    const seasonId = seasonIdParam ? Number(seasonIdParam) : null;

    const currentSeason = seasonId
      ? await prisma.season.findUnique({
          where: { id: seasonId },
        })
      : await prisma.season.findFirst({
          where: { isActive: true },
          orderBy: { id: "desc" },
        });

    if (!currentSeason) {
      return NextResponse.json({
        season: null,
        rankings: [],
      });
    }

    const players = await prisma.player.findMany({
      include: {
        participants: {
          where: {
            game: {
              series: {
                seasonId: currentSeason.id,
              },
            },
          },
          select: {
            kills: true,
            deaths: true,
            assists: true,
            team: true,
            game: {
              select: {
                winnerTeam: true,
                seriesId: true,
              },
            },
          },
        },
      },
    });

    const mappedRankings = players.map((player: (typeof players)[number]) => {
      // 세트 기준 총 경기 수
      const totalGames = player.participants.length;
      
      // 내전 시리즈 기준 참가 횟수
      // 같은 내전에서 1세트, 2세트, 3세트를 모두 뛰어도 참가횟수는 1회
      const participationCount = new Set(
        player.participants.map((participant) => participant.game.seriesId)
      ).size;

      const wins = player.participants.filter(
        (participant: (typeof player.participants)[number]) =>
          participant.team === participant.game.winnerTeam
      ).length;

      const losses = totalGames - wins;

      const totalKills = player.participants.reduce(
        (sum: number, participant: (typeof player.participants)[number]) =>
          sum + participant.kills,
        0
      );

      const totalDeaths = player.participants.reduce(
        (sum: number, participant: (typeof player.participants)[number]) =>
          sum + participant.deaths,
        0
      );

      const totalAssists = player.participants.reduce(
        (sum: number, participant: (typeof player.participants)[number]) =>
          sum + participant.assists,
        0
      );

      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

      const kda =
        totalDeaths === 0
          ? Number((totalKills + totalAssists).toFixed(2))
          : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

      return {
        playerId: player.id,
        name: player.name,
        nickname: player.nickname ?? "",
        tag: player.tag ?? "",
        totalGames,
        participationCount,
        wins,
        losses,
        winRate,
        kda,
      };
    });

    const rankings = mappedRankings
      .filter((player: (typeof mappedRankings)[number]) => player.totalGames > 0)
      .sort(
        (
          a: (typeof mappedRankings)[number],
          b: (typeof mappedRankings)[number]
        ) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.kda !== a.kda) return b.kda - a.kda;
          return a.playerId - b.playerId;
        }
      );

    return NextResponse.json({
      season: {
        id: currentSeason.id,
        name: currentSeason.name,
        isActive: currentSeason.isActive,
        createdAt: currentSeason.createdAt,
      },
      rankings,
    });
  } catch (error) {
    console.error("[RANKINGS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch rankings" },
      { status: 500 }
    );
  }
}