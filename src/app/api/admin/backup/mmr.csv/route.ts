export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request) {
  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const items = await prisma.playerBalanceProfile.findMany({
    orderBy: { overallMmr: "desc" },
    include: { player: { select: { id: true, name: true, nickname: true, tag: true } } },
  });

  const header = ["playerId", "name", "nickname", "tag", "overallMmr", "topMmr", "jungleMmr", "midMmr", "adcMmr", "supportMmr", "confidence", "matchesAnalyzed", "updatedAt"];
  const rows = items.map((item) => [
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
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
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

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balance-mmr.csv"',
    },
  });
}
