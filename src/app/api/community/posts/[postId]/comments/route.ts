export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getApprovedUserOrResponse } from "@/lib/community/auth";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const { postId } = await ctx.params;
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "게시글 ID가 올바르지 않습니다." }, { status: 400 });

  const body = await req.json();
  const content = String(body.content ?? "").trim();
  if (!content || content.length > 1000) return NextResponse.json({ message: "댓글은 1~1000자로 입력해주세요." }, { status: 400 });

  const comment = await prisma.communityComment.create({ data: { postId: id, authorId: user!.userAccountId, content } });
  return NextResponse.json({ comment }, { status: 201 });
}
