import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { Prisma } from "@prisma/client";

function buildPlayerSearchWhere(query: string): Prisma.PlayerWhereInput {
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
                mode: "insensitive",
              },
            },
            {
              tag: {
                contains: tagPart,
                mode: "insensitive",
              },
            },
          ],
        },
        {
          name: {
            contains: trimmed,
            mode: "insensitive",
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
          mode: "insensitive",
        },
      },
      {
        nickname: {
          contains: trimmed,
          mode: "insensitive",
        },
      },
      {
        tag: {
          contains: trimmed,
          mode: "insensitive",
        },
      },
    ],
  };
}

export async function GET(request: NextRequest) {
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
}