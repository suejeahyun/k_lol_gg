import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreatePlayerBody = {
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

export async function GET(request: NextRequest) {
  try {
    const pageParam = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const pageSizeParam = Number(
      request.nextUrl.searchParams.get("pageSize") ?? "10"
    );
    const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";

    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize =
      Number.isInteger(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : 10;

    const where = name
      ? {
          name: {
            contains: name,
            mode: "insensitive" as const,
          },
        }
      : undefined;

    const totalCount = await prisma.player.count({
      where,
    });

    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * pageSize;

    const players = await prisma.player.findMany({
      where,
      orderBy: [{ id: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        peakTier: true,
        currentTier: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      items: players,
      totalCount,
      currentPage: safePage,
      totalPages,
      pageSize,
    });
  } catch (error) {
    console.error("[PLAYERS_GET_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 목록 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePlayerBody;

    const name = body.name?.trim();
    const nickname = body.nickname?.trim();
    const tag = body.tag?.trim();
    const peakTier = normalizeTier(body.peakTier);
    const currentTier = normalizeTier(body.currentTier);

    if (!name || !nickname || !tag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(peakTier)) {
      return NextResponse.json(
        {
          message:
            "최대 티어 형식이 올바르지 않습니다. 예: 브론즈 2, 에메랄드 1, 마스터 3층, 그랜드마스터 500",
        },
        { status: 400 }
      );
    }

    if (!isValidTierValue(currentTier)) {
      return NextResponse.json(
        {
          message:
            "현재 티어 형식이 올바르지 않습니다. 예: 브론즈 2, 에메랄드 1, 마스터 3층, 그랜드마스터 500",
        },
        { status: 400 }
      );
    }

    const existing = await prisma.player.findFirst({
      where: {
        nickname,
        tag,
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "동일한 닉네임#태그를 가진 플레이어가 이미 존재합니다." },
        { status: 409 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          name,
          nickname,
          tag,
          peakTier,
          currentTier,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "PLAYER_CREATE",
          message: `플레이어 등록: ${player.name} (${player.nickname}#${player.tag})`,
        },
      });

      return player;
    });

    return NextResponse.json(
      {
        message: "플레이어가 등록되었습니다.",
        player: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[PLAYER_CREATE_POST_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
