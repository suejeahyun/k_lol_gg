import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { EventTournamentStage } from "@prisma/client";

type RouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type MatchCreateInput = {
  eventId: number;
  stage: EventTournamentStage;
  round: number;
  teamAId: number;
  teamBId: number;
};

function getStageByTeamCount(teamCount: number): EventTournamentStage {
  if (teamCount <= 2) return "FINAL";
  if (teamCount <= 4) return "SEMI_FINAL";
  if (teamCount <= 8) return "QUARTER_FINAL";
  if (teamCount <= 16) return "ROUND_OF_16";
  return "ROUND_OF_32";
}

export async function POST(_req: NextRequest, { params }: RouteProps) {
  try {
    const { eventId } = await params;
    const id = Number(eventId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "이벤트 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      include: {
        teams: {
          orderBy: {
            seed: "asc",
          },
        },
        matches: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (event.teams.length < 2) {
      return NextResponse.json(
        { message: "대진 생성을 위해 최소 2팀이 필요합니다." },
        { status: 400 }
      );
    }

    if (event.matches.length > 0) {
      return NextResponse.json(
        { message: "이미 생성된 대진이 있습니다." },
        { status: 400 }
      );
    }

    const stage = getStageByTeamCount(event.teams.length);
    const teams = event.teams;
    const matchData: MatchCreateInput[] = [];

    for (let i = 0; i < teams.length; i += 2) {
      const teamA = teams[i];
      const teamB = teams[i + 1];

      if (!teamB) {
        continue;
      }

      matchData.push({
        eventId: id,
        stage,
        round: Math.floor(i / 2) + 1,
        teamAId: teamA.id,
        teamBId: teamB.id,
      });
    }

    if (matchData.length === 0) {
      return NextResponse.json(
        { message: "생성 가능한 대진이 없습니다." },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.eventTournamentMatch.createMany({
        data: matchData,
      });

      await tx.eventMatch.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_BRACKET_CREATE",
          message: `이벤트 내전 대진 생성: ${event.title}`,
        },
      });

      return tx.eventTournamentMatch.findMany({
        where: {
          eventId: id,
        },
        include: {
          teamA: true,
          teamB: true,
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[EVENT_BRACKET_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 대진 생성 실패" },
      { status: 500 }
    );
  }
}