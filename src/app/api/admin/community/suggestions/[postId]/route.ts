export const dynamic = "force-dynamic";

import { CommunitySuggestionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getAdminOrResponse } from "@/lib/community/auth";

type RouteContext = { params: Promise<{ postId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { response } = await getAdminOrResponse();
  if (response) return response;
  const { postId } = await ctx.params;
  const id = Number(postId);
  const body = await req.json();
  const suggestionStatus = body.suggestionStatus as CommunitySuggestionStatus;
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "게시글 ID가 올바르지 않습니다." }, { status: 400 });
  if (!["RECEIVED", "REVIEWING", "PLANNED", "COMPLETED", "HOLD"].includes(suggestionStatus)) return NextResponse.json({ message: "상태값이 올바르지 않습니다." }, { status: 400 });
  const post = await prisma.communityPost.update({ where: { id }, data: { suggestionStatus } });
  return NextResponse.json({ post });
}
