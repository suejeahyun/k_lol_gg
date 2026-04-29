import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { hashPassword } from "@/lib/auth/password";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      password,
      name,
      nickname,
      tag,
      peakTier,
      currentTier,
    } = body;

    if (!userId || !password || !name || !nickname || !tag) {
      return NextResponse.json(
        { message: "아이디, 비밀번호, 이름, 닉네임, 태그는 필수입니다." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.userAccount.findUnique({
      where: { userId },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "이미 사용 중인 아이디입니다." },
        { status: 409 }
      );
    }

    const existingPlayer = await prisma.player.findUnique({
      where: {
        nickname_tag: {
          nickname,
          tag,
        },
      },
    });

    if (existingPlayer) {
      return NextResponse.json(
        { message: "이미 등록된 닉네임과 태그입니다." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.create({
        data: {
          userId,
          passwordHash,
          status: "PENDING",
          role: "USER",
        },
      });

      await tx.player.create({
        data: {
          name,
          nickname,
          tag,
          peakTier: peakTier || null,
          currentTier: currentTier || null,
          userAccountId: user.id,
        },
      });
    });

    return NextResponse.json(
      {
        message:
          "회원가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[AUTH_SIGNUP_POST_ERROR]", error);

    return NextResponse.json(
      { message: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}