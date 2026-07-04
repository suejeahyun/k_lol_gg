export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { DestructionPreliminaryFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type Team = { id: number };

type MatchCreateInput = {
  tournamentId: number;
  stage: "PRELIMINARY";
  round: number;
  preliminaryGroup?: string | null;
  teamAId: number;
  teamBId: number;
  bestOf: number;
  isConfirmed?: boolean;
};

function getBestOf(format: DestructionPreliminaryFormat) {
  return format.endsWith("BO3") ? 3 : 1;
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pushPair(
  matches: MatchCreateInput[],
  tournamentId: number,
  teamAId: number,
  teamBId: number,
  bestOf: number,
  preliminaryGroup: string | null = null,
) {
  matches.push({
    tournamentId,
    stage: "PRELIMINARY",
    round: matches.length + 1,
    preliminaryGroup,
    teamAId,
    teamBId,
    bestOf,
    isConfirmed: false,
  });
}

function buildRoundRobinMatches(
  tournamentId: number,
  teams: Team[],
  bestOf: number,
  preliminaryGroup: string | null = null,
) {
  const matches: MatchCreateInput[] = [];
  for (let i = 0; i < teams.length; i += 1) {
    for (let j = i + 1; j < teams.length; j += 1) {
      pushPair(matches, tournamentId, teams[i].id, teams[j].id, bestOf, preliminaryGroup);
    }
  }
  return matches;
}

function buildGroupRoundRobinMatches(tournamentId: number, teams: Team[], bestOf: number) {
  const groupA = teams.filter((_, index) => index % 2 === 0);
  const groupB = teams.filter((_, index) => index % 2 === 1);
  return [
    ...buildRoundRobinMatches(tournamentId, groupA, bestOf, "A"),
    ...buildRoundRobinMatches(tournamentId, groupB, bestOf, "B"),
  ].map((match, index) => ({ ...match, round: index + 1 }));
}

function buildRandomRoundMatches(
  tournamentId: number,
  teams: Team[],
  bestOf: number,
  roundCount: number,
) {
  const matches: MatchCreateInput[] = [];
  const seen = new Set<string>();

  for (let round = 0; round < roundCount; round += 1) {
    const shuffled = shuffle(teams);

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      const teamA = shuffled[i];
      const teamB = shuffled[i + 1];
      const key = [teamA.id, teamB.id].sort((a, b) => a - b).join(":");

      if (seen.has(key) && teams.length > 2) continue;
      seen.add(key);
      pushPair(matches, tournamentId, teamA.id, teamB.id, bestOf);
    }
  }

  return matches;
}

function buildMatches({
  tournamentId,
  teams,
  format,
  roundCount,
}: {
  tournamentId: number;
  teams: Team[];
  format: DestructionPreliminaryFormat;
  roundCount: number;
}) {
  const bestOf = getBestOf(format);

  if (format.startsWith("FULL_ROUND_ROBIN")) {
    return buildRoundRobinMatches(tournamentId, teams, bestOf);
  }

  if (format.startsWith("GROUP_ROUND_ROBIN")) {
    return buildGroupRoundRobinMatches(tournamentId, teams, bestOf);
  }

  if (format.startsWith("SWISS_ROUND")) {
    return buildRandomRoundMatches(tournamentId, teams, bestOf, roundCount);
  }

  return buildRandomRoundMatches(tournamentId, teams, bestOf, roundCount);
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
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      include: {
        teams: {
          include: { members: true },
          orderBy: [{ points: "desc" }, { wins: "desc" }, { id: "asc" }],
        },
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.teams.length < 2) {
      return NextResponse.json(
        { message: "예선 생성을 위해 최소 2팀이 필요합니다." },
        { status: 400 },
      );
    }

    const hasInvalidTeamSize = tournament.teams.some((team) => team.members.length !== 5);

    if (hasInvalidTeamSize) {
      return NextResponse.json(
        { message: "각 팀은 5명으로 구성되어야 합니다." },
        { status: 400 },
      );
    }

    const hasPositionDuplicate = tournament.teams.some((team) => {
      const positions = team.members.map((member) => member.position);
      return new Set(positions).size !== positions.length;
    });

    if (hasPositionDuplicate) {
      return NextResponse.json(
        { message: "중복 포지션이 있는 팀은 예선을 생성할 수 없습니다." },
        { status: 400 },
      );
    }

    const hasExistingPreliminary = tournament.matches.some((match) => match.stage === "PRELIMINARY");

    if (hasExistingPreliminary) {
      return NextResponse.json(
        { message: "이미 생성된 예선 경기가 있습니다." },
        { status: 400 },
      );
    }

    const matchData = buildMatches({
      tournamentId: id,
      teams: tournament.teams,
      format: tournament.preliminaryFormat,
      roundCount: tournament.preliminaryRoundCount,
    });

    if (matchData.length === 0) {
      return NextResponse.json(
        { message: "생성 가능한 예선 경기가 없습니다." },
        { status: 400 },
      );
    }

    const teamGroupById = new Map<number, string | null>();
    tournament.teams.forEach((team) => teamGroupById.set(team.id, null));
    matchData.forEach((match) => {
      if (!match.preliminaryGroup) return;
      teamGroupById.set(match.teamAId, match.preliminaryGroup);
      teamGroupById.set(match.teamBId, match.preliminaryGroup);
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.destructionMatch.createMany({ data: matchData });

      for (const [teamId, preliminaryGroup] of teamGroupById.entries()) {
        await tx.destructionTeam.update({
          where: { id: teamId },
          data: { preliminaryGroup },
        });
      }

      await tx.destructionTournament.update({
        where: { id },
        data: { status: "PRELIMINARY" },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_PRELIMINARY_DRAFT_CREATE",
          message: `멸망전 예선 확정 전 편성 생성: ${tournament.title} / ${tournament.preliminaryFormat}`,
        },
      });

      return tx.destructionMatch.findMany({
        where: { tournamentId: id, stage: "PRELIMINARY" },
        include: { teamA: true, teamB: true },
        orderBy: [{ preliminaryGroup: "asc" }, { round: "asc" }],
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[DESTRUCTION_PRELIMINARY_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 예선 생성 실패" },
      { status: 500 },
    );
  }
}

