import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";
import { communityTypeLabels, communityTypePaths } from "@/lib/community/meta";

export async function GET() {
  try {
    const user = await requireApprovedUser();

    const [posts, comments] = await Promise.all([
      prisma.communityPost.findMany({
        where: { authorId: user.userAccountId, isHidden: false },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { _count: { select: { comments: true, likes: true } } },
      }),
      prisma.communityComment.findMany({
        where: { authorId: user.userAccountId, isHidden: false, post: { isHidden: false } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { post: { select: { id: true, title: true, type: true } } },
      }),
    ]);

    return NextResponse.json({
      posts: posts.map((post) => ({
        id: post.id,
        type: post.type,
        typeLabel: communityTypeLabels[post.type],
        boardPath: communityTypePaths[post.type],
        title: post.title,
        createdAt: post.createdAt,
        viewCount: post.viewCount,
        commentCount: post._count.comments,
        likeCount: post._count.likes,
      })),
      comments: comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        postId: comment.post.id,
        postTitle: comment.post.title,
        postTypeLabel: communityTypeLabels[comment.post.type],
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (message === "NOT_APPROVED") {
      return NextResponse.json({ message: "승인 완료 유저만 확인할 수 있습니다." }, { status: 403 });
    }
    logServerError("[COMMUNITY_MY_ACTIVITY_GET_ERROR]", error);
    return NextResponse.json({ message: "내 커뮤니티 활동을 불러오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
