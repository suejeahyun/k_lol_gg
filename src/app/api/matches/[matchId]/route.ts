import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type Team = "BLUE" | "RED";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type UpdateParticipantInput = {
  playerId: number;
  championId: number;
  team: Team;
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
};

type UpdateGameInput = {
  gameNumber: number;
  participants: UpdateParticipantInput[];
};

type UpdateMatchInput = {
  seasonId: number;
  title: string;
  matchDate: string;
  games: UpdateGameInput[];
};

type RouteContext = {
  params: Promise<{
    matchId: string;
  }>;
};

const VALID_TEAMS: Team[] = ["BLUE", "RED"];
const VALID_POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidTeam(value: unknown): value is Team {
  return typeof value === "string" && VALID_TEAMS.includes(value as Team);
}

function isValidPosition(value: unknown): value is Position {
  return (
    typeof value === "string" &&
    VALID_POSITIONS.includes(value as Position)
  );
}

function validatePayload(body: unknown): {
  success: true;
  data: UpdateMatchInput;
} | {
  success: false;
  message: string;
} {
  if (!body || typeof body !== "object") {
    return {
      success: false,
      message: "요청 본문이 올바르지 않습니다.",
    };
  }

  const payload = body as Partial<UpdateMatchInput>;

  if (
    typeof payload.seasonId !== "number" ||
    !Number.isInteger(payload.seasonId) ||
    payload.seasonId <= 0
  ) {
    return {
      success: false,
      message: "seasonId가 올바르지 않습니다.",
    };
  }

  if (typeof payload.title !== "string" || !payload.title.trim()) {
    return {
      success: false,
      message: "제목을 입력해주세요.",
    };
  }

  if (typeof payload.matchDate !== "string" || !payload.matchDate.trim()) {
    return {
      success: false,
      message: "matchDate가 올바르지 않습니다.",
    };
  }

  const parsedDate = new Date(payload.matchDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      success: false,
      message: "matchDate 형식이 올바르지 않습니다.",
    };
  }

  if (!Array.isArray(payload.games) || payload.games.length === 0) {
    return {
      success: false,
      message: "최소 1개의 세트가 필요합니다.",
    };
  }

  for (const game of payload.games) {
    if (
      !game ||
      typeof game !== "object" ||
      typeof game.gameNumber !== "number" ||
      !Number.isInteger(game.gameNumber) ||
      game.gameNumber <= 0
    ) {
      return {
        success: false,
        message: "gameNumber가 올바르지 않습니다.",
      };
    }

    if (!Array.isArray(game.participants) || game.participants.length !== 10) {
      return {
        success: false,
        message: `${game.gameNumber}세트의 참가자는 정확히 10명이어야 합니다.`,
      };
    }

    const blueCount = game.participants.filter(
      (participant) => participant.team === "BLUE"
    ).length;
    const redCount = game.participants.filter(
      (participant) => participant.team === "RED"
    ).length;

    if (blueCount !== 5 || redCount !== 5) {
      return {
        success: false,
        message: `${game.gameNumber}세트는 블루 5명, 레드 5명이어야 합니다.`,
      };
    }

    const seenPlayers = new Set<number>();
    const bluePositions = new Set<Position>();
    const redPositions = new Set<Position>();

    for (const participant of game.participants) {
      if (
        typeof participant.playerId !== "number" ||
        !Number.isInteger(participant.playerId) ||
        participant.playerId <= 0
      ) {
        return {
          success: false,
          message: `${game.gameNumber}세트의 playerId가 올바르지 않습니다.`,
        };
      }

      if (seenPlayers.has(participant.playerId)) {
        return {
          success: false,
          message: `${game.gameNumber}세트에 중복된 플레이어가 있습니다.`,
        };
      }
      seenPlayers.add(participant.playerId);

      if (
        typeof participant.championId !== "number" ||
        !Number.isInteger(participant.championId) ||
        participant.championId <= 0
      ) {
        return {
          success: false,
          message: `${game.gameNumber}세트의 championId가 올바르지 않습니다.`,
        };
      }

      if (!isValidTeam(participant.team)) {
        return {
          success: false,
          message: `${game.gameNumber}세트의 team 값이 올바르지 않습니다.`,
        };
      }

      if (!isValidPosition(participant.position)) {
        return {
          success: false,
          message: `${game.gameNumber}세트의 position 값이 올바르지 않습니다.`,
        };
      }

      if (
        !Number.isInteger(participant.kills) ||
        participant.kills < 0 ||
        !Number.isInteger(participant.deaths) ||
        participant.deaths < 0 ||
        !Number.isInteger(participant.assists) ||
        participant.assists < 0
      ) {
        return {
          success: false,
          message: `${game.gameNumber}세트의 K/D/A 값이 올바르지 않습니다.`,
        };
      }

      if (participant.team === "BLUE") {
        if (bluePositions.has(participant.position)) {
          return {
            success: false,
            message: `${game.gameNumber}세트 블루팀 포지션이 중복되었습니다.`,
          };
        }
        bluePositions.add(participant.position);
      }

      if (participant.team === "RED") {
        if (redPositions.has(participant.position)) {
          return {
            success: false,
            message: `${game.gameNumber}세트 레드팀 포지션이 중복되었습니다.`,
          };
        }
        redPositions.add(participant.position);
      }
    }
  }

  return {
    success: true,
    data: {
      seasonId: payload.seasonId,
      title: payload.title.trim(),
      matchDate: payload.matchDate,
      games: payload.games,
    },
  };
}

