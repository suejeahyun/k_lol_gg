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

  const recommendedNotice = notices.find((notice) => notice.isPinned) ?? notices[0];
  const normalNotices = notices.filter((notice) => notice.id !== recommendedNotice?.id);

  return (
    <div className="notice-page notice-page--recommend">
      <div className="page-header notice-hero">
        <div>
          <p className="page-eyebrow">NOTICE CENTER</p>
          <h1 className="page-title">공지 사항</h1>
        </div>
      </div>

      {recommendedNotice ? (
        <Link href={`/notices/${recommendedNotice.id}`} className="notice-recommend-card">
          <div className="notice-recommend-card__meta">
            <span className="notice-card__badge">추천 공지</span>
            <span>{new Date(recommendedNotice.createdAt).toLocaleDateString("ko-KR")}</span>
          </div>
          <h2>{recommendedNotice.title}</h2>
          <p>{recommendedNotice.content.length > 180 ? `${recommendedNotice.content.slice(0, 180)}...` : recommendedNotice.content}</p>
        </Link>
      ) : (
        <div className="notice-list__empty">등록된 공지사항이 없습니다.</div>
      )}

      <section className="notice-recommend-section">
        <div className="notice-section-head">
          <h2>전체 공지</h2>
          <span>{totalCount.toLocaleString("ko-KR")}개</span>
        </div>
        <div className="notice-recommend-grid">
          {normalNotices.map((notice) => (
            <Link key={notice.id} href={`/notices/${notice.id}`} className="notice-card notice-card--compact">
              <div className="notice-card__top">
                {notice.isPinned ? <span className="notice-card__badge">고정</span> : <span className="notice-card__badge notice-card__badge--sub">공지</span>}
                <span className="notice-card__date">{new Date(notice.createdAt).toLocaleDateString("ko-KR")}</span>
              </div>
              <h2 className="notice-card__title">{notice.title}</h2>
              <p className="notice-card__summary">
                {notice.content.length > 110 ? `${notice.content.slice(0, 110)}...` : notice.content}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/notices" />
    </div>
  );
}
