export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { formatRecruitPartyBlock, getActiveMemberCount, getKakaoRecruitDateKey, parseFinishRecruitCommand } from "@/lib/kakao/party-recruit";
import { getCurrentRecruitResetSeq, getLatestRecruitResetLog } from "@/lib/kakao/recruit-reset";
import {
  getBodyRoom,
  getBodySender,
  getBodyText,
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";


async function findActiveRecruitParty(params: {
  recruitNo: number;
  recruitDate: string;
  resetSeq: number;
}) {
  const { recruitNo, recruitDate, resetSeq } = params;

  const currentSeqParty = await prisma.recruitParty.findFirst({
    where: {
      recruitNo,
      recruitDate,
      resetSeq,
      status: "IN_PROGRESS",
    },
    include: { members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] } },
  });

  if (currentSeqParty) {
    return currentSeqParty;
  }

  return prisma.recruitParty.findFirst({
    where: {
      recruitNo,
      recruitDate,
      status: "IN_PROGRESS",
    },
    orderBy: [{ resetSeq: "desc" }, { updatedAt: "desc" }],
    include: { members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const parsed = parseFinishRecruitCommand(message);

    if (!parsed) {
      return partyRecruitJson(
        {
          reply: "[K-LOL.GG 구인구직 마무리 실패]\n명령어 형식이 올바르지 않습니다. 예: /12 쫑, /12 ㅉ, /구인마감 #12",
        },
        400,
      );
    }

    const recruitDate = getKakaoRecruitDateKey();
    const resetSeq = await getCurrentRecruitResetSeq(recruitDate);
    const latestReset = await getLatestRecruitResetLog(recruitDate);
    const createdAfterLatestReset = latestReset ? { gt: latestReset.createdAt } : undefined;
    const party = await findActiveRecruitParty({
      recruitNo: parsed.recruitNo,
      recruitDate,
      resetSeq,
    });

    if (!party) {
      const finishedLog = await prisma.recruitPartyLog.findFirst({
        where: {
          recruitNo: parsed.recruitNo,
          recruitDate,
          action: { in: ["FINISHED", "AUTO_EXPIRED"] },
          ...(createdAfterLatestReset ? { createdAt: createdAfterLatestReset } : {}),
        },
        orderBy: [{ resetSeq: "desc" }, { createdAt: "desc" }],
        select: { title: true, memberCount: true, maxMembers: true },
      });

      return partyRecruitJson(
        {
          reply: finishedLog
            ? [
                "[K-LOL.GG 구인구직 마무리]",
                `모집번호 #${parsed.recruitNo}는 이미 마무리된 구인글입니다.`,
                `기록: ${finishedLog.title || "구인글"}`,
                `최종 인원: ${finishedLog.memberCount}/${finishedLog.maxMembers}`,
              ].join("\n")
            : `[K-LOL.GG 구인구직 마무리]\n\n모집번호 #${parsed.recruitNo} 파티를 찾지 못했습니다.`,
        },
        404,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.recruitPartyLog.create({
        data: {
          recruitNo: party.recruitNo,
          recruitDate: party.recruitDate,
          resetSeq: party.resetSeq,
          type: String(party.type),
          title: party.title,
          action: "FINISHED",
          memberCount: getActiveMemberCount(party.members),
          maxMembers: party.maxMembers,
          summary: formatRecruitPartyBlock(party),
          roomName,
          sender,
        },
      });

      await tx.recruitParty.delete({ where: { id: party.id } });

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_FINISH",
        message: `카카오 구인구직 파티 마무리: #${party.recruitNo} ${party.title}`,
        targetType: "RecruitParty",
        targetId: party.id,
        afterJson: {
          recruitNo: party.recruitNo,
          recruitDate: party.recruitDate,
          resetSeq: party.resetSeq,
          roomName,
          sender,
          memberCount: getActiveMemberCount(party.members),
        },
        db: tx,
      });
    });

    return partyRecruitJson({
      reply: [
        "[K-LOL.GG 구인구직 마무리]",
        `모집번호 #${party.recruitNo} 마무리 완료`,
        "다음에 또 같이해요.",
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return partyRecruitJson(
      {
        reply: `[K-LOL.GG 구인구직 마무리 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}
