import { DestructionScrimRecruitStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { requireSiteFeature } from "@/lib/site/feature-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const scrims = await prisma.destructionScrimRecruit.findMany({
    where: {
      ...(status && status !== "ALL" ? { status: status as DestructionScrimRecruitStatus } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { requesterTeamName: { contains: q, mode: "insensitive" } },
              { opponentTeamName: { contains: q, mode: "insensitive" } },
              { memo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ ok: true, scrims });
}
