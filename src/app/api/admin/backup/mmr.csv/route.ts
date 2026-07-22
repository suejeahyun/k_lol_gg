export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { createCsvStreamResponse } from "@/lib/csv";

export async function GET(req: Request) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  await writeAdminLog({
    action: "BACKUP_CSV_DOWNLOAD",
    message: "관리자 CSV 백업 다운로드: mmr.csv",
    actorId: admin.user.id,
    actorType: admin.user.role,
    actorUserId: admin.user.userId,
    targetType: "BackupCsv",
    afterJson: { file: "mmr.csv" },
    ...getRequestAuditFields(req),
  });

  async function* rows() {
    let cursorId: number | undefined;
    while (true) {
      const items = await prisma.playerBalanceProfile.findMany({
        orderBy: { id: "asc" },
        take: 500,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
      });
      for (const item of items) {
        yield [
          item.playerId,
          item.player.name,
          item.player.nickname,
          item.player.tag,
          item.overallMmr,
          item.topMmr,
          item.jungleMmr,
          item.midMmr,
          item.adcMmr,
          item.supportMmr,
          item.confidence,
          item.matchesAnalyzed,
          item.updatedAt.toISOString(),
        ];
      }
      if (items.length < 500) break;
      cursorId = items.at(-1)?.id;
      if (!cursorId) break;
    }
  }

  return createCsvStreamResponse(
    "balance-mmr.csv",
    ["playerId", "name", "nickname", "tag", "overallMmr", "topMmr", "jungleMmr", "midMmr", "adcMmr", "supportMmr", "confidence", "matchesAnalyzed", "updatedAt"],
    rows(),
  );
}
