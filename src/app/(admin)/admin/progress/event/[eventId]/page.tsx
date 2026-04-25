import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import EventParticipantForm from "@/components/admin/EventParticipantForm";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

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
    ARAM: "칼바람 / 포지션 없음",
  };

  return labels[mode] ?? mode;
}

export default async function AdminEventMatchDetailPage({
  params,
}: PageProps) {
  const { eventId } = await params;
  const id = Number(eventId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const event = await prisma.eventMatch.findUnique({
    where: {
      id,
    },
    include: {
      galleryImage: true,
      participants: {
        include: {
          player: true,
          team: true,
        },
        orderBy: {
          id: "asc",
        },
      },
      teams: {
        include: {
          members: {
            include: {
              player: true,
            },
            orderBy: {
              id: "asc",
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      },
      matches: {
        include: {
          teamA: true,
          teamB: true,
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
      },
    },
  });

  if (!event) {
    notFound();
  }

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{event.title}</h1>
          <p className="admin-page__description">
            이벤트 내전 참가자 등록, 팀 구성, 경기 결과를 관리합니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <Link href="/admin/progress/event" className="chip-button">
            목록으로
          </Link>
        </div>
      </div>

      <section className="admin-event-detail-grid">
        <div className="admin-event-detail-card">
          <span>진행 상태</span>
          <strong>{getStatusLabel(event.status)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>진행 방식</span>
          <strong>{getModeLabel(event.mode)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>진행일</span>
          <strong>{formatDate(event.eventDate)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>모집 기간</span>
          <strong>
            {formatDate(event.recruitFrom)} ~ {formatDate(event.recruitTo)}
          </strong>
        </div>

        <div className="admin-event-detail-card">
          <span>참가자</span>
          <strong>{event.participants.length}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>팀</span>
          <strong>{event.teams.length}개</strong>
        </div>
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">기본 정보</h2>
            <p className="admin-page__description">
              {event.description || "등록된 설명이 없습니다."}
            </p>
          </div>
        </div>
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">참가자 등록</h2>
            <p className="admin-page__description">
              참가자는 5명 단위로 입력합니다. 칼바람 모드는 포지션 없이
              저장됩니다.
            </p>
          </div>
        </div>

        <EventParticipantForm eventId={event.id} mode={event.mode} />

        {event.participants.length === 0 ? (
          <div className="empty-box">등록된 참가자가 없습니다.</div>
        ) : (
          <div className="admin-event-participant-list">
            {event.participants.map((participant) => (
              <div key={participant.id} className="admin-event-participant-row">
                <span>
                  {participant.player.nickname}#{participant.player.tag}
                </span>
                <span>{participant.position ?? "포지션 없음"}</span>
                <span>{participant.team?.name ?? "팀 미배정"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">팀 구성</h2>
            <p className="admin-page__description">
              참가자 저장 후 팀 자동 생성 기능을 연결합니다.
            </p>
          </div>

          <button type="button" className="admin-page__create-button" disabled>
            팀 자동 생성 준비중
          </button>
        </div>

        {event.teams.length === 0 ? (
          <div className="empty-box">생성된 팀이 없습니다.</div>
        ) : (
          <div className="admin-event-team-list">
            {event.teams.map((team) => (
              <div key={team.id} className="admin-event-team-card">
                <h3>{team.name}</h3>

                <div>
                  {team.members.map((member) => (
                    <span key={member.id}>
                      {member.player.nickname}#{member.player.tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}