export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma/client";
import {
  buildRecruitStatusReply,
  filterRecruitingParties,
} from "@/lib/kakao/party-recruit";
import { runRecruitIdleAutoFinishIfNeeded } from "@/lib/kakao/recruit-idle-auto-finish";
import {
  partyRecruitJson,
  readJsonBody,
  rejectIfInvalidPartySecret,
} from "../_shared";

const STATUS_QUERY_TIMEOUT_MS = 5000;
const STATUS_TAKE = 30;

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
      setTimeout(
        () => reject(new Error("RECRUIT_STATUS_QUERY_TIMEOUT")),
        timeoutMs,
      );
    }),
  ]);
}

function extractDetailRecruitNo(message: unknown) {
  const text = String(message || "").trim();
  const match = text.match(/^\/?(?:구인상세|상세)\s*#?\s*(\d{1,2})\s*$/);
  if (!match) return null;

  const recruitNo = Number(match[1]);
  return Number.isInteger(recruitNo) && recruitNo >= 1 && recruitNo <= 99
    ? recruitNo
    : null;
}

async function getRecruitStatusPayload(detailRecruitNo?: number | null) {
  const allParties = await prisma.recruitParty.findMany({
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
    orderBy: [
      { recruitDate: "desc" },
      { resetSeq: "desc" },
      { recruitNo: "asc" },
    ],
    take: STATUS_TAKE,
  });

  const parties = filterRecruitingParties(allParties).slice(0, 20);

  return {
    empty: parties.length === 0,
    parties,
    reply: buildRecruitStatusReply(parties, {
      detailRecruitNo,
      detailThreshold: 5,
    }),
  };
}

async function handleStatus(
  req: NextRequest,
  bodySecret?: unknown,
  message?: unknown,
) {
  const rejected = rejectIfInvalidPartySecret(req, bodySecret);
  if (rejected) return rejected;

  try {
    const queryDetailNo = extractDetailRecruitNo(
      req.nextUrl.searchParams.get("message") ||
        req.nextUrl.searchParams.get("q") ||
        req.nextUrl.searchParams.get("detailNo"),
    );
    const bodyDetailNo = extractDetailRecruitNo(message);
    const directDetailNo = Number(req.nextUrl.searchParams.get("detailNo"));
    const detailRecruitNo =
      bodyDetailNo ??
      queryDetailNo ??
      (Number.isInteger(directDetailNo) &&
      directDetailNo >= 1 &&
      directDetailNo <= 99
        ? directDetailNo
        : null);

    await runRecruitIdleAutoFinishIfNeeded({ source: "kakao-status" });

    const payload = await withTimeout(
      getRecruitStatusPayload(detailRecruitNo),
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
        reply: `[K-LOL.GG 구인구직 현황 실패]\n${
          message || "서버 처리 중 오류가 발생했습니다."
        }`,
        error: message,
      },
      500,
    );
  }
}

export async function GET(req: NextRequest) {
  return handleStatus(req);
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  return handleStatus(req, body.secret, body.message || body.text);
}
