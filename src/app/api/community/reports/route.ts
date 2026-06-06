export const dynamic = "force-dynamic";

import { CommunityReportStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getAdminOrResponse, getApprovedUserOrResponse } from "@/lib/community/auth";

export async function GET() {
  const { response } = await getAdminOrResponse();
  if (response) return response;
  const reports = await prisma.communityReport.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { userId: true, player: { select: { nickname: true, tag: true } } } },
      post: { select: { id: true, title: true, isHidden: true } },
      comment: { select: { id: true, content: true, isHidden: true } },
    },
    take: 100,
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const body = await req.json();
  const targetType = body.targetType === "COMMENT" ? "COMMENT" : "POST";
  const reason = String(body.reason ?? "").trim();
  const detail = String(body.detail ?? "").trim() || null;
  const postId = body.postId ? Number(body.postId) : null;
  const commentId = body.commentId ? Number(body.commentId) : null;
  if (!reason) return NextResponse.json({ message: "신고 사유를 선택해주세요." }, { status: 400 });
  if (targetType === "POST" && !postId) return NextResponse.json({ message: "신고할 게시글이 없습니다." }, { status: 400 });
  if (targetType === "COMMENT" && !commentId) return NextResponse.json({ message: "신고할 댓글이 없습니다." }, { status: 400 });

  await prisma.communityReport.create({
    data: { targetType, reason, detail, reporterId: user!.userAccountId, postId: targetType === "POST" ? postId : null, commentId: targetType === "COMMENT" ? commentId : null },
  });
  return NextResponse.json({ message: "신고가 접수되었습니다." }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { response } = await getAdminOrResponse();
  if (response) return response;
  const body = await req.json();
  const id = Number(body.id);
  const status = body.status as CommunityReportStatus;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "신고 ID가 올바르지 않습니다." }, { status: 400 });
  if (!["PENDING", "RESOLVED", "REJECTED"].includes(status)) return NextResponse.json({ message: "상태값이 올바르지 않습니다." }, { status: 400 });
  const report = await prisma.communityReport.update({ where: { id }, data: { status, resolvedAt: status === "PENDING" ? null : new Date() } });
  return NextResponse.json({ report });
}
