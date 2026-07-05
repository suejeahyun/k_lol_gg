export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { parseScrimCreateCommand } from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import {
  findTargetTournament,
  findTeamByName,
  getBodyRoom,
  getBodySender,
  getBodyText,
  getMessageHash,
  getNextScrimNo,
  readJsonBody,
  rejectIfInvalidScrimSecret,
  scrimRecruitJson,
} from "../_shared";
import { prisma } from "@/lib/prisma/client";

const CREATE_HELP = [
  "[K-LOL.GG 스크림구인 등록 실패]",
  "",
  "명령어 형식이 올바르지 않습니다.",
  "",
  "예시",
  "/스크림구인 16 재현팀 7/6 21:00 5판",
  "/스크림구인 재현팀 21:00 5판",
].join("\n");

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

    const parsed = parseScrimCreateCommand(message);
    if (!parsed) return scrimRecruitJson({ reply: CREATE_HELP }, 400);

    const tournament = await findTargetTournament(parsed.tournamentId);
    if (!tournament) {
      return scrimRecruitJson(
        { reply: "[K-LOL.GG 스크림구인 등록 실패]\n진행 중인 멸망전을 찾지 못했습니다. 대회 번호를 포함해 다시 입력해주세요." },
        404,
      );
    }

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const sourceMessageHash = getMessageHash(message);
    const existingByHash = await prisma.destructionScrimRecruit.findFirst({
      where: { sourceMessageHash },
    });

    if (existingByHash) {
      return scrimRecruitJson({
        scrim: existingByHash,
        reply: [
          "[K-LOL.GG 스크림구인 중복 등록 차단]",
          "",
          `이미 등록된 스크림입니다. 번호: #${existingByHash.scrimNo}`,
          "같은 카카오톡 메시지는 다시 저장하지 않습니다.",
        ].join("\n"),
      });
    }

    const requesterTeam = await findTeamByName(tournament.id, parsed.requesterTeamName);
    const scrimNo = await getNextScrimNo();
    const title = `${requesterTeam?.name || parsed.requesterTeamName || "요청팀"} 스크림 구인`;

    const scrim = await prisma.destructionScrimRecruit.create({
      data: {
        scrimNo,
        recruitDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
        tournament: { connect: { id: tournament.id } },
        ...(requesterTeam ? { requesterTeam: { connect: { id: requesterTeam.id } } } : {}),
        requesterTeamName: requesterTeam?.name ?? parsed.requesterTeamName,
        title,
        scheduledAt: parsed.scheduledAt,
        startTimeText: parsed.startTimeText,
        gameCount: parsed.gameCount,
        memo: parsed.memo,
        status: "RECRUITING",
        roomName,
        sender,
        sourceMessage: message,
        sourceMessageHash,
      },
    });

    await prisma.destructionScrimRecruitLog.create({
      data: {
        scrimNo: scrim.scrimNo,
        recruitDate: scrim.recruitDate,
        tournamentId: scrim.tournamentId,
        action: "CREATE",
        title: scrim.title,
        summary: message,
        roomName,
        sender,
      },
    });

    await writeAdminLog({
      action: "KAKAO_DESTRUCTION_SCRIM_CREATE",
      message: `카카오 멸망전 스크림 생성: #${scrim.scrimNo} ${scrim.title}`,
      targetType: "DestructionScrimRecruit",
      targetId: scrim.id,
      afterJson: { scrimNo: scrim.scrimNo, tournamentId: scrim.tournamentId, roomName, sender },
    });

    return scrimRecruitJson({
      scrim,
      reply: [
        "[K-LOL.GG 멸망전 스크림 등록]",
        "",
        `번호: #${scrim.scrimNo}`,
        `대회: ${tournament.title}`,
        `요청팀: ${scrim.requesterTeamName || "미정"}`,
        `일시: ${scrim.startTimeText || "미정"}`,
        `판수: ${scrim.gameCount ? `${scrim.gameCount}판` : "미정"}`,
        "상태: 모집중",
        "",
        `참가: /스크림참가 ${scrim.scrimNo} 팀명`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG 스크림구인 등록 실패]\n${message}`, error: message }, 500);
  }
}
