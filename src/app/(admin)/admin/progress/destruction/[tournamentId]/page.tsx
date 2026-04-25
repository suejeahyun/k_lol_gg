import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import DestructionTeamForm from "@/components/admin/DestructionTeamForm";
import DestructionParticipantForm from "@/components/admin/DestructionParticipantForm";
import DestructionTeamAssignmentForm from "@/components/admin/DestructionTeamAssignmentForm";

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

export default async function AdminDestructionTournamentDetailPage({
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
        orderBy: {
          id: "asc",
        },
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

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{tournament.title}</h1>
          <p className="admin-page__description">
            멸망전 팀장, 참가자, 예선 풀리그, 토너먼트 결과를 관리합니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <Link href="/admin/progress/destruction" className="chip-button">
            목록으로
          </Link>
        </div>
      </div>

      <section className="admin-event-detail-grid">
        <div className="admin-event-detail-card">
          <span>진행 상태</span>
          <strong>{getStatusLabel(tournament.status)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>시작일</span>
          <strong>{formatDate(tournament.startDate)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>종료일</span>
          <strong>{formatDate(tournament.endDate)}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>팀</span>
          <strong>{tournament.teams.length}개</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>참가자</span>
          <strong>{tournament.participants.length}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>경기</span>
          <strong>{tournament.matches.length}개</strong>
        </div>
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">기본 정보</h2>
            <p className="admin-page__description">
              {tournament.description || "등록된 설명이 없습니다."}
            </p>
          </div>
        </div>
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">최종 결과</h2>
            <p className="admin-page__description">
              우승 팀: {winnerTeam?.name ?? "-"} / MVP:{" "}
              {mvpParticipant
                ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}`
                : "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">팀장 / 팀</h2>
            <p className="admin-page__description">
              팀 수에 맞춰 팀장을 등록합니다. 팀장은 자동으로 해당 팀 참가자로
              등록됩니다.
            </p>
          </div>
        </div>

        <DestructionTeamForm
          tournamentId={tournament.id}
          hasMatches={tournament.matches.length > 0}
        />

        {tournament.teams.length === 0 ? (
          <div className="empty-box">등록된 팀이 없습니다.</div>
        ) : (
          <div className="admin-event-team-list">
            {tournament.teams.map((team) => (
              <div key={team.id} className="admin-event-team-card">
                <h3>{team.name}</h3>

                <div>
                  <span>
                    팀장: {team.captain.nickname}#{team.captain.tag}
                  </span>
                  <span>승점 {team.points}</span>
                  <span>
                    {team.wins}승 {team.losses}패
                  </span>
                </div>

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
            <h2 className="admin-event-section-title">참가자</h2>
            <p className="admin-page__description">
              팀장을 포함해 참가자와 지정 포지션을 등록합니다.
            </p>
          </div>
        </div>

        <DestructionParticipantForm
          tournamentId={tournament.id}
          hasTeams={tournament.teams.length > 0}
          hasMatches={tournament.matches.length > 0}
        />

        {tournament.participants.length === 0 ? (
          <div className="empty-box">등록된 참가자가 없습니다.</div>
        ) : (
          <div className="admin-event-participant-list">
            {tournament.participants.map((participant) => (
              <div key={participant.id} className="admin-event-participant-row">
                <span>
                  {participant.player.nickname}#{participant.player.tag}
                </span>
                <span>{participant.position}</span>
                <span>{participant.team?.name ?? "팀 미배정"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">팀 배정</h2>
            <p className="admin-page__description">
              팀장 외 참가자들을 각 팀에 배정합니다.
            </p>
          </div>
        </div>

        <DestructionTeamAssignmentForm
          tournamentId={tournament.id}
          teams={tournament.teams}
          participants={tournament.participants}
          hasMatches={tournament.matches.length > 0}
        />
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">경기</h2>
            <p className="admin-page__description">
              예선 풀리그와 상위 4팀 토너먼트 대진을 관리합니다.
            </p>
          </div>
        </div>

        {tournament.matches.length === 0 ? (
          <div className="empty-box">등록된 경기가 없습니다.</div>
        ) : (
          <div className="admin-event-bracket-list">
            {tournament.matches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <span>{match.round}경기</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}