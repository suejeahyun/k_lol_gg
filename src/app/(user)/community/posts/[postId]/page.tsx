export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { communityTypeLabels, communityTypePaths, formatCommunityDate } from "@/lib/community/meta";
import { CommunityCommentForm, CommunityCommentHideButton, CommunityHideButton, CommunityLikeButton, CommunityReportButton } from "@/components/community/CommunityActions";
import CommunityRichContent from "@/components/community/CommunityRichContent";

type Props = { params: Promise<{ postId: string }> };

export default async function CommunityPostDetailPage({ params }: Props) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const currentUser = await getCurrentUser();
  const post = await prisma.communityPost.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
    include: {
      author: { select: { id: true, userId: true, player: { select: { nickname: true, tag: true } } } },
      matchSeries: { select: { id: true, title: true } },
      likes: { where: currentUser ? { userId: currentUser.userAccountId } : { userId: -1 }, select: { id: true } },
      _count: { select: { likes: true, comments: true } },
      comments: {
        where: { isHidden: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, userId: true, player: { select: { nickname: true, tag: true } } } } },
      },
    },
  }).catch(() => null);

  if (!post || post.isHidden) notFound();
  const isOwner = currentUser?.userAccountId === post.authorId;
  const isAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const canManage = Boolean(isOwner || isAdmin);

  return (
    <main className="page-container community-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">{communityTypeLabels[post.type]}</p>
          <h1 className="page-title">{post.title}</h1>
          <p className="page-description">
            {post.author.player ? `${post.author.player.nickname}#${post.author.player.tag}` : post.author.userId} · {formatCommunityDate(post.createdAt)} · 조회 {post.viewCount}
          </p>
        </div>
        <div className="community-actions-row">
          <Link className="button button--ghost" href={communityTypePaths[post.type]}>목록</Link>
          {canManage && <Link className="button button--ghost" href={`/community/posts/${post.id}/edit`}>수정</Link>}
          {canManage && <CommunityHideButton postId={post.id} />}
        </div>
      </div>

      <section className="card community-detail-card">
        {post.matchSeries && <p className="badge">연결 내전: {post.matchSeries.title}</p>}
        {post.videoUrl && (
          <div className="community-video-box">
            {post.thumbnailUrl && <img src={post.thumbnailUrl} alt={post.title} className="community-video-box__thumb" />}
            <a className="button button--primary" href={post.videoUrl} target="_blank" rel="noreferrer">영상 열기</a>
          </div>
        )}
        <CommunityRichContent html={post.content} />
        {post.tags.length > 0 && (
          <div className="community-tag-list" aria-label="게시글 태그">
            {post.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        )}
        <div className="community-detail-card__actions">
          <CommunityLikeButton postId={post.id} liked={post.likes.length > 0} likeCount={post._count.likes} />
          <CommunityReportButton targetType="POST" postId={post.id} />
        </div>
      </section>

      <section className="card community-comments">
        <h2>댓글 {post._count.comments}</h2>
        <CommunityCommentForm postId={post.id} />
        <div className="community-comment-list">
          {post.comments.map((comment) => {
            const canHideComment = currentUser?.userAccountId === comment.authorId || isAdmin;
            return (
              <article key={comment.id} className="community-comment">
                <div className="community-comment__head">
                  <strong>{comment.author.player ? `${comment.author.player.nickname}#${comment.author.player.tag}` : comment.author.userId}</strong>
                  <span>{formatCommunityDate(comment.createdAt)}</span>
                </div>
                <p>{comment.content}</p>
                <div className="community-comment__actions">
                  <CommunityReportButton targetType="COMMENT" commentId={comment.id} />
                  {canHideComment && <CommunityCommentHideButton commentId={comment.id} />}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
