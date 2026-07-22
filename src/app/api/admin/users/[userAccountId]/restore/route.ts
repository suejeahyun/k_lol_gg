import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

type RouteContext = {
  params: Promise<{
    userAccountId: string;
  }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const admin = await requireAdminRequest();

  if (!admin || admin.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { message: "최고 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const { userAccountId } = await context.params;
    const id = Number(userAccountId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { message: "회원 ID가 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const target = await prisma.userAccount.findUnique({ where: { id } });

    if (!target) {
      return NextResponse.json(
        { message: "복구할 회원을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (!target.deletedAt) {
      return NextResponse.json({ ok: true, message: "이미 활성 상태입니다." });
    }

    await prisma.userAccount.update({
      where: { id: target.id },
      data: {
        deletedAt: null,
        status: "PENDING",
        authVersion: { increment: 1 },
      },
    });

    await writeAdminLog({
      action: "USER_RESTORE",
      message: `회원 복구: #${target.id} ${target.userId} (${target.role})`,
      actorId: admin.user.id,
      actorType: admin.user.role,
      actorUserId: admin.user.userId,
      targetType: "UserAccount",
      targetId: target.id,
      ...getRequestAuditFields(req),
    });

    return NextResponse.json({
      ok: true,
      message: "회원이 복구되었습니다. 승인 상태는 대기로 변경되었습니다.",
    });
  } catch (error) {
    logServerError("[ADMIN_USER_RESTORE_ERROR]", error);

    return NextResponse.json(
      { message: "회원 복구 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
