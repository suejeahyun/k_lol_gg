import { requireSiteFeature } from "@/lib/site/feature-guard";
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
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  const items = await prisma.balanceMatchReview.findMany({
    orderBy: { createdAt: "desc" },
    include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
  });

  const header = ["reviewId", "matchSeriesId", "title", "matchDate", "predictedRedWinRate", "predictedBlueWinRate", "actualWinner", "qualityScore", "aiRiskLevel", "aiConfidence", "aiInferredWinner", "aiVerdict", "aiRiskFactors", "createdAt"];
  const rows = items.map((item) => [
    item.id,
    item.matchSeriesId,
    item.matchSeries.title,
    item.matchSeries.matchDate.toISOString(),
    item.predictedRedWinRate,
    item.predictedBlueWinRate,
    item.actualWinner,
    item.qualityScore,
    item.aiRiskLevel,
    item.aiConfidence,
    item.aiInferredWinner,
    item.aiVerdict,
    item.aiRiskFactors,
    item.createdAt.toISOString(),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  await writeAdminLog({
    action: "BACKUP_CSV_DOWNLOAD",
    message: "관리자 CSV 백업 다운로드: balance-ai.csv",
    actorId: admin.user.id,
    actorType: admin.user.role,
    actorUserId: admin.user.userId,
    targetType: "BackupCsv",
    afterJson: { file: "balance-ai.csv" },
    ...getRequestAuditFields(req),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balance-ai-reviews.csv"',
    },
  });
}
