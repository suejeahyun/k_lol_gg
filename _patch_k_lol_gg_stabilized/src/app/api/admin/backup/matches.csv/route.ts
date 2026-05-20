export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { createCsvResponse } from "@/lib/csv";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

export async function GET(req: Request) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const participants = await prisma.matchParticipant.findMany({
    orderBy: { id: "asc" },
    include: {
      player: true,
      champion: true,
      game: { include: { series: { include: { season: true } } } },
    },
  });

  await writeAdminLog({
    action: "BACKUP_CSV_DOWNLOAD",
    message: "관리자 CSV 백업 다운로드: matches.csv",
    actorId: admin.user.id,
    actorType: admin.user.role,
    actorUserId: admin.user.userId,
    targetType: "BackupCsv",
    afterJson: { file: "matches.csv" },
    ...getRequestAuditFields(req),
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
