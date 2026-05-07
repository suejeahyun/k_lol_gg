export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

type UpdatePlayerBody = {
  name?: string;
  nickname?: string;
  tag?: string;
  peakTier?: string | null;
  currentTier?: string | null;
};

function normalizeTier(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidTierValue(value?: string | null) {
  const tier = normalizeTier(value);

  if (!tier) return true;

  const basicRegex = /^(아이언|브론즈|실버|골드|플래티넘|에메랄드|다이아) [1-4]$/;
  const masterRegex = /^마스터 (10층|[1-9]층)$/;
  const highRegex = /^(그랜드마스터|챌린저) \d+$/;

  return basicRegex.test(tier) || masterRegex.test(tier) || highRegex.test(tier);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        participants: {
          orderBy: {
            game: {
              series: {
                matchDate: "desc",
              },
            },
          },
          include: {
            champion: true,
            game: {
              include: {
                series: {
                  include: {
                    season: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(player);
  } catch (error) {
    console.error("[PLAYER_DETAIL_GET_ERROR]", error);

    return NextResponse.json(
      { message: "플레이어 상세 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id)) {
      return NextResponse.json(
        { message: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = (await request.json()) as UpdatePlayerBody;

    const name = body.name?.trim();
    const nickname = body.nickname?.trim();
    const tag = body.tag?.trim();
    const peakTier = normalizeTier(body.peakTier);
    const currentTier = normalizeTier(body.currentTier);

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그는 필수입니다." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(peakTier) || !isValidTierValue(currentTier)) {
      return NextResponse.json(
        {
          message:
            "티어 형식이 올바르지 않습니다. 예: 브론즈 2, 에메랄드 1, 마스터 3층, 그랜드마스터 500",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.player.findFirst({
      where: {
        nickname,
        tag,
        NOT: {
          id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "동일한 닉네임#태그를 가진 플레이어가 이미 존재합니다." },
        { status: 409 }
      );
    }

    const updatedPlayer = await prisma.$transaction(async (tx) => {
      const updated = await tx.player.update({
        where: { id },
        data: {
          name,
          nickname,
          tag,
          peakTier,
          currentTier,
          isActive: true,
          deactivatedAt: null,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "PLAYER_UPDATE",
          message: `플레이어 수정: ${player.name} (${player.nickname}#${player.tag}) → ${updated.name} (${updated.nickname}#${updated.tag})`,
        },
      });

      return updated;
    });

    return NextResponse.json({
      message: "플레이어가 수정되었습니다.",
      player: updatedPlayer,
    });
  } catch (error) {
    console.error("[PLAYER_DETAIL_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "플레이어 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { playerId } = await context.params;
    const id = Number(playerId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "유효하지 않은 playerId 입니다." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        isActive: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!player.isActive) {
      return NextResponse.json({
        message: "이미 비활성화된 플레이어입니다.",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
        },
      });

      await tx.adminLog.create({
        data: {
          action: "PLAYER_DEACTIVATE",
          message: `플레이어 비활성화: ${player.name} (${player.nickname}#${player.tag})`,
        },
      });
    });

    return NextResponse.json({
      message: "플레이어가 비활성화되었습니다. 기존 경기/통계 기록은 보존됩니다.",
    });
  } catch (error) {
    console.error("[PLAYER_DETAIL_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "플레이어 비활성화 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
