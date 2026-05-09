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
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="balance-mmr.csv"',
    },
  });
}
