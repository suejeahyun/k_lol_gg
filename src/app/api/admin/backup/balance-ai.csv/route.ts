import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { createCsvStreamResponse } from "@/lib/csv";

export async function GET(req: Request) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const admin = await requireSuperAdminRequest();
  if (!admin) {
    return Response.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

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

  async function* rows() {
    let cursorId: number | undefined;
    while (true) {
      const items = await prisma.balanceMatchReview.findMany({
        orderBy: { id: "asc" },
        take: 500,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
      });
      for (const item of items) {
        yield [
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
        ];
      }
      if (items.length < 500) break;
      cursorId = items.at(-1)?.id;
      if (!cursorId) break;
    }
  }

  return createCsvStreamResponse(
    "balance-ai-reviews.csv",
    ["reviewId", "matchSeriesId", "title", "matchDate", "predictedRedWinRate", "predictedBlueWinRate", "actualWinner", "qualityScore", "aiRiskLevel", "aiConfidence", "aiInferredWinner", "aiVerdict", "aiRiskFactors", "createdAt"],
    rows(),
  );
}
