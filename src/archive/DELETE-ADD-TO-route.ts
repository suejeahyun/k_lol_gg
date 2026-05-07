// 이 코드는 src/app/api/participation/season/route.ts 파일에 추가하세요.
// 기존 GET, POST는 유지하고 아래 DELETE만 추가하면 됩니다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const playerId = Number(body.playerId);

    if (Number.isNaN(playerId)) {
      return NextResponse.json(
        { message: "유효하지 않은 참가자입니다." },
        { status: 400 }
      );
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const deleted = await prisma.seasonParticipationApply.deleteMany({
      where: {
        playerId,
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
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
