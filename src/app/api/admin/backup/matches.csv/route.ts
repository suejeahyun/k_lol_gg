export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { createCsvStreamResponse } from "@/lib/csv";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

export async function GET(req: Request) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

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

  async function* rows() {
    let cursorId: number | undefined;
    while (true) {
      const participants = await prisma.matchParticipant.findMany({
        orderBy: { id: "asc" },
        take: 500,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          team: true,
          position: true,
          kills: true,
          deaths: true,
          assists: true,
          player: { select: { name: true, nickname: true, tag: true } },
          champion: { select: { name: true } },
          game: {
            select: {
              gameNumber: true,
              winnerTeam: true,
              series: {
                select: {
                  id: true,
                  title: true,
                  matchDate: true,
                  season: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      for (const participant of participants) {
        yield [
          participant.game.series.id,
          participant.game.series.title,
          participant.game.series.season.name,
          participant.game.series.matchDate.toISOString(),
          participant.game.gameNumber,
          participant.game.winnerTeam,
          participant.team,
          participant.position,
          participant.player.name,
          `${participant.player.nickname}#${participant.player.tag}`,
          participant.champion.name,
          participant.kills,
          participant.deaths,
          participant.assists,
        ];
      }
      if (participants.length < 500) break;
      cursorId = participants.at(-1)?.id;
      if (!cursorId) break;
    }
  }

  return createCsvStreamResponse(
    `matches-${new Date().toISOString().slice(0, 10)}.csv`,
    ["seriesId", "title", "season", "matchDate", "gameNumber", "winnerTeam", "team", "position", "player", "riotId", "champion", "kills", "deaths", "assists"],
    rows(),
  );
}
