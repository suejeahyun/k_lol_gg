import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    eventId: string;
    matchId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  try {
    const { eventId, matchId } = await params;

    const parsedEventId = Number(eventId);
    const parsedMatchId = Number(matchId);

    if (Number.isNaN(parsedEventId) || Number.isNaN(parsedMatchId)) {
      return NextResponse.json(
        { message: "이벤트 또는 경기 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const winnerTeamId = body.winnerTeamId ? Number(body.winnerTeamId) : null;
    const mvpPlayerId = body.mvpPlayerId ? Number(body.mvpPlayerId) : null;

    if (!winnerTeamId) {
      return NextResponse.json(
        { message: "승리 팀을 선택해주세요." },
        { status: 400 }
      );
    }

    const match = await prisma.eventTournamentMatch.findFirst({
      where: {
        id: parsedMatchId,
        eventId: parsedEventId,
      },
      include: {
        event: true,
        teamA: true,
        teamB: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { message: "이벤트 경기를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const validWinner =
      winnerTeamId === match.teamAId || winnerTeamId === match.teamBId;

    if (!validWinner) {
      return NextResponse.json(
        { message: "해당 경기의 팀만 승리 팀으로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (mvpPlayerId) {
      const validMvp = await prisma.eventParticipant.findFirst({
        where: {
          eventId: parsedEventId,
          playerId: mvpPlayerId,
          teamId: winnerTeamId,
        },
      });

      if (!validMvp) {
        return NextResponse.json(
          { message: "승리 팀 참가자만 MVP로 지정할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    const updatedMatch = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventTournamentMatch.update({
        where: {
          id: parsedMatchId,
        },
        data: {
          winnerTeamId,
          mvpPlayerId,
        },
        include: {
          teamA: true,
          teamB: true,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_MATCH_RESULT_UPDATE",
          message: `이벤트 경기 결과 등록: ${match.event.title} / ${match.teamA.name} vs ${match.teamB.name}`,
        },
      });

      return updated;
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error("[EVENT_MATCH_RESULT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 경기 결과 등록 실패" },
      { status: 500 }
    );
  }
}