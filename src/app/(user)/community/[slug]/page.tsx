export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { communityTypeLabels, formatCommunityDate, getCommunityTypeFromSlug } from "@/lib/community/meta";

const statusLabel = { RECEIVED: "접수", REVIEWING: "검토중", PLANNED: "적용예정", COMPLETED: "완료", HOLD: "보류" } as const;

type Props = { params: Promise<{ slug: string }> };

export default async function CommunityListPage({ params }: Props) {
  const { slug } = await params;
  const type = getCommunityTypeFromSlug(slug);
  if (!type) notFound();

  const posts = await prisma.communityPost.findMany({
    where: { type, isHidden: false },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { userId: true, player: { select: { nickname: true, tag: true } } } },
      matchSeries: { select: { id: true, title: true } },
      _count: { select: { comments: true, likes: true } },
    },
    take: 100,
  });

  return (
    <main className="page-container community-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">COMMUNITY BOARD</p>
          <h1 className="page-title">{communityTypeLabels[type]}</h1>
          <p className="page-description">승인 완료 유저만 작성할 수 있습니다. 삭제는 숨김 처리됩니다.</p>
        </div>
        <div className="community-actions-row">
          <Link className="button button--ghost" href="/community">커뮤니티 홈</Link>
          <Link className="button button--primary" href={`/community/${slug}/new`}>글쓰기</Link>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="empty-box">등록된 글이 없습니다.</div>
      ) : (
        <section className="community-list">
          {posts.map((post) => (
            <Link key={post.id} href={`/community/posts/${post.id}`} className="community-list-item">
              <div className="community-list-item__main">
                <div className="community-list-item__badges">
                  {post.isPinned && <span className="badge">고정</span>}
                  {type === "SUGGESTION" && <span className="badge">{statusLabel[post.suggestionStatus]}</span>}
                  {post.matchSeries && <span className="badge">{post.matchSeries.title}</span>}
                  {post.videoUrl && <span className="badge">영상</span>}
                </div>
                <h2>{post.title}</h2>
                <p>{post.content}</p>
              </div>
              <div className="community-list-item__meta">
                <span>{post.author.player ? `${post.author.player.nickname}#${post.author.player.tag}` : post.author.userId}</span>
                <span>{formatCommunityDate(post.createdAt)}</span>
                <span>조회 {post.viewCount}</span>
                <span>좋아요 {post._count.likes}</span>
                <span>댓글 {post._count.comments}</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
