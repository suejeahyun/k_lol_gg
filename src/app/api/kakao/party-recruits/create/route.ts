import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { normalizeKakaoRequestId } from "@/lib/kakao/request-id";
import { getKakaoMessageValidationError } from "@/lib/kakao/input-guard";
import {
  buildCreateReply,
  buildRecruitPartyCode,
  getDisplayActiveMemberCount,
  getKakaoRecruitDateKey,
  parseCreateRecruitCommand,
} from "@/lib/kakao/party-recruit";
import { classifyKakaoRecruitMessage, buildWrongRecruitApiReply } from "@/lib/kakao/recruit-message-kind";
import {
  getCurrentRecruitResetSeq,
  getLatestRecruitResetLog,
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
  "인원수+인파티로 입력해주세요.",
  "예: 2인파티, 5인파티, 10인파티",
].join("\n");

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  try {
    const body = await readJsonBody(req);
    const secretRejected = rejectIfInvalidPartySecret(req, body.secret);

    if (secretRejected) {
      return secretRejected;
    }

    // 날짜가 바뀌어도 진행 중 구인글은 유지합니다.
    // 모집번호만 날짜/회차 기준으로 다시 #1부터 배정합니다.

    const message = getBodyText(body);
    const messageError = getKakaoMessageValidationError(message);
    if (messageError) {
      return partyRecruitJson({ reply: `[K-LOL.GG 파티구인 생성 실패]\n${messageError}` }, 400);
    }
    const classification = classifyKakaoRecruitMessage(message);
    if (classification.kind !== "PARTY_RECRUIT") {
      return partyRecruitJson(
        { reply: buildWrongRecruitApiReply({ expected: "파티구인", actual: classification.kind }) },
        400,
      );
    }

    const roomName = getBodyRoom(body);
    const sender = getBodySender(body);
    let requestKey = normalizeKakaoRequestId(body.requestId);

    const parsed = parseCreateRecruitCommand(message);

    if (!parsed) {
      return partyRecruitJson({ reply: CREATE_HELP }, 400);
    }

    if (requestKey) {
      const repeatedParty = await prisma.recruitParty.findUnique({
        where: { requestKey },
        include: { members: true },
      });
      if (repeatedParty?.status === "IN_PROGRESS") {
        return partyRecruitJson({
          party: repeatedParty,
          replayed: true,
          reply: buildCreateReply(parsed.template, repeatedParty.recruitNo),
        });
      }
      if (repeatedParty) requestKey = null;
    }

    if (roomName && sender) {
      const recentDuplicate = await prisma.recruitParty.findFirst({
        where: {
          roomName,
          hostName: sender,
          type: parsed.type,
          maxMembers: parsed.maxMembers,
          status: "IN_PROGRESS",
          createdAt: { gte: new Date(Date.now() - 15_000) },
        },
        orderBy: { createdAt: "desc" },
        include: { members: true },
      });
      if (recentDuplicate) {
        return partyRecruitJson({
          party: recentDuplicate,
          replayed: true,
          reply: buildCreateReply(parsed.template, recentDuplicate.recruitNo),
        });
      }
    }

    const recruitDate = getKakaoRecruitDateKey();
    const resetSeq = await getCurrentRecruitResetSeq(recruitDate);
    let recruitNo = parsed.recruitNo ?? (await getNextRecruitNo(recruitDate, resetSeq));
    let recruitCode = buildRecruitPartyCode({
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
          status: "IN_PROGRESS",
        },
        orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { updatedAt: "desc" }],
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
      const activeCount = getDisplayActiveMemberCount(existing.members, existing.maxMembers);

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
            "예시: /6인파티",
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
            `최종 인원: ${Math.min(finishedLog.memberCount, finishedLog.maxMembers)}/${finishedLog.maxMembers}`,
            "",
            "새 구인글은 번호 없이 생성하면 다음 번호가 자동 배정됩니다.",
            "예시: /6인파티",
          ].join("\n"),
        },
        409,
      );
    }

    let party: Awaited<ReturnType<typeof prisma.recruitParty.create>> | null = null;
    for (let attempt = 0; attempt < 3 && !party; attempt += 1) {
      try {
        party = await prisma.recruitParty.create({
          data: {
            recruitNo,
            recruitDate,
            resetSeq,
            recruitCode,
            requestKey,
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
      } catch (error) {
        const isNumberCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (requestKey && isNumberCollision) {
          const repeatedParty = await prisma.recruitParty.findUnique({
            where: { requestKey },
            include: { members: true },
          });
          if (repeatedParty) {
            return partyRecruitJson({
              party: repeatedParty,
              replayed: true,
              reply: buildCreateReply(parsed.template, repeatedParty.recruitNo),
            });
          }
        }
        if (parsed.recruitNo !== null || !isNumberCollision || attempt === 2) {
          throw error;
        }

        recruitNo = await getNextRecruitNo(recruitDate, resetSeq);
        recruitCode = buildRecruitPartyCode({
          recruitDate,
          maxMembers: parsed.maxMembers,
          recruitNo,
        });
      }
    }

    if (!party) {
      throw new Error("파티 모집번호 자동 배정에 실패했습니다.");
    }

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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return partyRecruitJson(
        {
          reply: [
            "[K-LOL.GG 구인구직 생성 실패]",
            "",
            "같은 모집번호가 동시에 생성되어 반영하지 못했습니다.",
            "번호를 지정하지 말고 인원수+인파티를 다시 입력해주세요.",
          ].join("\n"),
          error: message,
        },
        409,
      );
    }

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

    const [existsInCurrentSeq, existsActive] = await Promise.all([
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
          status: "IN_PROGRESS",
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!existsInCurrentSeq && !existsActive) {
      return candidate;
    }
  }

  throw new Error("사용 가능한 모집번호가 없습니다. 진행 중인 파티를 모집번호+ㅉ으로 마무리해주세요.");
}
