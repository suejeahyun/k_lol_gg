export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { formatCommunityDate } from "@/lib/community/meta";

export default async function ClipRankingPage() {
  const posts = await prisma.communityPost.findMany({
    where: { type: "HIGHLIGHT", isHidden: false },
    include: { _count: { select: { likes: true, comments: true } } },
    take: 100,
  });
  const ranked = posts
    .map((post) => ({ ...post, score: post._count.likes * 3 + post.viewCount * 0.1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
  return (
    <main className="page-container community-page">
      <div className="page-header"><div><p className="page-eyebrow">CLIP RANKING</p><h1 className="page-title">클립 랭킹</h1><p className="page-description">점수 = 좋아요 × 3 + 조회수 × 0.1</p></div></div>
      <section className="community-list">
        {ranked.map((post, index) => (
          <Link key={post.id} href={`/community/posts/${post.id}`} className="community-list-item community-list-item--rank">
            <strong className="community-rank">#{index + 1}</strong>
            {post.thumbnailUrl && <img src={post.thumbnailUrl} alt={post.title} className="community-rank-thumb" />}
            <div className="community-list-item__main"><h2>{post.title}</h2><p>{formatCommunityDate(post.createdAt)}</p></div>
            <div className="community-list-item__meta"><span>점수 {post.score.toFixed(1)}</span><span>좋아요 {post._count.likes}</span><span>조회 {post.viewCount}</span></div>
          </Link>
        ))}
      </section>
    </main>
  );
}
