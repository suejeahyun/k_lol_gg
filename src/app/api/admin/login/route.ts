import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { authConstants } from "@/lib/auth";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { prisma } from "@/lib/prisma/client";
import { hashPassword, verifyPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { signAuthToken } from "@/lib/auth/token";
import { USER_TOKEN_COOKIE, authCookieOptions, clearAuthCookieOptions } from "@/lib/auth/cookies";
import { verifyTotpCode } from "@/lib/security/totp";
import { safeEqualText } from "@/lib/security/hmac";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
} from "@/lib/security/totp-secret-storage";

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

  if (!safeEqualText(id, superAdminId) || !safeEqualText(password, superAdminPassword)) {
    return null;
  }

  const existing = await prisma.userAccount.findUnique({
    where: { userId: superAdminId },
    include: { player: true },
  });
  const passwordHash = await hashPassword(superAdminPassword);

  if (existing) {
    return prisma.userAccount.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: "SUPER_ADMIN",
        status: "APPROVED",
        authVersion: { increment: 1 },
      },
      include: { player: true },
    });
  }

  return prisma.userAccount.create({
    data: {
      userId: superAdminId,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "APPROVED",
    },
    include: { player: true },
  });
}

export async function POST(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "ADMIN_LOGIN",
    limit: 12,
    windowSeconds: 300,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = await req.json().catch(() => null) as LoginBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const id = String(body.id ?? "").trim();
    const password = String(body.password ?? "");
    const totpCode = String(body.totpCode ?? "").replace(/\D/g, "");

    if (!id || !password) {
      return NextResponse.json(
        { message: "아이디와 비밀번호를 입력해주세요." },
        { status: 400 },
      );
    }

    if (id.length > 128 || password.length > 256) {
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    let user = await prisma.userAccount.findUnique({
      where: { userId: id },
      include: {
        player: true,
      },
    });

    if (user?.deletedAt) {
      await verifyPasswordOrDummy(password, null);
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    if (!user) {
      user = await ensureSuperAdmin(id, password);
    }

    if (!user) {
      await verifyPasswordOrDummy(password, null);
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    if (!user.passwordHash) {
      await verifyPasswordOrDummy(password, null);
      return NextResponse.json(
        { message: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    let isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      const syncedSuperAdmin = await ensureSuperAdmin(id, password);
      if (syncedSuperAdmin) {
        user = syncedSuperAdmin;
        isValidPassword = true;
      }
    }

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

      const plainTotpSecret = decryptTotpSecret(user.adminTotpSecret);
      const validTotp = verifyTotpCode(plainTotpSecret, totpCode);

      if (!validTotp) {
        return NextResponse.json(
          { ok: false, requiresTwoFactor: true, message: "2단계 인증 코드가 올바르지 않습니다." },
          { status: 401 },
        );
      }

      if (!isEncryptedTotpSecret(user.adminTotpSecret)) {
        user = await prisma.userAccount.update({
          where: { id: user.id },
          data: { adminTotpSecret: encryptTotpSecret(plainTotpSecret) },
          include: { player: true },
        });
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
      authVersion: user.authVersion,
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

    response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());
    response.cookies.set(USER_TOKEN_COOKIE, token, authCookieOptions(60 * 60 * 24 * 7));

    return response;
  } catch (error) {
    logServerError("[ADMIN_LOGIN_POST_ERROR]", error);

    return NextResponse.json(
      { message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
