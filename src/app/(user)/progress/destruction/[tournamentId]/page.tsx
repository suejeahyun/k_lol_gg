export const dynamic = "force-dynamic";

import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import DestructionParticipationClient from "@/app/(user)/participation/destruction/[tournamentId]/DestructionParticipationClient";
import DestructionMvpBallot from "@/components/destruction/DestructionMvpBallot";
import { getCurrentUser } from "@/lib/auth/session";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

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

function getStageLabel(stage: string) {
  const labels: Record<string, string> = {
    PRELIMINARY: "예선",
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

export default async function DestructionProgressDetailPage({
  params,
}: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const currentUser = await getCurrentUser();

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
      participationApplies: {
        include: {
          player: true,
        },
        orderBy: {
          id: "asc",
        },
      },
      matches: {
        include: {
          teamA: true,
          teamB: true,
          mvpPlayer: true,
          mvpVotes: { where: { voterUserAccountId: currentUser?.userAccountId ?? -1 }, select: { candidatePlayerId: true } },
        },
        orderBy: [{ stage: "asc" }, { preliminaryGroup: "asc" }, { round: "asc" }],
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

  const activeApplies = tournament.participationApplies.filter(
    (apply) => !["CANCELLED", "REJECTED"].includes(apply.status)
  );

  const unconfirmedPreliminaryCount = tournament.matches.filter(
    (match) => match.stage === "PRELIMINARY" && !match.isConfirmed,
  ).length;

  const publicMatchCount = tournament.matches.filter(
    (match) => match.stage !== "PRELIMINARY" || match.isConfirmed,
  ).length;

  const preliminaryMatches = tournament.matches
    .filter((match) => match.stage === "PRELIMINARY" && match.isConfirmed)
    .sort((a, b) => {
      const groupCompare = (a.preliminaryGroup ?? "").localeCompare(b.preliminaryGroup ?? "");
      if (groupCompare !== 0) return groupCompare;
      return a.round - b.round;
    });

  const preliminaryRankTeams = tournament.teams.slice().sort((a, b) => {
    const groupCompare = (a.preliminaryGroup ?? "").localeCompare(b.preliminaryGroup ?? "");
    if (groupCompare !== 0) return groupCompare;
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.id - b.id;
  });

  const semiFinalMatches = tournament.matches.filter(
    (match) => match.stage === "SEMI_FINAL"
  );

  const finalMatches = tournament.matches.filter(
    (match) => match.stage === "FINAL"
  );

  const galleryImageUrls = coerceGalleryImageUrls(tournament.galleryImage?.imageUrl);

  const isRecruiting = tournament.status === "RECRUITING";
  const isTeamBuilding = ["TEAM_BUILDING", "AUCTION"].includes(tournament.status);
  const isPreliminary = tournament.status === "PRELIMINARY";
  const isTournamentStage = tournament.status === "TOURNAMENT";
  const isCompleted = tournament.status === "COMPLETED";
  const isCancelled = tournament.status === "CANCELLED";
  const matchesWithResult = tournament.matches.filter((match) => match.winnerTeamId && (match.stage !== "PRELIMINARY" || match.isConfirmed));
  const renderMvpBallot = (match: (typeof tournament.matches)[number]) => {
    const matchParticipants = tournament.participants.filter(
      (participant) => participant.teamId === match.teamAId || participant.teamId === match.teamBId,
    );
    const isMatchParticipant = Boolean(currentUser?.playerId && matchParticipants.some((participant) => participant.playerId === currentUser.playerId));
    const canVote = currentUser?.status === "APPROVED" && isMatchParticipant && matchParticipants.length === 10;
    const candidates = matchParticipants.filter((participant) => participant.playerId !== currentUser?.playerId).map((participant) => ({
      id: participant.playerId, name: participant.player.name, nickname: participant.player.nickname, tag: participant.player.tag,
    }));
    return <DestructionMvpBallot matchId={match.id} candidates={candidates}
      initialVotePlayerId={match.mvpVotes[0]?.candidatePlayerId ?? null}
      finalizedMvp={match.mvpPlayer ? { id: match.mvpPlayer.id, name: match.mvpPlayer.name, nickname: match.mvpPlayer.nickname, tag: match.mvpPlayer.tag, method: match.mvpSelectionMethod } : null}
      canVote={canVote}
      unavailableMessage={!currentUser ? "로그인 후 투표할 수 있습니다." : !isMatchParticipant ? "해당 경기 참가자 10명만 투표할 수 있습니다." : matchParticipants.length !== 10 ? "경기 참가자 10명이 확정되어야 투표할 수 있습니다." : undefined} />;
  };

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
          <Link
            href={`/participation/destruction/${id}/participants`}
            className="btn btn-primary"
          >
            참가자 명단
          </Link>
          <Link href={`/participation/destruction/${id}/captain-points`} className="btn btn-ghost">
            팀장 포인트표
          </Link>
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
          <span>신청</span>
          <strong>{activeApplies.length}명</strong>
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
          <strong>{publicMatchCount}개</strong>
        </div>
      </section>

      {isRecruiting ? (
        <section className="content-section destruction-apply-merged-section">
          <div className="section-header">
            <h2>참가 신청</h2>
            <p className="page-description">모집 단계에서는 이 화면에서 바로 참가 신청과 신청자 현황을 확인합니다.</p>
          </div>
          <DestructionParticipationClient tournamentId={String(id)} embedded />
        </section>
      ) : null}

      {tournament.status === "PLANNED" ? (
        <section className="content-section">
          <div className="section-header">
            <h2>모집 예정</h2>
          </div>
          <div className="empty-box">아직 모집이 시작되지 않았습니다. 모집이 열리면 이 화면에서 참가 신청이 가능합니다.</div>
        </section>
      ) : null}

      {isTeamBuilding ? (
        <section className="content-section">
          <div className="section-header">
            <h2>{tournament.status === "AUCTION" ? "경매 / 팀 구성" : "팀 구성"}</h2>
            <p className="page-description">현재 단계에 필요한 팀 구성 정보만 표시합니다.</p>
          </div>

          {tournament.teams.length === 0 ? (
            <div className="empty-box">아직 팀이 생성되지 않았습니다.</div>
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
                      <Link
                        key={member.id}
                        href={`/participation/destruction/${id}/participants/${member.playerId}`}
                        className="destruction-member-row"
                      >
                        <strong>
                          {member.player.nickname}#{member.player.tag}
                        </strong>
                        <span>{member.position}</span>
                        <em>{member.balanceScore}</em>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isPreliminary ? (
        <>
          <section className="content-section">
            <div className="section-header">
              <h2>예선 순위</h2>
            </div>

            {tournament.teams.length === 0 ? (
              <div className="empty-box">등록된 팀이 없습니다.</div>
            ) : (
              <div className="destruction-rank-list">
                {preliminaryRankTeams.map((team, index) => (
                  <div key={team.id} className="destruction-rank-row">
                    <strong>{index + 1}위</strong>
                    <span>{team.preliminaryGroup ? `${team.preliminaryGroup}조 · ` : ""}{team.name}</span>
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
              <h2>예선 경기</h2>
            </div>

            {preliminaryMatches.length === 0 ? (
              <div className="empty-box">{unconfirmedPreliminaryCount > 0 ? "예선 편성 확인 중입니다. 확정 후 공개됩니다." : "예선 경기가 없습니다."}</div>
            ) : (
              <div className="destruction-match-list">
                {preliminaryMatches.map((match) => (
                  <div key={match.id} className="destruction-match-row">
                    <span>{match.preliminaryGroup ? `${match.preliminaryGroup}조` : getStageLabel(match.stage)}</span>
                    <strong>
                      {match.teamA.name} vs {match.teamB.name}
                    </strong>
                    <em>{match.round}경기</em>
                    <b>승리: {getWinnerName(match)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {isTournamentStage ? (
        <>
          <section className="content-section">
            <div className="section-header">
              <h2>4강</h2>
            </div>

            {semiFinalMatches.length === 0 ? (
              <div className="empty-box">4강 경기가 없습니다.</div>
            ) : (
              <div className="destruction-match-list">
                {semiFinalMatches.map((match) => (
                  <div key={match.id} className="destruction-match-row">
                    <span>{getStageLabel(match.stage)}</span>
                    <strong>
                      {match.teamA.name} vs {match.teamB.name}
                    </strong>
                    <em>{match.round}경기</em>
                    <b>승리: {getWinnerName(match)}</b>
                  </div>
                ))}
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
                {finalMatches.map((match) => (
                  <div key={match.id} className="destruction-match-row">
                    <span>{getStageLabel(match.stage)}</span>
                    <strong>
                      {match.teamA.name} vs {match.teamB.name}
                    </strong>
                    <em>{match.round}경기</em>
                    <b>승리: {getWinnerName(match)}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {matchesWithResult.length ? (
        <section className="content-section">
          <div className="section-header">
            <h2>경기별 MVP</h2>
            <p className="page-description">경기 참가자 10명만 참여하며, 본인을 제외한 9명 중 한 명에게 투표합니다.</p>
          </div>
          <div className="destruction-mvp-match-list">
            {matchesWithResult.map((match) => (
              <article key={match.id} className="destruction-mvp-match-card">
                <div className="destruction-mvp-match-card__title">
                  <span>{getStageLabel(match.stage)} · {match.round}경기</span>
                  <strong>{match.teamA.name} {match.teamAScore} : {match.teamBScore} {match.teamB.name}</strong>
                </div>
                {renderMvpBallot(match)}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isCompleted ? (
        <section className="content-section destruction-final-section">
          <div className="section-header">
            <h2>최종 요약</h2>
            <p className="page-description">종료된 멸망전은 전체 진행 과정을 길게 나열하지 않고 핵심 결과만 정리합니다.</p>
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

            <div className="destruction-final-card">
              <span>참가 / 팀 / 경기</span>
              <strong>{tournament.participants.length}명 / {tournament.teams.length}팀 / {publicMatchCount}경기</strong>
            </div>
          </div>

          {tournament.teams.length ? (
            <div className="destruction-rank-list" style={{ marginTop: 16 }}>
              {tournament.teams.slice(0, 6).map((team, index) => (
                <div key={team.id} className="destruction-rank-row">
                  <strong>{index + 1}위</strong>
                  <span>{team.name}</span>
                  <em>{team.points}점 · {team.wins}승 {team.losses}패</em>
                </div>
              ))}
            </div>
          ) : null}

          {galleryImageUrls.length ? (
            <div className="destruction-final-gallery">
              {galleryImageUrls.map((imageUrl, index) => (
                <SafeGalleryImage
                  key={`${imageUrl}-${index}`}
                  src={imageUrl}
                  alt={`${tournament.galleryImage?.title ?? tournament.title} ${index + 1}`}
                  width={1200}
                  height={720}
                  className="destruction-final-gallery__image"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {isCancelled ? (
        <section className="content-section">
          <div className="section-header">
            <h2>취소된 멸망전</h2>
          </div>
          <div className="empty-box">해당 멸망전은 취소되었습니다. 참가 신청과 진행 정보는 표시하지 않습니다.</div>
        </section>
      ) : null}
    </main>
  );
}
