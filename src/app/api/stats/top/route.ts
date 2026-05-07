export const revalidate = 60;

import { NextResponse } from "next/server";
import { getCurrentAndPreviousSeason, getSeasonRankingPlayers } from "@/lib/stats/season-performance";
import { makeServerTiming, withTiming } from "@/lib/performance";

type SeasonDto = { id: number; name: string; isActive: boolean; createdAt: string };

function toSeasonDto(season: { id: number; name: string; isActive: boolean; createdAt: Date } | null): SeasonDto | null {
  if (!season) return null;
  return { id: season.id, name: season.name, isActive: season.isActive, createdAt: season.createdAt.toISOString() };
}

export async function GET() {
  const startedAt = Date.now();

  try {
    const data = await withTiming("GET /api/stats/top", async () => {
      const { currentSeason, previousSeason } = await getCurrentAndPreviousSeason();
      if (!currentSeason) {
        return { currentSeason: null, previousSeason: null, currentPlayers: [], previousPlayers: [] };
      }

      const [currentPlayers, previousPlayers] = await Promise.all([
        getSeasonRankingPlayers(currentSeason.id),
        previousSeason ? getSeasonRankingPlayers(previousSeason.id) : Promise.resolve([]),
      ]);

      return {
        currentSeason: toSeasonDto(currentSeason),
        previousSeason: toSeasonDto(previousSeason),
        currentPlayers,
        previousPlayers,
      };
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "Server-Timing": makeServerTiming("stats-top", startedAt),
      },
    });
  } catch (error) {
    console.error("[STATS_TOP_GET_ERROR]", error);
    return NextResponse.json({ message: "시즌 TOP 데이터 조회 실패" }, { status: 500 });
  }
}
