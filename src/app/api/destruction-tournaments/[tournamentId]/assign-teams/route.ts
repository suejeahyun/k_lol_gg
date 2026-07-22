export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { readJsonObject } from "@/lib/http/json-body";

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

const MAX_ASSIGNMENTS = 100;
const MAX_AUCTION_POINT = 1_000_000;

export async function PUT(req: NextRequest, { params }: RouteProps) {
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

    const body = await readJsonObject<Record<string, unknown>>(req);
    if (!body) {
      return NextResponse.json({ message: "올바른 JSON 요청 본문이 필요합니다." }, { status: 400 });
    }

    const assignments: AssignedParticipant[] = Array.isArray(body.assignments)
      ? body.assignments
      : [];

    if (assignments.length === 0) {
      return NextResponse.json(
        { message: "팀 배정 데이터가 없습니다." },
        { status: 400 }
      );
    }

    if (assignments.length > MAX_ASSIGNMENTS) {
      return NextResponse.json(
        { message: `한 번에 최대 ${MAX_ASSIGNMENTS}명까지 배정할 수 있습니다.` },
        { status: 400 },
      );
    }

    const hasInvalidAssignmentId = assignments.some(
      (assignment) =>
        !Number.isInteger(Number(assignment.participantId)) ||
        Number(assignment.participantId) <= 0 ||
        !Number.isInteger(Number(assignment.teamId)) ||
        Number(assignment.teamId) <= 0,
    );
    if (hasInvalidAssignmentId) {
      return NextResponse.json(
        { message: "참가자 또는 팀 정보가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        teams: true,
        participants: true,
        matches: {
          select: {
            id: true,
            winnerTeamId: true,
            mvpPlayerId: true,
          },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const hasSubmittedMatchResult = tournament.matches.some(
      (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
    );

    if (hasSubmittedMatchResult) {
      return NextResponse.json(
        { message: "이미 결과가 저장된 경기가 있어 팀 배정을 수정할 수 없습니다." },
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

    const hasInvalidAuctionPoint = assignments.some((assignment) => {
      const point = Number(assignment.auctionPoint);
      return !Number.isFinite(point) || point < 0 || point > MAX_AUCTION_POINT;
    });

    if (hasInvalidAuctionPoint) {
      return NextResponse.json(
        { message: `경매 포인트는 0~${MAX_AUCTION_POINT.toLocaleString("ko-KR")} 범위여야 합니다.` },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      ...assignments.map((assignment) =>
        prisma.destructionParticipant.update({
          where: {
            id: Number(assignment.participantId),
          },
          data: {
            teamId: Number(assignment.teamId),
            balanceScore: Number(assignment.auctionPoint),
          },
        })
      ),

      prisma.adminLog.create({
        data: {
          action: "DESTRUCTION_ASSIGN_TEAMS",
          message: `멸망전 참가자 팀 배정: ${tournament.title}`,
        },
      }),
    ]);

    const updatedTournament = await prisma.destructionTournament.findUnique({
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
        matches: {
          select: {
            id: true,
            winnerTeamId: true,
            mvpPlayerId: true,
          },
        },
      },
    });

    return NextResponse.json(updatedTournament);
  } catch (error) {
    logServerError("[DESTRUCTION_ASSIGN_TEAMS_PUT_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 팀 배정 실패" },
      { status: 500 }
    );
  }
}

