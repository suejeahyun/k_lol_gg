import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { writeSecurityAudit } from "@/lib/security/admin-audit";

type RouteContext = {
  params: Promise<{
    userAccountId: string;
  }>;
};

function createTempPassword() {
  const digits = String(Math.floor(100000 + Math.random() * 900000));
  return `KLOL-${digits}`;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdminRequest();

  if (!admin) {
    return NextResponse.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const { userAccountId } = await params;
    const id = Number(userAccountId);
    const body = await req.json().catch(() => ({}));
    const requestedPassword = String(body.newPassword ?? "").trim();
    const tempPassword = requestedPassword || createTempPassword();

    if (Number.isNaN(id)) {
      return NextResponse.json({ message: "잘못된 유저 ID입니다." }, { status: 400 });
    }

    if (tempPassword.length < 8) {
      return NextResponse.json({ message: "임시 비밀번호는 8자 이상이어야 합니다." }, { status: 400 });
    }

    const target = await prisma.userAccount.findUnique({ where: { id } });

    if (!target) {
      return NextResponse.json({ message: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    if (target.role === "SUPER_ADMIN" && target.id !== admin.user.id) {
      return NextResponse.json({ message: "다른 최고 관리자 비밀번호는 초기화할 수 없습니다." }, { status: 400 });
    }

    const passwordHash = await hashPassword(tempPassword);

    const updated = await prisma.userAccount.update({ where: { id }, data: { passwordHash } });

    await writeSecurityAudit({
      req,
      admin,
      action: "USER_PASSWORD_RESET",
      message: `회원 비밀번호 초기화: #${id} ${target.userId}`,
      targetType: "UserAccount",
      targetId: id,
      beforeJson: { id: target.id, userId: target.userId, role: target.role, status: target.status, passwordHash: "[REDACTED]" },
      afterJson: { id: updated.id, userId: updated.userId, role: updated.role, status: updated.status, passwordHash: "[ROTATED]" },
    });

    return NextResponse.json({ message: "비밀번호가 초기화되었습니다.", tempPassword });
  } catch (error) {
    logServerError("[ADMIN_USERS_PASSWORD_RESET_PATCH_ERROR]", error);
    return NextResponse.json({ message: "비밀번호 초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
