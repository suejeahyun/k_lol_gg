export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getYoutubeEmbedUrl } from "@/lib/youtube";

type PageProps = {
  params: Promise<{
    highlightId: string;
  }>;
};

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function HighlightDetailPage({ params }: PageProps) {
  const { highlightId } = await params;
  const id = Number(highlightId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const highlight = await prisma.highlight.findFirst({
    where: {
      id,
      isPublished: true,
    },
  });

  if (!highlight) {
    notFound();
  }

  return (
    <main className="page-container highlight-detail-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">K-LOL CLIP</p>
          <h1 className="page-title">{highlight.title}</h1>
          <p className="page-description">{formatDate(highlight.createdAt)}</p>
        </div>

        <div className="page-actions">
          <Link href="/highlights" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="highlight-detail-card">
        <div className="highlight-detail-card__frame">
          <iframe
            src={getYoutubeEmbedUrl(highlight.youtubeId)}
            title={highlight.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="highlight-detail-card__content">
          <h2>{highlight.title}</h2>
          <p>{highlight.description}</p>
          <a
            href={highlight.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            YouTube에서 보기
          </a>
        </div>
      </section>
    </main>
  );
}
