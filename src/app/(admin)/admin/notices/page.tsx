export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import NoticeDeleteButton from "@/features/notice/NoticeDeleteButton";
import Pagination from "@/components/Pagination";

type AdminNoticesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 10;

export default async function AdminNoticesPage({ searchParams }: AdminNoticesPageProps) {
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

  const pinnedCount = notices.filter((notice) => notice.isPinned).length;

  return (
    <div className="admin-page admin-notice-page">
      <div className="admin-page__header admin-notice-hero">
        <div>
          <p className="admin-page__kicker">NOTICE OPS</p>
          <h1 className="admin-page__title">공지 추천 관리</h1>
        </div>
        <Link href="/admin/notices/new" className="admin-page__create-button">공지 등록</Link>
      </div>

      <section className="card-grid admin-notice-summary">
        <div className="stat-card">
          <span className="stat-card__label">전체 공지</span>
          <strong className="stat-card__value">{totalCount.toLocaleString("ko-KR")}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">현재 페이지 고정</span>
          <strong className="stat-card__value">{pinnedCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">페이지</span>
          <strong className="stat-card__value">{safeCurrentPage}/{totalPages}</strong>
        </div>
      </section>

      <section className="admin-card admin-notice-guide">
        <div>
          <h2>추천 운영 기준</h2>
          <p className="admin-muted">중요 안내는 상단 고정으로 운영하고, 긴 공지는 제목과 첫 문단이 바로 이해되도록 정리하는 것을 권장합니다.</p>
        </div>
      </section>

      <div className="notice-admin-list notice-admin-list--grid">
        {notices.length === 0 ? (
          <div className="notice-admin-list__empty">등록된 공지사항이 없습니다.</div>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className={`notice-admin-card ${notice.isPinned ? "is-pinned" : ""}`}>
              <div className="notice-admin-card__content">
                <div className="notice-admin-card__top">
                  {notice.isPinned ? <span className="notice-admin-card__badge">추천 고정</span> : <span className="notice-admin-card__badge notice-admin-card__badge--sub">일반 공지</span>}
                  <span className="notice-admin-card__date">{new Date(notice.createdAt).toLocaleDateString("ko-KR")}</span>
                </div>
                <h2 className="notice-admin-card__title">{notice.title}</h2>
                <p className="notice-admin-card__summary">{notice.content.length > 150 ? `${notice.content.slice(0, 150)}...` : notice.content}</p>
              </div>
              <div className="notice-admin-card__actions">
                <Link href={`/admin/notices/${notice.id}/edit`} className="chip-button">수정</Link>
                <NoticeDeleteButton noticeId={notice.id} />
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination currentPage={safeCurrentPage} totalPages={totalPages} basePath="/admin/notices" />
    </div>
  );
}
