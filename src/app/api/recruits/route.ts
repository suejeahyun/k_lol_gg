export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";

export async function GET() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS", recruitDate: getKakaoRecruitDateKey() },
    include: {
      members: {
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitNo: "asc" }],
  });

  return NextResponse.json({ ok: true, parties });
}
