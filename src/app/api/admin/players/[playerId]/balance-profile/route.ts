import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = { params: Promise<{ playerId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;
  const { playerId } = await params;
  const id = Number(playerId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ message: "유효한 플레이어 ID가 아닙니다." }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      balanceProfile: true,
      balanceMatchResults: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { matchSeries: { select: { id: true, title: true, matchDate: true } } },
      },
    },
  });

  if (!player) return NextResponse.json({ message: "플레이어를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ player });
}
