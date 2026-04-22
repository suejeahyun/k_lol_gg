import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const trimmed = query.trim();

    if (!trimmed) {
      return NextResponse.json([]);
    }

    const players = await prisma.player.findMany({
      where: {
        name: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
      orderBy: [{ id: "desc" }],
      take: 8,
    });

    return NextResponse.json(players);
  } catch (error) {
    console.error("[PLAYER_SEARCH_GET_ERROR]", error);

    return NextResponse.json(
      { message: "플레이어 검색에 실패했습니다." },
      { status: 500 }
    );
  }
}