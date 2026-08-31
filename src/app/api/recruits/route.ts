import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { PUBLIC_REALTIME_CACHE_HEADER } from "@/lib/http/cache";
import { toPublicRecruitDto } from "@/lib/public/recruit";

const MAX_PUBLIC_RECRUIT_PARTIES = 200;

export async function GET() {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const allParties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      recruitNo: true,
      recruitDate: true,
      resetSeq: true,
      type: true,
      status: true,
      title: true,
      startTimeText: true,
      scheduledStartAt: true,
      tierText: true,
      preferredLineText: true,
      playStyle: true,
      note: true,
      maxMembers: true,
      updatedAt: true,
      members: {
        select: {
          position: true,
          slotNo: true,
          isSubstitute: true,
        },
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
    take: MAX_PUBLIC_RECRUIT_PARTIES,
  });

  const parties = allParties.map(toPublicRecruitDto);

  return NextResponse.json(
    { ok: true, parties },
    { headers: { "Cache-Control": PUBLIC_REALTIME_CACHE_HEADER } },
  );
}
