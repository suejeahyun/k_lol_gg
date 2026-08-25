export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const task = await prisma.disciplineResolutionTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ message: "경고 차감 과제를 찾을 수 없습니다." }, { status: 404 });
  const action = String(body.action || "").toUpperCase();
  const note = String(body.note || "").trim() || null;
  if (action === "APPROVE") {
    await prisma.$transaction([
      prisma.disciplineResolutionTask.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.user.id, reviewNote: note, claimedGameCount: task.requiredGameCount } }),
      prisma.userDisciplineRecord.update({ where: { id: task.disciplineRecordId }, data: { isActive: false, resetAt: new Date(), resetReason: note || "경고 차감 인증 승인", resetBy: admin.user.userId } }),
    ]);
    return NextResponse.json({ ok: true });
  }
  if (action === "REJECT") {
    if (!note) return NextResponse.json({ message: "반려 사유가 필요합니다." }, { status: 400 });
    await prisma.disciplineResolutionTask.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: admin.user.id, reviewNote: note } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "처리 동작을 확인해주세요." }, { status: 400 });
}
