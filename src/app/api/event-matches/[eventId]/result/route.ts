import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type EventMatchResultRouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function PATCH(
  req: NextRequest,
  { params }: EventMatchResultRouteProps
) {
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

    const winnerTeamId = body.winnerTeamId
      ? Number(body.winnerTeamId)
      : null;

    const mvpPlayerId = body.mvpPlayerId
      ? Number(body.mvpPlayerId)
      : null;

    const galleryImageId = body.galleryImageId
      ? Number(body.galleryImageId)
      : null;

    if (!winnerTeamId) {
      return NextResponse.json(
        { message: "우승 팀을 선택해주세요." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: {
        id,
      },
      include: {
        teams: true,
        participants: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const validWinnerTeam = event.teams.some(
      (team) => team.id === winnerTeamId
    );

    if (!validWinnerTeam) {
      return NextResponse.json(
        { message: "이벤트에 속한 팀만 우승 팀으로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (mvpPlayerId) {
      const validMvpPlayer = event.participants.some(
        (participant) => participant.playerId === mvpPlayerId
      );

      if (!validMvpPlayer) {
        return NextResponse.json(
          { message: "이벤트 참가자만 MVP로 지정할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    const updatedEvent = await prisma.eventMatch.update({
      where: {
        id,
      },
      data: {
        winnerTeamId,
        mvpPlayerId,
        galleryImageId,
        status: "COMPLETED",
      },
      include: {
        galleryImage: true,
        teams: {
          include: {
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
          },
        },
      },
    });

    await prisma.adminLog.create({
      data: {
        action: "EVENT_MATCH_RESULT",
        message: `이벤트 내전 결과 등록: ${event.title}`,
      },
    });

    return NextResponse.json(updatedEvent);
  } catch (error) {
    console.error("[EVENT_MATCH_RESULT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 결과 등록 실패" },
      { status: 500 }
    );
  }
}