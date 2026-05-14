export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { buildSyncReply, getKakaoRecruitTodayRange, parsePartyForm } from "@/lib/kakao/party-recruit";
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

    const noOnly =
      message.match(/모집번호\s*[:：]?\s*#?\s*(\d{1,2})/) ||
      message.match(/(^|\s)#(\d{1,2})(\s|$)/);
    const recruitNo = noOnly ? Number(noOnly[1] || noOnly[2]) : NaN;

    if (!Number.isInteger(recruitNo) || recruitNo < 0 || recruitNo > 99) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 반영 실패]\n\n" +
            "모집번호를 찾지 못했습니다.\n\n" +
            "예시\n" +
            "모집번호: #12\n" +
            "TOP. 재현",
        },
        { status: 400 },
      );
    }

    const todayRange = getKakaoRecruitTodayRange();
    const party = await prisma.recruitParty.findFirst({
      where: { recruitNo, createdAt: todayRange },
      include: { members: true },
    });

    if (!party) {
      const finishedLog = await prisma.recruitPartyLog.findFirst({
        where: { recruitNo, action: { in: ["FINISHED", "AUTO_EXPIRED"] }, createdAt: todayRange },
        orderBy: { createdAt: "desc" },
        select: { title: true, memberCount: true, maxMembers: true },
      });

      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply: finishedLog
            ? [
                "[K-LOL.GG 구인구직 반영 안내]",
                `모집번호 #${recruitNo}는 이미 마무리된 구인글입니다.`,
                `기록: ${finishedLog.title || "구인글"}`,
                `최종 인원: ${finishedLog.memberCount}/${finishedLog.maxMembers}`,
                "마무리된 번호에는 인원을 추가할 수 없습니다.",
              ].join("\n")
            : "[K-LOL.GG 구인구직 반영 실패]\n\n" +
              `모집번호 #${recruitNo} 파티를 찾지 못했습니다.\n` +
              "먼저 자랭구인 형식으로 오늘 파티를 생성해주세요.",
        },
        { status: 404 },
      );
    }

    const parsed = parsePartyForm(
      message,
      String(party.type),
      party.maxMembers,
    );
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 반영 실패]\n반영 가능한 양식을 찾지 못했습니다.",
        },
        { status: 400 },
      );
    }

    const previousActiveCount = party.members.filter(
      (member) => !member.isSubstitute,
    ).length;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.recruitPartyMember.deleteMany({ where: { partyId: party.id } });

      if (parsed.members.length > 0) {
        await tx.recruitPartyMember.createMany({
          data: parsed.members.map((member) => ({
            partyId: party.id,
            name: member.name,
            position: member.position,
            slotNo: member.slotNo,
            isSubstitute: member.isSubstitute,
          })),
          skipDuplicates: true,
        });
      }

      const result = await tx.recruitParty.update({
        where: { id: party.id },
        data: {
          startTimeText: parsed.startTimeText ?? party.startTimeText,
          playStyle: parsed.playStyle ?? party.playStyle,
          roomName: roomName ?? party.roomName,
        },
        include: {
          members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
        },
      });

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_SYNC",
        message: `카카오 구인구직 파티 반영: #${result.recruitNo} ${result.title}, ${result.members.filter((member) => !member.isSubstitute).length}/${result.maxMembers}`,
        targetType: "RecruitParty",
        targetId: result.id,
        afterJson: {
          recruitNo: result.recruitNo,
          roomName,
          sender,
          members: result.members,
        },
        db: tx,
      });

      return result;
    });

    return NextResponse.json({
      ok: true,
      formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
      party: updated,
      reply: buildSyncReply(updated, previousActiveCount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
        reply: `[K-LOL.GG 구인구직 반영 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      { status: 500 },
    );
  }
}
