import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const exclude = req.nextUrl.searchParams.get("exclude")?.trim() ?? "";

    if (!q) {
      return NextResponse.json([]);
    }

    const excludeIds = exclude
      ? exclude
          .split(",")
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];

    const players = await prisma.player.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
        },
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
    console.error("[PLAYERS_BALANCE_SEARCH_GET_ERROR]", error);
    return NextResponse.json([], { status: 200 });
  }
}