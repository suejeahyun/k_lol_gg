import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { signAuthToken } from "@/lib/auth/token";

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return NextResponse.json(
        { message: "아이디와 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    const user = await prisma.userAccount.findUnique({
      where: { userId },
      include: {
        player: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const token = signAuthToken({
      userAccountId: user.id,
      userId: user.userId,
      role: user.role,
      status: user.status,
      playerId: user.player?.id ?? null,
    });

    const res = NextResponse.json({
      message:
        user.status === "APPROVED"
          ? "로그인되었습니다."
          : "로그인되었습니다. 현재 관리자 승인 대기 상태입니다.",
      user: {
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        playerId: user.player?.id ?? null,
      },
    });

    res.cookies.set("user_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    console.error("[AUTH_LOGIN_POST_ERROR]", error);

    return NextResponse.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}