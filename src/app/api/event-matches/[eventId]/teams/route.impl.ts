export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

function getTierScore(tier: string | null): number {
  if (!tier) return 0;

  const value = tier.replace(/\s/g, "");

  if (value.includes("아이언")) return 10;
  if (value.includes("브론즈")) return 20;
  if (value.includes("실버")) return 30;
  if (value.includes("골드")) return 40;
  if (value.includes("플래티넘")) return 50;
  if (value.includes("에메랄드")) return 60;
  if (value.includes("다이아")) return 70;
  if (value.includes("마스터")) return 80;
  if (value.includes("그랜드마스터")) return 90;
  if (value.includes("챌린저")) return 100;

  return 0;
}

function getDivisionBonus(tier: string | null): number {
  if (!tier) return 0;

  const value = tier.replace(/\s/g, "");

  if (value.includes("1")) return 6;
  if (value.includes("2")) return 4;
  if (value.includes("3")) return 2;
  if (value.includes("4")) return 0;

  return 0;
}

function getPlayerBaseScore(player: {
  currentTier: string | null;
  peakTier: string | null;
}) {
  const currentScore =
    getTierScore(player.currentTier) + getDivisionBonus(player.currentTier);

  const peakScore =
    getTierScore(player.peakTier) + getDivisionBonus(player.peakTier);

  return currentScore * 0.5 + peakScore * 0.3;
}

function getWinRateScore(records: {
  team: "BLUE" | "RED";
  game: {
    winnerTeam: "BLUE" | "RED";
  };
}[]) {
  if (records.length === 0) return 0;

  const wins = records.filter(
    (record) => record.team === record.game.winnerTeam
  ).length;

  const winRate = wins / records.length;

  return winRate * 20;
}

function getTeamName(index: number) {
  return `${String.fromCharCode(65 + index)}팀`;
}


