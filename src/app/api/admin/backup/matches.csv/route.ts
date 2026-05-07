export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { createCsvResponse } from "@/lib/csv";

export async function GET() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const participants = await prisma.matchParticipant.findMany({
    orderBy: { id: "asc" },
    include: {
      player: true,
      champion: true,
      game: { include: { series: { include: { season: true } } } },
    },
  });

  return createCsvResponse(
    `matches-${new Date().toISOString().slice(0, 10)}.csv`,
    ["seriesId", "title", "season", "matchDate", "gameNumber", "winnerTeam", "team", "position", "player", "riotId", "champion", "kills", "deaths", "assists"],
    participants.map((p) => [
      p.game.series.id,
      p.game.series.title,
      p.game.series.season.name,
      p.game.series.matchDate.toISOString(),
      p.game.gameNumber,
      p.game.winnerTeam,
      p.team,
      p.position,
      p.player.name,
      `${p.player.nickname}#${p.player.tag}`,
      p.champion.name,
      p.kills,
      p.deaths,
      p.assists,
    ]),
  );
}
