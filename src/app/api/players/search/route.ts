import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

function buildPlayerSearchWhere(query: string) {
  const trimmed = query.trim();

  if (!trimmed) return {};

  const normalized = trimmed.replace(/\s+/g, "");
  const parts = normalized.split("#").filter(Boolean);

  if (parts.length >= 2) {
    const nicknamePart = parts[0];
    const tagPart = parts.slice(1).join("#");

    return {
      OR: [
        {
          AND: [
            {
              nickname: {
                contains: nicknamePart,
                mode: "insensitive" as const,
              },
            },
            {
              tag: {
                contains: tagPart,
                mode: "insensitive" as const,
              },
            },
          ],
        },
        {
          name: {
            contains: trimmed,
            mode: "insensitive" as const,
          },
        },
      ],
    };
  }

  return {
    OR: [
      {
        name: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
      {
        nickname: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
      {
        tag: {
          contains: trimmed,
          mode: "insensitive" as const,
        },
      },
    ],
  };
}

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";

    if (!query.trim()) {
      return NextResponse.json([]);
    }

    const players = await prisma.player.findMany({
      where: buildPlayerSearchWhere(query),
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
      take: 8,
    });

    return NextResponse.json(players);
  } catch (error) {
    console.error("[PLAYER_SEARCH_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to search players" },
      { status: 500 }
    );
  }
}