import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PLANNED: "기획중",
    RECRUITING: "모집중",
    TEAM_BUILDING: "팀 구성중",
    IN_PROGRESS: "진행중",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getModeLabel(mode: string) {
  const labels: Record<string, string> = {
    POSITION: "포지션",
    ARAM: "칼바람",
  };

  return labels[mode] ?? mode;
}

export default async function AdminEventMatchesPage() {
  const events = await prisma.eventMatch.findMany({
    orderBy: {
      eventDate: "desc",
    },
    include: {
      galleryImage: true,
      _count: {
        select: {
          participants: true,
          teams: true,
          matches: true,
        },
      },
    },
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">이벤트 내전 관리</h1>
          <p className="admin-page__description">
            월간 이벤트 내전 생성, 참가자 모집, 팀 구성, 결과 등록을 관리합니다.
          </p>
        </div>

        <Link href="/admin/progress/event/new" className="admin-page__create-button">
          이벤트 내전 생성
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="empty-box">등록된 이벤트 내전이 없습니다.</div>
      ) : (
        <div className="admin-event-list">
          {events.map((event) => (
            <div key={event.id} className="admin-event-card">
              <div className="admin-event-card__main">
                <div className="admin-event-card__top">
                  <span className="admin-event-card__status">
                    {getStatusLabel(event.status)}
                  </span>

                  <span className="admin-event-card__mode">
                    {getModeLabel(event.mode)}
                  </span>
                </div>

                <h2 className="admin-event-card__title">{event.title}</h2>

                <div className="admin-event-card__meta">
                  <span>진행일: {formatDate(event.eventDate)}</span>
                  <span>모집 시작: {formatDate(event.recruitFrom)}</span>
                  <span>모집 종료: {formatDate(event.recruitTo)}</span>
                </div>

                <div className="admin-event-card__counts">
                  <span>참가자 {event._count.participants}명</span>
                  <span>팀 {event._count.teams}개</span>
                  <span>경기 {event._count.matches}개</span>
                </div>
              </div>

              <div className="admin-event-card__actions">
                <Link
                  href={`/admin/progress/event/${event.id}`}
                  className="chip-button"
                >
                  상세/수정
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}