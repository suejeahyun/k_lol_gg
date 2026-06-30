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
    orderBy: [{ eventDate: "desc" }, { id: "desc" }],
    include: {
      galleryImage: true,
      teams: true,
      participants: true,
      matches: true,
      participationApplies: true,
    },
  });

  const recruitingCount = events.filter((event) => event.status === "RECRUITING").length;
  const completedCount = events.filter((event) => event.status === "COMPLETED").length;

  return (
    <main className="page-container event-progress-page event-user-page">
      <section className="event-user-hero">
        <div>
          <p className="page-eyebrow">EVENT MATCH</p>
          <h1>이벤트 내전</h1>
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
          <span>전체 이벤트</span>
          <strong>{events.length}개</strong>
        </div>
        <div className="event-user-summary-card">
          <span>모집중</span>
          <strong>{recruitingCount}개</strong>
        </div>
        <div className="event-user-summary-card">
          <span>종료</span>
          <strong>{completedCount}개</strong>
        </div>
      </section>

      {events.length === 0 ? (
        <div className="empty-box">등록된 이벤트 내전이 없습니다.</div>
      ) : (
        <div className="event-progress-list event-progress-list--wide">
          {events.map((event) => {
            const thumbnail = getGalleryThumbnailUrl(event.galleryImage?.imageUrl);
            const totalApplications = event.participationApplies.length;
            const winnerTeam = event.winnerTeamId
              ? event.teams.find((team) => team.id === event.winnerTeamId)
              : null;

            return (
              <Link
                key={event.id}
                href={`/progress/event/${event.id}`}
                className="event-progress-card event-progress-card--with-image"
              >
                <div className="event-progress-card__preview">
                  {thumbnail ? (
                    <SafeGalleryImage
                      src={thumbnail}
                      alt={`${event.title} 대표 이미지`}
                      width={480}
                      height={270}
                      className="event-progress-card__preview-image"
                    />
                  ) : (
                    <div className="event-progress-card__preview-empty">
                      이벤트 이미지 미등록
                    </div>
                  )}
                </div>

                <div className="event-progress-card__content">
                  <div className="event-progress-card__top">
                    <span>{getStatusLabel(event.status)}</span>
                    <span>{getModeLabel(event.mode)}</span>
                    {winnerTeam ? <span>우승 {winnerTeam.name}</span> : null}
                  </div>

                  <h2>{event.title}</h2>

                  <p>
                    {event.status === "RECRUITING"
                      ? "현재 참가 신청을 받고 있습니다."
                      : event.status === "COMPLETED"
                        ? "종료된 이벤트 내전입니다. 결과와 팀 구성을 확인할 수 있습니다."
                        : "팀 구성과 대진 진행 상황을 확인할 수 있습니다."}
                  </p>

                  <div className="event-progress-card__meta event-progress-card__meta--user">
                    <div>
                      <span>진행일</span>
                      <strong>{formatDate(event.eventDate)}</strong>
                    </div>

                    <div>
                      <span>신청</span>
                      <strong>{totalApplications}명</strong>
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
                      <span>경기</span>
                      <strong>{event.matches.length}경기</strong>
                    </div>
                  </div>

                  <div className="event-progress-card__actions">
                    <span>상세 보기</span>
                    {event.status === "RECRUITING" ? (
                      <em>참가 가능</em>
                    ) : null}
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