type TeamAssignmentInput = {
  participantId: number;
  teamId: number;
  balanceScore?: number;
  auctionPoint?: number;
};

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const parsedEventId = Number(eventId);

    if (Number.isNaN(parsedEventId)) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
        { status: 400 },
      );
    }

    const body = await req.json();
    const assignments: TeamAssignmentInput[] = Array.isArray(body.assignments)
      ? body.assignments
      : [];

    if (assignments.length === 0) {
      return NextResponse.json(
        { message: "팀 구성 데이터가 없습니다." },
        { status: 400 },
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id: parsedEventId },
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

    if (!event) {
      return NextResponse.json(
        { message: "이벤트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const hasSubmittedMatchResult = event.matches.some(
      (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
    );

    if (hasSubmittedMatchResult) {
      return NextResponse.json(
        { message: "이미 결과가 저장된 경기가 있어 팀 구성을 수정할 수 없습니다." },
        { status: 400 },
      );
    }

    const validTeamIds = event.teams.map((team) => team.id);
    const validParticipantIds = event.participants.map(
      (participant) => participant.id,
    );

    const hasInvalidTeam = assignments.some(
      (assignment) => !validTeamIds.includes(Number(assignment.teamId)),
    );

    if (hasInvalidTeam) {
      return NextResponse.json(
        { message: "이벤트에 속하지 않은 팀이 포함되어 있습니다." },
        { status: 400 },
      );
    }

    const hasInvalidParticipant = assignments.some(
      (assignment) =>
        !validParticipantIds.includes(Number(assignment.participantId)),
    );

    if (hasInvalidParticipant) {
      return NextResponse.json(
        { message: "이벤트에 속하지 않은 참가자가 포함되어 있습니다." },
        { status: 400 },
      );
    }

    const duplicatedParticipantIds = assignments
      .map((assignment) => Number(assignment.participantId))
      .filter(
        (participantId, index, arr) => arr.indexOf(participantId) !== index,
      );

    if (duplicatedParticipantIds.length > 0) {
      return NextResponse.json(
        { message: "중복 배정된 참가자가 있습니다." },
        { status: 400 },
      );
    }

    if (assignments.length !== event.participants.length) {
      return NextResponse.json(
        { message: "모든 참가자를 팀에 배정해야 합니다." },
        { status: 400 },
      );
    }

    const hasInvalidScore = assignments.some((assignment) => {
      const score = assignment.balanceScore ?? assignment.auctionPoint ?? 0;
      return Number.isNaN(Number(score));
    });

    if (hasInvalidScore) {
      return NextResponse.json(
        { message: "점수가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const teamMemberCounts = new Map<number, number>();

    assignments.forEach((assignment) => {
      const teamId = Number(assignment.teamId);
      teamMemberCounts.set(teamId, (teamMemberCounts.get(teamId) ?? 0) + 1);
    });

    const hasInvalidTeamSize = validTeamIds.some(
      (teamId) => (teamMemberCounts.get(teamId) ?? 0) !== 5,
    );

    if (hasInvalidTeamSize) {
      return NextResponse.json(
        { message: "이벤트 내전은 각 팀이 정확히 5명이어야 합니다." },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx.eventParticipant.update({
          where: {
            id: Number(assignment.participantId),
          },
          data: {
            teamId: Number(assignment.teamId),
            balanceScore: Number(
              assignment.balanceScore ?? assignment.auctionPoint ?? 0,
            ),
          },
        });
      }

      for (const teamId of validTeamIds) {
        const teamAssignments = assignments.filter(
          (assignment) => Number(assignment.teamId) === teamId,
        );

        const totalScore = teamAssignments.reduce((sum, assignment) => {
          return (
            sum + Number(assignment.balanceScore ?? assignment.auctionPoint ?? 0)
          );
        }, 0);

        await tx.eventTeam.update({
          where: {
            id: teamId,
          },
          data: {
            score: Math.round(totalScore * 100) / 100,
          },
        });
      }

      await tx.adminLog.create({
        data: {
          action: "EVENT_TEAMS_DRAG_UPDATE",
          message: `이벤트 팀 드래그 구성 저장: 이벤트 #${parsedEventId}`,
        },
      });
    });

    return NextResponse.json({ message: "팀 구성을 저장했습니다." });
  } catch (error) {
    logServerError("[EVENT_TEAM_DRAG_UPDATE_ERROR]", error);

    return NextResponse.json(
      { message: "팀 구성 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const parsedEventId = Number(eventId);

    if (Number.isNaN(parsedEventId)) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id: parsedEventId },
      include: {
        teams: true,
        participants: {
          include: {
            player: {
              include: {
                participants: {
                  select: {
                    team: true,
                    game: {
                      select: {
                        winnerTeam: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (event.teams.length > 0) {
      return NextResponse.json(
        { message: "이미 생성된 팀이 있습니다." },
        { status: 400 }
      );
    }

    if (event.participants.length === 0) {
      return NextResponse.json(
        { message: "참가자가 없습니다." },
        { status: 400 }
      );
    }

    if (event.participants.length % 5 !== 0) {
      return NextResponse.json(
        { message: "참가자 수가 5명의 배수일 때만 팀 생성이 가능합니다." },
        { status: 400 }
      );
    }

    const scoredParticipants = event.participants.map((participant) => {
      const baseScore = getPlayerBaseScore(participant.player);
      const winRateScore = getWinRateScore(participant.player.participants);

      const score = Math.round((baseScore + winRateScore) * 100) / 100;

      return {
        id: participant.id,
        playerId: participant.playerId,
        position: participant.position as Position | null,
        score,
      };
    });

    const teamCount = event.participants.length / 5;

    const buckets = Array.from({ length: teamCount }, () => ({
      totalScore: 0,
      members: [] as typeof scoredParticipants,
      positions: new Set<Position>(),
    }));

const sortedParticipants = [...scoredParticipants].sort(
  (a, b) => b.score - a.score
);

const teamCountForSnake = buckets.length;

let snakeIndex = 0;
let direction: 1 | -1 = 1;

for (const participant of sortedParticipants) {
  const targetBucket = buckets[snakeIndex];

  targetBucket.members.push(participant);
  targetBucket.totalScore += participant.score;

  if (participant.position) {
    targetBucket.positions.add(participant.position);
  }

  if (direction === 1) {
    snakeIndex += 1;

    if (snakeIndex >= teamCountForSnake) {
      snakeIndex = teamCountForSnake - 1;
      direction = -1;
    }
  } else {
    snakeIndex -= 1;

    if (snakeIndex < 0) {
      snakeIndex = 0;
      direction = 1;
    }
  }
}
    const invalidTeam = buckets.some((bucket) => bucket.members.length !== 5);

    if (invalidTeam) {
      return NextResponse.json(
        { message: "팀 인원 배정에 실패했습니다." },
        { status: 400 }
      );
    }

    await prisma.eventParticipant.updateMany({
      where: {
        eventId: parsedEventId,
      },
      data: {
        teamId: null,
      },
    });

    await Promise.all(
      scoredParticipants.map((participant) =>
        prisma.eventParticipant.update({
          where: {
            id: participant.id,
          },
          data: {
            balanceScore: participant.score,
          },
        })
      )
    );
    await prisma.eventTeam.deleteMany({
  where: {
    eventId: parsedEventId,
  },
});

    for (const [index, bucket] of buckets.entries()) {
      const team = await prisma.eventTeam.create({
        data: {
          eventId: parsedEventId,
          name: getTeamName(index),
          seed: index + 1,
          score: Math.round(bucket.totalScore * 100) / 100,
        },
      });

      await prisma.eventParticipant.updateMany({
        where: {
          id: {
            in: bucket.members.map((member) => member.id),
          },
        },
        data: {
          teamId: team.id,
        },
      });
    }
    await writeAdminLog({
      action: "EVENT_TEAMS_GENERATE",
      message: `이벤트 팀 자동 생성: 이벤트 #${parsedEventId}, ${teamCount}팀`,
    });

    return NextResponse.json({
      message: "팀 자동 생성 완료",
      teamCount,
    });
  } catch (error) {
    logServerError("[EVENT_TEAM_GENERATE_ERROR]", error);

    return NextResponse.json(
      { message: "팀 자동 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

