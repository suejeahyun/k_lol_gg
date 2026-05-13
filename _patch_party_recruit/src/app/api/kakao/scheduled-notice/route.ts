export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getTodayKstRange } from "@/lib/date/kst";
import { getRequiredSecretInProduction } from "@/lib/security/secrets";
import { prisma } from "@/lib/prisma/client";

type PositionKey = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type NoticeBody = {
  slot?: string | number | null;
  roomName?: string | null;
};

const TARGET_COUNT = 10;

const POSITION_LABEL: Record<PositionKey, string> = {
  TOP: "탑",
  JGL: "정글",
  MID: "미드",
  ADC: "원딜",
  SUP: "서포터",
};

const POSITION_ORDER: PositionKey[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function jsonReply(
  reply: string,
  extra: Record<string, unknown> = {},
  status = 200,
) {
  return NextResponse.json(
    {
      reply,
      ...extra,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function rejectIfInvalidSecret(req: NextRequest) {
  const secret = getRequiredSecretInProduction("KAKAO_OPENCHAT_SECRET");
  if (!secret) return null;

  const headerSecret = req.headers.get("x-kakao-openchat-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");

  if (headerSecret === secret || bearer === secret || querySecret === secret) {
    return null;
  }

  return jsonReply("인증되지 않은 요청입니다.", {}, 401);
}

function isPositionKey(value: unknown): value is PositionKey {
  return (
    value === "TOP" ||
    value === "JGL" ||
    value === "MID" ||
    value === "ADC" ||
    value === "SUP"
  );
}

function buildParticipationNotice(params: {
  total: number;
  positionCounts: Record<PositionKey, number>;
}) {
  const remain = Math.max(TARGET_COUNT - params.total, 0);

  const shortagePositions = POSITION_ORDER
    .filter((position) => params.positionCounts[position] < 2)
    .map((position) => POSITION_LABEL[position]);

  const shortageText =
    shortagePositions.length > 0 ? shortagePositions.join(", ") : "없음";

  return [
    "[K-LOL.GG 내전 참가 안내]",
    `현재 참가자: ${params.total}명`,
    `${TARGET_COUNT}명 기준 ${remain}명이 더 필요합니다.`,
    "포지션 현황 :",
    `탑 ${params.positionCounts.TOP}명`,
    `정글 ${params.positionCounts.JGL}명`,
    `미드 ${params.positionCounts.MID}명`,
    `원딜 ${params.positionCounts.ADC}명`,
    `서포터 ${params.positionCounts.SUP}명`,
    `부족 포지션: ${shortageText}`,
    "참가 가능하신 분은 사이트에서 내전 참가 신청 부탁드립니다.",
  ].join("\n");
}

async function getActiveSeasonId() {
  const activeSeason = await prisma.season.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      id: "desc",
    },
    select: {
      id: true,
    },
  });

  return activeSeason?.id ?? null;
}

async function createNotice(req: NextRequest, body?: NoticeBody) {
  const secretRejected = rejectIfInvalidSecret(req);
  if (secretRejected) return secretRejected;

  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "KAKAO_SCHEDULED_NOTICE",
    limit: 20,
    windowSeconds: 60,
  });

  if (rateLimitRejected) return rateLimitRejected;

  const slot =
    body?.slot ??
    req.nextUrl.searchParams.get("slot") ??
    req.nextUrl.searchParams.get("hour");

  const roomName =
    body?.roomName ??
    req.nextUrl.searchParams.get("room") ??
    null;

  const { start, end } = getTodayKstRange();
  const activeSeasonId = await getActiveSeasonId();

  const positionCounts: Record<PositionKey, number> = {
    TOP: 0,
    JGL: 0,
    MID: 0,
    ADC: 0,
    SUP: 0,
  };

  if (!activeSeasonId) {
    const reply = buildParticipationNotice({
      total: 0,
      positionCounts,
    });

    return jsonReply(reply, {
      slot,
      roomName,
      activeSeasonId: null,
      total: 0,
      positionCounts,
      warning: "활성 시즌이 없습니다.",
    });
  }

  const participants = await prisma.seasonParticipationApply.findMany({
    where: {
      seasonId: activeSeasonId,
      status: "APPLIED",
      applyDate: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
      mainPosition: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  for (const participant of participants) {
    if (isPositionKey(participant.mainPosition)) {
      positionCounts[participant.mainPosition] += 1;
    }
  }

  const reply = buildParticipationNotice({
    total: participants.length,
    positionCounts,
  });

  return jsonReply(reply, {
    slot,
    roomName,
    activeSeasonId,
    total: participants.length,
    positionCounts,
    dateRange: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });
}

function getFallbackReply() {
  return buildParticipationNotice({
    total: 0,
    positionCounts: {
      TOP: 0,
      JGL: 0,
      MID: 0,
      ADC: 0,
      SUP: 0,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await createNotice(req);
  } catch (error) {
    console.error("[KAKAO_SCHEDULED_NOTICE_GET_ERROR]", error);

    if (error instanceof Error && error.message.includes("KAKAO_OPENCHAT_SECRET")) {
      return jsonReply("서버 인증 환경변수가 설정되지 않았습니다.", {}, 500);
    }

    return jsonReply(
      getFallbackReply(),
      {
        fallback: true,
      },
      200,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as NoticeBody;
    return await createNotice(req, body);
  } catch (error) {
    console.error("[KAKAO_SCHEDULED_NOTICE_POST_ERROR]", error);

    if (error instanceof Error && error.message.includes("KAKAO_OPENCHAT_SECRET")) {
      return jsonReply("서버 인증 환경변수가 설정되지 않았습니다.", {}, 500);
    }

    return jsonReply(
      getFallbackReply(),
      {
        fallback: true,
      },
      200,
    );
  }
}