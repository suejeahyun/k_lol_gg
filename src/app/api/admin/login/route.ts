import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { authConstants } from "@/lib/auth";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signAuthToken } from "@/lib/auth/token";
import { verifyTotpCode } from "@/lib/security/totp";

type LoginBody = {
  id: string;
  password: string;
  totpCode?: string;
};

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

function isAdminRole(role: string) {
  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

async function ensureSuperAdmin(id: string, password: string) {
  const superAdminId = getRequiredEnv("SUPER_ADMIN_ID");
  const superAdminPassword = getRequiredEnv("SUPER_ADMIN_PASSWORD");

  if (id !== superAdminId || password !== superAdminPassword) {
    return null;
  }

  const passwordHash = await hashPassword(superAdminPassword);

  return prisma.userAccount.upsert({
    where: { userId: superAdminId },
    update: {
      passwordHash,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
    create: {
      userId: superAdminId,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
    include: {
      player: true,
    },
  });
}

export async function POST(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "ADMIN_LOGIN",
    limit: 5,
    windowSeconds: 600,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = (await req.json()) as LoginBody;
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");
    const totpCode = String(body.totpCode ?? "").replace(/\D/g, "");

    if (!id || !password) {
      return NextResponse.json(
        { message: "아이디와 비밀번호를 입력해주세요." },
        { status: 400 },
      );
    }

    let user = await prisma.userAccount.findUnique({
      where: { userId: id },
      include: {
        player: true,
      },
    });

    if (!user) {
      user = await ensureSuperAdmin(id, password);
    }

    if (!user) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { message: "비밀번호가 없는 Discord 전용 계정입니다." },
        { status: 401 },
      );
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    if (!isAdminRole(user.role)) {
      return NextResponse.json(
        { message: "관리자 권한이 없습니다." },
        { status: 403 },
      );
    }

    if (user.status !== "APPROVED") {
      return NextResponse.json(
        { message: "승인된 관리자 계정만 로그인할 수 있습니다." },
        { status: 403 },
      );
    }

    if (user.adminTotpEnabled) {
      if (!totpCode || !user.adminTotpSecret) {
        return NextResponse.json(
          { ok: false, requiresTwoFactor: true, message: "2단계 인증 코드가 필요합니다." },
          { status: 401 },
        );
      }

      const validTotp = verifyTotpCode(user.adminTotpSecret, totpCode);

      if (!validTotp) {
        return NextResponse.json(
          { ok: false, requiresTwoFactor: true, message: "2단계 인증 코드가 올바르지 않습니다." },
          { status: 401 },
        );
      }
    }

    await writeAdminLog({
      action: "ADMIN_LOGIN",
      message: `관리자 로그인: #${user.id} ${user.userId} (${user.role})`,
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
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        playerId: user.player?.id ?? null,
        adminTotpEnabled: user.adminTotpEnabled,
      },
    });

    response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    response.cookies.set("user_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    logServerError("[ADMIN_LOGIN_POST_ERROR]", error);

    return NextResponse.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}


