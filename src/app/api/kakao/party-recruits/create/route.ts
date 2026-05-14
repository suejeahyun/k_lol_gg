export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildCreateReply,
  getKakaoRecruitTodayRange,
  parseCreateRecruitCommand,
} from "@/lib/kakao/party-recruit";
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

    await archiveStaleRecruitParties();

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
            "자랭구인\n" +
            "일반구인\n" +
            "솔랭구인\n" +
            "칼바람구인\n" +
            "증바람구인\n" +
            "기타게임구인",
        },
        { status: 400 },
      );
    }

    const recruitNo = parsed.recruitNo ?? (await getNextRecruitNo());

    const [existing, finishedLog] = await Promise.all([
      prisma.recruitParty.findUnique({
        where: { recruitNo },
        include: { members: true },
      }),
      prisma.recruitPartyLog.findFirst({
        where: {
          recruitNo,
          action: "FINISHED",
          createdAt: getKakaoRecruitTodayRange(),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, createdAt: true, memberCount: true, maxMembers: true },
      }),
    ]);

    if (existing) {
      const activeCount = existing.members.filter(
        (member) => !member.isSubstitute && member.name.trim() !== "",
      ).length;
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 안내]\n\n" +
            `모집번호 #${recruitNo}는 이미 진행 중입니다.\n\n` +
            `현재 #${recruitNo} 상태:\n` +
            `${existing.title}\n` +
            `현재 인원: ${activeCount}/${existing.maxMembers}\n\n` +
            "새 구인글은 번호를 직접 지정하지 않고 생성해주세요.\n" +
            "예: 자랭구인",
        },
        { status: 409 },
      );
    }

    if (parsed.recruitNo !== null && finishedLog) {
      return NextResponse.json(
        {
          ok: false,
          formatVersion: PARTY_RECRUIT_FORMAT_VERSION,
          reply:
            "[K-LOL.GG 구인구직 안내]\n\n" +
            `모집번호 #${recruitNo}는 이미 마무리된 번호입니다.\n\n` +
            `마무리 기록: ${finishedLog.title || "구인글"}\n` +
            `최종 인원: ${finishedLog.memberCount}/${finishedLog.maxMembers}\n\n` +
            "새 구인글은 번호 없이 생성하면 다음 번호가 자동 배정됩니다.\n" +
            "예: 자랭구인",
        },
        { status: 409 },
      );
    }

    const party = await prisma.recruitParty.create({
      data: {
        recruitNo,
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
      reply: buildCreateReply(parsed.template, party.recruitNo),
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

async function getNextRecruitNo() {
  const todayRange = getKakaoRecruitTodayRange();
  const [latestActive, latestLog] = await Promise.all([
    prisma.recruitParty.findFirst({
      where: { createdAt: todayRange },
      orderBy: { recruitNo: "desc" },
      select: { recruitNo: true },
    }),
    prisma.recruitPartyLog.findFirst({
      where: {
        createdAt: todayRange,
        action: { in: ["FINISHED", "AUTO_EXPIRED"] },
      },
      orderBy: { recruitNo: "desc" },
      select: { recruitNo: true },
    }),
  ]);

  const lastNo = Math.max(
    latestActive?.recruitNo ?? 0,
    latestLog?.recruitNo ?? 0,
  );

  for (let offset = 1; offset <= 99; offset += 1) {
    const candidate = ((lastNo + offset - 1) % 99) + 1;
    const exists = await prisma.recruitParty.findUnique({
      where: { recruitNo: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  throw new Error(
    "오늘 사용 가능한 모집번호가 없습니다. 진행중인 구인글을 마무리해주세요.",
  );
}

async function archiveStaleRecruitParties() {
  const todayRange = getKakaoRecruitTodayRange();
  const staleParties = await prisma.recruitParty.findMany({
    where: { createdAt: { lt: todayRange.gte } },
    include: { members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }] } },
  });

  if (staleParties.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const party of staleParties) {
      await tx.recruitPartyLog.create({
        data: {
          recruitNo: party.recruitNo,
          type: String(party.type),
          title: party.title,
          action: "AUTO_EXPIRED",
          memberCount: party.members.filter((member) => !member.isSubstitute && member.name.trim() !== "").length,
          maxMembers: party.maxMembers,
          summary: "일자 변경으로 자동 마감되었습니다.",
          roomName: party.roomName,
          sender: "system",
        },
      });
      await tx.recruitParty.delete({ where: { id: party.id } });
    }
  });
}
