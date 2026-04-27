import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";

const APPLY_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type ApplyPositionValue = (typeof APPLY_POSITIONS)[number];

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

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

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { eventId } = await params;
    const id = Number(eventId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        mode: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const applies = await prisma.eventParticipationApply.findMany({
      where: {
        eventId: id,
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
      event,
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
    console.error("[EVENT_PARTICIPATION_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 참가자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json(
        { message: "연결된 플레이어 정보가 없습니다." },
        { status: 400 }
      );
    }

    const { eventId } = await params;
    const id = Number(eventId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 이벤트 ID입니다." },
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

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (event.status !== "RECRUITING") {
      return NextResponse.json(
        { message: "현재 모집 중인 이벤트 내전이 아닙니다." },
        { status: 400 }
      );
    }

    const apply = await prisma.eventParticipationApply.upsert({
      where: {
        eventId_playerId: {
          eventId: id,
          playerId: user.playerId,
        },
      },
      update: {
        mainPosition,
        subPositions,
        status: "APPLIED",
      },
      create: {
        eventId: id,
        playerId: user.playerId,
        mainPosition,
        subPositions,
        status: "APPLIED",
      },
    });

    return NextResponse.json({
      message: "이벤트 내전 참가 신청이 완료되었습니다.",
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

    console.error("[EVENT_PARTICIPATION_POST_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 참가 신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}