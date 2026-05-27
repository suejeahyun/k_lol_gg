export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { filterRecruitingParties } from "@/lib/kakao/party-recruit";

export async function GET() {
  const allParties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      members: {
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
  });

  const parties = filterRecruitingParties(allParties);

  return NextResponse.json({ ok: true, parties });
}
