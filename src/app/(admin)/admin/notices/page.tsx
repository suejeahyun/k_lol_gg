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

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">공지사항 관리</h1>
          <p className="admin-page__description">총 {totalCount}개</p>
        </div>
        <Link href="/admin/notices/new" className="admin-page__create-button">공지 등록</Link>
      </div>

      <div className="notice-admin-list">
        {notices.length === 0 ? (
          <div className="notice-admin-list__empty">등록된 공지사항이 없습니다.</div>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className="notice-admin-card">
              <div className="notice-admin-card__content">
                <div className="notice-admin-card__top">
                  {notice.isPinned ? <span className="notice-admin-card__badge">상단 고정</span> : null}
                  <span className="notice-admin-card__date">{new Date(notice.createdAt).toLocaleDateString("ko-KR")}</span>
                </div>
                <h2 className="notice-admin-card__title">{notice.title}</h2>
                <p className="notice-admin-card__summary">{notice.content.length > 160 ? `${notice.content.slice(0, 160)}...` : notice.content}</p>
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
