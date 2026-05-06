import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { verifyAuthToken } from "@/lib/auth/token";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPosition = (typeof POSITIONS)[number];

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isApplyPosition(value: unknown): value is ApplyPosition {
  return typeof value === "string" && POSITIONS.includes(value as ApplyPosition);
}

function normalizeSubPositions(value: unknown): ApplyPosition[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isApplyPosition);
}

async function findLoginPlayer(req: NextRequest) {
  const token = req.cookies.get("user_token")?.value;

  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload?.userAccountId) return null;

  const userAccountId = Number(payload.userAccountId);

  if (!Number.isInteger(userAccountId) || userAccountId <= 0) {
    return null;
  }

  const user = await prisma.userAccount.findUnique({
    where: {
      id: userAccountId,
    },
    select: {
      id: true,
      status: true,
      player: {
        select: {
          id: true,
          name: true,
          nickname: true,
          tag: true,
        },
      },
    },
  });

  if (!user || user.status !== "APPROVED") {
    return null;
  }

  return user.player;
}

export async function GET(req: NextRequest) {
  try {
    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const loginPlayer = await findLoginPlayer(req);

    if (!season) {
      return NextResponse.json({
        loginPlayerId: loginPlayer?.id ?? null,
        players: [],
      });
    }

    const { start, end } = getTodayRange();

    const applies = await prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: season.id,
        applyDate: {
          gte: start,
          lte: end,
        },
        status: "APPLIED",
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
            tag: true,
            peakTier: true,
            currentTier: true,
          },
        },
      },
    });

    return NextResponse.json({
      loginPlayerId: loginPlayer?.id ?? null,
      players: applies.map((apply) => ({
        applyId: apply.id,
        id: apply.player.id,
        name: apply.player.name,
        nickname: apply.player.nickname,
        tag: apply.player.tag,
        peakTier: apply.player.peakTier,
        currentTier: apply.player.currentTier,
        mainPosition: apply.mainPosition,
        subPositions: apply.subPositions,
      })),
    });
  } catch (error: unknown) {
    console.error("[SEASON_PARTICIPATION_GET_ERROR]", error);

    return NextResponse.json(
      { message: "참가자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const mainPosition = body.mainPosition;
    const subPositions = normalizeSubPositions(body.subPositions);

    if (!isApplyPosition(mainPosition)) {
      return NextResponse.json(
        { message: "주라인을 선택해주세요." },
        { status: 400 }
      );
    }

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "활성 시즌이 없습니다." },
        { status: 404 }
      );
    }

    const loginPlayer = await findLoginPlayer(req);

    if (!loginPlayer) {
      return NextResponse.json(
        {
          message:
            "로그인 정보와 연결된 플레이어를 찾을 수 없습니다. 관리자에게 계정 연결을 요청해주세요.",
        },
        { status: 401 }
      );
    }

    const { start } = getTodayRange();

    const apply = await prisma.seasonParticipationApply.upsert({
      where: {
        seasonId_playerId_applyDate: {
          seasonId: season.id,
          playerId: loginPlayer.id,
          applyDate: start,
        },
      },
      create: {
        seasonId: season.id,
        playerId: loginPlayer.id,
        applyDate: start,
        mainPosition,
        subPositions,
        status: "APPLIED",
      },
      update: {
        mainPosition,
        subPositions,
        status: "APPLIED",
      },
    });

    await writeAdminLog({
      action: "SEASON_PARTICIPATION_APPLY",
      message: `시즌 참가 신청: 시즌 #${season.id}, 플레이어 #${loginPlayer.id} ${loginPlayer.nickname}#${loginPlayer.tag}, 신청 #${apply.id}`,
    });

    return NextResponse.json({
      message: "참가 신청이 완료되었습니다.",
    });
  } catch (error: unknown) {
    console.error("[SEASON_PARTICIPATION_POST_ERROR]", error);

    return NextResponse.json(
      { message: "참가 신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const playerId = Number(body.playerId);

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 참가자입니다." },
        { status: 400 }
      );
    }

    const loginPlayer = await findLoginPlayer(req);

    if (!loginPlayer) {
      return NextResponse.json(
        { message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    if (loginPlayer.id !== playerId) {
      return NextResponse.json(
        { message: "본인의 참가 신청만 취소할 수 있습니다." },
        { status: 403 }
      );
    }

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "활성 시즌이 없습니다." },
        { status: 404 }
      );
    }

    const { start, end } = getTodayRange();

    const deleted = await prisma.seasonParticipationApply.deleteMany({
      where: {
        seasonId: season.id,
        playerId,
        applyDate: {
          gte: start,
          lte: end,
        },
        status: "APPLIED",
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { message: "오늘 참가 신청 내역이 없습니다." },
        { status: 404 }
      );
    }

    await writeAdminLog({
      action: "SEASON_PARTICIPATION_CANCEL",
      message: `시즌 참가 취소: 시즌 #${season.id}, 플레이어 #${playerId} ${loginPlayer.nickname}#${loginPlayer.tag}`,
    });

    return NextResponse.json({
      message: "참가가 취소되었습니다.",
    });
  } catch (error: unknown) {
    console.error("[SEASON_PARTICIPATION_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "참가 취소 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
