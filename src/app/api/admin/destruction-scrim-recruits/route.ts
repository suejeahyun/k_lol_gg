export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { DestructionScrimRecruitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
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
