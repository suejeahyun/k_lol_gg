export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import { buildTotpOtpAuthUrl, generateTotpSecret } from "@/lib/security/totp";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const currentUser = await requireAdminRequest();
  if (!currentUser?.user.id) {
    return NextResponse.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const existing = await prisma.userAccount.findUnique({
    where: { id: currentUser.user.id },
    select: { id: true, userId: true, role: true, adminTotpEnabled: true, adminTotpSecret: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });
  }

  if (existing.adminTotpEnabled) {
    return NextResponse.json({ ok: false, message: "이미 2단계 인증이 활성화되어 있습니다." }, { status: 409 });
  }

  const secret = existing.adminTotpSecret || generateTotpSecret();
  await prisma.userAccount.update({
    where: { id: existing.id },
    data: { adminTotpSecret: secret },
  });

  await writeAdminLog({
    action: "ADMIN_TOTP_SETUP_CREATED",
    message: `관리자 2단계 인증 설정 생성: #${existing.id} ${existing.userId}`,
    actorId: existing.id,
    actorType: existing.role,
    actorUserId: existing.userId,
    targetType: "UserAccount",
    targetId: existing.id,
    ...getRequestAuditFields(req),
  });

  return NextResponse.json({
    ok: true,
    secret,
    otpauthUrl: buildTotpOtpAuthUrl({ secret, accountName: existing.userId }),
    message: "Authenticator 앱에 otpauthUrl 또는 secret을 등록한 뒤 /api/admin/2fa/enable로 인증 코드를 확인하세요.",
  });
}
