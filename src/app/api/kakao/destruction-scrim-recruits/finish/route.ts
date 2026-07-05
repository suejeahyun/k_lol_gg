export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { parseScrimNumberCommand } from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { DestructionScrimRecruitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import {
  findActiveScrim,
  getBodyRoom,
  getBodySender,
  getBodyText,
  readJsonBody,
  rejectIfInvalidScrimSecret,
  scrimRecruitJson,
} from "../_shared";

const ACTION = "FINISH";
const NEXT_STATUS: DestructionScrimRecruitStatus = "COMPLETED";
const TITLE = "스크림완료";
const HELP = "[K-LOL.GG 스크림완료 실패]\n예: /스크림완료 3";

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const rejected = rejectIfInvalidScrimSecret(req, body.secret);
    if (rejected) return rejected;

    const message = getBodyText(body);
    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "SCRIM_RECRUIT") {
      return scrimRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "스크림구인", actual: classification.kind }) },
        400,
      );
    }

    const parsed = parseScrimNumberCommand(message);
    if (!parsed) return scrimRecruitJson({ reply: HELP }, 400);

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const scrim = await findActiveScrim(parsed.scrimNo);
    if (!scrim) {
      return scrimRecruitJson({ reply: `[K-LOL.GG ${TITLE} 실패]
스크림 #${parsed.scrimNo}을 찾지 못했습니다.` }, 404);
    }

    const updated = await prisma.destructionScrimRecruit.update({
      where: { id: scrim.id },
      data: {
        status: NEXT_STATUS,
        roomName: roomName ?? scrim.roomName,
      },
    });

    await prisma.destructionScrimRecruitLog.create({
      data: {
        scrimNo: updated.scrimNo,
        recruitDate: updated.recruitDate,
        tournamentId: updated.tournamentId,
        action: ACTION,
        title: updated.title,
        summary: message,
        roomName,
        sender,
      },
    });

    await writeAdminLog({
      action: `KAKAO_DESTRUCTION_SCRIM_${ACTION}`,
      message: `카카오 멸망전 스크림 ${TITLE}: #${updated.scrimNo} ${updated.title}`,
      targetType: "DestructionScrimRecruit",
      targetId: updated.id,
      afterJson: { scrimNo: updated.scrimNo, status: updated.status, roomName, sender },
    });

    return scrimRecruitJson({
      scrim: updated,
      reply: [
        `[K-LOL.GG ${TITLE}]`,
        "",
        `번호: #${updated.scrimNo}`,
        `요청팀: ${updated.requesterTeamName || "미정"}`,
        `상대팀: ${updated.opponentTeamName || "상대구함"}`,
        `상태: ${updated.status}`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG ${TITLE} 실패]
${message}`, error: message }, 500);
  }
}

