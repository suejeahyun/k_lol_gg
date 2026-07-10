export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { verifyTotpCode } from "@/lib/security/totp";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";

type Body = { code?: string };

export async function POST(req: NextRequest) {
  const currentUser = await requireAdminRequest();
  if (!currentUser?.user.id) {
    return NextResponse.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const user = await prisma.userAccount.findUnique({
    where: { id: currentUser.user.id },
    select: { id: true, userId: true, role: true, adminTotpSecret: true, adminTotpEnabled: true },
  });

  if (!user?.adminTotpSecret) {
    return NextResponse.json({ ok: false, message: "먼저 2단계 인증 설정을 생성하세요." }, { status: 400 });
  }

  const verified = verifyTotpCode(user.adminTotpSecret, body.code);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, message: "인증 코드가 올바르지 않습니다." }, { status: 400 });
  }

  await prisma.userAccount.update({
    where: { id: user.id },
    data: {
      adminTotpEnabled: true,
      adminTotpEnabledAt: new Date(),
    },
  });

  await writeAdminLog({
    action: "ADMIN_TOTP_ENABLED",
    message: `관리자 2단계 인증 활성화: #${user.id} ${user.userId}`,
    actorId: user.id,
    actorType: user.role,
    actorUserId: user.userId,
    targetType: "UserAccount",
    targetId: user.id,
    ...getRequestAuditFields(req),
  });

  return NextResponse.json({ ok: true, enabled: true });
}
