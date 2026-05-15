export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";

type NoticesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 10;

export default async function NoticesPage({ searchParams }: NoticesPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const totalCount = await prisma.notice.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const notices = await prisma.notice.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    skip: (safeCurrentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, title: true, content: true, isPinned: true, createdAt: true },
  });

  return (
    <div className="notice-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Notice list</p>
          <h1 className="page-title">공지사항 목록</h1>
        </div>
      </div>

      <div className="notice-list">
        {notices.length === 0 ? (
          <div className="notice-list__empty">등록된 공지사항이 없습니다.</div>
        ) : (
          notices.map((notice) => (
            <Link key={notice.id} href={`/notices/${notice.id}`} className="notice-card">
              <div className="notice-card__content">
                <div className="notice-card__top">
                  {notice.isPinned ? <span className="notice-card__badge">공지</span> : null}
                  <span className="notice-card__date">{new Date(notice.createdAt).toLocaleDateString("ko-KR")}</span>
                </div>
                <h2 className="notice-card__title">{notice.title}</h2>
                <p className="notice-card__summary">
                  {notice.content.length > 120 ? `${notice.content.slice(0, 120)}...` : notice.content}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/notices" />
    </div>
  );
}
