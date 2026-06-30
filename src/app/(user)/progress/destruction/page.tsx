export const dynamic = "force-dynamic";

import Link from "next/link";
import SafeGalleryImage from "@/components/SafeGalleryImage";
import { prisma } from "@/lib/prisma/client";
import { getGalleryThumbnailUrl } from "@/lib/gallery/winner-image-paths";

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
    AUCTION: "경매 진행",
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getProgressDescription(status: string) {
  if (status === "RECRUITING") {
    return "현재 멸망전 참가 신청을 받고 있습니다. 참가자 명단과 신청 현황을 확인할 수 있습니다.";
  }

  if (status === "AUCTION") {
    return "경매 진행 단계입니다. 참가자 명단과 경매 현황을 확인할 수 있습니다.";
  }

  if (status === "PRELIMINARY") {
    return "예선 진행 단계입니다. 팀 구성, 참가자 명단, 예선 결과를 확인할 수 있습니다.";
  }

  if (status === "TOURNAMENT") {
    return "본선 진행 단계입니다. 참가자 명단과 토너먼트 결과를 확인할 수 있습니다.";
  }

  if (status === "COMPLETED") {
    return "종료된 멸망전입니다. 최종 결과, 팀 구성, 참가자 명단을 확인할 수 있습니다.";
  }

  return "멸망전 진행 상태, 팀 구성, 참가자 명단을 확인할 수 있습니다.";
}

export default async function DestructionProgressPage() {
  const tournaments = await prisma.destructionTournament.findMany({
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    include: {
      teams: true,
      participants: true,
      matches: true,
      galleryImage: true,
      participationApplies: true,
    },
  });

  const recruitingCount = tournaments.filter(
    (tournament) => tournament.status === "RECRUITING"
  ).length;
  const activeCount = tournaments.filter((tournament) =>
    ["AUCTION", "PRELIMINARY", "TOURNAMENT"].includes(tournament.status)
  ).length;
  const completedCount = tournaments.filter(
    (tournament) => tournament.status === "COMPLETED"
  ).length;

  return (
    <main className="page-container destruction-progress-page event-user-page">
      <section className="event-user-hero">
        <div>
          <p className="page-eyebrow">DESTRUCTION MATCH</p>
          <h1>멸망전</h1>
        </div>

        <div className="event-user-hero__actions">
          <Link href="/progress" className="btn btn-ghost">
            진행현황으로
          </Link>
          <Link href="/participation" className="btn btn-primary">
            참가 신청
          </Link>
        </div>
      </section>

      <section className="event-user-summary-grid">
        <div className="event-user-summary-card">
          <span>전체 멸망전</span>
          <strong>{tournaments.length}개</strong>
        </div>
        <div className="event-user-summary-card">
          <span>모집중</span>
          <strong>{recruitingCount}개</strong>
        </div>
        <div className="event-user-summary-card">
          <span>진행중</span>
          <strong>{activeCount}개</strong>
        </div>
        <div className="event-user-summary-card">
          <span>종료</span>
          <strong>{completedCount}개</strong>
        </div>
      </section>

      {tournaments.length === 0 ? (
        <div className="empty-box">등록된 멸망전이 없습니다.</div>
      ) : (
        <div className="event-progress-list event-progress-list--wide">
          {tournaments.map((tournament) => {
            const thumbnail = getGalleryThumbnailUrl(tournament.galleryImage?.imageUrl);
            const totalApplications = tournament.participationApplies.length;

            return (
              <Link
                key={tournament.id}
                href={`/progress/destruction/${tournament.id}`}
                className="event-progress-card event-progress-card--with-image"
              >
                <div className="event-progress-card__preview">
                  {thumbnail ? (
                    <SafeGalleryImage
                      src={thumbnail}
                      alt={`${tournament.title} 대표 이미지`}
                      width={480}
                      height={270}
                      className="event-progress-card__preview-image"
                    />
                  ) : (
                    <div className="event-progress-card__preview-empty">
                      우승 이미지 미등록
                    </div>
                  )}
                </div>

                <div className="event-progress-card__content">
                  <div className="event-progress-card__top">
                    <span>{getStatusLabel(tournament.status)}</span>
                    {tournament.status !== "CANCELLED" ? <span>참가자 명단</span> : null}
                  </div>

                  <h2>{tournament.title}</h2>

                  <p>{tournament.description || getProgressDescription(tournament.status)}</p>

                  <div className="event-progress-card__meta event-progress-card__meta--user">
                    <div>
                      <span>시작일</span>
                      <strong>{formatDate(tournament.startDate)}</strong>
                    </div>

                    <div>
                      <span>종료일</span>
                      <strong>{formatDate(tournament.endDate)}</strong>
                    </div>

                    <div>
                      <span>신청</span>
                      <strong>{totalApplications}명</strong>
                    </div>

                    <div>
                      <span>참가자</span>
                      <strong>{tournament.participants.length}명</strong>
                    </div>

                    <div>
                      <span>팀</span>
                      <strong>{tournament.teams.length}개</strong>
                    </div>
                  </div>

                  <div className="event-progress-card__actions">
                    <span>상세 보기</span>
                    <em>참가자 명단 확인 가능</em>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
