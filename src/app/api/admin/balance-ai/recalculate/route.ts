export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { updateInternalMmrAfterMatch } from "@/lib/balance/internal-mmr";

export async function POST() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const matches = await prisma.matchSeries.findMany({
    orderBy: { matchDate: "asc" },
    include: {
      games: {
        orderBy: { gameNumber: "asc" },
        include: {
          participants: true,
        },
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.playerBalanceMatchResult.deleteMany();
    await tx.balanceMatchReview.deleteMany({ where: { selectedOptionType: "AI_INFERRED_MMR" } });
    await tx.playerBalanceProfile.deleteMany();

    for (const match of matches) {
      await updateInternalMmrAfterMatch(tx, match);
    }
  }, { timeout: 30000 });

  return NextResponse.json({
    message: "AI MMR 전체 재계산이 완료되었습니다.",
    analyzedMatchCount: matches.length,
  });
}
