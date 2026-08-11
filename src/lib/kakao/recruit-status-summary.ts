import { prisma } from "@/lib/prisma/client";
import {
  buildRecruitStatusSummaryReply,
  filterRecruitingParties,
} from "@/lib/kakao/party-recruit";

const STATUS_SUMMARY_TAKE = 30;

export async function getRecruitStatusSummaryReply() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      recruitNo: true,
      recruitDate: true,
      resetSeq: true,
      recruitCode: true,
      type: true,
      status: true,
      title: true,
      roomName: true,
      hostName: true,
      startTimeText: true,
      scheduledStartAt: true,
      tierText: true,
      preferredLineText: true,
      playStyle: true,
      note: true,
      maxMembers: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          name: true,
          position: true,
          slotNo: true,
          isSubstitute: true,
        },
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { recruitNo: "asc" },
    ],
    take: STATUS_SUMMARY_TAKE,
  });

  return buildRecruitStatusSummaryReply(filterRecruitingParties(parties));
}

export async function appendRecruitStatusSummary(reply: string) {
  try {
    const statusReply = await getRecruitStatusSummaryReply();
    return `${reply.trimEnd()}\n\n${statusReply}`;
  } catch {
    return [
      reply.trimEnd(),
      "",
      "[현재 구인현황]",
      "현황을 불러오지 못했습니다. 잠시 후 구인현황을 입력해주세요.",
    ].join("\n");
  }
}
