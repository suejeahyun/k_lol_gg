import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";

type LoginBody = {
  id: string;
  password: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LoginBody;

    const adminId = process.env.ADMIN_ID;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminId || !adminPassword) {
      return NextResponse.json(
        { message: "관리자 계정 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    if (body.id !== adminId || body.password !== adminPassword) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });

    response.cookies.set(authConstants.ADMIN_TOKEN_KEY, authConstants.ADMIN_TOKEN_VALUE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("[ADMIN_LOGIN_POST_ERROR]", error);

    return NextResponse.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}