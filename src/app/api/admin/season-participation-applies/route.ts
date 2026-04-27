import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

function getTodayStart() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function GET() {
  try {
    const today = getTodayStart();

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
        { status: 404 }
      );
    }

    const applies = await prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: season.id,
        applyDate: today,
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
    });

    return NextResponse.json({
      season,
      applyDate: today,
      players: applies.map((apply) => apply.player),
    });
  } catch (error: unknown) {
    console.error("[ADMIN_SEASON_PARTICIPATION_APPLIES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "시즌내전 참가 신청자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}