export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildCreateReply,
  getActiveMemberCount,
  getKakaoRecruitDateKey,
  getKakaoRecruitTodayRange,
  parseCreateRecruitCommand,
} from "@/lib/kakao/party-recruit";
import {
  getBodyRoom,
  getBodySender,
  getBodyText,
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

const CREATE_HELP = [
  "[K-LOL.GG 구인구직 생성 실패]",
  "",
  "명령어 형식이 올바르지 않습니다.",
  "",
  "사용 가능한 명령어",
  "자랭구인 또는 /자랭구인",
  "일반구인 또는 /일반구인",
  "솔랭구인 또는 /솔랭구인",
  "칼바람구인 또는 /칼바람구인",
  "증바람구인 또는 /증바람구인",
  "롤체일반구인 또는 /롤체일반구인",
  "롤체랭크구인 또는 /롤체랭크구인",
  "더블업구인 또는 /더블업구인",
  "",
  "예시",
  "/자랭구인",
  "/롤체랭크구인",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);

    if (secretRejected) {
      return secretRejected;
    }

    await archiveStaleRecruitParties();

    const message = getBodyText(body);
    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    const parsed = parseCreateRecruitCommand(message);

    if (!parsed) {
      return partyRecruitJson({ reply: CREATE_HELP }, 400);
    }

    const recruitDate = getKakaoRecruitDateKey();
    const recruitNo = parsed.recruitNo ?? (await getNextRecruitNo(recruitDate));
    const todayRange = getKakaoRecruitTodayRange();

    const [existing, finishedLog] = await Promise.all([
      prisma.recruitParty.findFirst({
        where: {
          recruitNo,
          recruitDate,
        },
        include: {
          members: true,
        },
      }),
      prisma.recruitPartyLog.findFirst({
        where: {
          recruitNo,
          action: "FINISHED",
          createdAt: todayRange,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          memberCount: true,
          maxMembers: true,
        },
      }),
    ]);

    if (existing) {
      const activeCount = getActiveMemberCount(existing.members);

      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 안내]",
            "",
            `모집번호 #${recruitNo}은 이미 진행 중입니다.`,
            "",
            `현재 #${recruitNo} 상태:`,
            existing.title,
            `현재 인원: ${activeCount}/${existing.maxMembers}`,
            "",
            "새 구인글은 번호를 직접 지정하지 않고 생성해주세요.",
            "예시: /자랭구인",
          ].join("\n"),
        },
        409,
      );
    }

    if (parsed.recruitNo !== null && finishedLog) {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 안내]",
            "",
            `모집번호 #${recruitNo}은 이미 마무리된 번호입니다.`,
            "",
            `마무리 기록: ${finishedLog.title || "구인글"}`,
            `최종 인원: ${finishedLog.memberCount}/${finishedLog.maxMembers}`,
            "",
            "새 구인글은 번호 없이 생성하면 다음 번호가 자동 배정됩니다.",
            "예시: /자랭구인",
          ].join("\n"),
        },
        409,
      );
    }

    const party = await prisma.recruitParty.create({
      data: {
        recruitNo,
        recruitDate,
        type: parsed.type,
        status: "IN_PROGRESS",
        title: parsed.title,
        roomName,
        hostName: sender,
        maxMembers: parsed.maxMembers,
      },
      include: {
        members: true,
      },
    });

    await writeAdminLog({
      action: "KAKAO_PARTY_RECRUIT_CREATE",
      message: `카카오 구인구직 파티 생성: #${party.recruitNo} ${party.title}`,
      targetType: "RecruitParty",
      targetId: party.id,
      afterJson: {
        recruitNo: party.recruitNo,
        recruitDate: party.recruitDate,
        type: party.type,
        roomName,
        sender,
      },
    });

    return partyRecruitJson({
      party,
      reply: buildCreateReply(parsed.template, party.recruitNo),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return partyRecruitJson(
      {
        reply: [
          "[K-LOL.GG 구인구직 생성 실패]",
          "",
          message || "서버 처리 중 오류가 발생했습니다.",
        ].join("\n"),
        error: message,
      },
      500,
    );
  }
}

async function getNextRecruitNo(recruitDate = getKakaoRecruitDateKey()) {
  const todayRange = getKakaoRecruitTodayRange();

  const [latestActive, latestLog] = await Promise.all([
    prisma.recruitParty.findFirst({
      where: {
        recruitDate,
      },
      orderBy: {
        recruitNo: "desc",
      },
      select: {
        recruitNo: true,
      },
    }),
    prisma.recruitPartyLog.findFirst({
      where: {
        createdAt: todayRange,
        action: {
          in: ["FINISHED", "AUTO_EXPIRED"],
        },
      },
      orderBy: {
        recruitNo: "desc",
      },
      select: {
        recruitNo: true,
      },
    }),
  ]);

  const lastNo = Math.max(
    latestActive?.recruitNo ?? 0,
    latestLog?.recruitNo ?? 0,
  );

  for (let offset = 1; offset <= 99; offset += 1) {
    const candidate = ((lastNo + offset - 1) % 99) + 1;

    const exists = await prisma.recruitParty.findFirst({
      where: {
        recruitNo: candidate,
        recruitDate,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      return candidate;
    }
  }

  throw new Error("오늘 사용 가능한 모집번호가 없습니다. 진행 중인 구인글을 마무리해주세요.");
}

async function archiveStaleRecruitParties() {
  const todayRange = getKakaoRecruitTodayRange();
  const recruitDate = getKakaoRecruitDateKey();

  const staleParties = await prisma.recruitParty.findMany({
    where: {
      OR: [
        { recruitDate: { not: recruitDate } },
        { createdAt: { lt: todayRange.gte } },
      ],
    },
    include: {
      members: {
        orderBy: [
          {
            slotNo: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
    },
  });

  if (staleParties.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const party of staleParties) {
      await tx.recruitPartyLog.create({
        data: {
          recruitNo: party.recruitNo,
          type: String(party.type),
          title: party.title,
          action: "AUTO_EXPIRED",
          memberCount: getActiveMemberCount(party.members),
          maxMembers: party.maxMembers,
          summary: "날짜 변경으로 자동 마감되었습니다.",
          roomName: party.roomName,
          sender: "system",
        },
      });

      await tx.recruitParty.delete({
        where: {
          id: party.id,
        },
      });
    }
  });
}