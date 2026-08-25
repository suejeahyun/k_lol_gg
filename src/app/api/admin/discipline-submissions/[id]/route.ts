export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { createWarning } from "@/lib/discipline/workflow";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "").toUpperCase();
  const submission = await prisma.disciplineSubmission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ message: "접수 건을 찾을 수 없습니다." }, { status: 404 });
  if (!["PENDING_REVIEW", "AWAITING_UPLOAD"].includes(submission.status)) return NextResponse.json({ message: "이미 처리된 접수 건입니다." }, { status: 409 });
  if (action === "REJECT") {
    const rejectionReason = String(body.rejectionReason || "").trim();
    if (!rejectionReason) return NextResponse.json({ message: "반려 사유가 필요합니다." }, { status: 400 });
    await prisma.disciplineSubmission.update({ where: { id }, data: { status: "REJECTED", rejectionReason, reviewedAt: new Date(), reviewedById: admin.user.id } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "APPROVE") return NextResponse.json({ message: "처리 동작을 확인해주세요." }, { status: 400 });
  if (submission.status !== "PENDING_REVIEW") return NextResponse.json({ message: "요청된 증빙 사진이 모두 접수된 뒤 승인할 수 있습니다." }, { status: 409 });
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ message: "경고 사유는 관리자 화면에서 필수로 입력해야 합니다." }, { status: 400 });
  const data = submission.parsedData as Record<string, unknown>;
  const issuedAt = new Date(String(data.issuedAt || submission.createdAt));
  const category = data.category === "INHOUSE" ? "INHOUSE" : "GENERAL";
  const targetName = String(data.targetName || "대상 미상");
  const targetNickname = String(data.nickname || "") || null;
  const targetTag = String(data.tag || "") || null;
  const sourceRefKey = `kakao-discipline-submission:${id}`;
  const existingRecord = await prisma.userDisciplineRecord.findUnique({ where: { sourceRefKey }, include: { resolutionTask: true } });
  if (existingRecord) {
    await prisma.disciplineSubmission.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.user.id, disciplineRecordId: existingRecord.id } });
    return NextResponse.json({ ok: true, recordId: existingRecord.id, taskCode: existingRecord.resolutionTask?.publicCode ?? null, idempotent: true });
  }
  const result = await createWarning({
    target: { userAccountId: submission.targetUserAccountId, playerId: submission.targetPlayerId, targetName, targetNickname, targetTag },
    reason,
    category,
    issuedAt: Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt,
    source: "KAKAO",
    sourceRefType: "DisciplineSubmission",
    sourceRefId: String(id),
    sourceRefKey,
    sourceMeta: { publicCode: submission.publicCode, category },
    createdBy: admin.user.userId,
  });
  await prisma.disciplineSubmission.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.user.id, disciplineRecordId: result.record.id } });
  return NextResponse.json({ ok: true, recordId: result.record.id, taskCode: result.task.publicCode, banReviewCreated: Boolean(result.banReview) });
}
