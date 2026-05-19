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

type ResetRecruitNumberOptions = {
  roomName?: string | null;
  sender?: string | null;
  recruitDate?: string;
};

export async function resetRecruitNumbers(options: ResetRecruitNumberOptions = {}) {
  const recruitDate = options.recruitDate ?? getKakaoRecruitDateKey();

  return prisma.$transaction(async (tx) => {
    const latestReset = await tx.recruitPartyLog.findFirst({
      where: {
        recruitDate,
        action: RECRUIT_RESET_ACTION,
      },
      orderBy: [
        { resetSeq: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        resetSeq: true,
      },
    });

    const previousResetSeq = latestReset?.resetSeq ?? 0;
    const nextResetSeq = previousResetSeq + 1;

    const activeKeptCount = await tx.recruitParty.count({
      where: {
        recruitDate,
        status: "IN_PROGRESS",
      },
    });

    const resetLog = await tx.recruitPartyLog.create({
      data: {
        recruitNo: 0,
        recruitDate,
        resetSeq: nextResetSeq,
        type: "SYSTEM",
        title: "모집번호 초기화",
        action: RECRUIT_RESET_ACTION,
        memberCount: 0,
        maxMembers: 0,
        summary: `${recruitDate} 모집번호를 초기화했습니다. 진행 중 구인글은 유지하고 다음 구인글은 #1부터 생성하되, 진행 중인 번호와 겹치면 다음 빈 번호를 사용합니다.`,
        roomName: options.roomName ?? null,
        sender: options.sender ?? null,
      },
    });

    await writeAdminLog({
      action: "KAKAO_PARTY_RECRUIT_RESET",
      message: `카카오 구인구직 모집번호 초기화: ${recruitDate}, 회차 ${nextResetSeq}`,
      targetType: "RecruitParty",
      targetId: resetLog.id,
      afterJson: {
        recruitDate,
        previousResetSeq,
        resetSeq: nextResetSeq,
        activeKeptCount,
        roomName: options.roomName ?? null,
        sender: options.sender ?? null,
      },
      db: tx,
    });

    return {
      recruitDate,
      previousResetSeq,
      resetSeq: nextResetSeq,
      activeKeptCount,
      resetLogId: resetLog.id,
    };
  });
}

export function buildRecruitResetReply(result: { recruitDate: string; resetSeq: number; activeKeptCount: number }) {
  return [
    "[K-LOL.GG 구인구직 모집번호 초기화 완료]",
    "",
    `기준일: ${result.recruitDate}`,
    `현재 번호 회차: ${result.resetSeq}`,
    `유지된 진행 중 구인글: ${result.activeKeptCount}개`,
    "",
    "기존 구인글은 삭제하지 않습니다.",
    "다음 구인 생성부터 #1부터 확인하되, 진행 중인 번호와 겹치면 다음 빈 번호를 사용합니다.",
  ].join("\n");
}
