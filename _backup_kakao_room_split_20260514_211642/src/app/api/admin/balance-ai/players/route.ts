export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

const SORT_FIELDS = new Set(["overallMmr", "topMmr", "jungleMmr", "midMmr", "adcMmr", "supportMmr", "confidence", "matchesAnalyzed"]);

export async function GET(request: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "overallMmr";
  const safeSort = SORT_FIELDS.has(sort) ? sort : "overallMmr";
  const q = searchParams.get("q")?.trim() ?? "";
  const where = q
    ? {
        player: {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nickname: { contains: q, mode: "insensitive" as const } },
            { tag: { contains: q, mode: "insensitive" as const } },
          ],
        },
      }
    : {};

  const [totalCount, items] = await Promise.all([
    prisma.playerBalanceProfile.count({ where }),
    prisma.playerBalanceProfile.findMany({
      where,
      orderBy: { [safeSort]: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { player: { select: { id: true, name: true, nickname: true, tag: true, currentTier: true, peakTier: true, balanceOverrideScore: true } } },
    }),
  ]);

  return NextResponse.json({
    items,
    pagination: { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) },
  });
}
