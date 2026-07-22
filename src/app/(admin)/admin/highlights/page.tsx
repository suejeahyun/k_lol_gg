export const dynamic = "force-dynamic";

import SafeHighlightThumbnail from "@/components/SafeHighlightThumbnail";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import HighlightDeleteButton from "@/features/highlight/HighlightDeleteButton";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

type AdminHighlightsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

export default async function AdminHighlightsPage({ searchParams }: AdminHighlightsPageProps) {
  const resolvedSearchParams = await searchParams;
  const requestedPage = parsePositivePage(resolvedSearchParams.page);
  const totalCount = await prisma.highlight.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const highlights = await prisma.highlight.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">하이라이트 관리</h1>
          <p className="admin-page__description">
            멸망전과 별개로 사이트에 노출할 YouTube 하이라이트를 관리합니다.
          </p>
        </div>

        <Link href="/admin/highlights/new" className="admin-page__create-button">
          하이라이트 추가
        </Link>
      </div>

      {highlights.length === 0 ? (
        <div className="empty-box">등록된 하이라이트가 없습니다.</div>
      ) : (
        <div className="highlight-admin-list">
          {highlights.map((highlight) => (
            <article key={highlight.id} className="highlight-admin-card">
              <div className="highlight-admin-card__thumb-wrap">
                <SafeHighlightThumbnail
                  youtubeId={highlight.youtubeId}
                  thumbnailUrl={highlight.thumbnailUrl}
                  alt={highlight.title}
                  width={320}
                  height={180}
                  className="highlight-admin-card__thumb"
                />
              </div>

              <div className="highlight-admin-card__body">
                <div className="highlight-admin-card__meta">
                  <span>{formatDate(highlight.createdAt)}</span>
                  <span>{highlight.isPublished ? "공개" : "비공개"}</span>
                  <span>정렬 {highlight.sortOrder}</span>
                </div>

                <h2>{highlight.title}</h2>
                <p>{highlight.description}</p>
              </div>

              <div className="highlight-admin-card__actions">
                <Link href={`/highlights/${highlight.id}`} className="chip-button">
                  보기
                </Link>
                <Link
                  href={`/admin/highlights/${highlight.id}/edit`}
                  className="chip-button"
                >
                  수정
                </Link>
                <HighlightDeleteButton highlightId={highlight.id} />
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/admin/highlights"
      />
    </main>
  );
}
