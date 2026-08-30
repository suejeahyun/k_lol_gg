export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { currentDisciplineEvidenceCount } from "@/lib/discipline/evidence-batch";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "").toUpperCase();
  const note = String(body.note || "").trim() || null;
  if (!["APPROVE", "REJECT"].includes(action)) {
    return NextResponse.json({ message: "처리 동작을 확인해주세요." }, { status: 400 });
  }
  if (action === "REJECT" && !note) {
    return NextResponse.json({ message: "반려 사유가 필요합니다." }, { status: 400 });
  }

  const task = await prisma.disciplineResolutionTask.findUnique({
    where: { id },
    include: { evidence: { select: { submittedAt: true } } },
  });
  if (!task) return NextResponse.json({ message: "경고 차감 과제를 찾을 수 없습니다." }, { status: 404 });
  if (task.status !== "PENDING_REVIEW") {
    return NextResponse.json({ message: "관리자 검토 대기 중인 과제만 처리할 수 있습니다." }, { status: 409 });
  }
  if (currentDisciplineEvidenceCount(task.evidence, task.reviewedAt) < task.requiredGameCount) {
    return NextResponse.json({ message: "현재 제출 묶음의 사진이 모두 접수되지 않았습니다." }, { status: 409 });
  }

  if (action === "APPROVE") {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "DisciplineResolutionTask" WHERE "id" = ${id} FOR UPDATE`;
        const current = await tx.disciplineResolutionTask.findUnique({
          where: { id },
          include: { evidence: { select: { submittedAt: true } } },
        });
        if (!current || current.status !== "PENDING_REVIEW") throw new Error("TASK_NOT_REVIEWABLE");
        if (currentDisciplineEvidenceCount(current.evidence, current.reviewedAt) < current.requiredGameCount) {
          throw new Error("TASK_EVIDENCE_INCOMPLETE");
        }
        const reviewedAt = new Date();
        await tx.disciplineResolutionTask.update({ where: { id }, data: { status: "APPROVED", reviewedAt, reviewedById: admin.user.id, reviewNote: note, claimedGameCount: current.requiredGameCount } });
        await tx.userDisciplineRecord.update({ where: { id: current.disciplineRecordId }, data: { isActive: false, resetAt: reviewedAt, resetReason: note || "경고 차감 인증 승인", resetBy: admin.user.userId } });
      });
    } catch (error) {
      if (error instanceof Error && ["TASK_NOT_REVIEWABLE", "TASK_EVIDENCE_INCOMPLETE"].includes(error.message)) {
        return NextResponse.json({ message: "과제 상태가 변경되었습니다. 화면을 새로고침해주세요." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "DisciplineResolutionTask" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.disciplineResolutionTask.findUnique({ where: { id } });
      if (!current || current.status !== "PENDING_REVIEW") throw new Error("TASK_NOT_REVIEWABLE");
      await tx.disciplineResolutionTask.update({
        where: { id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: admin.user.id,
          reviewNote: note,
          claimedGameCount: 0,
          submittedAt: null,
        },
      });
      await tx.kakaoImageReceiveSession.updateMany({
        where: { targetType: "DisciplineResolutionTask", targetId: id, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_NOT_REVIEWABLE") {
      return NextResponse.json({ message: "과제 상태가 변경되었습니다. 화면을 새로고침해주세요." }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
