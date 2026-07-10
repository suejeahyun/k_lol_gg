import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = { params: Promise<{ reviewId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;
  const { reviewId } = await params;
  const id = Number(reviewId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "유효한 리뷰 ID가 아닙니다." }, { status: 400 });
  }

  const review = await prisma.balanceMatchReview.findUnique({
    where: { id },
    include: {
      matchSeries: {
        include: {
          season: { select: { id: true, name: true } },
          games: {
            orderBy: { gameNumber: "asc" },
            include: {
              participants: {
                include: {
                  player: { select: { id: true, name: true, nickname: true, tag: true } },
                  champion: { select: { id: true, name: true, imageUrl: true } },
                },
              },
            },
          },
        },
      },
      draft: { include: { players: { include: { player: true } } } },
    },
  });

  if (!review) return NextResponse.json({ message: "AI 리뷰를 찾을 수 없습니다." }, { status: 404 });

  const playerResults = await prisma.playerBalanceMatchResult.findMany({
    where: { matchSeriesId: review.matchSeriesId },
    orderBy: [{ gameId: "asc" }, { team: "asc" }, { position: "asc" }],
    include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
  });

  return NextResponse.json({ review, playerResults });
}
