import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { getKakaoMessageValidationError } from "@/lib/kakao/input-guard";
import { acquirePartyRecruitLock } from "@/lib/kakao/db-lock";
import {
  formatRecruitPartyBlock,
  getActiveMemberCount,
  getKakaoRecruitDateKey,
  parseFinishRecruitCommand,
} from "@/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import {
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
}) {
  const { recruitNo } = params;

  // 번호가 전역에서 유일할 때만 종료합니다.
  // 같은 활성 번호가 둘 이상이면 엉뚱한 파티를 종료하지 않습니다.
  const activeParties = await prisma.recruitParty.findMany({
    where: {
      recruitNo,
      status: "IN_PROGRESS",
    },
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { updatedAt: "desc" },
    ],
    take: 2,
    include: {
      members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
    },
  });

  return activeParties.length === 1 ? activeParties[0] : null;
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    const messageError = getKakaoMessageValidationError(message);
    if (messageError) {
      return partyRecruitJson({ reply: `[K-LOL.GG 파티 종료 실패]\n${messageError}` }, 400);
    }
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
    const latestReset = await getLatestRecruitResetLog(recruitDate);
    const createdAfterLatestReset = latestReset
      ? { gt: latestReset.createdAt }
      : undefined;
    const party = await findActiveRecruitParty({
      recruitNo: parsed.recruitNo,
    });

    if (!party) {
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
            ? "[K-LOL.GG 구인구직 마무리]\n이미 마감된 구인입니다."
            : [
                "[K-LOL.GG 구인구직 마무리 실패]",
                "해당 번호의 진행 중 파티 구인을 찾지 못했습니다.",
              ].join("\n"),
        },
        404,
      );
    }

    const didFinish = await prisma.$transaction(async (tx) => {
      await acquirePartyRecruitLock(tx, party.id);
      const current = await tx.recruitParty.findUnique({
        where: { id: party.id },
        select: { status: true },
      });
      if (current?.status !== "IN_PROGRESS") return false;

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
      return true;
    });

    if (!didFinish) {
      return partyRecruitJson({
        reply: `[파티 #${party.recruitNo} 종료]\n이미 종료된 파티입니다.`,
      });
    }

    const activeCount = getActiveMemberCount(party.members);
    const substituteCount = party.members.filter((member) => member.isSubstitute).length;
    return partyRecruitJson({
      reply: [
        `[파티 #${party.recruitNo} 종료]`,
        `최종 ${activeCount}명 · 예비 ${substituteCount}명`,
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
