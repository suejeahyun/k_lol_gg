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
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    const { userAccountId } = await params;
    const id = Number(userAccountId);

    if (Number.isNaN(id)) {
      return NextResponse.json({ message: "잘못된 유저 ID입니다." }, { status: 400 });
    }

    const user = await prisma.userAccount.findUnique({ where: { id } });

    if (!user) {
      return NextResponse.json({ message: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    if (user.role === "SUPER_ADMIN") {
      return NextResponse.json({ message: "최고 관리자는 거절 처리할 수 없습니다." }, { status: 400 });
    }

    const updated = await prisma.userAccount.update({ where: { id }, data: { status: "REJECTED" } });

    await writeSecurityAudit({
      req,
      admin,
      action: "USER_REJECT",
      message: `회원 거절: #${id} ${user.userId}${reason ? ` / 사유: ${reason}` : ""}`,
      targetType: "UserAccount",
      targetId: id,
      beforeJson: { id: user.id, userId: user.userId, role: user.role, status: user.status },
      afterJson: { id: updated.id, userId: updated.userId, role: updated.role, status: updated.status, reason },
    });

    return NextResponse.json({ message: "회원이 거절 처리되었습니다." });
  } catch (error: unknown) {
    logServerError("[ADMIN_USERS_REJECT_PATCH_ERROR]", error);
    return NextResponse.json({ message: "회원 거절 중 오류가 발생했습니다." }, { status: 500 });
  }
}
