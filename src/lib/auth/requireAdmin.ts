import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma/client";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

type AdminRole = (typeof ADMIN_ROLES)[number];

type AdminSession = {
  mode: "legacy-admin" | "user-admin";
  user: {
    id: number | null;
    userId: string;
    role: AdminRole;
    status: "APPROVED";
    playerId: number | null;
  };
};

function isAdminRole(role: string): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

function isLegacyAdminTokenEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LEGACY_ADMIN_TOKEN === "true";
}

export async function requireAdminRequest(): Promise<AdminSession | null> {
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
        player: {
          select: {
            id: true,
          },
        },
      },
    });

    if (user && isAdminRole(user.role) && user.status === "APPROVED") {
      return {
        mode: "user-admin",
        user: {
          id: user.id,
          userId: user.userId,
          role: user.role,
          status: user.status,
          playerId: user.player?.id ?? null,
        },
      };
    }
  }

  const legacyAdminToken = cookieStore.get(authConstants.ADMIN_TOKEN_KEY)?.value;

  if (isLegacyAdminTokenEnabled() && legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE) {
    return {
      mode: "legacy-admin",
      user: {
        id: null,
        userId: "legacy-admin",
        role: "SUPER_ADMIN",
        status: "APPROVED",
        playerId: null,
      },
    };
  }

  return null;
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
