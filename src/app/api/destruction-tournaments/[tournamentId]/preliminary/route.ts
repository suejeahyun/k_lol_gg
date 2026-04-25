import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type MatchCreateInput = {
  tournamentId: number;
  stage: "PRELIMINARY";
  round: number;
  teamAId: number;
  teamBId: number;
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
        teams: {
          include: {
            members: true,
          },
          orderBy: {
            id: "asc",
          },
        },
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
        { message: "예선 생성을 위해 최소 2팀이 필요합니다." },
        { status: 400 }
      );
    }

    const hasInvalidTeamSize = tournament.teams.some(
      (team) => team.members.length !== 5
    );

    if (hasInvalidTeamSize) {
      return NextResponse.json(
        { message: "각 팀은 5명으로 구성되어야 합니다." },
        { status: 400 }
      );
    }

    const hasExistingPreliminary = tournament.matches.some(
      (match) => match.stage === "PRELIMINARY"
    );

    if (hasExistingPreliminary) {
      return NextResponse.json(
        { message: "이미 생성된 예선 경기가 있습니다." },
        { status: 400 }
      );
    }

    const teams = tournament.teams;
    const matchData: MatchCreateInput[] = [];
    let round = 1;

    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        matchData.push({
          tournamentId: id,
          stage: "PRELIMINARY",
          round,
          teamAId: teams[i].id,
          teamBId: teams[j].id,
        });

        round += 1;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.destructionMatch.createMany({
        data: matchData,
      });

      await tx.destructionTournament.update({
        where: {
          id,
        },
        data: {
          status: "PRELIMINARY",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_PRELIMINARY_CREATE",
          message: `멸망전 예선 풀리그 생성: ${tournament.title}`,
        },
      });

      return tx.destructionMatch.findMany({
        where: {
          tournamentId: id,
          stage: "PRELIMINARY",
        },
        include: {
          teamA: true,
          teamB: true,
        },
        orderBy: {
          round: "asc",
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[DESTRUCTION_PRELIMINARY_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 예선 생성 실패" },
      { status: 500 }
    );
  }
}