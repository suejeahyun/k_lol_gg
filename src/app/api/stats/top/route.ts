export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { makeServerTiming, withTiming } from "@/lib/performance";
import { getCachedStatsTopData } from "@/lib/stats/top";

export async function GET() {
  const startedAt = Date.now();

  try {
    const data = await withTiming("GET /api/stats/top", async () => {
      return getCachedStatsTopData();
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        "Server-Timing": makeServerTiming("stats-top", startedAt),
      },
    });
  } catch (error) {
    console.error("[STATS_TOP_GET_ERROR]", error);
    return NextResponse.json(
      { message: "시즌 TOP 데이터 조회 실패" },
      { status: 500 },
    );
  }
}
