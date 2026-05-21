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
import { getCurrentRecruitResetSeq } from "@/lib/kakao/recruit-reset";
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

function extractRecruitNos(message: string) {
  const result: number[] = [];
  const seen = new Set<number>();
  const regex = /모집번호\s*[:：]?\s*#?\s*(\d{1,2})/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    const recruitNo = Number(match[1]);
    if (!Number.isInteger(recruitNo) || recruitNo < 1 || recruitNo > 99) continue;
    if (seen.has(recruitNo)) continue;
    seen.add(recruitNo);
    result.push(recruitNo);
  }

  return result;
}


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
    include: { members: true },
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
    include: { members: true },
  });

  if (sameDateParty) {
    return sameDateParty;
  }

  // 구인현황에 표시되는 날짜 지난 진행 중 글도 수정할 수 있도록 최신 활성 글로 보정합니다.
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
    include: { members: true },
  });
}

function splitRecruitStatusBlocks(message: string) {
  const sections = message
    .replace(/\r/g, "\n")
    .split(/\n\s*-{10,}\s*\n/g)
    .map((section) => section.trim())
    .filter(Boolean);

  const blocks: Array<{ recruitNo: number; message: string }> = [];
  const seen = new Set<number>();

  for (const section of sections) {
    const recruitNo = extractRecruitNo(section);
    if (!Number.isInteger(recruitNo) || recruitNo < 1 || recruitNo > 99) continue;
    if (seen.has(recruitNo)) continue;
    seen.add(recruitNo);
    blocks.push({ recruitNo, message: section });
  }

  return blocks;
}

async function syncOneRecruit(params: {
  recruitNo: number;
  message: string;
  roomName: string | null;
  sender: string | null;
  recruitDate: string;
  resetSeq: number;
  todayRange: { gte: Date; lt: Date };
}) {
  const { recruitNo, message, roomName, sender, recruitDate, resetSeq, todayRange } = params;

  const party = await findActiveRecruitParty({ recruitNo, recruitDate, resetSeq });

  if (!party) {
    const sameDateFinishedLog = await prisma.recruitPartyLog.findFirst({
      where: { recruitNo, recruitDate, action: { in: ["FINISHED", "AUTO_EXPIRED"] }, createdAt: todayRange },
      orderBy: [{ resetSeq: "desc" }, { createdAt: "desc" }],
      select: { title: true, memberCount: true, maxMembers: true },
    });

    const finishedLog = sameDateFinishedLog ?? await prisma.recruitPartyLog.findFirst({
      where: { recruitNo, action: { in: ["FINISHED", "AUTO_EXPIRED"] } },
      orderBy: [
        { recruitDate: "desc" },
        { resetSeq: "desc" },
        { createdAt: "desc" },
      ],
      select: { title: true, memberCount: true, maxMembers: true },
    });

    return {
      ok: false,
      recruitNo,
      statusCode: 404,
      reply: finishedLog
        ? [
            "[K-LOL.GG 구인구직 반영 안내]",
            `모집번호 #${recruitNo}는 이미 마무리된 구인글입니다.`,
            `기록: ${finishedLog.title || "구인글"}`,
            `최종 인원: ${Math.min(finishedLog.memberCount, finishedLog.maxMembers)}/${finishedLog.maxMembers}`,
            "마무리된 번호에는 인원을 추가할 수 없습니다.",
          ].join("\n")
        : [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            `모집번호 #${recruitNo} 파티를 찾지 못했습니다.`,
            "먼저 구인 생성 명령어로 오늘 파티를 생성해주세요.",
          ].join("\n"),
    };
  }

  const parsed = parsePartyForm(message, String(party.type), party.maxMembers);
  if (!parsed) {
    return {
      ok: false,
      recruitNo,
      statusCode: 400,
      reply: `[K-LOL.GG 구인구직 반영 실패]\n모집번호 #${recruitNo}에서 반영 가능한 양식을 찾지 못했습니다.`,
    };
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
      message: `카카오 구인구직 파티 반영: #${result.recruitNo} ${result.title}, ${Math.min(result.members.filter((member) => !member.isSubstitute && member.name.trim() !== "").length, result.maxMembers)}/${result.maxMembers}`,
      targetType: "RecruitParty",
      targetId: result.id,
      afterJson: {
        recruitNo: result.recruitNo,
        recruitDate: result.recruitDate,
        resetSeq: result.resetSeq,
        roomName,
        sender,
        members: result.members,
      },
      db: tx,
    });

    return result;
  });

  return {
    ok: true,
    recruitNo,
    statusCode: 200,
    party: updated,
    reply: buildSyncReply(updated, previousActiveCount),
  };
}

function buildBulkSyncReply(results: Awaited<ReturnType<typeof syncOneRecruit>>[]) {
  const success = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  const lines = [
    "[K-LOL.GG 구인구직 현황 반영 완료]",
    "",
    `반영 완료: ${success.length}개`,
    `반영 실패: ${failed.length}개`,
  ];

  if (success.length > 0) {
    lines.push("", "완료 목록");
    for (const result of success) {
      lines.push(`- #${result.recruitNo}`);
    }
  }

  if (failed.length > 0) {
    lines.push("", "실패 목록");
    for (const result of failed) {
      lines.push(`- #${result.recruitNo}: ${result.reply.replace(/\n/g, " / ")}`);
    }
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);
    if (secretRejected) return secretRejected;

    const message = getBodyText(body);
    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const recruitDate = getKakaoRecruitDateKey();
    const resetSeq = await getCurrentRecruitResetSeq(recruitDate);
    const todayRange = getKakaoRecruitTodayRange();
    const recruitNos = extractRecruitNos(message);
    const statusBlocks = splitRecruitStatusBlocks(message);

    if (recruitNos.length > 1 && statusBlocks.length > 1) {
      const results = [];
      for (const block of statusBlocks) {
        results.push(
          await syncOneRecruit({
            recruitNo: block.recruitNo,
            message: block.message,
            roomName,
            sender,
            recruitDate,
            resetSeq,
            todayRange,
          }),
        );
      }

      const hasSuccess = results.some((result) => result.ok);
      return partyRecruitJson(
        {
          bulk: true,
          results,
          reply: buildBulkSyncReply(results),
        },
        hasSuccess ? 200 : 400,
      );
    }

    if (recruitNos.length > 1) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 반영 실패]",
            "",
            "하나의 메시지에서 모집번호가 여러 개 발견되었습니다.",
            "구인현황 전체를 수정해 붙여넣을 때는 구분선이 필요합니다.",
            "가능하면 수정할 모집번호의 블록만 복사해서 붙여넣어주세요.",
          ].join("\n"),
        },
        400,
      );
    }

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
            "1. 재현",
          ].join("\n"),
        },
        400,
      );
    }

    const result = await syncOneRecruit({
      recruitNo,
      message,
      roomName,
      sender,
      recruitDate,
      resetSeq,
      todayRange,
    });

    return partyRecruitJson(
      {
        party: result.ok ? result.party : undefined,
        reply: result.reply,
      },
      result.statusCode,
    );
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
