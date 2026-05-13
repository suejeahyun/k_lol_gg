export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { buildCreateReply, parseCreateRecruitCommand } from "@/lib/kakao/party-recruit";
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
    const parsed = parseCreateRecruitCommand(message);

    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 생성 실패]\n\n" +
            "명령어 형식이 올바르지 않습니다.\n\n" +
            "예시\n" +
            "/자랭구인구직 12\n" +
            "/일반게임구인구직 13\n" +
            "/솔랭구인구직 14\n" +
            "/칼바람구인구직 15",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.recruitParty.findUnique({
      where: { recruitNo: parsed.recruitNo },
      include: { members: true },
    });

    if (existing) {
      const activeCount = existing.members.filter((member) => !member.isSubstitute).length;
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 안내]\n\n" +
            `모집번호 #${parsed.recruitNo}는 이미 사용 중입니다.\n\n` +
            `현재 #${parsed.recruitNo} 상태:\n` +
            `${existing.title}\n` +
            `현재 인원: ${activeCount}/${existing.maxMembers}\n\n` +
            "다른 번호를 사용해주세요.\n" +
            "예: /자랭구인구직 13",
        },
        { status: 409 },
      );
    }

    const party = await prisma.recruitParty.create({
      data: {
        recruitNo: parsed.recruitNo,
        type: parsed.type,
        status: "IN_PROGRESS",
        title: parsed.title,
        roomName,
        hostName: sender,
        maxMembers: parsed.maxMembers,
      },
      include: { members: true },
    });

    await writeAdminLog({
      action: "KAKAO_PARTY_RECRUIT_CREATE",
      message: `카카오 구인구직 파티 생성: #${party.recruitNo} ${party.title}`,
      targetType: "RecruitParty",
      targetId: party.id,
      afterJson: {
        recruitNo: party.recruitNo,
        type: party.type,
        roomName,
        sender,
      },
    });

    return NextResponse.json({
      ok: true,
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      party,
      reply: buildCreateReply(parsed.template),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
        reply: `[K-LOL.GG 구인구직 생성 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      { status: 500 },
    );
  }
}
