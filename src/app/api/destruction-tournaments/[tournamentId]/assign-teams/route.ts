import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type AssignedParticipant = {
  participantId: number;
  teamId: number;
  auctionPoint: number;
};

export async function PUT(req: NextRequest, { params }: RouteProps) {
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

    const assignments: AssignedParticipant[] = Array.isArray(body.assignments)
      ? body.assignments
      : [];

    if (assignments.length === 0) {
      return NextResponse.json(
        { message: "팀 배정 데이터가 없습니다." },
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

    if (tournament.matches.length > 0) {
      return NextResponse.json(
        { message: "경기가 생성된 멸망전은 팀 배정을 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const validTeamIds = tournament.teams.map((team) => team.id);
    const validParticipantIds = tournament.participants.map(
      (participant) => participant.id
    );

    const hasInvalidTeam = assignments.some(
      (assignment) => !validTeamIds.includes(Number(assignment.teamId))
    );

    if (hasInvalidTeam) {
      return NextResponse.json(
        { message: "멸망전에 속하지 않은 팀이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const hasInvalidParticipant = assignments.some(
      (assignment) =>
        !validParticipantIds.includes(Number(assignment.participantId))
    );

    if (hasInvalidParticipant) {
      return NextResponse.json(
        { message: "멸망전에 속하지 않은 참가자가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    const duplicatedParticipantIds = assignments
      .map((assignment) => Number(assignment.participantId))
      .filter(
        (participantId, index, arr) => arr.indexOf(participantId) !== index
      );

    if (duplicatedParticipantIds.length > 0) {
      return NextResponse.json(
        { message: "중복 배정된 참가자가 있습니다." },
        { status: 400 }
      );
    }

    const hasInvalidAuctionPoint = assignments.some((assignment) =>
      Number.isNaN(Number(assignment.auctionPoint))
    );

    if (hasInvalidAuctionPoint) {
      return NextResponse.json(
        { message: "경매 포인트가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const updatedTournament = await prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx.destructionParticipant.update({
          where: {
            id: Number(assignment.participantId),
          },
          data: {
            teamId: Number(assignment.teamId),
            balanceScore: Number(assignment.auctionPoint),
          },
        });
      }

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_ASSIGN_TEAMS",
          message: `멸망전 참가자 팀 배정: ${tournament.title}`,
        },
      });

      return tx.destructionTournament.findUnique({
        where: {
          id,
        },
        include: {
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
          matches: true,
        },
      });
    });

    return NextResponse.json(updatedTournament);
  } catch (error) {
    console.error("[DESTRUCTION_ASSIGN_TEAMS_PUT_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 팀 배정 실패" },
      { status: 500 }
    );
  }
}