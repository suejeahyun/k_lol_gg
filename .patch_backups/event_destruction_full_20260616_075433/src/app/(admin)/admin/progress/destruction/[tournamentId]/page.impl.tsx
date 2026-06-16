export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import DestructionTeamForm from "@/components/admin/DestructionTeamForm";
import DestructionParticipantForm from "@/components/admin/DestructionParticipantForm";
import DestructionPreliminaryGenerator from "@/components/admin/DestructionPreliminaryGenerator";
import DestructionMatchResultForm from "@/components/admin/DestructionMatchResultForm";
import DestructionTournamentGenerator from "@/components/admin/DestructionTournamentGenerator";
import DestructionFinalGenerator from "@/components/admin/DestructionFinalGenerator";
import DestructionCompleteForm from "@/components/admin/DestructionCompleteForm";
import ImportParticipantsButton from "@/components/admin/ImportParticipantsButton";
import DestructionAuctionManager from "@/components/admin/DestructionAuctionManager";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

type StepKey =
  | "TEAMS"
  | "PARTICIPANTS"
  | "AUCTION"
  | "PRELIMINARY"
  | "TOURNAMENT"
  | "FINAL"
  | "COMPLETE";

const PRELIMINARY_FORMAT_LABELS: Record<string, string> = {
  FULL_ROUND_ROBIN_BO3: "전체 풀리그 BO3",
  FULL_ROUND_ROBIN_BO1: "전체 풀리그 BO1",
  GROUP_ROUND_ROBIN_BO3: "조별 풀리그 BO3",
  GROUP_ROUND_ROBIN_BO1: "조별 풀리그 BO1",
  SWISS_ROUND_BO3: "스위스 N라운드 BO3",
  SWISS_ROUND_BO1: "스위스 N라운드 BO1",
  RANDOM_ROUNDS_BO3: "랜덤 N라운드 BO3",
  RANDOM_ROUNDS_BO1: "랜덤 N라운드 BO1",
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

function getCurrentStep({
  status,
  teamCount,
  participantCount,
  expectedParticipantCount,
  hasInvalidTeamSize,
  preliminaryMatchCount,
  unfinishedPreliminaryCount,
  semiFinalMatchCount,
  unfinishedSemiFinalCount,
  finalMatchCount,
  unfinishedFinalCount,
}: {
  status: string;
  teamCount: number;
  participantCount: number;
  expectedParticipantCount: number;
  hasInvalidTeamSize: boolean;
  preliminaryMatchCount: number;
  unfinishedPreliminaryCount: number;
  semiFinalMatchCount: number;
  unfinishedSemiFinalCount: number;
  finalMatchCount: number;
  unfinishedFinalCount: number;
}): StepKey {
  if (status === "COMPLETED") return "COMPLETE";
  if (teamCount === 0) return "TEAMS";
  if (participantCount < expectedParticipantCount) return "PARTICIPANTS";
  if (hasInvalidTeamSize) return "AUCTION";
  if (preliminaryMatchCount === 0 || unfinishedPreliminaryCount > 0) return "PRELIMINARY";
  if (semiFinalMatchCount === 0 || unfinishedSemiFinalCount > 0) return "TOURNAMENT";
  if (finalMatchCount === 0 || unfinishedFinalCount > 0) return "FINAL";
  return "COMPLETE";
}

function AdminStepSection({
  step,
  currentStep,
  title,
  description,
  children,
}: {
  step: StepKey;
  currentStep: StepKey;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const isCurrent = step === currentStep;

  return (
    <details className="admin-form" open={isCurrent}>
      <summary className="admin-page__header" style={{ cursor: "pointer" }}>
        <div>
          <h2 className="admin-event-section-title">
            {title} {isCurrent ? "· 현재 단계" : ""}
          </h2>
          <p className="admin-page__description">{description}</p>
        </div>
      </summary>

      <div>{children}</div>
    </details>
  );
}

export default async function AdminDestructionTournamentDetailPage({
  params,
}: PageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const [tournament, galleryImages] = await Promise.all([
    prisma.destructionTournament.findUnique({
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
  ]);

  if (!tournament) {
    notFound();
  }

  const winnerTeam = tournament.winnerTeamId
    ? tournament.teams.find((team) => team.id === tournament.winnerTeamId)
    : null;

  const mvpParticipant = tournament.mvpPlayerId
    ? tournament.participants.find(
        (participant) => participant.playerId === tournament.mvpPlayerId,
      )
    : null;

  const preliminaryMatches = tournament.matches.filter(
    (match) => match.stage === "PRELIMINARY",
  );

  const semiFinalMatches = tournament.matches.filter(
    (match) => match.stage === "SEMI_FINAL",
  );

  const finalMatches = tournament.matches.filter(
    (match) => match.stage === "FINAL",
  );

  const tournamentMatches = tournament.matches.filter(
    (match) => match.stage === "SEMI_FINAL" || match.stage === "FINAL",
  );

  const unfinishedPreliminaryCount = preliminaryMatches.filter(
    (match) => !match.winnerTeamId,
  ).length;

  const unfinishedSemiFinalCount = semiFinalMatches.filter(
    (match) => !match.winnerTeamId,
  ).length;

  const unfinishedFinalCount = finalMatches.filter(
    (match) => !match.winnerTeamId,
  ).length;

  const expectedParticipantCount = tournament.teams.length * 5;
  const hasInvalidTeamSize =
    tournament.teams.length > 0 &&
    tournament.teams.some((team) => team.members.length !== 5);

  const currentStep = getCurrentStep({
    status: tournament.status,
    teamCount: tournament.teams.length,
    participantCount: tournament.participants.length,
    expectedParticipantCount,
    hasInvalidTeamSize,
    preliminaryMatchCount: preliminaryMatches.length,
    unfinishedPreliminaryCount,
    semiFinalMatchCount: semiFinalMatches.length,
    unfinishedSemiFinalCount,
    finalMatchCount: finalMatches.length,
    unfinishedFinalCount,
  });

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{tournament.title}</h1>
          <p className="admin-page__description">
            현재 단계만 펼쳐서 표시합니다. 다른 단계는 제목을 눌러 확인할 수 있습니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <ImportParticipantsButton type="destruction" targetId={id} />
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
          <span>예선 방식</span>
          <strong>
            {PRELIMINARY_FORMAT_LABELS[tournament.preliminaryFormat] ?? tournament.preliminaryFormat}
          </strong>
        </div>

        <div className="admin-event-detail-card">
          <span>본선 진출</span>
          <strong>{tournament.advanceTeamCount}팀</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>팀</span>
          <strong>
            {tournament.teams.length}개
            {expectedParticipantCount > 0 ? ` · 필요 ${expectedParticipantCount}명` : ""}
          </strong>
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

      <AdminStepSection
        step="TEAMS"
        currentStep={currentStep}
        title="1. 팀장 / 팀"
        description="팀장 신청자 또는 일반 신청자 중 관리자가 팀장을 지정하고, 팀장별 보유 포인트를 입력합니다."
      >
        <DestructionTeamForm
          tournamentId={tournament.id}
          hasMatches={tournament.matches.length > 0}
        />

        {tournament.teams.length === 0 ? (
          <div className="empty-box">등록된 팀이 없습니다.</div>
        ) : (
          <div className="admin-event-team-list">
            {tournament.teams.map((team, index) => (
              <div key={team.id} className="admin-event-team-card">
                <h3>
                  {index + 1}위 · {team.name}
                </h3>

                <div>
                  <span>
                    팀장: {team.captain.nickname}#{team.captain.tag}
                  </span>
                  <span>보유 {team.initialAuctionPoints}P</span>
                  <span>잔여 {team.remainingAuctionPoints}P</span>
                  <span>승점 {team.points}</span>
                  <span>
                    {team.wins}승 {team.losses}패
                  </span>
                </div>

                <div>
                  {team.members.map((member) => (
                    <span key={member.id}>
                      {member.player.nickname}#{member.player.tag} · {member.position}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="PARTICIPANTS"
        currentStep={currentStep}
        title="2. 참가자"
        description="팀장을 제외한 일반 참가자를 등록합니다. 경매 시작 전 참가자 수는 팀 수 × 5명과 정확히 맞아야 합니다."
      >
        <DestructionParticipantForm
          tournamentId={tournament.id}
          hasTeams={tournament.teams.length > 0}
          hasMatches={tournament.matches.length > 0}
        />

        {expectedParticipantCount > 0 && tournament.participants.length !== expectedParticipantCount ? (
          <div className="empty-box">
            현재 {tournament.participants.length}명 / 필요 {expectedParticipantCount}명입니다. 참가자 수를 맞춘 뒤 경매를 진행하세요.
          </div>
        ) : null}

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
      </AdminStepSection>

      <AdminStepSection
        step="AUCTION"
        currentStep={currentStep}
        title="3. 경매 팀 구성"
        description="카드 추첨 후 디스코드 채팅 경매를 진행하고, 관리자가 최종 낙찰 팀장과 포인트를 입력합니다."
      >
        <DestructionAuctionManager
          tournamentId={tournament.id}
          teams={tournament.teams}
          participants={tournament.participants}
          hasMatches={tournament.matches.length > 0}
        />
      </AdminStepSection>

      <AdminStepSection
        step="PRELIMINARY"
        currentStep={currentStep}
        title="4. 예선"
        description="선택한 예선 방식으로 경기를 생성합니다. 승리 1점, 패배 0점 기준으로 본선 상위 4팀을 산정합니다."
      >
        <DestructionPreliminaryGenerator
          tournamentId={tournament.id}
          teamCount={tournament.teams.length}
          preliminaryMatchCount={preliminaryMatches.length}
          hasInvalidTeamSize={hasInvalidTeamSize}
        />

        {preliminaryMatches.length === 0 ? (
          <div className="empty-box">생성된 예선 경기가 없습니다.</div>
        ) : (
          <div className="admin-event-bracket-list">
            {preliminaryMatches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <span>{match.round}경기</span>
                </div>

                <DestructionMatchResultForm
                  tournamentId={tournament.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={tournament.participants}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                  initialTeamAScore={match.teamAScore}
                  initialTeamBScore={match.teamBScore}
                />
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="TOURNAMENT"
        currentStep={currentStep}
        title="5. 상위 4팀 토너먼트"
        description="예선 결과 기준 상위 4팀으로 4강 토너먼트를 생성합니다."
      >
        <DestructionTournamentGenerator
          tournamentId={tournament.id}
          teamCount={tournament.teams.length}
          preliminaryMatchCount={preliminaryMatches.length}
          unfinishedPreliminaryCount={unfinishedPreliminaryCount}
          tournamentMatchCount={tournamentMatches.length}
        />

        {semiFinalMatches.length === 0 ? (
          <div className="empty-box">생성된 4강 경기가 없습니다.</div>
        ) : (
          <div className="admin-event-bracket-list">
            {semiFinalMatches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <span>{match.round}경기</span>
                </div>

                <DestructionMatchResultForm
                  tournamentId={tournament.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={tournament.participants}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                  initialTeamAScore={match.teamAScore}
                  initialTeamBScore={match.teamBScore}
                />
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="FINAL"
        currentStep={currentStep}
        title="6. 결승"
        description="4강 승리 팀으로 결승 경기를 생성하고 최종 승리 팀과 MVP를 입력합니다."
      >
        <DestructionFinalGenerator
          tournamentId={tournament.id}
          semiFinalMatchCount={semiFinalMatches.length}
          unfinishedSemiFinalCount={unfinishedSemiFinalCount}
          finalMatchCount={finalMatches.length}
        />

        {finalMatches.length === 0 ? (
          <div className="empty-box">생성된 결승 경기가 없습니다.</div>
        ) : (
          <div className="admin-event-bracket-list">
            {finalMatches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{getStageLabel(match.stage)}</span>
                  <strong>
                    {match.teamA.name} vs {match.teamB.name}
                  </strong>
                  <span>{match.round}경기</span>
                </div>

                <DestructionMatchResultForm
                  tournamentId={tournament.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={tournament.participants}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                  initialTeamAScore={match.teamAScore}
                  initialTeamBScore={match.teamBScore}
                />
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="COMPLETE"
        currentStep={currentStep}
        title="7. 최종 처리"
        description="결승 결과가 있으면 우승팀과 MVP가 자동 반영됩니다. 확인 후 멸망전을 종료합니다."
      >
        <div className="empty-box">
          현재 최종값: 우승 팀 {winnerTeam?.name ?? "-"} / MVP {" "}
          {mvpParticipant
            ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}`
            : "-"}
        </div>

        <DestructionCompleteForm
          tournamentId={tournament.id}
          teams={tournament.teams}
          participants={tournament.participants}
          galleryImages={galleryImages}
          initialWinnerTeamId={tournament.winnerTeamId}
          initialMvpPlayerId={tournament.mvpPlayerId}
          initialGalleryImageId={tournament.galleryImageId}
        />
      </AdminStepSection>
    </main>
  );
}
