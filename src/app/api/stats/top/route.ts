import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "10");

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize =
      Number.isNaN(pageSize) || pageSize < 1 ? 10 : pageSize;

    const skip = (safePage - 1) * safePageSize;

    const [players, totalCount] = await Promise.all([
      prisma.player.findMany({
        include: {
          participants: {
            select: {
              kills: true,
              deaths: true,
              assists: true,
              gold: true,
              team: true,
              game: {
                select: {
                  winnerTeam: true,
                },
              },
            },
          },
        },
      }),
      prisma.player.count(),
    ]);

    const mapped = players.map((p: (typeof players)[number]) => {
      const totalGames = p.participants.length;

      const wins = p.participants.filter(
        (pt: (typeof p.participants)[number]) =>
          pt.team === pt.game.winnerTeam
      ).length;

      const totalKills = p.participants.reduce(
        (s: number, v: (typeof p.participants)[number]) => s + v.kills,
        0
      );

      const totalDeaths = p.participants.reduce(
        (s: number, v: (typeof p.participants)[number]) => s + v.deaths,
        0
      );

      const totalAssists = p.participants.reduce(
        (s: number, v: (typeof p.participants)[number]) => s + v.assists,
        0
      );

      const totalGold = p.participants.reduce(
        (s: number, v: (typeof p.participants)[number]) => s + v.gold,
        0
      );

      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

      const kda =
        totalDeaths === 0
          ? Number((totalKills + totalAssists).toFixed(2))
          : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

      const avgGold = totalGames > 0 ? Math.round(totalGold / totalGames) : 0;

      return {
        id: p.id,
        name: p.name,
        nickname: p.nickname ?? "",
        tag: p.tag ?? "",
        totalGames,
        winRate,
        kda,
        avgGold,
      };
    });

    const sorted = mapped.sort(
      (a: (typeof mapped)[number], b: (typeof mapped)[number]) =>
        b.winRate - a.winRate
    );

    const paged = sorted.slice(skip, skip + safePageSize);

    return NextResponse.json({
      data: paged,
      totalCount,
    });
  } catch (error) {
    console.error("[TOP_STATS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to fetch top stats" },
      { status: 500 }
    );
  }
}