import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma/client";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { verifyPassword } from "@/lib/auth/password";
import { authConstants } from "@/lib/auth";
import { signAuthToken } from "@/lib/auth/token";
import { USER_TOKEN_COOKIE, authCookieOptions, clearAuthCookieOptions } from "@/lib/auth/cookies";

export async function POST(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "AUTH_LOGIN",
    limit: 10,
    windowSeconds: 600,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const userId = String(body.userId ?? "").trim();
    const password = String(body.password ?? "");

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

    if (!user || user.deletedAt) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { message: "비밀번호가 설정되지 않은 계정입니다. 관리자에게 비밀번호 초기화를 요청해주세요." },
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

    await writeAdminLog({
      action: "USER_LOGIN",
      message: `유저 로그인: #${user.id} ${user.userId} (${user.status})`,
      actorId: user.id,
      actorType: user.role,
      actorUserId: user.userId,
      targetType: "UserAccount",
      targetId: user.id,
      ...getRequestAuditFields(req),
    });

    const token = signAuthToken({
      userAccountId: user.id,
      userId: user.userId,
      role: user.role,
      status: user.status,
      playerId: user.player?.id ?? null,
      authVersion: user.authVersion,
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

    res.cookies.set(USER_TOKEN_COOKIE, token, authCookieOptions(60 * 60 * 24 * 7));
    res.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());

    return res;
  } catch (error) {
    logServerError("[AUTH_LOGIN_POST_ERROR]", error);

    return NextResponse.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
