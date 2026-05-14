export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { formatRecruitPartyBlock, getActiveMemberCount, parseFinishRecruitCommand } from "@/lib/kakao/party-recruit";
import {
  PARTY_RECRUIT_FORMAT_VERSION,
  getBodyRoom,
  getBodySender,
  getBodyText,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

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
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply: "[K-LOL.GG 구인구직 마무리 실패]\n명령어 형식이 올바르지 않습니다. 예: /12 쫑 또는 /12 ㅉ",
        },
        { status: 400 },
      );
    }

    const party = await prisma.recruitParty.findUnique({
      where: { recruitNo: parsed.recruitNo },
      include: { members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] } },
    });

    if (!party) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply: `[K-LOL.GG 구인구직 마무리]\n\n모집번호 #${parsed.recruitNo} 파티를 찾지 못했습니다.`,
        },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.recruitPartyLog.create({
        data: {
          recruitNo: party.recruitNo,
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
          roomName,
          sender,
          memberCount: getActiveMemberCount(party.members),
        },
        db: tx,
      });
    });

    return NextResponse.json({
      ok: true,
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      reply: [
        "[K-LOL 구인구직 마무리]",
        "다음에 또 같이해요.",
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
        reply: `[K-LOL.GG 구인구직 마무리 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      { status: 500 },
    );
  }
}
