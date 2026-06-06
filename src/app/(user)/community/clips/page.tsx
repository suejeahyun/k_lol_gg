export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { formatCommunityDate } from "@/lib/community/meta";

export default async function ClipRankingPage() {
  const posts = await prisma.communityPost.findMany({
    where: { type: "HIGHLIGHT", isHidden: false },
    include: {
      author: { select: { userId: true, player: { select: { nickname: true, tag: true } } } },
      _count: { select: { likes: true, comments: true } },
    },
    take: 100,
  });

  const ranked = posts
    .map((post) => ({ ...post, score: post._count.likes * 3 + post.viewCount * 0.1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  return (
    <main className="page-container community-page community-board-page">
      <section className="community-board-headline">
        <div>
          <p className="community-board-eyebrow">CLIP RANKING</p>
          <h1>클립 랭킹</h1>
          <p>점수 = 좋아요 × 3 + 조회수 × 0.1 기준으로 정렬됩니다.</p>
        </div>
        <div className="community-actions-row">
          <Link className="button button--ghost" href="/community">커뮤니티 홈</Link>
          <Link className="button button--primary" href="/community/highlights/new">글쓰기</Link>
        </div>
      </section>

      {ranked.length === 0 ? (
        <div className="community-empty-box">등록된 클립이 없습니다.</div>
      ) : (
        <section className="community-board-table community-board-table--ranking" aria-label="클립 랭킹 목록">
          <div className="community-board-row community-board-row--head" aria-hidden="true">
            <span className="community-board-cell community-board-cell--no">순위</span>
            <span className="community-board-cell community-board-cell--title">제목</span>
            <span className="community-board-cell community-board-cell--author">작성자</span>
            <span className="community-board-cell community-board-cell--date">작성일</span>
            <span className="community-board-cell community-board-cell--views">조회수</span>
            <span className="community-board-cell community-board-cell--likes">좋아요</span>
            <span className="community-board-cell community-board-cell--score">점수</span>
          </div>

          {ranked.map((post, index) => {
            const authorName = post.author.player ? `${post.author.player.nickname}#${post.author.player.tag}` : post.author.userId;
            return (
              <Link key={post.id} href={`/community/posts/${post.id}`} className="community-board-row community-board-row--body">
                <span className="community-board-cell community-board-cell--no" data-label="순위">#{index + 1}</span>
                <span className="community-board-cell community-board-cell--title" data-label="제목">
                  <span className="community-board-title-line">
                    {post.videoUrl && <span className="community-board-badge">영상</span>}
                    <strong>{post.title}</strong>
                    {post._count.comments > 0 && <em>[{post._count.comments}]</em>}
                  </span>
                </span>
                <span className="community-board-cell community-board-cell--author" data-label="작성자">{authorName}</span>
                <span className="community-board-cell community-board-cell--date" data-label="작성일">{formatCommunityDate(post.createdAt)}</span>
                <span className="community-board-cell community-board-cell--views" data-label="조회수">{post.viewCount}</span>
                <span className="community-board-cell community-board-cell--likes" data-label="좋아요">{post._count.likes}</span>
                <span className="community-board-cell community-board-cell--score" data-label="점수">{post.score.toFixed(1)}</span>
              </Link>
            );
          })}
        </section>
      )}
    </main>
  );
}
