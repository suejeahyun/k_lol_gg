import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { getKstDateKey, getTodayKstRange } from "@/lib/date/kst";
import { prisma } from "@/lib/prisma/client";

const MAX_DAILY_SEASON_APPLIES = 100;

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { start, end } = getTodayKstRange();

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "현재 활성 시즌이 없습니다." },
        { status: 404 },
      );
    }

    const applies = await prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: season.id,
        applyDate: {
          gte: start,
          lte: end,
        },
        status: "APPLIED",
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
            tag: true,
            peakTier: true,
            currentTier: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: MAX_DAILY_SEASON_APPLIES,
    });

    return NextResponse.json({
      season,
      applyDate: getKstDateKey(start),
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      players: applies.map((apply) => apply.player),
    });
  } catch (error: unknown) {
    logServerError("[ADMIN_SEASON_PARTICIPATION_APPLIES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "시즌내전 참가 신청자 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
