export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { communityTypeLabels, formatCommunityDate } from "@/lib/community/meta";
import { AdminPostHideButton } from "@/components/community/AdminCommunityActions";

export default async function AdminCommunityPage() {
  const posts = await prisma.communityPost.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { userId: true, player: { select: { nickname: true, tag: true } } } }, _count: { select: { comments: true, likes: true, reports: true } } },
    take: 100,
  });
  return (
    <main className="admin-page community-page">
      <div className="admin-page__header"><div><p className="page-eyebrow">COMMUNITY ADMIN</p><h1>게시판 관리</h1></div></div>
      <section className="admin-card">
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>유형</th><th>제목</th><th>작성자</th><th>상태</th><th>반응</th><th>작성일</th><th>관리</th></tr></thead><tbody>
          {posts.map((post) => (
            <tr key={post.id}>
              <td data-label="ID">#{post.id}</td><td data-label="유형">{communityTypeLabels[post.type]}</td><td data-label="제목"><Link href={`/community/posts/${post.id}`}>{post.title}</Link></td>
              <td data-label="작성자">{post.author.player ? `${post.author.player.nickname}#${post.author.player.tag}` : post.author.userId}</td>
              <td data-label="상태">{post.isHidden ? "숨김" : "노출"}</td><td data-label="반응">좋아요 {post._count.likes} / 댓글 {post._count.comments} / 신고 {post._count.reports}</td><td data-label="작성일">{formatCommunityDate(post.createdAt)}</td>
              <td data-label="관리">{!post.isHidden && <AdminPostHideButton postId={post.id} />}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
    </main>
  );
}
