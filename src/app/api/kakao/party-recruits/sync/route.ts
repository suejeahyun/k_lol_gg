export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildSyncReply,
  getKakaoRecruitDateKey,
  getKakaoRecruitTodayRange,
  isSoloRankPartyType,
  parsePartyForm,
} from "@/lib/kakao/party-recruit";
import {
  getBodyRoom,
  getBodySender,
  getBodyText,
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

function extractRecruitNo(message: string) {
  const explicit = message.match(/모집번호\s*[:：]?\s*#?\s*(\d{1,2})/);
  if (explicit) return Number(explicit[1]);

  const hash = message.match(/(^|\s)#(\d{1,2})(\s|$)/);
  if (hash) return Number(hash[2]);

  return NaN;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const recruitNo = extractRecruitNo(message);

    if (!Number.isInteger(recruitNo) || recruitNo < 1 || recruitNo > 99) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            "모집번호를 찾지 못했습니다.",
            "모집번호가 없는 구인글은 반영하지 않습니다.",
            "",
            "예시",
            "모집번호: #12",
            "TOP. 재현",
          ].join("\n"),
        },
        400,
      );
    }

    const recruitDate = getKakaoRecruitDateKey();
    const todayRange = getKakaoRecruitTodayRange();
    const party = await prisma.recruitParty.findFirst({
      where: { recruitNo, recruitDate },
      include: { members: true },
    });

    if (!party) {
      const finishedLog = await prisma.recruitPartyLog.findFirst({
        where: { recruitNo, action: { in: ["FINISHED", "AUTO_EXPIRED"] }, createdAt: todayRange },
        orderBy: { createdAt: "desc" },
        select: { title: true, memberCount: true, maxMembers: true },
      });

      return partyRecruitJson(
        {
          reply: finishedLog
            ? [
                "[K-LOL.GG 구인구직 반영 안내]",
                `모집번호 #${recruitNo}는 이미 마무리된 구인글입니다.`,
                `기록: ${finishedLog.title || "구인글"}`,
                `최종 인원: ${finishedLog.memberCount}/${finishedLog.maxMembers}`,
                "마무리된 번호에는 인원을 추가할 수 없습니다.",
              ].join("\n")
            : [
                "[K-LOL.GG 구인구직 반영 실패]",
                "",
                `모집번호 #${recruitNo} 파티를 찾지 못했습니다.`,
                "먼저 자랭구인 형식으로 오늘 파티를 생성해주세요.",
              ].join("\n"),
        },
        404,
      );
    }

    const parsed = parsePartyForm(message, String(party.type), party.maxMembers);
    if (!parsed) {
      return partyRecruitJson(
        {
          reply: "[K-LOL.GG 구인구직 반영 실패]\n반영 가능한 양식을 찾지 못했습니다.",
        },
        400,
      );
    }

    const previousActiveCount = party.members.filter(
      (member) => !member.isSubstitute && member.name.trim() !== "",
    ).length;
    const isSoloRank = isSoloRankPartyType(String(party.type));

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
          tierText: isSoloRank ? parsed.tierText : null,
          preferredLineText: isSoloRank ? parsed.preferredLineText : null,
          playStyle: isSoloRank ? parsed.playStyle : null,
          note: parsed.note ?? party.note,
          roomName: roomName ?? party.roomName,
        },
        include: {
          members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] },
        },
      });

      await writeAdminLog({
        action: "KAKAO_PARTY_RECRUIT_SYNC",
        message: `카카오 구인구직 파티 반영: #${result.recruitNo} ${result.title}, ${result.members.filter((member) => !member.isSubstitute && member.name.trim() !== "").length}/${result.maxMembers}`,
        targetType: "RecruitParty",
        targetId: result.id,
        afterJson: {
          recruitNo: result.recruitNo,
          recruitDate: result.recruitDate,
          roomName,
          sender,
          members: result.members,
        },
        db: tx,
      });

      return result;
    });

    return partyRecruitJson({
      party: updated,
      reply: buildSyncReply(updated, previousActiveCount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return partyRecruitJson(
      {
        reply: `[K-LOL.GG 구인구직 반영 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}
