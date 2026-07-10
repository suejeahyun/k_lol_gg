import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import type { Position, Team } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { rebuildInternalMmr } from "@/lib/balance/internal-mmr";

const MAX_TRAINING_GAMES = Number(process.env.BALANCE_RECOMMENDATION_TRAIN_GAME_LIMIT ?? "10000");

const CORE_ROLE_PAIRS = [
  ["ADC", "SUP"],
  ["JGL", "MID"],
  ["JGL", "TOP"],
  ["JGL", "ADC"],
  ["JGL", "SUP"],
  ["MID", "SUP"],
] as const satisfies ReadonlyArray<readonly [Position, Position]>;

type TeamParticipants = Array<{
  playerId: number;
  team: Team;
  position: Position;
}>;

function countCoreRolePairSamples(participants: TeamParticipants) {
  let count = 0;

  for (const team of ["RED", "BLUE"] as Team[]) {
    const teamParticipants = participants.filter((participant) => participant.team === team);

    for (const [left, right] of CORE_ROLE_PAIRS) {
      const hasLeft = teamParticipants.some((participant) => participant.position === left);
      const hasRight = teamParticipants.some((participant) => participant.position === right);
      if (hasLeft && hasRight) count += 1;
    }
  }

  return count;
}

async function getRecommendationSourceStats() {
  const [matchCount, gameCount, participantCount, championPositionGroups, games] = await Promise.all([
    prisma.matchSeries.count(),
    prisma.matchGame.count(),
    prisma.matchParticipant.count(),
    prisma.matchParticipant.groupBy({
      by: ["playerId", "championId", "position"],
      _count: { _all: true },
    }),
    prisma.matchGame.findMany({
      orderBy: { id: "desc" },
      take: Number.isFinite(MAX_TRAINING_GAMES) && MAX_TRAINING_GAMES > 0 ? MAX_TRAINING_GAMES : 10000,
      select: {
        participants: {
          select: {
            playerId: true,
            team: true,
            position: true,
          },
        },
      },
    }),
  ]);

  const rolePairSampleCount = games.reduce(
    (sum, game) => sum + countCoreRolePairSamples(game.participants),
    0,
  );

  return {
    matchCount,
    gameCount,
    participantCount,
    championPositionSampleCount: championPositionGroups.length,
    rolePairSampleCount,
  };
}

export async function POST() {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const sourceStatsBefore = await getRecommendationSourceStats();

  const analyzedMatchCount = await prisma.$transaction(
    async (tx) => rebuildInternalMmr(tx),
    { timeout: 60000 },
  );

  await prisma.adminLog.create({
    data: {
      action: "BALANCE_RECOMMENDATION_TRAIN",
      message: `등록 내전 AI 학습 실행: 내전 ${analyzedMatchCount}개, 세트 ${sourceStatsBefore.gameCount}개, 참가 기록 ${sourceStatsBefore.participantCount}개`,
      targetType: "BALANCE_RECOMMENDATION",
      afterJson: sourceStatsBefore,
    },
  }).catch(() => null);

  return NextResponse.json({
    message: "등록된 내전 기반 AI 학습이 완료되었습니다.",
    analyzedMatchCount,
    ...sourceStatsBefore,
    learnedTargets: [
      "AI MMR",
      "경기별 AI 리뷰",
      "플레이어별 포지션 MMR",
      "밴픽 추천용 챔피언·포지션 표본 확인",
      "핵심 포지션 페어 표본 확인",
    ],
  });
}
