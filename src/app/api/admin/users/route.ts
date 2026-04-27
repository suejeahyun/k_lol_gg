import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {

    const users = await prisma.userAccount.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        player: true,
      },
    });

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        player: user.player
          ? {
              id: user.player.id,
              nickname: user.player.nickname,
              tag: user.player.tag,
              peakTier: user.player.peakTier,
              currentTier: user.player.currentTier,
            }
          : null,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
        if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
            { message: "로그인이 필요합니다." },
            { status: 401 }
        );
        }

        if (error.message === "FORBIDDEN") {
        return NextResponse.json(
            { message: "관리자 권한이 필요합니다." },
            { status: 403 }
        );
        }
    }

    console.error("[ERROR]", error);

    return NextResponse.json(
        { message: "오류 발생" },
        { status: 500 }
    );
    }
}