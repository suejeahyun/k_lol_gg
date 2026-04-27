import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";

const APPLY_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"] as const;

type RouteContext = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type ApplyPositionValue = (typeof APPLY_POSITIONS)[number];

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
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const applies = await prisma.destructionParticipationApply.findMany({
      where: {
        tournamentId: id,
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
      tournament,
      players: applies.map((apply) => ({
        id: apply.player.id,
        name: apply.player.name,
        nickname: apply.player.nickname,
        tag: apply.player.tag,
        peakTier: apply.player.peakTier,
        currentTier: apply.player.currentTier,
        mainPosition: apply.mainPosition,
        subPositions: apply.subPositions,
        isCaptain: apply.isCaptain,
      })),
    });
  } catch (error: unknown) {
    console.error("[DESTRUCTION_PARTICIPATION_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가자 조회 중 오류가 발생했습니다." },
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

    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "잘못된 멸망전 ID입니다." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mainPosition = body.mainPosition;
    const subPositions = parseSubPositions(body.subPositions);
    const isCaptain = Boolean(body.isCaptain);

    if (!isApplyPosition(mainPosition)) {
      return NextResponse.json(
        { message: "주라인을 선택해주세요." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (tournament.status !== "RECRUITING") {
      return NextResponse.json(
        { message: "현재 모집 중인 멸망전이 아닙니다." },
        { status: 400 }
      );
    }

    const apply = await prisma.destructionParticipationApply.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: user.playerId,
        },
      },
      update: {
        mainPosition,
        subPositions,
        isCaptain,
        status: "APPLIED",
      },
      create: {
        tournamentId: id,
        playerId: user.playerId,
        mainPosition,
        subPositions,
        isCaptain,
        status: "APPLIED",
      },
    });

    return NextResponse.json({
      message: "멸망전 참가 신청이 완료되었습니다.",
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

    console.error("[DESTRUCTION_PARTICIPATION_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 참가 신청 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}