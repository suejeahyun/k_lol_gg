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
    <main className="page-container community-page community-board-page">
      <section className="community-board-headline">
        <div>
          <p className="community-board-eyebrow">COMMUNITY BOARD</p>
          <h1>{communityTypeLabels[type]}</h1>
          <p>승인 완료 유저만 작성할 수 있습니다. 삭제는 숨김 처리됩니다.</p>
        </div>
        <div className="community-actions-row">
          <Link className="button button--ghost" href="/community">커뮤니티 홈</Link>
          <Link className="button button--primary" href={`/community/${slug}/new`}>글쓰기</Link>
        </div>
      </section>

      {posts.length === 0 ? (
        <div className="community-empty-box">등록된 글이 없습니다.</div>
      ) : (
        <section className="community-board-table" aria-label={`${communityTypeLabels[type]} 게시글 목록`}>
          <div className="community-board-row community-board-row--head" aria-hidden="true">
            <span className="community-board-cell community-board-cell--no">번호</span>
            <span className="community-board-cell community-board-cell--title">제목</span>
            <span className="community-board-cell community-board-cell--author">작성자</span>
            <span className="community-board-cell community-board-cell--date">작성일</span>
            <span className="community-board-cell community-board-cell--views">조회수</span>
            <span className="community-board-cell community-board-cell--likes">좋아요</span>
          </div>

          {posts.map((post) => {
            const authorName = post.author.player ? `${post.author.player.nickname}#${post.author.player.tag}` : post.author.userId;
            return (
              <Link key={post.id} href={`/community/posts/${post.id}`} className="community-board-row community-board-row--body">
                <span className="community-board-cell community-board-cell--no" data-label="번호">
                  {post.isPinned ? <span className="community-board-notice">공지</span> : post.id}
                </span>
                <span className="community-board-cell community-board-cell--title" data-label="제목">
                  <span className="community-board-title-line">
                    {type === "SUGGESTION" && <span className="community-board-badge">{statusLabel[post.suggestionStatus]}</span>}
                    {post.matchSeries && <span className="community-board-badge">내전</span>}
                    {post.videoUrl && <span className="community-board-badge">영상</span>}
                    <strong>{post.title}</strong>
                    {post._count.comments > 0 && <em>[{post._count.comments}]</em>}
                  </span>
                </span>
                <span className="community-board-cell community-board-cell--author" data-label="작성자">{authorName}</span>
                <span className="community-board-cell community-board-cell--date" data-label="작성일">{formatCommunityDate(post.createdAt)}</span>
                <span className="community-board-cell community-board-cell--views" data-label="조회수">{post.viewCount}</span>
                <span className="community-board-cell community-board-cell--likes" data-label="좋아요">{post._count.likes}</span>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
