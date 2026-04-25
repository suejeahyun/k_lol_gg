import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { calculateBalanceScore } from "@/lib/balance/tierScore";

type RouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type ParticipantInput = {
  playerId: number;
  position?: Position | null;
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

    if (playerIds.some((playerId) => Number.isNaN(playerId) || playerId <= 0)) {
      return NextResponse.json(
        { message: "플레이어 정보가 올바르지 않습니다." },
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

    const players = await prisma.player.findMany({
      where: {
        id: {
          in: playerIds,
        },
      },
      select: {
        id: true,
        peakTier: true,
        currentTier: true,
      },
    });

    if (players.length !== playerIds.length) {
      return NextResponse.json(
        { message: "등록되지 않은 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const playerMap = new Map(players.map((player) => [player.id, player]));

    const updatedEvent = await prisma.$transaction(async (tx) => {
      await tx.eventParticipant.deleteMany({
        where: {
          eventId: id,
        },
      });

      await tx.eventParticipant.createMany({
        data: participants.map((participant) => {
          const player = playerMap.get(Number(participant.playerId));

          return {
            eventId: id,
            playerId: Number(participant.playerId),
            position:
              event.mode === "ARAM"
                ? null
                : isValidPosition(participant.position)
                  ? participant.position
                  : null,
            balanceScore: calculateBalanceScore({
              currentTier: player?.currentTier,
              peakTier: player?.peakTier,
            }),
          };
        }),
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