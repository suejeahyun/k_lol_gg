import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type ParticipantInput = {
  playerId: number;
  position?: Position | null;
  balanceScore?: number;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isValidPosition(position: unknown): position is Position {
  return typeof position === "string" && POSITIONS.includes(position as Position);
}

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const { eventId } = await params;
    const id = Number(eventId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "이벤트 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const participants: ParticipantInput[] = Array.isArray(body.participants)
      ? body.participants
      : [];

    if (participants.length < 10) {
      return NextResponse.json(
        { message: "참가자는 최소 10명 이상이어야 합니다." },
        { status: 400 }
      );
    }

    if (participants.length % 5 !== 0) {
      return NextResponse.json(
        { message: "참가자는 5명 단위로 등록해야 합니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      include: {
        participants: true,
        teams: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (event.teams.length > 0) {
      return NextResponse.json(
        { message: "이미 팀이 생성된 이벤트는 참가자를 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const playerIds = participants.map((participant) =>
      Number(participant.playerId)
    );

    const hasInvalidPlayerId = playerIds.some((playerId) =>
      Number.isNaN(playerId)
    );

    if (hasInvalidPlayerId) {
      return NextResponse.json(
        { message: "플레이어 ID가 올바르지 않습니다." },
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

    if (event.mode === "POSITION") {
      const hasInvalidPosition = participants.some(
        (participant) => !isValidPosition(participant.position)
      );

      if (hasInvalidPosition) {
        return NextResponse.json(
          { message: "포지션 모드에서는 모든 참가자의 라인이 필요합니다." },
          { status: 400 }
        );
      }
    }

    const updatedEvent = await prisma.$transaction(async (tx) => {
      await tx.eventParticipant.deleteMany({
        where: {
          eventId: id,
        },
      });

      await tx.eventParticipant.createMany({
        data: participants.map((participant) => ({
          eventId: id,
          playerId: Number(participant.playerId),
          position:
            event.mode === "ARAM"
              ? null
              : isValidPosition(participant.position)
                ? participant.position
                : null,
          balanceScore: Number(participant.balanceScore ?? 0),
        })),
      });

      await tx.eventMatch.update({
        where: {
          id,
        },
        data: {
          status: "RECRUITING",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_PARTICIPANTS_UPDATE",
          message: `이벤트 내전 참가자 등록: ${event.title}`,
        },
      });

      return tx.eventMatch.findUnique({
        where: {
          id,
        },
        include: {
          participants: {
            include: {
              player: true,
              team: true,
            },
            orderBy: {
              id: "asc",
            },
          },
          teams: true,
          matches: true,
        },
      });
    });

    return NextResponse.json(updatedEvent);
  } catch (error) {
    console.error("[EVENT_PARTICIPANTS_PUT_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 참가자 등록 실패" },
      { status: 500 }
    );
  }
}