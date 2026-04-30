import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

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

export async function POST(_req: NextRequest, { params }: RouteContext) {
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
    return NextResponse.json({
      message: "팀 자동 생성 완료",
      teamCount,
    });
  } catch (error) {
    console.error("[EVENT_TEAM_GENERATE_ERROR]", error);

    return NextResponse.json(
      { message: "팀 자동 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}