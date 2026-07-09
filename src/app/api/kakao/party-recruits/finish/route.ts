export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { getScrimStatusLabel } from "@/lib/kakao/destruction-scrim-recruit";
import { findActiveScrim as findActiveDestructionScrim } from "../../destruction-scrim-recruits/_shared";
import {
  formatRecruitPartyBlock,
  getActiveMemberCount,
  getKakaoRecruitDateKey,
  parseFinishRecruitCommand,
} from "@/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import {
  getCurrentRecruitResetSeq,
  getLatestRecruitResetLog,
} from "@/lib/kakao/recruit-reset";
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
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (currentSeqParty) {
    return currentSeqParty;
  }

  const sameDateParty = await prisma.recruitParty.findFirst({
    where: {
      recruitNo,
      recruitDate,
      status: "IN_PROGRESS",
    },
    orderBy: [{ resetSeq: "desc" }, { updatedAt: "desc" }],
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (sameDateParty) {
    return sameDateParty;
  }

  // 구인현황은 날짜가 지난 진행 중 구인글도 보여줍니다.
  // 따라서 마감 명령도 오늘 날짜에 없으면 같은 모집번호의 최신 진행 중 글까지 찾아야 합니다.
  return prisma.recruitParty.findFirst({
    where: {
      recruitNo,
      status: "IN_PROGRESS",
    },
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { updatedAt: "desc" },
    ],
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
  });
}

async function finishActiveScrimFromPlainCloseCommand(params: {
  scrimNo: number;
  roomName: string | null;
  sender: string | null;
  message: string;
}) {
  const scrim = await findActiveDestructionScrim(params.scrimNo);
  if (!scrim) return null;

  const updated = await prisma.destructionScrimRecruit.update({
    where: { id: scrim.id },
    data: {
      status: "COMPLETED",
      roomName: params.roomName ?? scrim.roomName,
    },
  });

  await prisma.destructionScrimRecruitLog.create({
    data: {
      scrimNo: updated.scrimNo,
      recruitDate: updated.recruitDate,
      tournamentId: updated.tournamentId,
      action: "FINISH",
      title: updated.title,
      summary: params.message,
      roomName: params.roomName,
      sender: params.sender,
    },
  });

  await writeAdminLog({
    action: "KAKAO_DESTRUCTION_SCRIM_FINISH_FROM_PLAIN_CLOSE",
    message: `카카오 스크림 일반 ㅉ 명령 종료: #${updated.scrimNo} ${updated.title}`,
    targetType: "DestructionScrimRecruit",
    targetId: updated.id,
    afterJson: {
      scrimNo: updated.scrimNo,
      status: updated.status,
      roomName: params.roomName,
      sender: params.sender,
    },
  });

  return partyRecruitJson({
    reply: [
      "[K-LOL.GG 스크림종료]",
      "",
      `번호: #${updated.scrimNo}`,
      `요청팀: ${updated.requesterTeamName || "미정"}`,
      `상대팀: ${updated.opponentTeamName || "상대구함"}`,
      `상태: ${getScrimStatusLabel(updated.status)}`,
      "",
      "일반 구인구직이 아닌 스크림으로 종료 처리했습니다.",
    ].join("\n"),
    forwardedTo: "destruction-scrim-recruits/finish",
    scrim: updated,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "PARTY_RECRUIT") {
      return partyRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "파티구인", actual: classification.kind }) },
        400,
      );
    }

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const parsed = parseFinishRecruitCommand(message);

    if (!parsed) {
      return partyRecruitJson(
        {
          reply:
            "[K-LOL.GG 구인구직 마무리 실패]\n명령어 형식이 올바르지 않습니다. 예: 12ㅉ",
        },
        400,
      );
    }

    const recruitDate = getKakaoRecruitDateKey();
    const resetSeq = await getCurrentRecruitResetSeq(recruitDate);
    const latestReset = await getLatestRecruitResetLog(recruitDate);
    const createdAfterLatestReset = latestReset
      ? { gt: latestReset.createdAt }
      : undefined;
    const party = await findActiveRecruitParty({
      recruitNo: parsed.recruitNo,
      recruitDate,
      resetSeq,
    });

    if (!party) {
      const scrimFinishReply = await finishActiveScrimFromPlainCloseCommand({
        scrimNo: parsed.recruitNo,
        roomName,
        sender,
        message,
      });
      if (scrimFinishReply) return scrimFinishReply;

      const sameDateFinishedLog = await prisma.recruitPartyLog.findFirst({
        where: {
          recruitNo: parsed.recruitNo,
          recruitDate,
          action: { in: ["FINISHED", "AUTO_EXPIRED"] },
          ...(createdAfterLatestReset
            ? { createdAt: createdAfterLatestReset }
            : {}),
        },
        orderBy: [{ resetSeq: "desc" }, { createdAt: "desc" }],
        select: { title: true, memberCount: true, maxMembers: true },
      });

      const finishedLog =
        sameDateFinishedLog ??
        (await prisma.recruitPartyLog.findFirst({
          where: {
            recruitNo: parsed.recruitNo,
            action: { in: ["FINISHED", "AUTO_EXPIRED"] },
          },
          orderBy: [
            { recruitDate: "desc" },
            { resetSeq: "desc" },
            { createdAt: "desc" },
          ],
          select: { title: true, memberCount: true, maxMembers: true },
        }));

      return partyRecruitJson(
        {
          reply: finishedLog
            ? "[K-LOL.GG 구인구직 마무리]"
            : "[K-LOL.GG 구인구직 마무리 실패]",
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

      await tx.recruitParty.update({
        where: { id: party.id },
        data: { status: "FINISHED" },
      });

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
      reply: "[K-LOL.GG 구인구직 마무리]",
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
