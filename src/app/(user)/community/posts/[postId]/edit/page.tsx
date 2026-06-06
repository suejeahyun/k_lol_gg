export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import CommunityPostForm from "@/components/community/CommunityPostForm";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";

type Props = { params: Promise<{ postId: string }> };

export default async function CommunityPostEditPage({ params }: Props) {
  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const currentUser = await getCurrentUser();
  const post = await prisma.communityPost.findUnique({ where: { id } });
  if (!post || post.isHidden || !currentUser) notFound();
  const isAdmin = currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN";
  if (post.authorId !== currentUser.userAccountId && !isAdmin) notFound();
  const matches = post.type === "MATCH_REVIEW" ? await prisma.matchSeries.findMany({ orderBy: { matchDate: "desc" }, take: 50, select: { id: true, title: true } }) : [];
  return (
    <main className="page-container community-page">
      <div className="page-header"><div><p className="page-eyebrow">COMMUNITY EDIT</p><h1 className="page-title">게시글 수정</h1></div></div>
      <section className="card"><CommunityPostForm type={post.type} post={post} matchOptions={matches} /></section>
    </main>
  );
}
