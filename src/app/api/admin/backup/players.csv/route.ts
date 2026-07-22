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
    message: "관리자 CSV 백업 다운로드: players.csv",
    actorId: admin.user.id,
    actorType: admin.user.role,
    actorUserId: admin.user.userId,
    targetType: "BackupCsv",
    afterJson: { file: "players.csv" },
    ...getRequestAuditFields(req),
  });

  async function* rows() {
    let cursorId: number | undefined;
    while (true) {
      const players = await prisma.player.findMany({
        orderBy: { id: "asc" },
        take: 500,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          name: true,
          nickname: true,
          tag: true,
          currentTier: true,
          peakTier: true,
          createdAt: true,
          userAccount: { select: { userId: true, status: true } },
        },
      });
      for (const player of players) {
        yield [
          player.id,
          player.name,
          player.nickname,
          player.tag,
          player.currentTier ?? "",
          player.peakTier ?? "",
          player.userAccount?.userId ?? "",
          player.userAccount?.status ?? "",
          player.createdAt.toISOString(),
        ];
      }
      if (players.length < 500) break;
      cursorId = players.at(-1)?.id;
      if (!cursorId) break;
    }
  }

  return createCsvStreamResponse(
    `players-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "name", "nickname", "tag", "currentTier", "peakTier", "userId", "userStatus", "createdAt"],
    rows(),
  );
}
