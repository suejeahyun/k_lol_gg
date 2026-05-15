import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { getKakaoRecruitDateKey } from "@/lib/kakao/party-recruit";

export const RECRUIT_RESET_ACTION = "RESET";

export function isRecruitResetCommand(message: string) {
  const text = message.trim().replace(/^\/+/, "");
  return /^(모집번호초기화|구인번호초기화|구인초기화|파티번호초기화|recruit-reset)$/i.test(text);
}

export async function getLatestRecruitResetLog(recruitDate = getKakaoRecruitDateKey()) {
  return prisma.recruitPartyLog.findFirst({
    where: {
      recruitDate,
      action: RECRUIT_RESET_ACTION,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
}

type ResetRecruitNumberOptions = {
  roomName?: string | null;
  sender?: string | null;
  recruitDate?: string;
};

export async function resetRecruitNumbers(options: ResetRecruitNumberOptions = {}) {
  const recruitDate = options.recruitDate ?? getKakaoRecruitDateKey();

  return prisma.$transaction(async (tx) => {
    const activeBeforeReset = await tx.recruitParty.count({
      where: {
        recruitDate,
      },
    });

    await tx.recruitParty.deleteMany({
      where: {
        recruitDate,
      },
    });

    const resetLog = await tx.recruitPartyLog.create({
      data: {
        recruitNo: 0,
        recruitDate,
        type: "SYSTEM",
        title: "모집번호 초기화",
        action: RECRUIT_RESET_ACTION,
        memberCount: 0,
        maxMembers: 0,
        summary: `${recruitDate} 모집번호를 초기화했습니다. 다음 구인글은 #1부터 생성됩니다.`,
        roomName: options.roomName ?? null,
        sender: options.sender ?? null,
      },
    });

    await writeAdminLog({
      action: "KAKAO_PARTY_RECRUIT_RESET",
      message: `카카오 구인구직 모집번호 초기화: ${recruitDate}`,
      targetType: "RecruitParty",
      targetId: resetLog.id,
      afterJson: {
        recruitDate,
        activeBeforeReset,
        roomName: options.roomName ?? null,
        sender: options.sender ?? null,
      },
      db: tx,
    });

    return {
      recruitDate,
      activeBeforeReset,
      resetLogId: resetLog.id,
    };
  });
}

export function buildRecruitResetReply(result: { recruitDate: string; activeBeforeReset: number }) {
  return [
    "[K-LOL.GG 구인구직 모집번호 초기화 완료]",
    "",
    `기준일: ${result.recruitDate}`,
    `초기화된 진행 중 구인글: ${result.activeBeforeReset}개`,
    "",
    "다음 구인 생성부터 모집번호 #1부터 다시 사용됩니다.",
  ].join("\n");
}
