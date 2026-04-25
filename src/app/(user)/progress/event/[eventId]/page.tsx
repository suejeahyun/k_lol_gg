import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

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
    ARAM: "칼바람",
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

export default async function EventProgressDetailPage({ params }: PageProps) {
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

  const winnerTeam = event.winnerTeamId
    ? event.teams.find((team) => team.id === event.winnerTeamId)
    : null;

  const mvpParticipant = event.mvpPlayerId
    ? event.participants.find(
        (participant) => participant.playerId === event.mvpPlayerId
      )
    : null;

  return (
    <main className="page-container event-progress-detail">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">EVENT MATCH DETAIL</p>
          <h1 className="page-title">{event.title}</h1>
          <p className="page-description">
            {event.description || "등록된 설명이 없습니다."}
          </p>
        </div>

        <div className="page-actions">
          <Link href="/progress/event" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="event-detail-summary-grid">
        <div className="event-detail-summary-card">
          <span>진행 상태</span>
          <strong>{getStatusLabel(event.status)}</strong>
        </div>

        <div className="event-detail-summary-card">
          <span>진행 방식</span>
          <strong>{getModeLabel(event.mode)}</strong>
        </div>

        <div className="event-detail-summary-card">
          <span>진행일</span>
          <strong>{formatDate(event.eventDate)}</strong>
        </div>

        <div className="event-detail-summary-card">
          <span>모집 기간</span>
          <strong>
            {formatDate(event.recruitFrom)} ~ {formatDate(event.recruitTo)}
          </strong>
        </div>

        <div className="event-detail-summary-card">
          <span>참가자</span>
          <strong>{event.participants.length}명</strong>
        </div>

        <div className="event-detail-summary-card">
          <span>팀</span>
          <strong>{event.teams.length}개</strong>
        </div>
      </section>

      {event.status === "COMPLETED" ? (
        <section className="content-section event-final-section">
          <div className="section-header">
            <h2>최종 결과</h2>
          </div>

          <div className="event-final-grid">
            <div className="event-final-card">
              <span>우승 팀</span>
              <strong>{winnerTeam?.name ?? "-"}</strong>
            </div>

            <div className="event-final-card">
              <span>MVP</span>
              <strong>
                {mvpParticipant
                  ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}`
                  : "-"}
              </strong>
            </div>
          </div>

          {event.galleryImage?.imageUrl?.length ? (
            <div className="event-final-gallery">
              {event.galleryImage.imageUrl.map((imageUrl, index) => (
                <Image
                  key={`${imageUrl}-${index}`}
                  src={imageUrl}
                  alt={`${event.galleryImage?.title ?? event.title} ${index + 1}`}
                  width={1200}
                  height={720}
                  className="event-final-gallery__image"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="content-section">
        <div className="section-header">
          <h2>팀 구성</h2>
        </div>

        {event.teams.length === 0 ? (
          <div className="empty-box">아직 팀이 생성되지 않았습니다.</div>
        ) : (
          <div className="event-detail-team-grid">
            {event.teams.map((team) => (
              <div key={team.id} className="event-detail-team-card">
                <h3>{team.name}</h3>

                <div className="event-detail-member-list">
                  {team.members.map((member) => (
                    <div key={member.id} className="event-detail-member-row">
                      <strong>
                        {member.player.nickname}#{member.player.tag}
                      </strong>
                      <span>{member.position ?? "포지션 없음"}</span>
                      <em>{member.balanceScore}</em>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>대진표</h2>
        </div>

        {event.matches.length === 0 ? (
          <div className="empty-box">아직 대진표가 생성되지 않았습니다.</div>
        ) : (
          <div className="event-detail-bracket-list">
            {event.matches.map((match) => {
              const winnerName =
                match.winnerTeamId === match.teamAId
                  ? match.teamA.name
                  : match.winnerTeamId === match.teamBId
                    ? match.teamB.name
                    : "-";

              return (
                <div key={match.id} className="event-detail-bracket-row">
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <em>{match.round}경기</em>
                  <b>승리: {winnerName}</b>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>참가자</h2>
        </div>

        {event.participants.length === 0 ? (
          <div className="empty-box">등록된 참가자가 없습니다.</div>
        ) : (
          <div className="event-detail-participant-list">
            {event.participants.map((participant) => (
              <div key={participant.id} className="event-detail-participant-row">
                <strong>
                  {participant.player.nickname}#{participant.player.tag}
                </strong>
                <span>{participant.position ?? "포지션 없음"}</span>
                <em>{participant.team?.name ?? "팀 미배정"}</em>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}