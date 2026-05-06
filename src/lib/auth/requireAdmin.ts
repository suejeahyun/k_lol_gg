import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";
import { prisma } from "@/lib/prisma/client";

export async function requireAdminRequest() {
  const cookieStore = await cookies();
  const legacyAdminToken = cookieStore.get(authConstants.ADMIN_TOKEN_KEY)?.value;

  if (legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE) {
    return { mode: "legacy-admin" as const };
  }

  const userToken = cookieStore.get("user_token")?.value;
  const payload = userToken ? verifyAuthToken(userToken) : null;

  if (!payload?.userAccountId) {
    return null;
  }

  const user = await prisma.userAccount.findUnique({
    where: {
      id: payload.userAccountId,
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

  if (!user || user.role !== "ADMIN" || user.status !== "APPROVED") {
    return null;
  }

  return {
    mode: "user-admin" as const,
    user: {
      id: user.id,
      userId: user.userId,
      role: user.role,
      status: user.status,
      playerId: user.player?.id ?? null,
    },
  };
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
