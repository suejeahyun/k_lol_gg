import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { CommunityPostType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getAdminOrResponse, getApprovedUserOrResponse } from "@/lib/community/auth";
import { getAutoThumbnail, isValidExternalVideoUrl } from "@/lib/community/meta";
import { parseCommunityTags, sanitizeCommunityHtml } from "@/lib/community/html";

type RouteContext = { params: Promise<{ postId: string }> };

async function getPostId(ctx: RouteContext) {
  const { postId } = await ctx.params;
  const id = Number(postId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const id = await getPostId(ctx);
  if (!id) return NextResponse.json({ message: "게시글 ID가 올바르지 않습니다." }, { status: 400 });

  try {
    const post = await prisma.communityPost.findUnique({ where: { id } });
    if (!post || post.isHidden) return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: 404 });
    const isAdmin = user!.role === "ADMIN" || user!.role === "SUPER_ADMIN";
    if (post.authorId !== user!.userAccountId && !isAdmin) return NextResponse.json({ message: "수정 권한이 없습니다." }, { status: 403 });

    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = sanitizeCommunityHtml(String(body.content ?? "").trim());
    const tags = parseCommunityTags(body.tags);
    const videoUrl = body.videoUrl ? String(body.videoUrl).trim() : null;
    const matchSeriesId = body.matchSeriesId ? Number(body.matchSeriesId) : null;
    const type = (body.type ?? post.type) as CommunityPostType;

    if (!title || title.length > 80) return NextResponse.json({ message: "제목은 1~80자로 입력해주세요." }, { status: 400 });
    if (!content || content.length > 5000) return NextResponse.json({ message: "내용은 1~5000자로 입력해주세요." }, { status: 400 });
    if (videoUrl && !isValidExternalVideoUrl(videoUrl)) return NextResponse.json({ message: "영상 링크 형식이 올바르지 않습니다." }, { status: 400 });

    const updated = await prisma.communityPost.update({
      where: { id },
      data: { title, content, videoUrl, thumbnailUrl: getAutoThumbnail(videoUrl), tags, matchSeriesId, type },
    });
    return NextResponse.json({ post: updated });
  } catch (error) {
    logServerError("[COMMUNITY_POST_PATCH_ERROR]", error);
    return NextResponse.json({ message: "게시글 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;
  const id = await getPostId(ctx);
  if (!id) return NextResponse.json({ message: "게시글 ID가 올바르지 않습니다." }, { status: 400 });

  const post = await prisma.communityPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ message: "게시글을 찾을 수 없습니다." }, { status: 404 });
  const isAdmin = user!.role === "ADMIN" || user!.role === "SUPER_ADMIN";
  if (post.authorId !== user!.userAccountId && !isAdmin) return NextResponse.json({ message: "삭제 권한이 없습니다." }, { status: 403 });

  await prisma.communityPost.update({
    where: { id },
    data: { isHidden: true, hiddenAt: new Date(), hiddenReason: isAdmin ? "ADMIN_HIDE" : "AUTHOR_HIDE" },
  });
  return NextResponse.json({ message: "게시글이 숨김 처리되었습니다." });
}
