import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await requireApprovedUser();

    const player = await prisma.player.findUnique({
      where: {
        userAccountId: user.userAccountId,
      },
    });

    return NextResponse.json({ player });
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
          { message: "관리자 승인 후 이용 가능합니다." },
          { status: 403 }
        );
      }
    }

    console.error("[MY_PLAYER_GET_ERROR]", error);

    return NextResponse.json(
      { message: "내 정보 조회 중 오류 발생" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApprovedUser();
    const body = await req.json();

    const { nickname, tag, peakTier, currentTier } = body;

    if (!nickname || !tag) {
      return NextResponse.json(
        { message: "닉네임과 태그는 필수입니다." },
        { status: 400 }
      );
    }

    const existing = await prisma.player.findFirst({
      where: {
        nickname,
        tag,
        NOT: {
          userAccountId: user.userAccountId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "이미 사용 중인 닉네임#태그입니다." },
        { status: 409 }
      );
    }

    const updated = await prisma.player.update({
      where: {
        userAccountId: user.userAccountId,
      },
      data: {
        nickname,
        tag,
        peakTier: peakTier || null,
        currentTier: currentTier || null,
      },
    });

    return NextResponse.json({ player: updated });
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
          { message: "관리자 승인 후 이용 가능합니다." },
          { status: 403 }
        );
      }
    }

    console.error("[MY_PLAYER_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "내 정보 수정 중 오류 발생" },
      { status: 500 }
    );
  }
}