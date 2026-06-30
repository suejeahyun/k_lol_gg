export const dynamic = "force-dynamic";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import EventParticipationClient from "@/app/(user)/participation/event/[eventId]/EventParticipationClient";

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

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

function getWinnerName(match: { winnerTeamId: number | null; teamAId: number; teamBId: number; teamA: { name: string }; teamB: { name: string } }) {
  if (match.winnerTeamId === match.teamAId) return match.teamA.name;
  if (match.winnerTeamId === match.teamBId) return match.teamB.name;
  return "미정";
}

export default async function EventProgressDetailPage({ params }: PageProps) {
  const { eventId } = await params;
  const id = Number(eventId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const event = await prisma.eventMatch.findUnique({
    where: { id },
    include: {
      galleryImage: true,
      participationApplies: {
        include: {
          player: true,
        },
        orderBy: { createdAt: "asc" },
      },
      participants: {
        include: {
          player: true,
          team: true,
        },
        orderBy: { id: "asc" },
      },
      teams: {
        include: {
          members: {
            include: { player: true },
            orderBy: { id: "asc" },
          },
        },
        orderBy: [{ seed: "asc" }, { id: "asc" }],
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

  const galleryImageUrls = coerceGalleryImageUrls(event.galleryImage?.imageUrl);

  const matchesByStage = event.matches.reduce<Record<string, typeof event.matches>>(
    (acc, match) => {
      acc[match.stage] = acc[match.stage] ?? [];
      acc[match.stage].push(match);
      return acc;
    },
    {}
  );

  const activeApplies = event.participationApplies.filter(
    (apply) => !["CANCELLED", "REJECTED"].includes(apply.status)
  );

  const isRecruiting = event.status === "RECRUITING";
  const isTeamBuilding = event.status === "TEAM_BUILDING";
  const isInProgress = event.status === "IN_PROGRESS";
  const isCompleted = event.status === "COMPLETED";
  const isCancelled = event.status === "CANCELLED";

  return (
    <main className="page-container event-progress-detail event-user-detail-page">
      <section className="event-user-detail-hero">
        <div>
          <p className="page-eyebrow">EVENT MATCH DETAIL</p>
          <h1>{event.title}</h1>
          <p>
            현재 진행 단계에 필요한 정보만 표시합니다. 모집중이면 이 화면에서 바로 참가 신청할 수 있습니다.
          </p>
        </div>

        <div className="event-user-hero__actions">
          <Link href="/progress/event" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </section>

      <section className="event-detail-summary-grid event-detail-summary-grid--user">
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
          <span>신청</span>
          <strong>{activeApplies.length}명</strong>
        </div>
        <div className="event-detail-summary-card">
          <span>참가자</span>
          <strong>{event.participants.length}명</strong>
        </div>
        <div className="event-detail-summary-card">
          <span>팀 / 경기</span>
          <strong>
            {event.teams.length}팀 / {event.matches.length}경기
          </strong>
        </div>
      </section>

      {event.status === "PLANNED" ? (
        <section className="content-section event-user-section">
          <div className="section-header">
            <h2>모집 예정</h2>
          </div>
          <div className="empty-box">아직 모집이 시작되지 않았습니다. 모집이 열리면 이 화면에서 참가 신청이 가능합니다.</div>
        </section>
      ) : null}

      {isRecruiting ? (
        <section className="content-section event-user-section event-apply-merged-section">
          <div className="section-header">
            <h2>참가 신청</h2>
            <p className="page-description">모집 단계에서는 신청 폼과 신청자 현황만 표시합니다.</p>
          </div>
          <EventParticipationClient eventId={String(id)} embedded />
        </section>
      ) : null}

      {isTeamBuilding || isInProgress ? (
        <section className="content-section event-user-section">
          <div className="section-header">
            <h2>팀 구성</h2>
          </div>

          {event.teams.length === 0 ? (
            <div className="empty-box">아직 팀이 생성되지 않았습니다.</div>
          ) : (
            <div className="event-user-team-matrix">
              <div className="event-user-team-matrix__header">
                <span>라인</span>
                {event.teams.map((team) => (
                  <strong key={team.id}>{team.name}</strong>
                ))}
              </div>

              {POSITIONS.map((position) => (
                <div key={position} className="event-user-team-matrix__row">
                  <strong>{position}</strong>
                  {event.teams.map((team) => {
                    const member = team.members.find(
                      (teamMember) => teamMember.position === position
                    );

                    return (
                      <div key={team.id} className="event-user-team-matrix__cell">
                        {member ? (
                          <>
                            <b>{member.player.name}</b>
                            <span>
                              {member.player.nickname}#{member.player.tag}
                            </span>
                          </>
                        ) : (
                          <em>대기</em>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isInProgress ? (
        <section className="content-section event-user-section">
          <div className="section-header">
            <h2>대진 / 결과</h2>
          </div>

          {event.matches.length === 0 ? (
            <div className="empty-box">아직 대진표가 생성되지 않았습니다.</div>
          ) : (
            <div className="event-user-bracket-stage-list">
              {Object.entries(matchesByStage).map(([stage, matches]) => (
                <div key={stage} className="event-user-bracket-stage">
                  <h3>{getStageLabel(stage)}</h3>
                  <div className="event-user-match-grid">
                    {matches.map((match) => (
                      <div key={match.id} className="event-user-match-card">
                        <div>
                          <span>{match.round}경기</span>
                          <strong>
                            {match.teamA.name} vs {match.teamB.name}
                          </strong>
                        </div>
                        <em>승리: {getWinnerName(match)}</em>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isCompleted ? (
        <section className="content-section event-final-section event-user-final-section">
          <div className="section-header">
            <h2>최종 요약</h2>
            <p className="page-description">종료된 이벤트는 우승, MVP, 참가 규모, 대진 결과만 요약해서 표시합니다.</p>
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

            <div className="event-final-card">
              <span>참가 / 팀 / 경기</span>
              <strong>{event.participants.length}명 / {event.teams.length}팀 / {event.matches.length}경기</strong>
            </div>
          </div>

          {event.matches.length ? (
            <div className="event-user-bracket-stage-list" style={{ marginTop: 16 }}>
              {Object.entries(matchesByStage).map(([stage, matches]) => (
                <div key={stage} className="event-user-bracket-stage">
                  <h3>{getStageLabel(stage)}</h3>
                  <div className="event-user-match-grid">
                    {matches.map((match) => (
                      <div key={match.id} className="event-user-match-card">
                        <div>
                          <span>{match.round}경기</span>
                          <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                        </div>
                        <em>승리: {getWinnerName(match)}</em>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {galleryImageUrls.length ? (
            <div className="event-final-gallery">
              {galleryImageUrls.map((imageUrl, index) => (
                <SafeGalleryImage
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

      {isCancelled ? (
        <section className="content-section event-user-section">
          <div className="section-header">
            <h2>취소된 이벤트</h2>
          </div>
          <div className="empty-box">해당 이벤트는 취소되었습니다. 참가 신청과 진행 정보는 표시하지 않습니다.</div>
        </section>
      ) : null}
    </main>
  );
}
