export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getApprovedUserOrResponse } from "@/lib/community/auth";

type RouteContext = { params: Promise<{ commentId: string }> };

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const { commentId } = await ctx.params;
  const id = Number(commentId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "댓글 ID가 올바르지 않습니다." }, { status: 400 });

  const comment = await prisma.communityComment.findUnique({ where: { id } });
  if (!comment) return NextResponse.json({ message: "댓글을 찾을 수 없습니다." }, { status: 404 });
  const isAdmin = user!.role === "ADMIN" || user!.role === "SUPER_ADMIN";
  if (comment.authorId !== user!.userAccountId && !isAdmin) return NextResponse.json({ message: "삭제 권한이 없습니다." }, { status: 403 });

  await prisma.communityComment.update({ where: { id }, data: { isHidden: true, hiddenAt: new Date(), hiddenReason: isAdmin ? "ADMIN_HIDE" : "AUTHOR_HIDE" } });
  return NextResponse.json({ message: "댓글이 숨김 처리되었습니다." });
}
