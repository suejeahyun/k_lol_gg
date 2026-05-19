export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import {
  buildCreateReply,
  buildRecruitPartyCode,
  getActiveMemberCount,
  getKakaoRecruitDateKey,
  parseCreateRecruitCommand,
} from "@/lib/kakao/party-recruit";
import {
  buildRecruitResetReply,
  getCurrentRecruitResetSeq,
  getLatestRecruitResetLog,
  isRecruitResetCommand,
  resetRecruitNumbers,
} from "@/lib/kakao/recruit-reset";
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
  "2인파티 또는 /2인파티",
  "3인파티 또는 /3인파티",
  "4인파티 또는 /4인파티",
  "5인파티 또는 /5인파티",
  "5인협곡파티 또는 /5인협곡파티",
  "8인파티 또는 /8인파티",
  "10인파티 또는 /10인파티",
  "",
  "기존 명령어",
  "자랭구인 또는 /자랭구인",
  "일반구인 또는 /일반구인",
  "솔랭구인 또는 /솔랭구인",
  "칼바람구인 또는 /칼바람구인",
  "증바람구인 또는 /증바람구인",
  "롤체일반구인 또는 /롤체일반구인",
  "롤체랭크구인 또는 /롤체랭크구인",
  "더블업구인 또는 /더블업구인",
  "",
  "관리 명령어",
  "모집번호초기화 또는 /모집번호초기화",
  "",
  "예시",
  "/2인파티",
  "/5인협곡파티",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);

    if (secretRejected) {
      return secretRejected;
    }

    // 날짜가 바뀌어도 진행 중 구인글은 유지합니다.
    // 모집번호만 날짜/회차 기준으로 다시 #1부터 배정합니다.

    const message = getBodyText(body);
    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);

    if (isRecruitResetCommand(message)) {
      const result = await resetRecruitNumbers({ roomName, sender });
      return partyRecruitJson({
        result,
        reply: buildRecruitResetReply(result),
      });
    }

    const parsed = parseCreateRecruitCommand(message);

    if (!parsed) {
      return partyRecruitJson({ reply: CREATE_HELP }, 400);
    }

    const recruitDate = getKakaoRecruitDateKey();
    const resetSeq = await getCurrentRecruitResetSeq(recruitDate);
    const recruitNo = parsed.recruitNo ?? (await getNextRecruitNo(recruitDate, resetSeq));
    const recruitCode = buildRecruitPartyCode({
      recruitDate,
      maxMembers: parsed.maxMembers,
      recruitNo,
    });
    const latestReset = await getLatestRecruitResetLog(recruitDate);
    const createdAfterLatestReset = latestReset ? { gt: latestReset.createdAt } : undefined;

    const [existing, finishedLog] = await Promise.all([
      prisma.recruitParty.findFirst({
        where: {
          recruitNo,
          recruitDate,
          status: "IN_PROGRESS",
        },
        include: {
          members: true,
        },
      }),
      prisma.recruitPartyLog.findFirst({
        where: {
          recruitNo,
          recruitDate,
          resetSeq,
          action: "FINISHED",
          ...(createdAfterLatestReset ? { createdAt: createdAfterLatestReset } : {}),
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
            "예시: /2인파티",
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
            "예시: /2인파티",
          ].join("\n"),
        },
        409,
      );
    }

    const party = await prisma.recruitParty.create({
      data: {
        recruitNo,
        recruitDate,
        resetSeq,
        recruitCode,
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
        resetSeq: party.resetSeq,
        recruitCode: party.recruitCode,
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

async function getNextRecruitNo(recruitDate = getKakaoRecruitDateKey(), resetSeq = 0) {
  const latestReset = await getLatestRecruitResetLog(recruitDate);
  const createdAfterLatestReset = latestReset ? { gt: latestReset.createdAt } : undefined;

  const latestLog = await prisma.recruitPartyLog.findFirst({
    where: {
      recruitDate,
      resetSeq,
      action: {
        in: ["FINISHED", "AUTO_EXPIRED"],
      },
      ...(createdAfterLatestReset ? { createdAt: createdAfterLatestReset } : {}),
    },
    orderBy: {
      recruitNo: "desc",
    },
    select: {
      recruitNo: true,
    },
  });

  const lastNo = latestLog?.recruitNo ?? 0;

  for (let offset = 1; offset <= 99; offset += 1) {
    const candidate = ((lastNo + offset - 1) % 99) + 1;

    const [existsInCurrentSeq, existsActiveToday] = await Promise.all([
      prisma.recruitParty.findFirst({
        where: {
          recruitNo: candidate,
          recruitDate,
          resetSeq,
        },
        select: {
          id: true,
        },
      }),
      prisma.recruitParty.findFirst({
        where: {
          recruitNo: candidate,
          recruitDate,
          status: "IN_PROGRESS",
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!existsInCurrentSeq && !existsActiveToday) {
      return candidate;
    }
  }

  throw new Error("오늘 사용 가능한 모집번호가 없습니다. 진행 중인 구인글을 마무리하거나 모집번호초기화를 실행해주세요.");
}
