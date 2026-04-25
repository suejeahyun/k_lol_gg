import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteProps) {
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

    const winnerTeamId = body.winnerTeamId ? Number(body.winnerTeamId) : null;
    const mvpPlayerId = body.mvpPlayerId ? Number(body.mvpPlayerId) : null;
    const galleryImageId = body.galleryImageId
      ? Number(body.galleryImageId)
      : null;

    if (!winnerTeamId) {
      return NextResponse.json(
        { message: "우승 팀을 선택해주세요." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        teams: true,
        participants: true,
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const finalMatch = tournament.matches.find(
      (match) => match.stage === "FINAL"
    );

    if (!finalMatch) {
      return NextResponse.json(
        { message: "결승 경기를 먼저 생성해주세요." },
        { status: 400 }
      );
    }

    if (!finalMatch.winnerTeamId) {
      return NextResponse.json(
        { message: "결승 경기 결과를 먼저 등록해주세요." },
        { status: 400 }
      );
    }

    if (winnerTeamId !== finalMatch.winnerTeamId) {
      return NextResponse.json(
        { message: "우승 팀은 결승 승리 팀과 일치해야 합니다." },
        { status: 400 }
      );
    }

    const validWinnerTeam = tournament.teams.some(
      (team) => team.id === winnerTeamId
    );

    if (!validWinnerTeam) {
      return NextResponse.json(
        { message: "멸망전에 속한 팀만 우승 팀으로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (mvpPlayerId) {
      const validMvpPlayer = tournament.participants.some(
        (participant) => participant.playerId === mvpPlayerId
      );

      if (!validMvpPlayer) {
        return NextResponse.json(
          { message: "멸망전 참가자만 MVP로 지정할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    if (galleryImageId) {
      const galleryImage = await prisma.galleryImage.findUnique({
        where: {
          id: galleryImageId,
        },
      });

      if (!galleryImage) {
        return NextResponse.json(
          { message: "갤러리 이미지를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
    }

    const updatedTournament = await prisma.destructionTournament.update({
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
        matches: {
          include: {
            teamA: true,
            teamB: true,
          },
        },
      },
    });

    await prisma.adminLog.create({
      data: {
        action: "DESTRUCTION_TOURNAMENT_COMPLETE",
        message: `멸망전 종료 처리: ${tournament.title}`,
      },
    });

    return NextResponse.json(updatedTournament);
  } catch (error) {
    console.error("[DESTRUCTION_TOURNAMENT_COMPLETE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 종료 처리 실패" },
      { status: 500 }
    );
  }
}