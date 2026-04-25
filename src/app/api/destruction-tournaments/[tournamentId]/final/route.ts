import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export async function POST(_req: NextRequest, { params }: RouteProps) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        matches: {
          orderBy: [{ stage: "asc" }, { round: "asc" }],
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const semiFinalMatches = tournament.matches.filter(
      (match) => match.stage === "SEMI_FINAL"
    );

    if (semiFinalMatches.length !== 2) {
      return NextResponse.json(
        { message: "4강 경기가 2개 있어야 결승을 생성할 수 있습니다." },
        { status: 400 }
      );
    }

    const hasUnfinishedSemiFinal = semiFinalMatches.some(
      (match) => !match.winnerTeamId
    );

    if (hasUnfinishedSemiFinal) {
      return NextResponse.json(
        { message: "4강 경기 결과를 먼저 모두 등록해주세요." },
        { status: 400 }
      );
    }

    const hasFinalMatch = tournament.matches.some(
      (match) => match.stage === "FINAL"
    );

    if (hasFinalMatch) {
      return NextResponse.json(
        { message: "이미 생성된 결승 경기가 있습니다." },
        { status: 400 }
      );
    }

    const firstWinnerTeamId = semiFinalMatches[0].winnerTeamId;
    const secondWinnerTeamId = semiFinalMatches[1].winnerTeamId;

    if (!firstWinnerTeamId || !secondWinnerTeamId) {
      return NextResponse.json(
        { message: "결승 진출 팀을 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const finalMatch = await tx.destructionMatch.create({
        data: {
          tournamentId: id,
          stage: "FINAL",
          round: 1,
          teamAId: firstWinnerTeamId,
          teamBId: secondWinnerTeamId,
        },
        include: {
          teamA: true,
          teamB: true,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_FINAL_CREATE",
          message: `멸망전 결승 생성: ${tournament.title}`,
        },
      });

      return finalMatch;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[DESTRUCTION_FINAL_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 결승 생성 실패" },
      { status: 500 }
    );
  }
}