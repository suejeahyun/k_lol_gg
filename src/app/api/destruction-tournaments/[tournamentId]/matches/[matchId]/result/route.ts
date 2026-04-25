import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
    matchId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  try {
    const { tournamentId, matchId } = await params;

    const parsedTournamentId = Number(tournamentId);
    const parsedMatchId = Number(matchId);

    if (Number.isNaN(parsedTournamentId) || Number.isNaN(parsedMatchId)) {
      return NextResponse.json(
        { message: "멸망전 또는 경기 ID가 올바르지 않습니다." },
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

    const match = await prisma.destructionMatch.findFirst({
      where: {
        id: parsedMatchId,
        tournamentId: parsedTournamentId,
      },
      include: {
        tournament: true,
        teamA: true,
        teamB: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { message: "멸망전 경기를 찾을 수 없습니다." },
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
      const validMvp = await prisma.destructionParticipant.findFirst({
        where: {
          tournamentId: parsedTournamentId,
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
      const beforeMatch = await tx.destructionMatch.findUnique({
        where: {
          id: parsedMatchId,
        },
      });

      if (beforeMatch?.stage === "PRELIMINARY" && beforeMatch.winnerTeamId) {
        const loserTeamId =
          beforeMatch.winnerTeamId === beforeMatch.teamAId
            ? beforeMatch.teamBId
            : beforeMatch.teamAId;

        await tx.destructionTeam.update({
          where: {
            id: beforeMatch.winnerTeamId,
          },
          data: {
            points: {
              decrement: 3,
            },
            wins: {
              decrement: 1,
            },
          },
        });

        await tx.destructionTeam.update({
          where: {
            id: loserTeamId,
          },
          data: {
            points: {
              decrement: 1,
            },
            losses: {
              decrement: 1,
            },
          },
        });
      }

      const updated = await tx.destructionMatch.update({
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

      if (updated.stage === "PRELIMINARY") {
        const loserTeamId =
          winnerTeamId === updated.teamAId ? updated.teamBId : updated.teamAId;

        await tx.destructionTeam.update({
          where: {
            id: winnerTeamId,
          },
          data: {
            points: {
              increment: 3,
            },
            wins: {
              increment: 1,
            },
          },
        });

        await tx.destructionTeam.update({
          where: {
            id: loserTeamId,
          },
          data: {
            points: {
              increment: 1,
            },
            losses: {
              increment: 1,
            },
          },
        });
      }

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_MATCH_RESULT_UPDATE",
          message: `멸망전 경기 결과 등록: ${match.tournament.title} / ${match.teamA.name} vs ${match.teamB.name}`,
        },
      });

      return updated;
    });

    return NextResponse.json(updatedMatch);
  } catch (error) {
    console.error("[DESTRUCTION_MATCH_RESULT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 경기 결과 등록 실패" },
      { status: 500 }
    );
  }
}