function resolveWinnerTeam(participants: UpdateParticipantInput[]): Team {
  const blueKills = participants
    .filter((participant) => participant.team === "BLUE")
    .reduce((sum, participant) => sum + participant.kills, 0);

  const redKills = participants
    .filter((participant) => participant.team === "RED")
    .reduce((sum, participant) => sum + participant.kills, 0);

  return blueKills >= redKills ? "BLUE" : "RED";
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { matchId } = await context.params;
    const matchIdNumber = Number(matchId);

    if (!Number.isInteger(matchIdNumber) || matchIdNumber <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 matchId입니다." },
        { status: 400 }
      );
    }

    const match = await prisma.matchSeries.findUnique({
      where: { id: matchIdNumber },
      include: {
        season: true,
        games: {
          orderBy: {
            gameNumber: "asc",
          },
          include: {
            participants: {
              orderBy: {
                id: "asc",
              },
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
        { message: "내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(match);
  } catch (error) {
    console.error("[MATCH_GET_BY_ID_ERROR]", error);
    return NextResponse.json(
      { message: "내전 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { matchId } = await context.params;
    const matchIdNumber = Number(matchId);

    if (!Number.isInteger(matchIdNumber) || matchIdNumber <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 matchId입니다." },
        { status: 400 }
      );
    }

    const existingMatch = await prisma.matchSeries.findUnique({
      where: { id: matchIdNumber },
      select: { id: true },
    });

    if (!existingMatch) {
      return NextResponse.json(
        { message: "수정할 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const validated = validatePayload(body);

    if (!validated.success) {
      return NextResponse.json(
        { message: validated.message },
        { status: 400 }
      );
    }

    const data = validated.data;

    const season = await prisma.season.findUnique({
      where: { id: data.seasonId },
      select: { id: true },
    });

    if (!season) {
      return NextResponse.json(
        { message: "선택한 시즌이 존재하지 않습니다." },
        { status: 404 }
      );
    }

    const playerIds = data.games.flatMap((game) =>
      game.participants.map((participant) => participant.playerId)
    );
    const championIds = data.games.flatMap((game) =>
      game.participants.map((participant) => participant.championId)
    );

    const [players, champions] = await Promise.all([
      prisma.player.findMany({
        where: {
          id: { in: [...new Set(playerIds)] },
        },
        select: { id: true },
      }),
      prisma.champion.findMany({
        where: {
          id: { in: [...new Set(championIds)] },
        },
        select: { id: true },
      }),
    ]);

    if (players.length !== new Set(playerIds).size) {
      return NextResponse.json(
        { message: "존재하지 않는 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    if (champions.length !== new Set(championIds).size) {
      return NextResponse.json(
        { message: "존재하지 않는 챔피언이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const updatedMatch = await prisma.$transaction(async (tx) => {
      await tx.matchParticipant.deleteMany({
        where: {
          game: {
            seriesId: matchIdNumber,
          },
        },
      });

      await tx.matchGame.deleteMany({
        where: {
          seriesId: matchIdNumber,
        },
      });

      const matchSeries = await tx.matchSeries.update({
        where: { id: matchIdNumber },
        data: {
          seasonId: data.seasonId,
          title: data.title,
          matchDate: new Date(data.matchDate),
        },
      });

      for (const game of data.games) {
        const createdGame = await tx.matchGame.create({
          data: {
            seriesId: matchIdNumber,
            gameNumber: game.gameNumber,
            durationMin: 0,
            winnerTeam: resolveWinnerTeam(game.participants),
          },
        });

        await tx.matchParticipant.createMany({
          data: game.participants.map((participant) => ({
            gameId: createdGame.id,
            playerId: participant.playerId,
            championId: participant.championId,
            team: participant.team,
            position: participant.position,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
          })),
        });
      }

      return matchSeries;
    });

    return NextResponse.json({
      message: "내전이 수정되었습니다.",
      match: updatedMatch,
    });
  } catch (error) {
    console.error("[MATCH_PATCH_ERROR]", error);
    return NextResponse.json(
      { message: "내전 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  try {
    const { matchId } = await context.params;
    const matchIdNumber = Number(matchId);

    if (!Number.isInteger(matchIdNumber) || matchIdNumber <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 matchId입니다." },
        { status: 400 }
      );
    }

    const existingMatch = await prisma.matchSeries.findUnique({
      where: { id: matchIdNumber },
      select: { id: true },
    });

    if (!existingMatch) {
      return NextResponse.json(
        { message: "삭제할 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.matchParticipant.deleteMany({
        where: {
          game: {
            seriesId: matchIdNumber,
          },
        },
      });

      await tx.matchGame.deleteMany({
        where: {
          seriesId: matchIdNumber,
        },
      });

      await tx.matchSeries.delete({
        where: {
          id: matchIdNumber,
        },
      });
    });

    return NextResponse.json({
      message: "내전이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("[MATCH_DELETE_ERROR]", error);
    return NextResponse.json(
      { message: "내전 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}