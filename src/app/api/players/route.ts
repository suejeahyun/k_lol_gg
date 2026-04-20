import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type CreatePlayerBody = {
  name: string;
  nickname: string;
  tag: string;
  peakTier?: string | null;
  currentTier?: string | null;
};

const BASIC_TIERS = [
  "아이언",
  "브론즈",
  "실버",
  "골드",
  "플래티넘",
  "에메랄드",
  "다이아",
] as const;

const MASTER_TIERS = ["마스터"] as const;
const HIGH_TIERS = ["그랜드마스터", "챌린저"] as const;

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

export async function GET() {
  try {
    const players = await prisma.player.findMany({
      orderBy: { id: "desc" },
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

    return NextResponse.json(players);
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
        { message: "최대 티어 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (!isValidTierValue(currentTier)) {
      return NextResponse.json(
        { message: "현재 티어 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const created = await prisma.player.create({
      data: {
        name,
        nickname,
        tag,
        peakTier,
        currentTier,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[PLAYER_CREATE_POST_ERROR]", error);
    return NextResponse.json(
      { message: "플레이어 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}