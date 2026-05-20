export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { getCurrentSeasonId, recalculateSeasonStats } from "@/lib/stats/recalculate";

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const body = await req.json().catch(() => ({}));
    const requestedSeasonId = Number(body.seasonId ?? 0);
    const seasonId =
      Number.isInteger(requestedSeasonId) && requestedSeasonId > 0
        ? requestedSeasonId
        : await getCurrentSeasonId();

    if (!seasonId) {
      return NextResponse.json(
        { message: "활성 시즌이 없습니다." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const recalculated = await recalculateSeasonStats(seasonId, tx);

      await writeAdminLog({
        action: "STATS_RECALCULATE",
        message: `통계 재계산: ${recalculated.season.name} / 참가 데이터 ${recalculated.participants}건 / 플레이어 ${recalculated.playerStats}명`,
        db: tx,
      });

      return recalculated;
    });

    return NextResponse.json({
      message: "통계 재계산이 완료되었습니다.",
      result,
    });
  } catch (error) {
    console.error("[ADMIN_STATS_RECALCULATE_ERROR]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "통계 재계산 실패" },
      { status: 500 },
    );
  }
}
