import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { filterRecruitingParties } from "@/lib/kakao/party-recruit";

const MAX_PUBLIC_RECRUIT_PARTIES = 200;

export async function GET() {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const allParties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: {
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
    take: MAX_PUBLIC_RECRUIT_PARTIES,
  });

  const parties = filterRecruitingParties(allParties);

  return NextResponse.json({ ok: true, parties });
}
