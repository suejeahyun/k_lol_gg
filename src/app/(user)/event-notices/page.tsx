import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

const typeLabels = {
  EVENT_MATCH: "이벤트 내전",
  DESTRUCTION: "멸망전",
  ETC: "기타 이벤트",
} as const;

function formatDate(date: Date | null) {
  if (!date) return "일정 미정";

  return new Date(date).toLocaleDateString("ko-KR");
}

export default async function EventNoticesPage() {
  const notices = await prisma.eventNotice.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="notice-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Event Notice List</p>
          <h1 className="page-title">이벤트 공지 목록</h1>
        </div>
      </div>

      <div className="notice-list">
        {notices.length === 0 ? (
          <div className="notice-list__empty">
            등록된 이벤트 공지가 없습니다.
          </div>
        ) : (
          notices.map((notice) => (
            <Link
              key={notice.id}
              href={`/event-notices/${notice.id}`}
              className="notice-card"
            >
              <div className="notice-card__content">
                <div className="notice-card__top">
                  {notice.isPinned ? (
                    <span className="notice-card__badge">공지</span>
                  ) : null}

                  <span className="notice-card__badge">
                    {typeLabels[notice.type]}
                  </span>

                  <span className="notice-card__date">
                    {formatDate(notice.startDate)}
                  </span>
                </div>

                <h2 className="notice-card__title">{notice.title}</h2>

                <p className="notice-card__summary">
                  {notice.content.length > 120
                    ? `${notice.content.slice(0, 120)}...`
                    : notice.content}
                </p>

                {notice.recruitInfo ? (
                  <p className="notice-card__summary">
                    참가 방법:{" "}
                    {notice.recruitInfo.length > 80
                      ? `${notice.recruitInfo.slice(0, 80)}...`
                      : notice.recruitInfo}
                  </p>
                ) : null}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}