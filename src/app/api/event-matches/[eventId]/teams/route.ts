import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type EventMatchTeamsRouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type TeamInput = {
  name: string;
  seed?: number | null;
  memberPlayerIds: number[];
};

export async function POST(
  req: NextRequest,
  { params }: EventMatchTeamsRouteProps
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

    const teams: TeamInput[] = Array.isArray(body.teams) ? body.teams : [];

    if (teams.length < 2) {
      return NextResponse.json(
        { message: "팀은 최소 2개 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const allPlayerIds = teams.flatMap((team) => team.memberPlayerIds);

    if (allPlayerIds.length % 5 !== 0) {
      return NextResponse.json(
        { message: "전체 참가자는 5명 단위여야 합니다." },
        { status: 400 }
      );
    }

    const hasInvalidTeamSize = teams.some(
      (team) => team.memberPlayerIds.length !== 5
    );

    if (hasInvalidTeamSize) {
      return NextResponse.json(
        { message: "각 팀은 5명이어야 합니다." },
        { status: 400 }
      );
    }

    const duplicatedPlayerIds = allPlayerIds.filter(
      (playerId, index, arr) => arr.indexOf(playerId) !== index
    );

    if (duplicatedPlayerIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 팀원이 있습니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: {
        id,
      },
      include: {
        participants: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const registeredPlayerIds = event.participants.map(
      (participant) => participant.playerId
    );

    const hasUnregisteredPlayer = allPlayerIds.some(
      (playerId) => !registeredPlayerIds.includes(playerId)
    );

    if (hasUnregisteredPlayer) {
      return NextResponse.json(
        { message: "이벤트에 등록되지 않은 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const createdTeams = await prisma.$transaction(async (tx) => {
      await tx.eventTournamentMatch.deleteMany({
        where: {
          eventId: id,
        },
      });

      await tx.eventParticipant.updateMany({
        where: {
          eventId: id,
        },
        data: {
          teamId: null,
        },
      });

      await tx.eventTeam.deleteMany({
        where: {
          eventId: id,
        },
      });

      const result = [];

      for (let i = 0; i < teams.length; i += 1) {
        const team = teams[i];

        const createdTeam = await tx.eventTeam.create({
          data: {
            eventId: id,
            name: team.name || `${String.fromCharCode(65 + i)}팀`,
            seed: team.seed ?? i + 1,
          },
        });

        await tx.eventParticipant.updateMany({
          where: {
            eventId: id,
            playerId: {
              in: team.memberPlayerIds,
            },
          },
          data: {
            teamId: createdTeam.id,
          },
        });

        result.push(createdTeam);
      }

      await tx.eventMatch.update({
        where: {
          id,
        },
        data: {
          status: "TEAM_BUILDING",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_TEAMS_CREATE",
          message: `이벤트 내전 팀 생성: ${event.title}`,
        },
      });

      return result;
    });

    return NextResponse.json(createdTeams);
  } catch (error) {
    console.error("[EVENT_MATCH_TEAMS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 팀 생성 실패" },
      { status: 500 }
    );
  }
}