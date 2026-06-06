export const dynamic = "force-dynamic";

import { CommunityPostType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { getApprovedUserOrResponse } from "@/lib/community/auth";
import { getAutoThumbnail, isValidExternalVideoUrl } from "@/lib/community/meta";
import { parseCommunityTags, sanitizeCommunityHtml } from "@/lib/community/html";

const allowedTypes: CommunityPostType[] = ["HIGHLIGHT", "SUGGESTION", "MATCH_REVIEW", "FREE"];

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as CommunityPostType | null;
    const posts = await prisma.communityPost.findMany({
      where: {
        isHidden: false,
        ...(type && allowedTypes.includes(type) ? { type } : {}),
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { userId: true, player: { select: { nickname: true, tag: true } } } },
        _count: { select: { comments: true, likes: true, reports: true } },
      },
      take: 100,
    });
    return NextResponse.json({ posts });
  } catch (error) {
    console.error("[COMMUNITY_POSTS_GET_ERROR]", error);
    return NextResponse.json({ message: "게시글 목록 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, response } = await getApprovedUserOrResponse();
  if (response) return response;

  try {
    const body = await req.json();
    const type = body.type as CommunityPostType;
    const title = String(body.title ?? "").trim();
    const content = sanitizeCommunityHtml(String(body.content ?? "").trim());
    const tags = parseCommunityTags(body.tags);
    const videoUrl = body.videoUrl ? String(body.videoUrl).trim() : null;
    const matchSeriesId = body.matchSeriesId ? Number(body.matchSeriesId) : null;

    if (!allowedTypes.includes(type)) return NextResponse.json({ message: "게시판 유형이 올바르지 않습니다." }, { status: 400 });
    if (!title || title.length > 80) return NextResponse.json({ message: "제목은 1~80자로 입력해주세요." }, { status: 400 });
    if (!content || content.length > 5000) return NextResponse.json({ message: "내용은 1~5000자로 입력해주세요." }, { status: 400 });
    if (videoUrl && !isValidExternalVideoUrl(videoUrl)) return NextResponse.json({ message: "영상 링크 형식이 올바르지 않습니다." }, { status: 400 });
    if (type !== "MATCH_REVIEW" && matchSeriesId) return NextResponse.json({ message: "매치 리뷰만 내전과 연결할 수 있습니다." }, { status: 400 });

    const post = await prisma.communityPost.create({
      data: {
        type,
        title,
        content,
        videoUrl,
        thumbnailUrl: getAutoThumbnail(videoUrl),
        tags,
        matchSeriesId,
        authorId: user!.userAccountId,
      },
    });

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    console.error("[COMMUNITY_POSTS_POST_ERROR]", error);
    return NextResponse.json({ message: "게시글 등록 중 오류가 발생했습니다." }, { status: 500 });
  }
}
