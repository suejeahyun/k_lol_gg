export const dynamic = "force-dynamic";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";

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

  return (
    <main className="page-container event-progress-detail event-user-detail-page">
      <section className="event-user-detail-hero">
        <div>
          <p className="page-eyebrow">EVENT MATCH DETAIL</p>
          <h1>{event.title}</h1>
          <p>
            참가 신청, 팀 구성, 대진 결과, 최종 우승 정보를 확인합니다.
          </p>
        </div>

        <div className="event-user-hero__actions">
          {event.status === "RECRUITING" ? (
            <Link href={`/participation/event/${event.id}`} className="btn btn-primary">
              참가하기
            </Link>
          ) : null}
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
          <strong>{event.participationApplies.length}명</strong>
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

      {event.status === "COMPLETED" ? (
        <section className="content-section event-final-section event-user-final-section">
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
          ) : (
            <div className="empty-box">우승 이미지가 아직 등록되지 않았습니다.</div>
          )}
        </section>
      ) : null}

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
                  {matches.map((match) => {
                    const winnerName =
                      match.winnerTeamId === match.teamAId
                        ? match.teamA.name
                        : match.winnerTeamId === match.teamBId
                          ? match.teamB.name
                          : "미정";

                    return (
                      <div key={match.id} className="event-user-match-card">
                        <div>
                          <span>{match.round}경기</span>
                          <strong>
                            {match.teamA.name} vs {match.teamB.name}
                          </strong>
                        </div>
                        <em>승리: {winnerName}</em>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section event-user-section">
        <div className="section-header">
          <h2>참가 신청 현황</h2>
        </div>

        {event.participationApplies.length === 0 ? (
          <div className="empty-box">참가 신청자가 없습니다.</div>
        ) : (
          <div className="event-user-table-wrap">
            <table className="event-user-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>이름</th>
                  <th>닉네임#태그</th>
                  <th>주라인</th>
                  <th>부라인</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {event.participationApplies.map((apply, index) => (
                  <tr key={apply.id}>
                    <td>{index + 1}</td>
                    <td>{apply.player.name}</td>
                    <td>
                      {apply.player.nickname}#{apply.player.tag}
                    </td>
                    <td>{apply.mainPosition ?? "-"}</td>
                    <td>
                      {apply.subPositions.length > 0
                        ? apply.subPositions.join(", ")
                        : "-"}
                    </td>
                    <td>{apply.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
