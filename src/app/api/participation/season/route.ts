import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";

const APPLY_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPositionValue = (typeof APPLY_POSITIONS)[number];

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isApplyPosition(value: unknown): value is ApplyPositionValue {
  return (
    typeof value === "string" &&
    (APPLY_POSITIONS as readonly string[]).includes(value)
  );
}

function parseSubPositions(value: unknown): ApplyPositionValue[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isApplyPosition);
}

export async function GET() {
  try {
    const today = getTodayStart();

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "현재 활성 시즌이 없습니다." },
        { status: 404 }
      );
    }

    const applies = await prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: season.id,
        applyDate: today,
        status: "APPLIED",
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
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json({
      season,
      applyDate: today,
      players: applies.map((apply) => ({
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
      { message: "시즌내전 참가자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json(
        { message: "연결된 플레이어 정보가 없습니다." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mainPosition = body.mainPosition;
    const subPositions = parseSubPositions(body.subPositions);

    if (!isApplyPosition(mainPosition)) {
      return NextResponse.json(
        { message: "주라인을 선택해주세요." },
        { status: 400 }
      );
    }

    const today = getTodayStart();

    const season = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "현재 활성 시즌이 없습니다." },
        { status: 404 }
      );
    }

    const apply = await prisma.seasonParticipationApply.upsert({
      where: {
        seasonId_playerId_applyDate: {
          seasonId: season.id,
          playerId: user.playerId,
          applyDate: today,
        },
      },
      update: {
        status: "APPLIED",
        mainPosition,
        subPositions,
      },
      create: {
        seasonId: season.id,
        playerId: user.playerId,
        applyDate: today,
        mainPosition,
        subPositions,
        status: "APPLIED",
      },
    });

    return NextResponse.json({
      message: "오늘 시즌내전 참가 신청이 완료되었습니다.",
      apply,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
          { message: "로그인이 필요합니다." },
          { status: 401 }
        );
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json(
          { message: "관리자 승인 후 참가 신청이 가능합니다." },
          { status: 403 }
        );
      }
    }

    console.error("[SEASON_PARTICIPATION_POST_ERROR]", error);

    return NextResponse.json(
      { message: "시즌내전 참가 신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}