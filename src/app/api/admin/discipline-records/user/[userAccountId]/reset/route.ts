export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ userAccountId: string }> }) {
  const admin = await requireSuperAdminRequest();
  if (!admin) return NextResponse.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  const { userAccountId } = await params;
  const body = await req.json().catch(() => ({}));
  const id = Number(userAccountId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "잘못된 유저 ID입니다." }, { status: 400 });

  const result = await prisma.userDisciplineRecord.updateMany({
    where: { userAccountId: id, isActive: true },
    data: {
      isActive: false,
      resetAt: new Date(),
      resetReason: String(body.reason || "개별 유저 누적 초기화"),
      resetBy: admin.user.userId,
    },
  });
  return NextResponse.json({ ok: true, count: result.count });
}
