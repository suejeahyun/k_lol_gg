export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import CommunityPostForm from "@/components/community/CommunityPostForm";
import { prisma } from "@/lib/prisma/client";
import { communityTypeLabels, getCommunityTypeFromSlug } from "@/lib/community/meta";

type Props = { params: Promise<{ slug: string }> };

export default async function CommunityNewPage({ params }: Props) {
  const { slug } = await params;
  const type = getCommunityTypeFromSlug(slug);
  if (!type) notFound();
  const matches = type === "MATCH_REVIEW" ? await prisma.matchSeries.findMany({ orderBy: { matchDate: "desc" }, take: 50, select: { id: true, title: true } }) : [];
  return (
    <main className="page-container community-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">COMMUNITY WRITE</p>
          <h1 className="page-title">{communityTypeLabels[type]} 글쓰기</h1>
        </div>
      </div>
      <section className="card"><CommunityPostForm type={type} matchOptions={matches} /></section>
    </main>
  );
}
