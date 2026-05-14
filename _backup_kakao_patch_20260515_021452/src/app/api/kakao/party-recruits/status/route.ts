export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { buildRecruitStatusReply, getKakaoRecruitTodayRange } from "@/lib/kakao/party-recruit";
import { PARTY_RECRUIT_FORMAT_VERSION } from "../_shared";

export async function GET() {
  try {
    const parties = await prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS", createdAt: getKakaoRecruitTodayRange() },
      include: {
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ recruitNo: "asc" }],
      take: 20,
    });

    return NextResponse.json({
      ok: true,
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      empty: parties.length === 0,
      parties,
      reply: buildRecruitStatusReply(parties),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
        reply: `[K-LOL.GG 구인구직 현황 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      { status: 500 },
    );
  }
}
