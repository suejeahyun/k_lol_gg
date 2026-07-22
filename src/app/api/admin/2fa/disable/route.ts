export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { verifyTotpCode } from "@/lib/security/totp";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { authConstants } from "@/lib/auth";
import { USER_TOKEN_COOKIE, clearAuthCookieOptions } from "@/lib/auth/cookies";
import { decryptTotpSecret } from "@/lib/security/totp-secret-storage";

type Body = { code?: string; targetUserAccountId?: number };

export async function POST(req: NextRequest) {
  const currentUser = await requireAdminRequest();
  if (!currentUser?.user.id) {
    return NextResponse.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const targetUserAccountId =
    currentUser.user.role === "SUPER_ADMIN" && body.targetUserAccountId
      ? Number(body.targetUserAccountId)
      : currentUser.user.id;

  if (!Number.isInteger(targetUserAccountId) || targetUserAccountId <= 0) {
    return NextResponse.json({ ok: false, message: "대상 계정 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const actor = await prisma.userAccount.findUnique({
    where: { id: currentUser.user.id },
    select: { id: true, userId: true, role: true, adminTotpSecret: true, adminTotpEnabled: true },
  });

  if (!actor) {
    return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });
  }

  if (targetUserAccountId === actor.id && actor.adminTotpEnabled) {
    const verified = verifyTotpCode(
      actor.adminTotpSecret ? decryptTotpSecret(actor.adminTotpSecret) : null,
      body.code,
    );
    if (!verified.ok) {
      return NextResponse.json({ ok: false, message: "인증 코드가 올바르지 않습니다." }, { status: 400 });
    }
  } else if (targetUserAccountId !== actor.id && actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  }

  await prisma.userAccount.update({
    where: { id: targetUserAccountId },
    data: {
      adminTotpSecret: null,
      adminTotpEnabled: false,
      adminTotpEnabledAt: null,
      authVersion: { increment: 1 },
    },
  });

  await writeAdminLog({
    action: "ADMIN_TOTP_DISABLED",
    message: `관리자 2단계 인증 비활성화: target #${targetUserAccountId}`,
    actorId: actor.id,
    actorType: actor.role,
    actorUserId: actor.userId,
    targetType: "UserAccount",
    targetId: targetUserAccountId,
    ...getRequestAuditFields(req),
  });

  const isSelf = targetUserAccountId === actor.id;
  const response = NextResponse.json({
    ok: true,
    enabled: false,
    reauthRequired: isSelf,
    message: isSelf
      ? "2단계 인증이 해제되었습니다. 다시 로그인해주세요."
      : "대상 관리자의 2단계 인증을 해제하고 기존 세션을 종료했습니다.",
  });
  if (isSelf) {
    response.cookies.set(USER_TOKEN_COOKIE, "", clearAuthCookieOptions());
    response.cookies.set(authConstants.ADMIN_TOKEN_KEY, "", clearAuthCookieOptions());
  }
  return response;
}
