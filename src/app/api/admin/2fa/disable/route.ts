export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";
import { verifyTotpCode } from "@/lib/security/totp";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

type Body = { code?: string; targetUserAccountId?: number };

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.status !== "APPROVED" || (currentUser.role !== "ADMIN" && currentUser.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const targetUserAccountId = currentUser.role === "SUPER_ADMIN" && body.targetUserAccountId ? Number(body.targetUserAccountId) : currentUser.userAccountId;

  const actor = await prisma.userAccount.findUnique({
    where: { id: currentUser.userAccountId },
    select: { id: true, userId: true, role: true, adminTotpSecret: true, adminTotpEnabled: true },
  });

  if (!actor) {
    return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });
  }

  if (targetUserAccountId === actor.id && actor.adminTotpEnabled) {
    const verified = verifyTotpCode(actor.adminTotpSecret, body.code);
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
      adminTotpEnabledAt: null,    },
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

  return NextResponse.json({ ok: true, enabled: false });
}

