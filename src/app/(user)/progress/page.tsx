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

export default async function ProgressPage() {
  const [latestEvent, totalEvents, completedEvents] = await Promise.all([
    prisma.eventMatch.findFirst({
      orderBy: {
        eventDate: "desc",
      },
      include: {
        teams: true,
        participants: true,
        matches: true,
      },
    }),

    prisma.eventMatch.count(),

    prisma.eventMatch.count({
      where: {
        status: "COMPLETED",
      },
    }),
  ]);

  return (
    <main className="page-container progress-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">PROGRESS</p>
          <h1 className="page-title">진행 현황</h1>
          <p className="page-description">
            이벤트 내전과 멸망전 진행 상태를 확인합니다.
          </p>
        </div>
      </div>

      <section className="progress-overview-grid">
        <Link href="/progress/event" className="progress-overview-card">
          <div className="progress-overview-card__top">
            <span>EVENT MATCH</span>
            <strong>이벤트 내전</strong>
          </div>

          <p>
            월간 이벤트 내전의 모집, 팀 구성, 대진표, 결과를 확인합니다.
          </p>

          <div className="progress-overview-card__stats">
            <div>
              <span>전체 이벤트</span>
              <strong>{totalEvents}</strong>
            </div>

            <div>
              <span>완료 이벤트</span>
              <strong>{completedEvents}</strong>
            </div>
          </div>

          {latestEvent ? (
            <div className="progress-overview-card__latest">
              <span>최근 이벤트</span>
              <strong>{latestEvent.title}</strong>
              <em>
                {getStatusLabel(latestEvent.status)} ·{" "}
                {formatDate(latestEvent.eventDate)}
              </em>
            </div>
          ) : (
            <div className="progress-overview-card__latest">
              <span>최근 이벤트</span>
              <strong>없음</strong>
              <em>등록된 이벤트 내전이 없습니다.</em>
            </div>
          )}
        </Link>

        <Link href="/progress/destruction" className="progress-overview-card">
          <div className="progress-overview-card__top">
            <span>DESTRUCTION MATCH</span>
            <strong>멸망전</strong>
          </div>

          <p>
            팀장, 예선 풀리그, 상위 4팀 토너먼트, 결승 진행 상태를 확인합니다.
          </p>

          <div className="progress-overview-card__stats">
            <div>
              <span>상태</span>
              <strong>준비중</strong>
            </div>

            <div>
              <span>방식</span>
              <strong>풀리그</strong>
            </div>
          </div>

          <div className="progress-overview-card__latest">
            <span>진행 안내</span>
            <strong>멸망전 기능 준비중</strong>
            <em>이벤트 내전 완료 후 개발 예정입니다.</em>
          </div>
        </Link>
      </section>
    </main>
  );
}