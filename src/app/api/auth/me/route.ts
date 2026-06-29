import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getCurrentUser();

    if (!session) {
      return NextResponse.json(
        { user: null },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        },
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
        { user: null },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
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
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    logServerError("[AUTH_ME_GET_ERROR]", error);

    return NextResponse.json(
      { message: "유저 정보를 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
