export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { buildRecruitStatusReply } from "@/lib/kakao/party-recruit";
import { partyRecruitJson } from "../_shared";

const STATUS_QUERY_TIMEOUT_MS = 6500;
const STATUS_TAKE = 20;

function buildTimeoutReply() {
  return [
    "[K-LOL.GG 구인구직 현황]",
    "",
    "현황 조회가 지연되고 있습니다.",
    "잠시 후 다시 구인현황을 입력해주세요.",
    "",
    "현황 보기:",
    "https://k-lol-gg.vercel.app/recruit",
  ].join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("RECRUIT_STATUS_QUERY_TIMEOUT")), timeoutMs);
    }),
  ]);
}

async function getRecruitStatusPayload() {
  const parties = await prisma.recruitParty.findMany({
    where: { status: "IN_PROGRESS" },
    select: {
      id: true,
      recruitNo: true,
      recruitDate: true,
      resetSeq: true,
      recruitCode: true,
      type: true,
      status: true,
      title: true,
      roomName: true,
      hostName: true,
      startTimeText: true,
      tierText: true,
      preferredLineText: true,
      playStyle: true,
      note: true,
      maxMembers: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          name: true,
          position: true,
          slotNo: true,
          isSubstitute: true,
          createdAt: true,
        },
        orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
    take: STATUS_TAKE,
  });

  return {
    empty: parties.length === 0,
    parties,
    reply: buildRecruitStatusReply(parties),
  };
}

async function handleStatus() {
  try {
    const payload = await withTimeout(
      getRecruitStatusPayload(),
      STATUS_QUERY_TIMEOUT_MS,
    );

    return partyRecruitJson(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === "RECRUIT_STATUS_QUERY_TIMEOUT") {
      return partyRecruitJson(
        {
          empty: false,
          timeout: true,
          reply: buildTimeoutReply(),
          error: message,
        },
        200,
      );
    }

    return partyRecruitJson(
      {
        reply: `[K-LOL.GG 구인구직 현황 실패]\n${message || "서버 처리 중 오류가 발생했습니다."}`,
        error: message,
      },
      500,
    );
  }
}

export async function GET() {
  return handleStatus();
}

export async function POST(_req: NextRequest) {
  return handleStatus();
}