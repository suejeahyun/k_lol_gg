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
            gold: true,
            team: true,
            game: {
              select: {
                winnerTeam: true,
              },
            },
          },
        },
      },
    });

    const rankings = players
      .map((player: (typeof players)[number]) => {
        const totalGames = player.participants.length;
        const wins = player.participants.filter(
          (participant) => participant.team === participant.game.winnerTeam
        ).length;
        const losses = totalGames - wins;

        const totalKills = player.participants.reduce(
          (sum, participant) => sum + participant.kills,
          0
        );
        const totalDeaths = player.participants.reduce(
          (sum, participant) => sum + participant.deaths,
          0
        );
        const totalAssists = player.participants.reduce(
          (sum, participant) => sum + participant.assists,
          0
        );
        const totalGold = player.participants.reduce(
          (sum, participant) => sum + participant.gold,
          0
        );

        const winRate =
          totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

        const kda =
          totalDeaths === 0
            ? Number((totalKills + totalAssists).toFixed(2))
            : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

        const avgGold = totalGames > 0 ? Math.round(totalGold / totalGames) : 0;

        return {
          playerId: player.id,
          name: player.name,
          nickname: player.nickname,
          tag: player.tag,
          totalGames,
          wins,
          losses,
          winRate,
          kda,
          avgGold,
        };
      })
      .filter((player) => player.totalGames > 0)
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.kda !== a.kda) return b.kda - a.kda;
        if (b.avgGold !== a.avgGold) return b.avgGold - a.avgGold;
        return a.playerId - b.playerId;
      });

    return NextResponse.json({
      season: currentSeason,
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