import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{ matchId: string }>;
};

type PatchGameInput = {
  gameNumber: number;
  durationMin: number;
  winnerTeam: "BLUE" | "RED";
  participants: Array<{
    playerId: number;
    championId: number;
    team: "BLUE" | "RED";
    position: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    gold: number;
  }>;
};

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { matchId } = await params;
    const id = Number(matchId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid matchId" },
        { status: 400 }
      );
    }

    const match = await prisma.matchSeries.findUnique({
      where: { id },
      include: {
        season: true,
        games: {
          orderBy: {
            gameNumber: "asc",
          },
          include: {
            participants: {
              include: {
                player: true,
                champion: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      return NextResponse.json(
        { message: "Match not found" },
        { status: 404 }
      );
    }

    const gamesWithMvp = match.games.map((game: (typeof match.games)[number]) => {
      const participantsWithScore = game.participants.map(
        (participant: (typeof game.participants)[number]) => {
          const isWinner = participant.team === game.winnerTeam;
          const score =
            participant.kills * 3 +
            participant.assists -
            participant.deaths +
            (isWinner ? 5 : 0);

          return {
            ...participant,
            isWinner,
            score,
          };
        }
      );

      type ScoredParticipant = (typeof participantsWithScore)[number];

      const mvp =
        participantsWithScore.length === 0
          ? null
          : participantsWithScore.reduce(
              (
                best: ScoredParticipant | null,
                current: ScoredParticipant
              ): ScoredParticipant => {
                if (!best) {
                  return current;
                }

                if (current.score > best.score) {
                  return current;
                }

                if (current.score === best.score) {
                  const currentKda =
                    current.deaths === 0
                      ? current.kills + current.assists
                      : (current.kills + current.assists) / current.deaths;

                  const bestKda =
                    best.deaths === 0
                      ? best.kills + best.assists
                      : (best.kills + best.assists) / best.deaths;

                  if (currentKda > bestKda) {
                    return current;
                  }
                }

                return best;
              },
              null
            );

      return {
        ...game,
        participants: participantsWithScore,
        mvp: mvp
          ? {
              id: mvp.id,
              playerId: mvp.playerId,
              championId: mvp.championId,
              playerName: mvp.player.name,
              playerNickname: mvp.player.nickname,
              playerTag: mvp.player.tag,
              championName: mvp.champion.name,
              championImageUrl: mvp.champion.imageUrl,
              team: mvp.team,
              position: mvp.position,
              kills: mvp.kills,
              deaths: mvp.deaths,
              assists: mvp.assists,
              cs: mvp.cs,
              gold: mvp.gold,
              isWinner: mvp.isWinner,
              score: mvp.score,
            }
          : null,
      };
    });

    return NextResponse.json({
      ...match,
      games: gamesWithMvp,
    });
  } catch (error) {
    console.error("[MATCH_DETAIL_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch match detail" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { matchId } = await params;
    const id = Number(matchId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid matchId" },
        { status: 400 }
      );
    }

    const body = await req.json();

    await prisma.matchParticipant.deleteMany({
      where: {
        game: {
          seriesId: id,
        },
      },
    });

    await prisma.matchGame.deleteMany({
      where: {
        seriesId: id,
      },
    });

    const updated = await prisma.matchSeries.update({
      where: { id },
      data: {
        title: body.title,
        matchDate: new Date(body.matchDate),
        seasonId: body.seasonId,
        games: {
          create: body.games.map((game: PatchGameInput) => ({
            gameNumber: game.gameNumber,
            durationMin: game.durationMin,
            winnerTeam: game.winnerTeam,
            participants: {
              create: game.participants.map(
                (participant: PatchGameInput["participants"][number]) => ({
                  playerId: participant.playerId,
                  championId: participant.championId,
                  team: participant.team,
                  position: participant.position,
                  kills: participant.kills,
                  deaths: participant.deaths,
                  assists: participant.assists,
                  cs: participant.cs,
                  gold: participant.gold,
                })
              ),
            },
          })),
        },
      },
      include: {
        games: {
          include: {
            participants: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[MATCH_UPDATE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to update match" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { matchId } = await params;
    const id = Number(matchId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid matchId" },
        { status: 400 }
      );
    }

    const match = await prisma.matchSeries.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!match) {
      return NextResponse.json(
        { message: "Match not found" },
        { status: 404 }
      );
    }

    await prisma.matchParticipant.deleteMany({
      where: {
        game: {
          seriesId: id,
        },
      },
    });

    await prisma.matchGame.deleteMany({
      where: {
        seriesId: id,
      },
    });

    await prisma.matchSeries.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MATCH_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to delete match" },
      { status: 500 }
    );
  }
}