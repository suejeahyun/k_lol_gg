export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildScrimFormFromData,
  buildScrimRecruitTemplate,
  hasScrimLineupValue,
  parseScrimCreateCommand,
  type ScrimLineup,
} from "@/lib/kakao/destruction-scrim-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import { DestructionScrimRecruitStatus, Prisma } from "@prisma/client";
import {
  findActiveScrim,
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
  "양식 호출",
  "/스크림구인",
  "",
  "간단 입력 예시",
  "/스크림 구인 16 한빈팀 7/5 20:00 3판2선",
].join("\n");

function kstDateKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function lineupJson(lineup: ScrimLineup): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!hasScrimLineupValue(lineup)) return Prisma.JsonNull;
  return lineup as unknown as Prisma.InputJsonObject;
}

function hasLineupOrName(params: { teamName?: string | null; lineup: ScrimLineup }) {
  return Boolean(params.teamName || hasScrimLineupValue(params.lineup));
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const rejected = rejectIfInvalidScrimSecret(req, body.secret);
    if (rejected) return rejected;

    const message = getBodyText(body);
    const parsed = parseScrimCreateCommand(message);

    if (parsed?.isTemplateRequest) {
      return scrimRecruitJson({ reply: buildScrimRecruitTemplate(), templateOnly: true });
    }

    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "SCRIM_RECRUIT") {
      return scrimRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "스크림구인", actual: classification.kind }) },
        400,
      );
    }

    if (!parsed) return scrimRecruitJson({ reply: CREATE_HELP }, 400);

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const sourceMessageHash = getMessageHash(message);

    if (parsed.scrimNo) {
      const scrim = await findActiveScrim(parsed.scrimNo);
      if (!scrim) {
        return scrimRecruitJson({ reply: `[K-LOL.GG 스크림구인 수정 실패]\n스크림 #${parsed.scrimNo}을 찾지 못했습니다.` }, 404);
      }

      const requesterTeam = parsed.requesterTeamName ? await findTeamByName(scrim.tournamentId, parsed.requesterTeamName) : null;
      const opponentTeam = parsed.opponentTeamName ? await findTeamByName(scrim.tournamentId, parsed.opponentTeamName) : null;
      const shouldMarkMatched = scrim.status === "RECRUITING" && hasLineupOrName({ teamName: parsed.opponentTeamName, lineup: parsed.opponentLineup });

      const data: Prisma.DestructionScrimRecruitUpdateInput = {
        ...(parsed.startTimeText ? { startTimeText: parsed.startTimeText } : {}),
        ...(parsed.scheduledAt ? { scheduledAt: parsed.scheduledAt } : {}),
        ...(parsed.gameCount ? { gameCount: parsed.gameCount } : {}),
        ...(parsed.seriesRuleText ? { seriesRuleText: parsed.seriesRuleText } : {}),
        ...(parsed.memo ? { memo: parsed.memo } : {}),
        ...(parsed.requesterTeamName ? { requesterTeamName: requesterTeam?.name ?? parsed.requesterTeamName } : {}),
        ...(parsed.opponentTeamName ? { opponentTeamName: opponentTeam?.name ?? parsed.opponentTeamName } : {}),
        ...(hasScrimLineupValue(parsed.requesterLineup) ? { requesterLineupJson: lineupJson(parsed.requesterLineup) } : {}),
        ...(hasScrimLineupValue(parsed.opponentLineup) ? { opponentLineupJson: lineupJson(parsed.opponentLineup) } : {}),
        ...(shouldMarkMatched ? { status: "MATCHED" as DestructionScrimRecruitStatus } : {}),
        ...(requesterTeam ? { requesterTeam: { connect: { id: requesterTeam.id } } } : {}),
        ...(opponentTeam ? { opponentTeam: { connect: { id: opponentTeam.id } } } : {}),
        roomName: roomName ?? scrim.roomName,
      };

      const updated = await prisma.destructionScrimRecruit.update({
        where: { id: scrim.id },
        data,
      });

      await prisma.destructionScrimRecruitLog.create({
        data: {
          scrimNo: updated.scrimNo,
          recruitDate: updated.recruitDate,
          tournamentId: updated.tournamentId,
          action: shouldMarkMatched ? "FORM_JOIN" : "FORM_UPDATE",
          title: updated.title,
          summary: message,
          roomName,
          sender,
        },
      });

      await writeAdminLog({
        action: shouldMarkMatched ? "KAKAO_DESTRUCTION_SCRIM_FORM_JOIN" : "KAKAO_DESTRUCTION_SCRIM_FORM_UPDATE",
        message: `카카오 멸망전 스크림 양식 반영: #${updated.scrimNo} ${updated.title}`,
        targetType: "DestructionScrimRecruit",
        targetId: updated.id,
        afterJson: { scrimNo: updated.scrimNo, status: updated.status, roomName, sender },
      });

      return scrimRecruitJson({
        scrim: updated,
        reply: [
          shouldMarkMatched ? "[K-LOL.GG 멸망전 스크림 상대 신청 반영]" : "[K-LOL.GG 멸망전 스크림 양식 수정]",
          "",
          `번호: #${updated.scrimNo}`,
          `요청팀: ${updated.requesterTeamName || "미정"}`,
          `상대팀: ${updated.opponentTeamName || "상대구함"}`,
          `일시: ${updated.startTimeText || "미정"}`,
          `방식: ${updated.seriesRuleText || (updated.gameCount ? `${updated.gameCount}판` : "미정")}`,
          `상태: ${updated.status}`,
          "",
          "현재 양식:",
          buildScrimFormFromData(updated),
        ].join("\n"),
      });
    }

    const tournament = await findTargetTournament(parsed.tournamentId);
    if (!tournament) {
      return scrimRecruitJson(
        { reply: "[K-LOL.GG 스크림구인 등록 실패]\n진행 중인 멸망전을 찾지 못했습니다. 양식의 멸망전번호를 입력해 다시 보내주세요." },
        404,
      );
    }

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
          "",
          buildScrimFormFromData(existingByHash),
        ].join("\n"),
      });
    }

    const requesterTeam = await findTeamByName(tournament.id, parsed.requesterTeamName);
    const opponentTeam = await findTeamByName(tournament.id, parsed.opponentTeamName);
    const scrimNo = await getNextScrimNo();
    const title = `${requesterTeam?.name || parsed.requesterTeamName || "요청팀"} 스크림 구인`;
    const initialStatus = hasLineupOrName({ teamName: parsed.opponentTeamName, lineup: parsed.opponentLineup })
      ? "MATCHED"
      : "RECRUITING";

    const scrim = await prisma.destructionScrimRecruit.create({
      data: {
        scrimNo,
        recruitDate: kstDateKey(),
        tournamentId: tournament.id,
        requesterTeamId: requesterTeam?.id ?? null,
        opponentTeamId: opponentTeam?.id ?? null,
        requesterTeamName: requesterTeam?.name ?? parsed.requesterTeamName,
        opponentTeamName: opponentTeam?.name ?? parsed.opponentTeamName,
        requesterLineupJson: lineupJson(parsed.requesterLineup),
        opponentLineupJson: lineupJson(parsed.opponentLineup),
        title,
        scheduledAt: parsed.scheduledAt,
        startTimeText: parsed.startTimeText,
        gameCount: parsed.gameCount,
        seriesRuleText: parsed.seriesRuleText,
        memo: parsed.memo,
        status: initialStatus,
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
        `상대팀: ${scrim.opponentTeamName || "상대구함"}`,
        `일시: ${scrim.startTimeText || "미정"}`,
        `방식: ${scrim.seriesRuleText || (scrim.gameCount ? `${scrim.gameCount}판` : "미정")}`,
        `상태: ${scrim.status}`,
        "",
        "상대 신청용 양식:",
        buildScrimFormFromData(scrim),
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scrimRecruitJson({ reply: `[K-LOL.GG 스크림구인 등록 실패]\n${message}`, error: message }, 500);
  }
}
