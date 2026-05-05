import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getGameMvpParticipant } from "@/lib/mvp";

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
                id: true,
                winnerTeam: true,
                seriesId: true,
              },
            },
          },
        },
      },
    });

    const mvpCountByPlayer = new Map<number, number>();
    const participantsByGame = new Map<
      number,
      Array<{
        playerId: number;
        kills: number;
        deaths: number;
        assists: number;
        team: string;
        winnerTeam: string;
      }>
    >();

    for (const player of players) {
      for (const participant of player.participants) {
        const items = participantsByGame.get(participant.game.id) ?? [];
        items.push({
          playerId: player.id,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          team: participant.team,
          winnerTeam: participant.game.winnerTeam,
        });
        participantsByGame.set(participant.game.id, items);
      }
    }

    for (const gameParticipants of participantsByGame.values()) {
      const mvp = getGameMvpParticipant(
        gameParticipants,
        gameParticipants[0]?.winnerTeam ?? "",
      );

      if (mvp) {
        mvpCountByPlayer.set(
          mvp.playerId,
          (mvpCountByPlayer.get(mvp.playerId) ?? 0) + 1,
        );
      }
    }

    const mappedRankings = players.map((player: (typeof players)[number]) => {
      const totalGames = player.participants.length;
      const participationCount = new Set(
        player.participants.map((participant) => participant.game.seriesId),
      ).size;

      const wins = player.participants.filter(
        (participant: (typeof player.participants)[number]) =>
          participant.team === participant.game.winnerTeam,
      ).length;

      const losses = totalGames - wins;
      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

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
        mvpCount: mvpCountByPlayer.get(player.id) ?? 0,
      };
    });

    const rankings = mappedRankings
      .filter((player: (typeof mappedRankings)[number]) => player.totalGames > 0)
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
        return a.playerId - b.playerId;
      });

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
      { status: 500 },
    );
  }
}
