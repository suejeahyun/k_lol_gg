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

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireSuperAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "최고 관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }

  try {
    const { userAccountId } = await params;
    const id = Number(userAccountId);

    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { ok: false, message: "잘못된 유저 ID입니다." },
        { status: 400 },
      );
    }

    const target = await prisma.userAccount.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        adminTotpEnabled: true,
        adminTotpEnabledAt: true,
        adminTotpSecret: true,
      },
    });

    if (!target) {
      return NextResponse.json(
        { ok: false, message: "유저를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (target.role !== "ADMIN" && target.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { ok: false, message: "관리자 계정만 2단계 인증을 초기화할 수 있습니다." },
        { status: 400 },
      );
    }

    if (target.id === admin.user.id) {
      return NextResponse.json(
        { ok: false, message: "본인의 2단계 인증은 보안 설정 페이지에서 직접 해제하세요." },
        { status: 400 },
      );
    }

    const updated = await prisma.userAccount.update({
      where: { id },
      data: {
        adminTotpSecret: null,
        adminTotpEnabled: false,
        adminTotpEnabledAt: null,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        adminTotpEnabled: true,
        adminTotpEnabledAt: true,
      },
    });

    await writeSecurityAudit({
      req,
      admin,
      action: "ADMIN_2FA_RESET",
      message: `관리자 2단계 인증 초기화: #${target.id} ${target.userId}`,
      targetType: "UserAccount",
      targetId: target.id,
      beforeJson: {
        id: target.id,
        userId: target.userId,
        role: target.role,
        status: target.status,
        adminTotpEnabled: target.adminTotpEnabled,
        adminTotpEnabledAt: target.adminTotpEnabledAt?.toISOString() ?? null,
        hasAdminTotpSecret: Boolean(target.adminTotpSecret),
      },
      afterJson: {
        id: updated.id,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
        adminTotpEnabled: updated.adminTotpEnabled,
        adminTotpEnabledAt: updated.adminTotpEnabledAt?.toISOString() ?? null,
        hasAdminTotpSecret: false,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "2단계 인증을 초기화했습니다. 해당 관리자는 다시 인증앱을 등록해야 합니다.",
      user: updated,
    });
  } catch (error) {
    logServerError("[ADMIN_USERS_2FA_RESET_PATCH_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "2단계 인증 초기화 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
