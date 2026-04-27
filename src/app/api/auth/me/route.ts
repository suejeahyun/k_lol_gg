import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getCurrentUser();

    if (!session) {
      return NextResponse.json(
        { message: "로그인되어 있지 않습니다." },
        { status: 401 }
      );
    }

    const user = await prisma.userAccount.findUnique({
      where: { id: session.userAccountId },
      include: {
        player: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        player: user.player
          ? {
              id: user.player.id,
              nickname: user.player.nickname,
              tag: user.player.tag,
              peakTier: user.player.peakTier,
              currentTier: user.player.currentTier,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[AUTH_ME_GET_ERROR]", error);

    return NextResponse.json(
      { message: "유저 정보를 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}