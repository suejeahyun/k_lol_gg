export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { formatCommunityDate } from "@/lib/community/meta";
import { AdminSuggestionStatusSelect } from "@/components/community/AdminCommunityActions";

export default async function AdminSuggestionsPage() {
  const posts = await prisma.communityPost.findMany({ where: { type: "SUGGESTION" }, orderBy: { createdAt: "desc" }, include: { author: { select: { userId: true } } }, take: 100 });
  return (
    <main className="admin-page community-page">
      <div className="admin-page__header"><div><p className="page-eyebrow">SUGGESTION ADMIN</p><h1>건의사항 관리</h1></div></div>
      <section className="admin-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>제목</th><th>작성자</th><th>상태</th><th>노출</th><th>작성일</th></tr></thead><tbody>
        {posts.map((post) => (<tr key={post.id}><td>#{post.id}</td><td><Link href={`/community/posts/${post.id}`}>{post.title}</Link></td><td>{post.author.userId}</td><td><AdminSuggestionStatusSelect postId={post.id} value={post.suggestionStatus} /></td><td>{post.isHidden ? "숨김" : "노출"}</td><td>{formatCommunityDate(post.createdAt)}</td></tr>))}
      </tbody></table></div></section>
    </main>
  );
}
