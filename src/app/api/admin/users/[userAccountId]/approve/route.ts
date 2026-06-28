import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeSecurityAudit } from "@/lib/security/admin-audit";

type RouteContext = {
  params: Promise<{
    userAccountId: string;
  }>;
};

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });

  try {
    const { userAccountId } = await params;
    const id = Number(userAccountId);

    if (Number.isNaN(id)) {
      return NextResponse.json({ message: "잘못된 유저 ID입니다." }, { status: 400 });
    }

    const user = await prisma.userAccount.findUnique({ where: { id }, include: { player: true } });

    if (!user) {
      return NextResponse.json({ message: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!user.player) {
      return NextResponse.json({ message: "연결된 Player가 없어 승인할 수 없습니다." }, { status: 400 });
    }

    const updated = await prisma.userAccount.update({ where: { id }, data: { status: "APPROVED" } });

    await writeSecurityAudit({
      req,
      admin,
      action: "USER_APPROVE",
      message: `회원 승인: #${id} ${user.userId}`,
      targetType: "UserAccount",
      targetId: id,
      beforeJson: { id: user.id, userId: user.userId, role: user.role, status: user.status },
      afterJson: { id: updated.id, userId: updated.userId, role: updated.role, status: updated.status },
    });

    return NextResponse.json({ message: "회원 승인이 완료되었습니다." });
  } catch (error: unknown) {
    logServerError("[ADMIN_USERS_APPROVE_PATCH_ERROR]", error);
    return NextResponse.json({ message: "회원 승인 중 오류가 발생했습니다." }, { status: 500 });
  }
}
