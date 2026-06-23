import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getCachedSeasonRankingPlayers } from "@/lib/stats/season-performance";
import { makeServerTiming, withTiming } from "@/lib/performance";
import { logServerError } from "@/lib/server/safe-log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const result = await withTiming("GET /api/rankings", async () => {
      const seasonIdParam = req.nextUrl.searchParams.get("seasonId");
      const seasonId = seasonIdParam ? Number(seasonIdParam) : null;

      const minParticipationParam = req.nextUrl.searchParams.get("minParticipation");
      const minParticipation = minParticipationParam === null
        ? 10
        : Math.max(0, Number(minParticipationParam) || 0);

      const currentSeason = seasonId
        ? await prisma.season.findUnique({
            where: {
              id: seasonId,
            },
          })
        : await prisma.season.findFirst({
            where: {
              isActive: true,
            },
            orderBy: {
              id: "desc",
            },
          });

      if (!currentSeason) {
        return {
          season: null,
          rankings: [],
        };
      }

      const rankings = (await getCachedSeasonRankingPlayers(currentSeason.id))
        .filter((player) => player.participationCount >= minParticipation)
        .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.mvpCount !== a.mvpCount) return b.mvpCount - a.mvpCount;
        return a.playerId - b.playerId;
      });

      return {
        season: {
          id: currentSeason.id,
          name: currentSeason.name,
          isActive: currentSeason.isActive,
          createdAt: currentSeason.createdAt,
        },
        rankings,
        meta: {
          minParticipation,
        },
      };
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "Server-Timing": makeServerTiming("rankings", startedAt),
      },
    });
  } catch (error) {
    logServerError("[RANKINGS_GET_ERROR]", error);

    return NextResponse.json(
      {
        message: "Failed to fetch rankings",
      },
      {
        status: 500,
      },
    );
  }
}

