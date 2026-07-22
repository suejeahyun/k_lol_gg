import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { parseIntegerInRange, parsePositivePage } from "@/lib/http/pagination";

export async function GET(request: NextRequest) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const { searchParams } = new URL(request.url);
  const page = parsePositivePage(searchParams.get("page"));
  const pageSize = parseIntegerInRange(searchParams.get("pageSize"), 20, 10, 100);
  const risk = searchParams.get("risk")?.trim();
  const where = risk ? { aiRiskLevel: risk } : {};

  const [totalCount, items] = await Promise.all([
    prisma.balanceMatchReview.count({ where }),
    prisma.balanceMatchReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        matchSeries: { select: { id: true, title: true, matchDate: true } },
        draft: { select: { id: true, title: true, optionType: true } },
      },
    }),
  ]);

  return NextResponse.json({
    items,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  });
}
