import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import EventParticipantForm from "@/components/admin/EventParticipantForm";
import EventTeamGenerator from "@/components/admin/EventTeamGenerator";
import EventBracketGenerator from "@/components/admin/EventBracketGenerator";
import EventMatchResultForm from "@/components/admin/EventMatchResultForm";
import EventCompleteForm from "@/components/admin/EventCompleteForm";

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

function getStageLabel(stage: string) {
  const labels: Record<string, string> = {
    ROUND_OF_32: "32강",
    ROUND_OF_16: "16강",
    QUARTER_FINAL: "8강",
    SEMI_FINAL: "4강",
    FINAL: "결승",
  };

  return labels[stage] ?? stage;
}

export default async function AdminEventMatchDetailPage({
  params,
}: PageProps) {
  const { eventId } = await params;
  const id = Number(eventId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const [event, galleryImages, players] = await Promise.all([
    prisma.eventMatch.findUnique({
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
    }),

    prisma.galleryImage.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        title: true,
      },
    }),

    prisma.player.findMany({
      orderBy: [{ name: "asc" }, { nickname: "asc" }],
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
      },
    }),
  ]);

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
              등록된 플레이어 목록에서 참가자를 선택합니다.
            </p>
          </div>
        </div>

        <EventParticipantForm
          eventId={event.id}
          mode={event.mode}
        />

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
              참가자 저장 후 팀 자동 생성을 실행합니다.
            </p>
          </div>
        </div>

        <EventTeamGenerator
          eventId={event.id}
          mode={event.mode}
          participants={event.participants}
          hasTeams={event.teams.length > 0}
        />

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

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">대진표</h2>
            <p className="admin-page__description">
              팀 생성 후 토너먼트 대진을 생성하고 경기 결과를 등록합니다.
            </p>
          </div>
        </div>

        <EventBracketGenerator
          eventId={event.id}
          teamCount={event.teams.length}
          matchCount={event.matches.length}
        />

        {event.matches.length === 0 ? (
          <div className="empty-box">생성된 대진이 없습니다.</div>
        ) : (
          <div className="admin-event-bracket-list">
            {event.matches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <span>{match.round}경기</span>
                </div>

                <EventMatchResultForm
                  eventId={event.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={event.participants}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">최종 결과</h2>
            <p className="admin-page__description">
              우승 팀, MVP, 연결할 갤러리 이미지를 선택하고 이벤트를 종료합니다.
            </p>
          </div>
        </div>

        <EventCompleteForm
          eventId={event.id}
          teams={event.teams}
          participants={event.participants}
          galleryImages={galleryImages}
          initialWinnerTeamId={event.winnerTeamId}
          initialMvpPlayerId={event.mvpPlayerId}
          initialGalleryImageId={event.galleryImageId}
        />
      </section>
    </main>
  );
}