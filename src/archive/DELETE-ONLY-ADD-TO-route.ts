// 기존 src/app/api/participation/season/route.ts 파일 하단에 추가하세요.
// 핵심: prisma.seasonParticipation 이 아니라 prisma.seasonParticipationApply 를 사용합니다.
// 이 DELETE는 로그인 체크를 하지 않고, 오늘 참가자 목록에서 playerId 기준으로 삭제합니다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playerId = Number(body.playerId);

    if (Number.isNaN(playerId)) {
      return NextResponse.json(
        { message: "유효하지 않은 참가자입니다." },
        { status: 400 }
      );
    }

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "활성 시즌이 없습니다." },
        { status: 404 }
      );
    }

    const { start, end } = getTodayRange();

    const deleted = await prisma.seasonParticipationApply.deleteMany({
      where: {
        seasonId: season.id,
        playerId,
        applyDate: {
          gte: start,
          lte: end,
        },
        status: "APPLIED",
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { message: "오늘 참가 신청 내역이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "참가가 취소되었습니다.",
    });
  } catch (error: unknown) {
    console.error("[SEASON_PARTICIPATION_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "참가 취소 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
