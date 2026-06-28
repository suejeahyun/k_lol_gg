export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdminRequest();
  if (!admin) return NextResponse.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const recordId = Number(id);
  if (!Number.isFinite(recordId)) return NextResponse.json({ message: "잘못된 기록 ID입니다." }, { status: 400 });

  const updated = await prisma.userDisciplineRecord.update({
    where: { id: recordId },
    data: {
      isActive: false,
      resetAt: new Date(),
      resetReason: String(body.reason || "운영자 초기화"),
      resetBy: admin.user.userId,
    },
  });
  return NextResponse.json({ ok: true, record: updated });
}
