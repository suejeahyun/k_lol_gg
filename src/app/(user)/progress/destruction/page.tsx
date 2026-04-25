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
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

export default async function DestructionProgressPage() {
  const tournaments = await prisma.destructionTournament.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      teams: true,
      participants: true,
      matches: true,
      galleryImage: true,
    },
  });

  return (
    <main className="page-container destruction-progress-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">DESTRUCTION MATCH</p>
          <h1 className="page-title">멸망전</h1>
          <p className="page-description">
            멸망전 진행 상태, 팀 구성, 예선 순위, 토너먼트 결과를 확인합니다.
          </p>
        </div>

        <div className="page-actions">
          <Link href="/progress" className="btn btn-ghost">
            진행현황으로
          </Link>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="empty-box">등록된 멸망전이 없습니다.</div>
      ) : (
        <div className="destruction-progress-list">
          {tournaments.map((tournament) => (
            <Link
              key={tournament.id}
              href={`/progress/destruction/${tournament.id}`}
              className="destruction-progress-card"
            >
              <div className="destruction-progress-card__top">
                <span>{getStatusLabel(tournament.status)}</span>
              </div>

              <h2>{tournament.title}</h2>

              <p>{tournament.description || "등록된 설명이 없습니다."}</p>

              <div className="destruction-progress-card__meta">
                <div>
                  <span>시작일</span>
                  <strong>{formatDate(tournament.startDate)}</strong>
                </div>

                <div>
                  <span>종료일</span>
                  <strong>{formatDate(tournament.endDate)}</strong>
                </div>

                <div>
                  <span>팀</span>
                  <strong>{tournament.teams.length}개</strong>
                </div>

                <div>
                  <span>참가자</span>
                  <strong>{tournament.participants.length}명</strong>
                </div>

                <div>
                  <span>경기</span>
                  <strong>{tournament.matches.length}개</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}