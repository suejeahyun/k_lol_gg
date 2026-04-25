import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type TeamInput = {
  name: string;
  captainId: number;
};

export async function POST(req: NextRequest, { params }: RouteProps) {
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

    const teams: TeamInput[] = Array.isArray(body.teams) ? body.teams : [];

    if (teams.length < 2) {
      return NextResponse.json(
        { message: "팀은 최소 2개 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const captainIds = teams.map((team) => Number(team.captainId));

    const hasInvalidCaptain = captainIds.some((captainId) =>
      Number.isNaN(captainId)
    );

    if (hasInvalidCaptain) {
      return NextResponse.json(
        { message: "팀장 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const duplicatedCaptainIds = captainIds.filter(
      (captainId, index, arr) => arr.indexOf(captainId) !== index
    );

    if (duplicatedCaptainIds.length > 0) {
      return NextResponse.json(
        { message: "중복된 팀장이 있습니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        teams: true,
        matches: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (tournament.matches.length > 0) {
      return NextResponse.json(
        { message: "경기가 생성된 멸망전은 팀을 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const players = await prisma.player.findMany({
      where: {
        id: {
          in: captainIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (players.length !== captainIds.length) {
      return NextResponse.json(
        { message: "존재하지 않는 팀장이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const createdTeams = await prisma.$transaction(async (tx) => {
      await tx.destructionParticipant.updateMany({
        where: {
          tournamentId: id,
        },
        data: {
          teamId: null,
        },
      });

      await tx.destructionTeam.deleteMany({
        where: {
          tournamentId: id,
        },
      });

      const result = [];

      for (let i = 0; i < teams.length; i += 1) {
        const team = teams[i];

        const createdTeam = await tx.destructionTeam.create({
          data: {
            tournamentId: id,
            name: team.name?.trim() || `${String.fromCharCode(65 + i)}팀`,
            captainId: Number(team.captainId),
          },
        });

        await tx.destructionParticipant.upsert({
          where: {
            tournamentId_playerId: {
              tournamentId: id,
              playerId: Number(team.captainId),
            },
          },
          update: {
            teamId: createdTeam.id,
          },
          create: {
            tournamentId: id,
            teamId: createdTeam.id,
            playerId: Number(team.captainId),
            position: "TOP",
            balanceScore: 0,
          },
        });

        result.push(createdTeam);
      }

      await tx.destructionTournament.update({
        where: {
          id,
        },
        data: {
          status: "TEAM_BUILDING",
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_TEAMS_CREATE",
          message: `멸망전 팀장/팀 등록: ${tournament.title}`,
        },
      });

      return result;
    });

    return NextResponse.json(createdTeams);
  } catch (error) {
    console.error("[DESTRUCTION_TEAMS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 팀 등록 실패" },
      { status: 500 }
    );
  }
}