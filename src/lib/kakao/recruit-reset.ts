import { prisma } from "@/lib/prisma/client";
import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";

export const RECRUIT_RESET_ACTIONS = ["RESET", "AUTO_IDLE_RESET", "ADMIN_RESET_ALL"] as const;

export async function getLatestRecruitResetLog(recruitDate = getKakaoRecruitDateKey()) {
  return prisma.recruitPartyLog.findFirst({
    where: {
      recruitDate,
      action: { in: [...RECRUIT_RESET_ACTIONS] },
    },
    orderBy: [
      { resetSeq: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      resetSeq: true,
      createdAt: true,
    },
  });
}

export async function getCurrentRecruitResetSeq(recruitDate = getKakaoRecruitDateKey()) {
  const latestReset = await getLatestRecruitResetLog(recruitDate);
  return latestReset?.resetSeq ?? 0;
}
