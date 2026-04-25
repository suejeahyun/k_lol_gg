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
    POSITION: "포지션 지정",
    ARAM: "칼바람",
  };

  return labels[mode] ?? mode;
}

export default async function EventProgressPage() {
  const events = await prisma.eventMatch.findMany({
    orderBy: {
      eventDate: "desc",
    },
    include: {
      galleryImage: true,
      teams: true,
      participants: true,
      matches: true,
    },
  });

  return (
    <main className="page-container event-progress-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">EVENT MATCH</p>
          <h1 className="page-title">이벤트 내전</h1>
          <p className="page-description">
            월간 이벤트 내전 진행 상황, 참가자 수, 팀 구성, 결과를 확인합니다.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-box">등록된 이벤트 내전이 없습니다.</div>
      ) : (
        <div className="event-progress-list">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/progress/event/${event.id}`}
              className="event-progress-card"
            >
              <div className="event-progress-card__top">
                <span>{getStatusLabel(event.status)}</span>
                <span>{getModeLabel(event.mode)}</span>
              </div>

              <h2>{event.title}</h2>

              <p>{event.description || "등록된 설명이 없습니다."}</p>

              <div className="event-progress-card__meta">
                <div>
                  <span>진행일</span>
                  <strong>{formatDate(event.eventDate)}</strong>
                </div>

                <div>
                  <span>참가자</span>
                  <strong>{event.participants.length}명</strong>
                </div>

                <div>
                  <span>팀</span>
                  <strong>{event.teams.length}개</strong>
                </div>

                <div>
                  <span>대진</span>
                  <strong>{event.matches.length}경기</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}