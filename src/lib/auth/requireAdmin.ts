import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma/client";
import {
  isAdminRole,
  isAdminTwoFactorReady,
  type AdminRole,
} from "@/lib/auth/admin-security-policy";

type AdminSession = {
  mode: "user-admin";
  user: {
    id: number;
    userId: string;
    role: AdminRole;
    status: "APPROVED";
    playerId: number | null;
  };
};

async function resolveAdminSession(options: { allowTwoFactorEnrollment: boolean }): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const userToken = cookieStore.get("user_token")?.value;
  const payload = userToken ? verifyAuthToken(userToken) : null;

  if (payload?.userAccountId) {
    const user = await prisma.userAccount.findUnique({
      where: {
        id: payload.userAccountId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        authVersion: true,
        adminTotpEnabled: true,
        player: {
          select: {
            id: true,
          },
        },
      },
    });

    const role = user && isAdminRole(user.role) ? user.role : null;
    const validAccount = Boolean(
      user &&
      role &&
      (payload.authVersion ?? 0) === user.authVersion &&
      user.status === "APPROVED",
    );
    const twoFactorReady = Boolean(
      user &&
      isAdminTwoFactorReady({
        role: user.role,
        adminTotpEnabled: user.adminTotpEnabled,
        tokenTotpVerified: payload.adminTotpVerified === true,
      }),
    );

    const enrollmentAllowed = Boolean(
      user &&
      options.allowTwoFactorEnrollment &&
      !user.adminTotpEnabled,
    );

    if (user && role && validAccount && (twoFactorReady || enrollmentAllowed)) {
      return {
        mode: "user-admin",
        user: {
          id: user.id,
          userId: user.userId,
          role,
          status: "APPROVED",
          playerId: user.player?.id ?? null,
        },
      };
    }
  }

  return null;
}

export async function requireAdminRequest(): Promise<AdminSession | null> {
  return resolveAdminSession({ allowTwoFactorEnrollment: false });
}

export async function requireAdminEnrollmentRequest(): Promise<AdminSession | null> {
  return resolveAdminSession({ allowTwoFactorEnrollment: true });
}

export async function rejectIfNotAdmin() {
  const admin = await requireAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { message: "관리자 권한이 필요합니다." },
      { status: 401 },
    );
  }

  return null;
}

export async function requireSuperAdminRequest(): Promise<AdminSession | null> {
  const admin = await requireAdminRequest();

  if (!admin || admin.user.role !== "SUPER_ADMIN") {
    return null;
  }

  return admin;
}

export async function rejectIfNotSuperAdmin() {
  const admin = await requireSuperAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { message: "최고 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  return null;
}
