import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

export default async function NoticesPage() {
  const notices = await prisma.notice.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="notice-page">
      <div className="notice-page__header">
        <h1 className="notice-page__title">공지사항</h1>
        <p className="notice-page__description">
          운영 공지 및 안내사항을 확인할 수 있습니다.
        </p>
      </div>

      <div className="notice-list">
        {notices.length === 0 ? (
          <div className="notice-list__empty">등록된 공지사항이 없습니다.</div>
        ) : (
          notices.map((notice) => (
            <Link
              key={notice.id}
              href={`/notices/${notice.id}`}
              className="notice-card"
            >
              <div className="notice-card__content">
                <div className="notice-card__top">
                  {notice.isPinned ? (
                    <span className="notice-card__badge">공지</span>
                  ) : null}

                  <span className="notice-card__date">
                    {new Date(notice.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>

                <h2 className="notice-card__title">{notice.title}</h2>

                <p className="notice-card__summary">
                  {notice.content.length > 120
                    ? `${notice.content.slice(0, 120)}...`
                    : notice.content}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}