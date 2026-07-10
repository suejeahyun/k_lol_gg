import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

export async function GET() {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const [reviewCount, highRiskCount, profileCount, latestReviews, topProfiles] = await Promise.all([
    prisma.balanceMatchReview.count(),
    prisma.balanceMatchReview.count({ where: { aiRiskLevel: "HIGH" } }),
    prisma.playerBalanceProfile.count(),
    prisma.balanceMatchReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
    }),
    prisma.playerBalanceProfile.findMany({
      orderBy: { overallMmr: "desc" },
      take: 5,
      include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
    }),
  ]);

  const reviews = await prisma.balanceMatchReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      predictedRedWinRate: true,
      predictedBlueWinRate: true,
      actualWinner: true,
      aiInferredWinner: true,
      qualityScore: true,
      aiRiskLevel: true,
    },
  });

  const withPrediction = reviews.filter((review) => review.actualWinner && review.aiInferredWinner);
  const hitCount = withPrediction.filter((review) => review.actualWinner === review.aiInferredWinner).length;
  const averageQuality = reviews.length
    ? reviews.reduce((sum, review) => sum + (review.qualityScore ?? 0), 0) / reviews.length
    : 0;

  return NextResponse.json({
    reviewCount,
    highRiskCount,
    profileCount,
    predictionHitRate: withPrediction.length ? Number(((hitCount / withPrediction.length) * 100).toFixed(1)) : null,
    averageQuality: Number(averageQuality.toFixed(1)),
    latestReviews,
    topProfiles,
  });
}
