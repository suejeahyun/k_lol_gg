export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.status !== "APPROVED" || (currentUser.role !== "ADMIN" && currentUser.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ ok: false, message: "관리자 권한이 필요합니다." }, { status: 401 });
  }

  const user = await prisma.userAccount.findUnique({
    where: { id: currentUser.userAccountId },
    select: {
      id: true,
      userId: true,
      role: true,
      adminTotpEnabled: true,
      adminTotpEnabledAt: true,
      adminTotpSecret: true,
    },
  });

  if (!user) {
    return NextResponse.json({ ok: false, message: "계정을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    enabled: user.adminTotpEnabled,
    enabledAt: user.adminTotpEnabledAt,
    setupPending: Boolean(user.adminTotpSecret && !user.adminTotpEnabled),
  });
}
