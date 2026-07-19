import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const exclude = req.nextUrl.searchParams.get("exclude")?.trim() ?? "";

    if (!q) {
      return NextResponse.json([]);
    }

    if (q.length > 100) {
      return NextResponse.json(
        { message: "검색어는 100자 이하로 입력해주세요." },
        { status: 400 },
      );
    }

    const excludeIds = exclude
      ? exclude
          .split(",")
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];

    const players = await prisma.player.findMany({
      where: {
        isActive: true,
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            nickname: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            tag: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
        ...(excludeIds.length > 0
          ? {
              id: {
                notIn: excludeIds,
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        currentTier: true,
        peakTier: true,
      },
      orderBy: [{ name: "asc" }, { nickname: "asc" }],
      take: 8,
    });

    return NextResponse.json(players);
  } catch (error) {
    logServerError("[PLAYERS_BALANCE_SEARCH_GET_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 검색 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
