export const dynamic = "force-dynamic";
export const revalidate = 0;

import { prisma } from "@/lib/prisma/client";
import { buildRecruitStatusReply } from "@/lib/kakao/party-recruit";
import { partyRecruitJson } from "../_shared";

export async function GET() {
  try {
    const parties = await prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      include: {
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      take: 20,
    });

    return partyRecruitJson({
      empty: parties.length === 0,
      parties,
      reply: buildRecruitStatusReply(parties),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return partyRecruitJson(
      {
        reply: `[K-LOL.GG 구인구직 현황 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}
