export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";

const typeLabels = {
  EVENT_MATCH: "이벤트 내전",
  DESTRUCTION: "멸망전",
  ETC: "기타 이벤트",
} as const;

type AdminEventNoticesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 10;

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminEventNoticesPage({ searchParams }: AdminEventNoticesPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const totalCount = await prisma.eventNotice.count();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const notices = await prisma.eventNotice.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    skip: (safeCurrentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: { id: true, title: true, content: true, type: true, isPinned: true, startDate: true, createdAt: true },
  });

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 공지 관리</h1>
          <p className="admin-page__description">총 {totalCount}개</p>
        </div>
        <Link href="/admin/event-notices/new" className="admin-page__create-button">이벤트 공지 등록</Link>
      </div>

      <div className="notice-admin-list">
        {notices.length === 0 ? (
          <div className="notice-admin-list__empty">등록된 이벤트 공지가 없습니다.</div>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className="notice-admin-card">
              <div className="notice-admin-card__content">
                <div className="notice-admin-card__top">
                  {notice.isPinned ? <span className="notice-admin-card__badge">상단 고정</span> : null}
                  <span className="notice-admin-card__type">{typeLabels[notice.type]}</span>
                  <span className="notice-admin-card__date">등록일 {formatDate(notice.createdAt)}</span>
                </div>
                <h2 className="notice-admin-card__title">{notice.title}</h2>
                <p className="notice-admin-card__summary">{notice.content.length > 160 ? `${notice.content.slice(0, 160)}...` : notice.content}</p>
                <div className="notice-admin-card__meta">이벤트 일시: {formatDate(notice.startDate)}</div>
              </div>
              <div className="notice-admin-card__actions">
                <Link href={`/admin/event-notices/${notice.id}/edit`} className="chip-button">수정</Link>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/admin/event-notices" />
    </div>
  );
}
