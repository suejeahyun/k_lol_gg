import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{
    tournamentId: string;
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
    PRELIMINARY: "예선 진행",
    TOURNAMENT: "토너먼트 진행",
    COMPLETED: "종료",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

function getStageLabel(stage: string) {
  const labels: Record<string, string> = {
    PRELIMINARY: "예선",
    SEMI_FINAL: "4강",
    FINAL: "결승",
  };

  return labels[stage] ?? stage;
}

export default async function DestructionProgressDetailPage({
  params,
}: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const tournament = await prisma.destructionTournament.findUnique({
    where: {
      id,
    },
    include: {
      galleryImage: true,
      teams: {
        include: {
          captain: true,
          members: {
            include: {
              player: true,
            },
            orderBy: {
              id: "asc",
            },
          },
        },
        orderBy: [
          { points: "desc" },
          { wins: "desc" },
          { losses: "asc" },
          { id: "asc" },
        ],
      },
      participants: {
        include: {
          player: true,
          team: true,
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

  if (!tournament) {
    notFound();
  }

  const winnerTeam = tournament.winnerTeamId
    ? tournament.teams.find((team) => team.id === tournament.winnerTeamId)
    : null;

  const mvpParticipant = tournament.mvpPlayerId
    ? tournament.participants.find(
        (participant) => participant.playerId === tournament.mvpPlayerId
      )
    : null;

  const preliminaryMatches = tournament.matches.filter(
    (match) => match.stage === "PRELIMINARY"
  );

  const semiFinalMatches = tournament.matches.filter(
    (match) => match.stage === "SEMI_FINAL"
  );

  const finalMatches = tournament.matches.filter(
    (match) => match.stage === "FINAL"
  );

  return (
    <main className="page-container destruction-detail-page">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">DESTRUCTION MATCH DETAIL</p>
          <h1 className="page-title">{tournament.title}</h1>
          <p className="page-description">
            {tournament.description || "등록된 설명이 없습니다."}
          </p>
        </div>

        <div className="page-actions">
          <Link href="/progress/destruction" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="destruction-detail-summary-grid">
        <div className="destruction-detail-summary-card">
          <span>진행 상태</span>
          <strong>{getStatusLabel(tournament.status)}</strong>
        </div>

        <div className="destruction-detail-summary-card">
          <span>시작일</span>
          <strong>{formatDate(tournament.startDate)}</strong>
        </div>

        <div className="destruction-detail-summary-card">
          <span>종료일</span>
          <strong>{formatDate(tournament.endDate)}</strong>
        </div>

        <div className="destruction-detail-summary-card">
          <span>팀</span>
          <strong>{tournament.teams.length}개</strong>
        </div>

        <div className="destruction-detail-summary-card">
          <span>참가자</span>
          <strong>{tournament.participants.length}명</strong>
        </div>

        <div className="destruction-detail-summary-card">
          <span>경기</span>
          <strong>{tournament.matches.length}개</strong>
        </div>
      </section>

      {tournament.status === "COMPLETED" ? (
        <section className="content-section destruction-final-section">
          <div className="section-header">
            <h2>최종 결과</h2>
          </div>

          <div className="destruction-final-grid">
            <div className="destruction-final-card">
              <span>우승 팀</span>
              <strong>{winnerTeam?.name ?? "-"}</strong>
            </div>

            <div className="destruction-final-card">
              <span>MVP</span>
              <strong>
                {mvpParticipant
                  ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}`
                  : "-"}
              </strong>
            </div>
          </div>

          {tournament.galleryImage?.imageUrl?.length ? (
            <div className="destruction-final-gallery">
              {tournament.galleryImage.imageUrl.map((imageUrl, index) => (
                <Image
                  key={`${imageUrl}-${index}`}
                  src={imageUrl}
                  alt={`${tournament.galleryImage?.title ?? tournament.title} ${
                    index + 1
                  }`}
                  width={1200}
                  height={720}
                  className="destruction-final-gallery__image"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="content-section">
        <div className="section-header">
          <h2>예선 순위</h2>
        </div>

        {tournament.teams.length === 0 ? (
          <div className="empty-box">등록된 팀이 없습니다.</div>
        ) : (
          <div className="destruction-rank-list">
            {tournament.teams.map((team, index) => (
              <div key={team.id} className="destruction-rank-row">
                <strong>{index + 1}위</strong>
                <span>{team.name}</span>
                <em>
                  {team.points}점 · {team.wins}승 {team.losses}패
                </em>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>팀 구성</h2>
        </div>

        {tournament.teams.length === 0 ? (
          <div className="empty-box">등록된 팀이 없습니다.</div>
        ) : (
          <div className="destruction-team-grid">
            {tournament.teams.map((team) => (
              <div key={team.id} className="destruction-team-card">
                <h3>{team.name}</h3>

                <div className="destruction-team-captain">
                  팀장: {team.captain.nickname}#{team.captain.tag}
                </div>

                <div className="destruction-member-list">
                  {team.members.map((member) => (
                    <div key={member.id} className="destruction-member-row">
                      <strong>
                        {member.player.nickname}#{member.player.tag}
                      </strong>
                      <span>{member.position}</span>
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
          <h2>예선 풀리그</h2>
        </div>

        {preliminaryMatches.length === 0 ? (
          <div className="empty-box">예선 경기가 없습니다.</div>
        ) : (
          <div className="destruction-match-list">
            {preliminaryMatches.map((match) => {
              const winnerName =
                match.winnerTeamId === match.teamAId
                  ? match.teamA.name
                  : match.winnerTeamId === match.teamBId
                    ? match.teamB.name
                    : "-";

              return (
                <div key={match.id} className="destruction-match-row">
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
          <h2>4강</h2>
        </div>

        {semiFinalMatches.length === 0 ? (
          <div className="empty-box">4강 경기가 없습니다.</div>
        ) : (
          <div className="destruction-match-list">
            {semiFinalMatches.map((match) => {
              const winnerName =
                match.winnerTeamId === match.teamAId
                  ? match.teamA.name
                  : match.winnerTeamId === match.teamBId
                    ? match.teamB.name
                    : "-";

              return (
                <div key={match.id} className="destruction-match-row">
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
          <h2>결승</h2>
        </div>

        {finalMatches.length === 0 ? (
          <div className="empty-box">결승 경기가 없습니다.</div>
        ) : (
          <div className="destruction-match-list">
            {finalMatches.map((match) => {
              const winnerName =
                match.winnerTeamId === match.teamAId
                  ? match.teamA.name
                  : match.winnerTeamId === match.teamBId
                    ? match.teamB.name
                    : "-";

              return (
                <div key={match.id} className="destruction-match-row">
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
    </main>
  );
}