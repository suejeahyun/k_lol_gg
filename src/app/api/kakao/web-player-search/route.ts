export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getPlayerRecordForKakao } from "@/features/player/services/getPlayerRecordForKakao";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server/safe-log";

function roundOne(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : 0;
}

export async function GET(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_WEB_PLAYER_SEARCH",
    limit: 30,
    windowSeconds: 300,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const query = req.nextUrl.searchParams.get("query") ?? req.nextUrl.searchParams.get("q") ?? "";
    const record = await getPlayerRecordForKakao(query);

    if (!record) {
      return NextResponse.json(
        { ok: false, message: "검색 결과가 없습니다. 닉네임#태그를 확인해주세요." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const totalGames = record.totalGames || 0;

    return NextResponse.json(
      {
        ok: true,
        playerId: record.playerId,
        name: record.name ?? record.nickname,
        nickname: record.nickname,
        tag: record.tag,
        totalGames,
        participationCount: record.participationCount,
        wins: record.wins,
        losses: record.losses,
        winRate: roundOne(record.winRate),
        mvpCount: record.mvpCount,
        avgKills: totalGames > 0 ? roundOne(record.kills / totalGames) : 0,
        avgDeaths: totalGames > 0 ? roundOne(record.deaths / totalGames) : 0,
        avgAssists: totalGames > 0 ? roundOne(record.assists / totalGames) : 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("[KAKAO_WEB_PLAYER_SEARCH_GET_ERROR]", error, { endpoint: "/api/kakao/web-player-search" });

    return NextResponse.json(
      { ok: false, message: "플레이어 조회 중 오류가 발생했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
