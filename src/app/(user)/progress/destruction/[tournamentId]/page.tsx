export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import SafeGalleryImage from "@/components/SafeGalleryImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { coerceGalleryImageUrls } from "@/lib/gallery/winner-image-paths";
import DestructionParticipationClient from "@/app/(user)/participation/destruction/[tournamentId]/DestructionParticipationClient";
import DestructionStandingsBoard from "@/components/destruction/DestructionStandingsBoard";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tournamentId } = await params;
  return {
    title: "멸망전 상세",
    description: "멸망전 참가자, 팀 구성, 예선과 본선 경기 결과를 확인하세요.",
    alternates: { canonical: `/progress/destruction/${tournamentId}` },
  };
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

  if (!Number.isInteger(id) || id <= 0) {
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
  const pendingMvpMatches = matchesWithResult.filter((match) => !match.mvpFinalizedAt);
  const showPreliminaryStandings =
    tournament.teams.length > 0 &&
    ["PRELIMINARY", "TOURNAMENT", "COMPLETED"].includes(tournament.status);

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

      {showPreliminaryStandings ? (
        <section className="content-section destruction-standings-section">
          <div className="section-header">
            <h2>예선 조별 순위</h2>
            <p className="page-description">
              매치 전적과 세트 득실, 최근 경기 흐름을 조별로 확인합니다.
            </p>
          </div>
          <DestructionStandingsBoard
            title={tournament.title}
            teams={tournament.teams}
            matches={tournament.matches}
          />
        </section>
      ) : null}

      {isPreliminary ? (
        <>
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
                    <i className="destruction-match-row__mvp">{match.mvpPlayer ? `MVP: ${match.mvpPlayer.name} (${match.mvpPlayer.nickname}#${match.mvpPlayer.tag})` : ""}</i>
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
                    <i className="destruction-match-row__mvp">{match.mvpPlayer ? `MVP: ${match.mvpPlayer.name} (${match.mvpPlayer.nickname}#${match.mvpPlayer.tag})` : ""}</i>
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
                    <i className="destruction-match-row__mvp">{match.mvpPlayer ? `MVP: ${match.mvpPlayer.name} (${match.mvpPlayer.nickname}#${match.mvpPlayer.tag})` : ""}</i>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {matchesWithResult.length ? (
        <section className="content-section destruction-mvp-vote-cta">
          <div>
            <span>MVP VOTE</span>
            <h2>
              {pendingMvpMatches.length
                ? `투표할 경기가 ${pendingMvpMatches.length}개 있습니다.`
                : "경기별 MVP 결과를 확인하세요."}
            </h2>
            <p className="page-description">
              예선과 본선을 오가지 않고 MVP 투표 전용 페이지에서 한 번에 참여할 수 있습니다.
            </p>
          </div>
          <Link className="btn btn-primary" href={`/progress/destruction/${id}/mvp-vote`}>
            {pendingMvpMatches.length ? "MVP 투표하러 가기" : "MVP 결과 보기"}
          </Link>
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
