export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "").toUpperCase();
  const note = String(body.note || "").trim() || null;
  const review = await prisma.disciplineBanReview.findUnique({ where: { id } });
  if (!review || review.status !== "PENDING") return NextResponse.json({ message: "대기 중인 강퇴 검토 건을 찾을 수 없습니다." }, { status: 404 });
  if (action === "REJECT") {
    if (!note) return NextResponse.json({ message: "보류/반려 사유가 필요합니다." }, { status: 400 });
    await prisma.disciplineBanReview.update({ where: { id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: admin.user.id, decisionNote: note } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "APPROVE") return NextResponse.json({ message: "처리 동작을 확인해주세요." }, { status: 400 });
  const warningIds = Array.isArray(review.warningRecordIds) ? review.warningRecordIds.map(Number).filter(Number.isInteger) : [];
  const warning = warningIds.length ? await prisma.userDisciplineRecord.findFirst({ where: { id: { in: warningIds } }, orderBy: { createdAt: "desc" } }) : null;
  const ban = await prisma.$transaction(async (tx) => {
    const record = await tx.userDisciplineRecord.create({ data: { userAccountId: warning?.userAccountId ?? null, playerId: warning?.playerId ?? null, targetName: review.targetName, targetNickname: review.targetNickname, targetTag: review.targetTag, type: "BAN", reason: note || "경고 3회 누적 강퇴", source: "WARNING_ACCUMULATION", sourceRefKey: `discipline-ban-review:${id}`, sourceMeta: { warningRecordIds: warningIds }, createdBy: admin.user.userId } });
    await tx.disciplineBanReview.update({ where: { id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: admin.user.id, decisionNote: note, banRecordId: record.id } });
    return record;
  });
  return NextResponse.json({ ok: true, banRecordId: ban.id });
}
