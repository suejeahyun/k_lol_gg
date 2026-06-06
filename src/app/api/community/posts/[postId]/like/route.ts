export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getApprovedUserOrResponse } from "@/lib/community/auth";

type RouteContext = { params: Promise<{ postId: string }> };

export async function POST(_req: Request, ctx: RouteContext) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const { postId } = await ctx.params;
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ message: "게시글 ID가 올바르지 않습니다." }, { status: 400 });

  const existing = await prisma.communityLike.findUnique({ where: { postId_userId: { postId: id, userId: user!.userAccountId } } });
  if (existing) {
    await prisma.communityLike.delete({ where: { id: existing.id } });
    return NextResponse.json({ liked: false });
  }
  await prisma.communityLike.create({ data: { postId: id, userId: user!.userAccountId } });
  return NextResponse.json({ liked: true });
}
