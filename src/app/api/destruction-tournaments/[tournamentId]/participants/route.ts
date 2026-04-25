import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type ParticipantInput = {
  playerId: number;
  position: Position;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidPosition(position: unknown): position is Position {
  return typeof position === "string" && POSITIONS.includes(position as Position);
}

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const participants: ParticipantInput[] = Array.isArray(body.participants)
      ? body.participants
      : [];

    if (participants.length < 4) {
      return NextResponse.json(
        { message: "일반 참가자는 최소 4명 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (participants.length % 4 !== 0) {
      return NextResponse.json(
        { message: "일반 참가자는 4명 단위로 등록해야 합니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      include: {
        teams: true,
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (tournament.teams.length < 2) {
      return NextResponse.json(
        { message: "팀장을 먼저 등록해주세요." },
        { status: 400 }
      );
    }

    if (tournament.matches.length > 0) {
      return NextResponse.json(
        { message: "경기가 생성된 멸망전은 참가자를 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const captainIds = tournament.teams.map((team) => team.captainId);

    const playerIds = participants.map((participant) =>
      Number(participant.playerId)
    );

    if (playerIds.some((playerId) => Number.isNaN(playerId) || playerId <= 0)) {
      return NextResponse.json(
        { message: "플레이어 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const includesCaptain = playerIds.some((playerId) =>
      captainIds.includes(playerId)
    );

    if (includesCaptain) {
      return NextResponse.json(
        {
          message:
            "팀장은 팀장/팀 등록 단계에서 자동 등록됩니다. 일반 참가자 목록에는 팀장을 제외해주세요.",
        },
        { status: 400 }
      );
    }

    const duplicatedPlayerIds = playerIds.filter(
      (playerId, index, arr) => arr.indexOf(playerId) !== index
    );

    if (duplicatedPlayerIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 참가자가 있습니다." },
        { status: 400 }
      );
    }

    const hasInvalidPosition = participants.some(
      (participant) => !isValidPosition(participant.position)
    );

    if (hasInvalidPosition) {
      return NextResponse.json(
        { message: "모든 참가자의 지정 포지션이 필요합니다." },
        { status: 400 }
      );
    }

    const existingPlayers = await prisma.player.findMany({
      where: {
        id: {
          in: playerIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingPlayers.length !== playerIds.length) {
      return NextResponse.json(
        { message: "등록되지 않은 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.destructionParticipant.deleteMany({
        where: {
          tournamentId: id,
          playerId: {
            notIn: captainIds,
          },
        },
      }),

      prisma.destructionParticipant.createMany({
        data: participants.map((participant) => ({
          tournamentId: id,
          teamId: null,
          playerId: Number(participant.playerId),
          position: participant.position,
          balanceScore: 0,
        })),
      }),

      prisma.destructionTournament.update({
        where: {
          id,
        },
        data: {
          status: "RECRUITING",
        },
      }),

      prisma.adminLog.create({
        data: {
          action: "DESTRUCTION_PARTICIPANTS_UPDATE",
          message: `멸망전 일반 참가자 등록: ${tournament.title}`,
        },
      }),
    ]);

    const updatedTournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        teams: {
          include: {
            captain: true,
            members: {
              include: {
                player: true,
              },
            },
          },
        },
        participants: {
          include: {
            player: true,
            team: true,
          },
        },
        matches: true,
      },
    });

    return NextResponse.json(updatedTournament);
  } catch (error) {
    console.error("[DESTRUCTION_PARTICIPANTS_PUT_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가자 등록 실패" },
      { status: 500 }
    );
  }
}