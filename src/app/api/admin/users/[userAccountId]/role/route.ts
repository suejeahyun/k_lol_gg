import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { writeSecurityAudit } from "@/lib/security/admin-audit";

type RouteContext = {
  params: Promise<{
    userAccountId: string;
  }>;
};

const ALLOWED_ROLES = ["USER", "ADMIN"] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdminRequest();

  if (!admin) {
    return NextResponse.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const { userAccountId } = await params;
    const id = Number(userAccountId);
    const body = await req.json().catch(() => ({}));
    const role = String(body.role ?? "").trim() as AllowedRole;

    if (Number.isNaN(id)) {
      return NextResponse.json({ message: "잘못된 유저 ID입니다." }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ message: "변경할 수 없는 권한입니다." }, { status: 400 });
    }

    const target = await prisma.userAccount.findUnique({ where: { id }, include: { player: true } });

    if (!target) {
      return NextResponse.json({ message: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json({ message: "최고 관리자 권한은 변경할 수 없습니다." }, { status: 400 });
    }

    if (admin.user.id === target.id && role !== "ADMIN") {
      return NextResponse.json({ message: "본인의 관리자 권한은 직접 해제할 수 없습니다." }, { status: 400 });
    }

    if (role === "ADMIN" && target.status !== "APPROVED") {
      return NextResponse.json({ message: "승인 완료 계정만 관리자로 지정할 수 있습니다." }, { status: 400 });
    }

    const updated = await prisma.userAccount.update({ where: { id }, data: { role }, include: { player: true } });

    await writeSecurityAudit({
      req,
      admin,
      action: role === "ADMIN" ? "USER_ROLE_ADMIN" : "USER_ROLE_USER",
      message: `회원 권한 변경: #${id} ${target.userId} ${target.role} -> ${role}`,
      targetType: "UserAccount",
      targetId: id,
      beforeJson: { id: target.id, userId: target.userId, role: target.role, status: target.status },
      afterJson: { id: updated.id, userId: updated.userId, role: updated.role, status: updated.status },
    });

    return NextResponse.json({
      message: role === "ADMIN" ? "관리자로 지정했습니다." : "관리자 권한을 해제했습니다.",
      user: { id: updated.id, userId: updated.userId, role: updated.role, status: updated.status },
    });
  } catch (error) {
    logServerError("[ADMIN_USERS_ROLE_PATCH_ERROR]", error);
    return NextResponse.json({ message: "권한 변경 중 오류가 발생했습니다." }, { status: 500 });
  }
}
