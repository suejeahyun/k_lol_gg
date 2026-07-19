import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

export async function GET(_req: NextRequest, context: { params: Promise<{ userAccountId: string }> }) {
  const admin = await requireAdminRequest();

  if (!admin) {
    return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  try {
    const { userAccountId } = await context.params;
    const id = Number(userAccountId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ message: "유효하지 않은 회원 ID입니다." }, { status: 400 });
    }

    const user = await prisma.userAccount.findUnique({
      where: { id },
      include: { player: true },
    });

    if (!user) {
      return NextResponse.json({ message: "회원을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      currentAdmin: {
        id: admin.user.id,
        userId: admin.user.userId,
        role: admin.user.role,
      },
      user: {
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        adminTotpEnabled: admin.user.role === "SUPER_ADMIN" ? user.adminTotpEnabled : false,
        adminTotpEnabledAt: admin.user.role === "SUPER_ADMIN" ? user.adminTotpEnabledAt?.toISOString() ?? null : null,
        adminTotpSetupPending: admin.user.role === "SUPER_ADMIN" ? Boolean(user.adminTotpSecret && !user.adminTotpEnabled) : false,
        player: user.player
          ? {
              id: user.player.id,
              name: user.player.name,
              nickname: user.player.nickname,
              tag: user.player.tag,
              peakTier: user.player.peakTier,
              currentTier: user.player.currentTier,
            }
          : null,
        linkStatus: user.player ? "PLAYER_LINKED" : "NO_PLAYER",
      },
    });
  } catch (error) {
    logServerError("[ADMIN_USER_DETAIL_GET_ERROR]", error);
    return NextResponse.json({ message: "회원 상세 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
