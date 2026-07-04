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

type RankedTeam = {
  id: number;
  preliminaryGroup?: string | null;
  points: number;
  wins: number;
  losses: number;
};

function compareRankedTeams(a: RankedTeam, b: RankedTeam) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  return a.id - b.id;
}

function resolveSemiFinalTeams(teams: RankedTeam[]) {
  const groupedTeams = new Map<string, RankedTeam[]>();

  teams.forEach((team) => {
    if (!team.preliminaryGroup) return;

    const current = groupedTeams.get(team.preliminaryGroup) ?? [];
    current.push(team);
    groupedTeams.set(team.preliminaryGroup, current);
  });

  const groups = Array.from(groupedTeams.entries())
    .filter(([, groupTeams]) => groupTeams.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, groupTeams]) => ({
      group,
      teams: groupTeams.slice().sort(compareRankedTeams),
    }));

  if (groups.length === 2) {
    const [groupA, groupB] = groups;
    return [groupA.teams[0], groupB.teams[0], groupA.teams[1], groupB.teams[1]];
  }

  return teams.slice().sort(compareRankedTeams).slice(0, 4);
}

export async function POST(_req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

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

    const topTeams = resolveSemiFinalTeams(tournament.teams).slice(0, 4);

    if (topTeams.length < 4) {
      return NextResponse.json(
        { message: "본선 4강에 올릴 팀을 4개 확정할 수 없습니다." },
        { status: 400 }
      );
    }

    const matchData: MatchCreateInput[] = [
      {
        tournamentId: id,
        stage: "SEMI_FINAL",
        round: 1,
        teamAId: topTeams[0].id,
        teamBId: topTeams[3].id,
        bestOf: 3,
        isConfirmed: true,
      },
      {
        tournamentId: id,
        stage: "SEMI_FINAL",
        round: 2,
        teamAId: topTeams[1].id,
        teamBId: topTeams[2].id,
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
          message: `멸망전 상위 4팀 토너먼트 생성: ${tournament.title}`,
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

