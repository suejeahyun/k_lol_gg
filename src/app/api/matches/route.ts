import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { validateMatchCreateInput } from "@/validations/match";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type CreateParticipantInput = {
  playerId: number;
  championId: number;
  team: Team;
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
};

type CreateGameInput = {
  gameNumber: number;
  participants: CreateParticipantInput[];
};

type CreateMatchInput = {
  seasonId: number;
  title: string;
  matchDate: string;
  games: CreateGameInput[];
};

function resolveWinnerTeam(participants: CreateParticipantInput[]): Team {
  const blueKills = participants
    .filter((participant) => participant.team === "BLUE")
    .reduce((sum, participant) => sum + participant.kills, 0);

  const redKills = participants
    .filter((participant) => participant.team === "RED")
    .reduce((sum, participant) => sum + participant.kills, 0);

  if (redKills > blueKills) {
    return "RED";
  }

  return "BLUE";
}

export async function GET() {
  try {
    const matches = await prisma.matchSeries.findMany({
      include: {
        season: true,
        games: true,
      },
      orderBy: {
        matchDate: "desc",
      },
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error("[MATCH_LIST_GET_ERROR]", error);

    return NextResponse.json(
      { message: "내전 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateMatchInput;

    const validation = validateMatchCreateInput(body);
    if (!validation.ok) {
      return NextResponse.json(
        { message: validation.message },
        { status: 400 }
      );
    }

    const season = await prisma.season.findUnique({
      where: { id: body.seasonId },
      select: { id: true },
    });

    if (!season) {
      return NextResponse.json(
        { message: "존재하지 않는 시즌입니다." },
        { status: 400 }
      );
    }

    const playerIds = [
      ...new Set(
        body.games.flatMap((game) =>
          game.participants.map((participant) => participant.playerId)
        )
      ),
    ];

    const championIds = [
      ...new Set(
        body.games.flatMap((game) =>
          game.participants.map((participant) => participant.championId)
        )
      ),
    ];

    const [players, champions] = await Promise.all([
      prisma.player.findMany({
        where: {
          id: {
            in: playerIds,
          },
        },
        select: {
          id: true,
        },
      }),
      prisma.champion.findMany({
        where: {
          id: {
            in: championIds,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (players.length !== playerIds.length) {
      return NextResponse.json(
        { message: "존재하지 않는 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    if (champions.length !== championIds.length) {
      return NextResponse.json(
        { message: "존재하지 않는 챔피언이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const created = await prisma.matchSeries.create({
      data: {
        title: body.title.trim(),
        matchDate: new Date(body.matchDate),
        seasonId: body.seasonId,
        games: {
          create: body.games.map((game) => ({
            gameNumber: game.gameNumber,
            durationMin: 0,
            winnerTeam: resolveWinnerTeam(game.participants),
            participants: {
              create: game.participants.map((participant) => ({
                playerId: participant.playerId,
                championId: participant.championId,
                team: participant.team,
                position: participant.position,
                kills: participant.kills,
                deaths: participant.deaths,
                assists: participant.assists,
              })),
            },
          })),
        },
      },
      include: {
        season: true,
        games: {
          include: {
            participants: true,
          },
        },
      },
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("[MATCH_CREATE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "내전 등록 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}