export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type MatchCreateInput = {
  tournamentId: number;
  stage: "SEMI_FINAL";
  round: number;
  teamAId: number;
  teamBId: number;
  bestOf: number;
  isConfirmed?: boolean;
};

export async function POST(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (!Number.isInteger(id) || id <= 0) {
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
          orderBy: [
            {
              points: "desc",
            },
            {
              wins: "desc",
            },
            {
              losses: "asc",
            },
            {
              id: "asc",
            },
          ],
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

    if (tournament.teams.length < 4) {
      return NextResponse.json(
        { message: "토너먼트 생성을 위해 최소 4팀이 필요합니다." },
        { status: 400 }
      );
    }

    const preliminaryMatches = tournament.matches.filter(
      (match) => match.stage === "PRELIMINARY"
    );

    if (preliminaryMatches.length === 0) {
      return NextResponse.json(
        { message: "예선 경기를 먼저 생성해주세요." },
        { status: 400 }
      );
    }

    const hasUnconfirmedPreliminary = preliminaryMatches.some(
      (match) => !match.isConfirmed
    );

    if (hasUnconfirmedPreliminary) {
      return NextResponse.json(
        { message: "예선 편성을 먼저 확정해주세요." },
        { status: 400 }
      );
    }

    const hasUnfinishedPreliminary = preliminaryMatches.some(
      (match) => !match.winnerTeamId
    );

    if (hasUnfinishedPreliminary) {
      return NextResponse.json(
        { message: "모든 예선 경기 결과를 먼저 등록해주세요." },
        { status: 400 }
      );
    }

    const hasTournamentMatches = tournament.matches.some(
      (match) => match.stage === "SEMI_FINAL" || match.stage === "FINAL"
    );

    if (hasTournamentMatches) {
      return NextResponse.json(
        { message: "이미 생성된 토너먼트 경기가 있습니다." },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: "본선 진출 팀과 4강 대진을 선택해주세요." },
        { status: 400 }
      );
    }

    const semiFinals =
      body && typeof body === "object" && "semiFinals" in body
        ? (body as { semiFinals?: unknown }).semiFinals
        : null;

    if (
      !Array.isArray(semiFinals) ||
      semiFinals.length !== 2 ||
      semiFinals.some(
        (match) =>
          !match ||
          typeof match !== "object" ||
          !Number.isInteger((match as { teamAId?: unknown }).teamAId) ||
          !Number.isInteger((match as { teamBId?: unknown }).teamBId)
      )
    ) {
      return NextResponse.json(
        { message: "4강 1경기와 2경기의 팀을 모두 선택해주세요." },
        { status: 400 }
      );
    }

    const selectedMatches = semiFinals as Array<{
      teamAId: number;
      teamBId: number;
    }>;
    const selectedTeamIds = selectedMatches.flatMap((match) => [
      match.teamAId,
      match.teamBId,
    ]);

    if (new Set(selectedTeamIds).size !== 4) {
      return NextResponse.json(
        { message: "본선 진출 4팀은 서로 다른 팀이어야 합니다." },
        { status: 400 }
      );
    }

    const tournamentTeamIds = new Set(tournament.teams.map((team) => team.id));
    if (selectedTeamIds.some((teamId) => !tournamentTeamIds.has(teamId))) {
      return NextResponse.json(
        { message: "이 멸망전에 참가하지 않은 팀이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const matchData: MatchCreateInput[] = [
      {
        tournamentId: id,
        stage: "SEMI_FINAL",
        round: 1,
        teamAId: selectedMatches[0].teamAId,
        teamBId: selectedMatches[0].teamBId,
        bestOf: 3,
        isConfirmed: true,
      },
      {
        tournamentId: id,
        stage: "SEMI_FINAL",
        round: 2,
        teamAId: selectedMatches[1].teamAId,
        teamBId: selectedMatches[1].teamBId,
        bestOf: 3,
        isConfirmed: true,
      },
    ];

    const result = await prisma.$transaction(async (tx) => {
      await tx.destructionMatch.createMany({
        data: matchData,
      });

      await tx.destructionTournament.update({
        where: {
          id,
        },
        data: {
          status: "TOURNAMENT",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_TOURNAMENT_BRACKET_CREATE",
          message: `멸망전 운영자 지정 4강 대진 생성: ${tournament.title} (${selectedMatches
            .map((match) => {
              const teamA = tournament.teams.find((team) => team.id === match.teamAId);
              const teamB = tournament.teams.find((team) => team.id === match.teamBId);
              return `${teamA?.name ?? match.teamAId} vs ${teamB?.name ?? match.teamBId}`;
            })
            .join(", ")})`,
        },
      });

      return tx.destructionMatch.findMany({
        where: {
          tournamentId: id,
          stage: "SEMI_FINAL",
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
    logServerError("[DESTRUCTION_TOURNAMENT_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 토너먼트 생성 실패" },
      { status: 500 }
    );
  }
}
