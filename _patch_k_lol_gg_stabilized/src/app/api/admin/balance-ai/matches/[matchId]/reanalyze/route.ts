export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { updateInternalMmrAfterMatch } from "@/lib/balance/internal-mmr";

type RouteContext = { params: Promise<{ matchId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;
  const { matchId } = await params;
  const id = Number(matchId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "유효한 내전 ID가 아닙니다." }, { status: 400 });
  }

  const match = await prisma.matchSeries.findUnique({
    where: { id },
    include: { games: { orderBy: { gameNumber: "asc" }, include: { participants: true } } },
  });

  if (!match) return NextResponse.json({ message: "내전을 찾을 수 없습니다." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.playerBalanceMatchResult.deleteMany({ where: { matchSeriesId: id } });
    await tx.balanceMatchReview.deleteMany({ where: { matchSeriesId: id } });
    await updateInternalMmrAfterMatch(tx, match);
  }, { timeout: 30000 });

  return NextResponse.json({ message: "해당 내전 AI 재분석이 완료되었습니다." });
}
