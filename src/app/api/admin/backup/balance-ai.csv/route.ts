export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotSuperAdmin } from "@/lib/auth/requireAdmin";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET() {
  const rejected = await rejectIfNotSuperAdmin();
  if (rejected) return rejected;

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
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balance-ai-reviews.csv"',
    },
  });
}
