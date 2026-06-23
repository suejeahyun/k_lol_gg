import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";

type RouteContext = {
  params: Promise<{ userAccountId: string }>;
};

export async function PATCH(_req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { userAccountId } = await params;
    const id = Number(userAccountId);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ message: "잘못된 회원 ID입니다." }, { status: 400 });
    }

    const user = await prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ message: "유저를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userAccount.update({ where: { id }, data: { status: "PENDING" } });
      await writeAdminLog({
        action: "USER_STATUS_RESET",
        message: `회원 상태 초기화: #${id} ${user.userId} / ${user.status} → PENDING`,
        db: tx,
      });
    });

    return NextResponse.json({ message: "회원 상태가 승인 대기로 변경되었습니다." });
  } catch (error) {
    logServerError("[ADMIN_USER_RESET_ERROR]", error);
    return NextResponse.json({ message: "회원 상태 초기화 실패" }, { status: 500 });
  }
}
