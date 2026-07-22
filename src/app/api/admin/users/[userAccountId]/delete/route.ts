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

export async function DELETE(req: NextRequest, context: RouteContext) {
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

    if (admin.user.id === id) {
      return NextResponse.json(
        { message: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    const target = await prisma.userAccount.findUnique({
      where: { id },
      include: {
        player: true,
      },
    });

    if (!target || target.deletedAt) {
      return NextResponse.json(
        { message: "삭제할 회원을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (target.role === "SUPER_ADMIN") {
      return NextResponse.json(
        { message: "최고 관리자 계정은 삭제할 수 없습니다." },
        { status: 403 },
      );
    }

    await prisma.userAccount.update({
      where: { id: target.id },
      data: {
        deletedAt: new Date(),
        status: "REJECTED",
        authVersion: { increment: 1 },
      },
    });

    await writeAdminLog({
      action: "USER_SOFT_DELETE",
      message: `회원 삭제 처리: #${target.id} ${target.userId} (${target.role}/${target.status})`,
      actorId: admin.user.id,
      actorType: admin.user.role,
      actorUserId: admin.user.userId,
      targetType: "UserAccount",
      targetId: target.id,
      ...getRequestAuditFields(req),
    });

    return NextResponse.json({
      ok: true,
      message: "회원이 삭제 처리되었습니다. 데이터는 복구 가능하도록 보존됩니다.",
    });
  } catch (error) {
    logServerError("[ADMIN_USER_SOFT_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "회원 삭제 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
