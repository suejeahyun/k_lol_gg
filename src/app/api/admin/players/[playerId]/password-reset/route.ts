export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog, getRequestAuditFields } from "@/lib/admin-log";
import { hashPassword } from "@/lib/auth/password";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";

type RouteContext = {
  params: Promise<{
    playerId: string;
  }>;
};

const DEFAULT_RESET_PASSWORD = "1234";

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { message: "최고 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const { playerId } = await params;
    const id = Number(playerId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "잘못된 플레이어 ID입니다." },
        { status: 400 },
      );
    }

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        userAccount: true,
      },
    });

    if (!player) {
      return NextResponse.json(
        { message: "플레이어를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (!player.userAccount) {
      return NextResponse.json(
        { message: "이 플레이어와 연결된 사이트 계정이 없습니다." },
        { status: 400 },
      );
    }

    if (player.userAccount.role === "SUPER_ADMIN" && player.userAccount.id !== admin.user.id) {
      return NextResponse.json(
        { message: "다른 최고 관리자 계정의 비밀번호는 초기화할 수 없습니다." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(DEFAULT_RESET_PASSWORD);
    const audit = getRequestAuditFields(req);

    await prisma.userAccount.update({
      where: { id: player.userAccount.id },
      data: { passwordHash },
    });

    await writeAdminLog({
      action: "PLAYER_PASSWORD_RESET",
      message: `플레이어 관리에서 비밀번호 초기화: ${player.name} (${player.nickname}#${player.tag}) / 계정 ${player.userAccount.userId}`,
      actorId: admin.user.id,
      actorType: admin.mode,
      actorUserId: admin.user.userId,
      targetType: "UserAccount",
      targetId: player.userAccount.id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return NextResponse.json({
      message: "비밀번호가 1234로 초기화되었습니다.",
      tempPassword: DEFAULT_RESET_PASSWORD,
      userAccountId: player.userAccount.id,
      userId: player.userAccount.userId,
    });
  } catch (error) {
    console.error("[ADMIN_PLAYER_PASSWORD_RESET_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "비밀번호 초기화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
