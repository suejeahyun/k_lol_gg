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

  const players = await prisma.player.findMany({
    orderBy: { id: "asc" },
    include: { userAccount: { select: { userId: true, status: true } } },
  });

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

  return createCsvResponse(
    `players-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "name", "nickname", "tag", "currentTier", "peakTier", "userId", "userStatus", "createdAt"],
    players.map((player) => [
      player.id,
      player.name,
      player.nickname,
      player.tag,
      player.currentTier ?? "",
      player.peakTier ?? "",
      player.userAccount?.userId ?? "",
      player.userAccount?.status ?? "",
      player.createdAt.toISOString(),
    ]),
  );
}
