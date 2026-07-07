export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { getScrimStatusLabel, parseScrimNumberCommand } from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { DestructionScrimRecruitStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import {
  findActiveScrim,
  findTeamByName,
  getBodyRoom,
  getBodySender,
  getBodyText,
  readJsonBody,
  rejectIfInvalidScrimSecret,
  scrimRecruitJson,
} from "../_shared";

const ACTION = "JOIN";
const NEXT_STATUS = "MATCHED";
const TITLE = "스크림참가";
const HELP = "[K-LOL.GG 스크림참가 실패]\\n예: /스크림참가 3 하림팀";

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
      return scrimRecruitJson({ reply: `[K-LOL.GG ${TITLE} 실패]\n스크림 #${parsed.scrimNo}을 찾지 못했습니다.` }, 404);
    }

    let data: Prisma.DestructionScrimRecruitUpdateInput = { status: NEXT_STATUS as DestructionScrimRecruitStatus, roomName: roomName ?? scrim.roomName };
    let logSummary = message;

    if (ACTION === "JOIN") {
      const opponentTeamName = parsed.teamName;
      if (!opponentTeamName) {
        return scrimRecruitJson({ reply: "[K-LOL.GG 스크림참가 실패]\n팀명을 함께 입력해주세요. 예: /스크림참가 3 하림팀" }, 400);
      }

      if (scrim.status !== "RECRUITING") {
        return scrimRecruitJson({ reply: `[K-LOL.GG 스크림참가 실패]\n#${scrim.scrimNo}은 현재 ${scrim.status} 상태라 참가 신청할 수 없습니다.` }, 409);
      }

      const opponentTeam = await findTeamByName(scrim.tournamentId, opponentTeamName);
      data = {
        ...data,
        status: "MATCHED" as DestructionScrimRecruitStatus,
        ...(opponentTeam ? { opponentTeam: { connect: { id: opponentTeam.id } } } : { opponentTeam: { disconnect: true } }),
        opponentTeamName: opponentTeam?.name ?? opponentTeamName,
      };
      logSummary = `${opponentTeam?.name ?? opponentTeamName} 신청`;
    }

    const updated = await prisma.destructionScrimRecruit.update({
      where: { id: scrim.id },
      data,
    });

    await prisma.destructionScrimRecruitLog.create({
      data: {
        scrimNo: updated.scrimNo,
        recruitDate: updated.recruitDate,
        tournamentId: updated.tournamentId,
        action: ACTION,
        title: updated.title,
        summary: logSummary,
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
        `상태: ${getScrimStatusLabel(updated.status)}`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG ${TITLE} 실패]\n${message}`, error: message }, 500);
  }
}
