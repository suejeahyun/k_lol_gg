import { NextRequest } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { createCsvResponse } from "@/lib/csv";

type RankingPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

type RankingResponse = {
  rankings?: RankingPlayer[];
};

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const origin = req.nextUrl.origin;
  const seasonId = req.nextUrl.searchParams.get("seasonId");
  const res = await fetch(`${origin}/api/rankings${seasonId ? `?seasonId=${seasonId}` : ""}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as RankingResponse;

  return createCsvResponse(
    `rankings-${new Date().toISOString().slice(0, 10)}.csv`,
    ["playerId", "name", "riotId", "totalGames", "participationCount", "wins", "losses", "winRate", "mvpCount"],
    (data.rankings ?? []).map((player) => [
      player.playerId,
      player.name,
      `${player.nickname}#${player.tag}`,
      player.totalGames,
      player.participationCount,
      player.wins,
      player.losses,
      player.winRate,
      player.mvpCount,
    ]),
  );
}
