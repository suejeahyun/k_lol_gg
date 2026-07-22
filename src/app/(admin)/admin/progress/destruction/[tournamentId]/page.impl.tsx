
export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { applyDestructionRecruitmentAutoReserve, getDestructionLaneLimits } from "@/lib/destruction/recruitment-auto-reserve";
import DestructionTeamForm from "@/components/admin/DestructionTeamForm";
import DestructionPreliminaryGenerator from "@/components/admin/DestructionPreliminaryGenerator";
import DestructionPreliminaryManualManager from "@/components/admin/DestructionPreliminaryManualManager";
import DestructionMatchResultForm from "@/components/admin/DestructionMatchResultForm";
import DestructionTournamentGenerator from "@/components/admin/DestructionTournamentGenerator";
import DestructionFinalGenerator from "@/components/admin/DestructionFinalGenerator";
import DestructionCompleteForm from "@/components/admin/DestructionCompleteForm";
import DestructionAuctionManager from "@/components/admin/DestructionAuctionManager";
import DestructionRecruitmentManager from "@/components/admin/DestructionRecruitmentManager";
import DestructionParticipantReplacementManager from "@/components/admin/DestructionParticipantReplacementManager";
import {
  getRiotDestructionVerification,
  summarizeRiotDestructionVerifications,
} from "@/lib/riot/destruction-verification";

type PageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
  searchParams?: Promise<{
    step?: string;
  }>;
};

type StepKey =
  | "RECRUITING"
  | "CAPTAINS"
  | "AUCTION"
  | "PRELIMINARY"
  | "TOURNAMENT"
  | "FINAL"
  | "COMPLETE";

const STEP_LABELS: Record<StepKey, string> = {
  RECRUITING: "모집 현황",
  CAPTAINS: "팀장 지정",
  AUCTION: "경매 진행",
  PRELIMINARY: "예선 진행",
  TOURNAMENT: "본선 4강",
  FINAL: "결승",
  COMPLETE: "최종 완료",
};

const STEP_ORDER: StepKey[] = ["RECRUITING", "CAPTAINS", "AUCTION", "PRELIMINARY", "TOURNAMENT", "FINAL", "COMPLETE"];

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

async function getParticipantReplacements(tournamentId: number) {
  try {
    const items = await prisma.destructionParticipantReplacement.findMany({
      where: { tournamentId },
      include: {
        team: true,
        outgoingPlayer: true,
        incomingPlayer: true,
      },
      orderBy: {
        effectiveAt: "desc",
      },
    });

    return { ready: true, items };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return { ready: false, items: [] };
    }

    throw error;
  }
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

function getCurrentStep({
  status,
  applyCount,
  teamCount,
  hasInvalidTeamSize,
  unresolvedAuctionCount,
  preliminaryMatchCount,
  unfinishedPreliminaryCount,
  semiFinalMatchCount,
  unfinishedSemiFinalCount,
  finalMatchCount,
  unfinishedFinalCount,
}: {
  status: string;
  applyCount: number;
  teamCount: number;
  hasInvalidTeamSize: boolean;
  unresolvedAuctionCount: number;
  preliminaryMatchCount: number;
  unfinishedPreliminaryCount: number;
  semiFinalMatchCount: number;
  unfinishedSemiFinalCount: number;
  finalMatchCount: number;
  unfinishedFinalCount: number;
}): StepKey {
  if (status === "COMPLETED") return "COMPLETE";
  if (teamCount === 0 && applyCount === 0) return "RECRUITING";
  if (teamCount === 0) return "CAPTAINS";
  if (hasInvalidTeamSize || unresolvedAuctionCount > 0) return "AUCTION";
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
    <details id={`destruction-step-${step}`} className={isCurrent ? "admin-form destruction-step-section is-current" : "admin-form destruction-step-section"} open={isCurrent}>
      <summary className="admin-page__header destruction-step-summary" style={{ cursor: "pointer" }}>
        <div>
          <h2 className="admin-event-section-title">
            {title} {isCurrent ? "· 선택됨" : ""}
          </h2>
          <p className="admin-page__description">{description}</p>
        </div>
      </summary>

      <div className="destruction-step-body">{children}</div>
    </details>
  );
}

export default async function AdminDestructionTournamentDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { tournamentId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const id = Number(tournamentId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  await applyDestructionRecruitmentAutoReserve(id);

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
        participationApplies: {
          where: {
            status: {
              in: ["APPLIED", "CONFIRMED", "RESERVE", "CANCELLED", "REJECTED"],
            },
          },
          include: {
            player: {
              include: {
                riotAccount: true,
                soloRankSnapshot: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
            mvpPlayer: true,
            mvpVotes: true,
          },
          orderBy: [{ stage: "asc" }, { preliminaryGroup: "asc" }, { round: "asc" }],
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

  const participantReplacementState = await getParticipantReplacements(tournament.id);

  const winnerTeam = tournament.winnerTeamId
    ? tournament.teams.find((team) => team.id === tournament.winnerTeamId)
    : null;

  const mvpParticipant = tournament.mvpPlayerId
    ? tournament.participants.find(
        (participant) => participant.playerId === tournament.mvpPlayerId,
      )
    : null;

  const preliminaryMatches = tournament.matches
    .filter((match) => match.stage === "PRELIMINARY")
    .sort((a, b) => {
      const groupCompare = (a.preliminaryGroup ?? "").localeCompare(b.preliminaryGroup ?? "");
      if (groupCompare !== 0) return groupCompare;
      return a.round - b.round;
    });

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
    (match) => !match.isConfirmed || !match.winnerTeamId,
  ).length;

  const unconfirmedPreliminaryCount = preliminaryMatches.filter(
    (match) => !match.isConfirmed,
  ).length;

  const unfinishedSemiFinalCount = semiFinalMatches.filter(
    (match) => !match.winnerTeamId,
  ).length;

  const unfinishedFinalCount = finalMatches.filter(
    (match) => !match.winnerTeamId,
  ).length;

  const applicationViewModels = tournament.participationApplies.map((apply) => ({
    id: apply.id,
    playerId: apply.playerId,
    mainPosition: apply.mainPosition,
    subPositions: apply.subPositions,
    isCaptain: apply.isCaptain,
    status: apply.status,
    message: apply.message,
    createdAt: apply.createdAt.toISOString(),
    player: {
      id: apply.player.id,
      name: apply.player.name,
      nickname: apply.player.nickname,
      tag: apply.player.tag,
      currentTier: apply.player.currentTier,
      peakTier: apply.player.peakTier,
    },
    riotVerification: getRiotDestructionVerification({
      currentTier: apply.player.currentTier,
      riotAccount: apply.player.riotAccount,
      soloRankSnapshot: apply.player.soloRankSnapshot,
    }),
  }));

  const riotVerificationSummary = summarizeRiotDestructionVerifications(
    applicationViewModels
      .filter((apply) => apply.status === "APPLIED" || apply.status === "CONFIRMED" || apply.status === "RESERVE")
      .map((apply) => apply.riotVerification),
  );


  const applicationMetaByPlayerId = new Map(
    tournament.participationApplies.map((apply) => [
      apply.playerId,
      {
        subPositions: apply.subPositions,
        message: apply.message,
      },
    ]),
  );

  const participantViewModels = tournament.participants.map((participant) => {
    const meta = applicationMetaByPlayerId.get(participant.playerId);
    return {
      ...participant,
      subPositions: meta?.subPositions ?? [],
      message: meta?.message ?? null,
    };
  });

  const getMvpManager = (match: (typeof tournament.matches)[number]) => match.winnerTeamId ? ({
    mvpPlayerId: match.mvpPlayerId,
    mvpSelectionMethod: match.mvpSelectionMethod,
    candidates: tournament.participants
      .filter((participant) => participant.teamId === match.teamAId || participant.teamId === match.teamBId)
      .map((participant) => ({
        id: participant.playerId,
        name: participant.player.name,
        nickname: participant.player.nickname,
        tag: participant.player.tag,
        voteCount: match.mvpVotes.filter((vote) => vote.candidatePlayerId === participant.playerId).length,
      })),
  }) : undefined;

  const laneLimits = getDestructionLaneLimits(tournament);

  const activeApplications = applicationViewModels.filter(
    (apply) => apply.status === "APPLIED" || apply.status === "CONFIRMED",
  );
  const reserveApplicationCount = applicationViewModels.filter((apply) => apply.status === "RESERVE").length;
  const applyCount = activeApplications.length;
  const expectedCaptainCount = applyCount > 0 && applyCount % 5 === 0 ? applyCount / 5 : 0;
  const hasInvalidTeamSize =
    tournament.teams.length > 0 &&
    tournament.teams.some((team) => team.members.length !== 5);
  const unresolvedAuctionCount = tournament.participants.filter(
    (participant) =>
      !participant.isCaptain &&
      participant.auctionStatus !== "SOLD" &&
      participant.auctionStatus !== "ASSIGNED",
  ).length;
  const soldAuctionCount = tournament.participants.filter(
    (participant) => !participant.isCaptain && participant.auctionStatus === "SOLD",
  ).length;

  const currentStep = getCurrentStep({
    status: tournament.status,
    applyCount,
    teamCount: tournament.teams.length,
    hasInvalidTeamSize,
    unresolvedAuctionCount,
    preliminaryMatchCount: preliminaryMatches.length,
    unfinishedPreliminaryCount,
    semiFinalMatchCount: semiFinalMatches.length,
    unfinishedSemiFinalCount,
    finalMatchCount: finalMatches.length,
    unfinishedFinalCount,
  });

  const requestedStep = resolvedSearchParams.step;
  const selectedStep = STEP_ORDER.includes(requestedStep as StepKey)
    ? (requestedStep as StepKey)
    : currentStep;

  const preliminaryGroupCount = new Set(
    tournament.teams
      .map((team) => team.preliminaryGroup)
      .filter((group): group is string => Boolean(group)),
  ).size;


  return (
    <main className="admin-page destruction-admin-detail-page">
      <style>{`
        .destruction-admin-detail-page { width: min(1500px, calc(100vw - 300px)); max-width: none; }
        .destruction-admin-hero { border: 1px solid rgba(59,130,246,0.28); border-radius: 22px; padding: 18px; background: linear-gradient(135deg, rgba(15,23,42,0.82), rgba(12,33,65,0.72)); margin-bottom: 16px; }
        .destruction-step-nav { display: grid; grid-template-columns: repeat(7, minmax(100px, 1fr)); gap: 8px; margin: 16px 0; }
        .destruction-step-nav a { text-decoration: none; border: 1px solid rgba(59,130,246,0.28); border-radius: 12px; padding: 10px 8px; background: rgba(15,23,42,0.62); color: #bcd2ee; text-align: center; font-size: 12px; font-weight: 700; }
        .destruction-step-nav a.is-current { border-color: rgba(56,189,248,0.82); background: rgba(14,165,233,0.20); color: #f8fbff; box-shadow: 0 0 18px rgba(56,189,248,0.16); }
        .destruction-step-nav a.is-actual { border-color: rgba(34,197,94,0.55); }
        .destruction-step-nav__badge { display: block; margin-top: 4px; font-size: 10px; color: #67e8f9; }
        .destruction-step-section { border-radius: 20px; overflow: hidden; }
        .destruction-step-section.is-current { border-color: rgba(56,189,248,0.55); box-shadow: 0 0 24px rgba(56,189,248,0.10); }
        .destruction-step-summary { padding-bottom: 10px; }
        .destruction-step-body { padding-top: 8px; }
        .destruction-admin-detail-page .admin-event-detail-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        @media (max-width: 1180px) { .destruction-admin-detail-page { width: 100%; } .destruction-step-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
      <div className="admin-page__header destruction-admin-hero">
        <div>
          <h1 className="admin-page__title">{tournament.title}</h1>
          <p className="admin-page__description">
            모집 → 팀장 지정 → 카드 경매 → 예선 → 본선/결승 순서로 운영합니다. 상단 단계 탭에서 선택한 단계만 표시됩니다. 기본값은 현재 진행 단계입니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <Link href={`/participation/destruction/${tournament.id}`} className="chip-button">
            유저 참가 페이지
          </Link>
          <Link href={`/participation/destruction/${tournament.id}/participants`} className="chip-button">
            참가자 공개 명단
          </Link>
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
          <span>현재 단계</span>
          <strong>{STEP_LABELS[currentStep]}</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>예선 방식</span>
          <strong>
            {PRELIMINARY_FORMAT_LABELS[tournament.preliminaryFormat] ?? tournament.preliminaryFormat}
          </strong>
        </div>

        <div className="admin-event-detail-card">
          <span>확정 후보</span>
          <strong>{applyCount}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>보류</span>
          <strong>{reserveApplicationCount}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>Riot 정상</span>
          <strong>{riotVerificationSummary.verified}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>Riot 확인</span>
          <strong>{riotVerificationSummary.needsAdminReview}명</strong>
        </div>

        <div className="admin-event-detail-card">
          <span>팀장</span>
          <strong>
            {tournament.teams.length}명
            {expectedCaptainCount > 0 ? ` / 필요 ${expectedCaptainCount}명` : ""}
          </strong>
        </div>

        <div className="admin-event-detail-card">
          <span>경매</span>
          <strong>
            낙찰 {soldAuctionCount}명 · 미완료 {unresolvedAuctionCount}명
          </strong>
        </div>

        <div className="admin-event-detail-card">
          <span>예선 조</span>
          <strong>{preliminaryGroupCount > 0 ? `${preliminaryGroupCount}개 조` : "미지정"}</strong>
        </div>
      </section>

      <nav className="destruction-step-nav" aria-label="멸망전 진행 단계">
        {STEP_ORDER.map((step) => {
          const className = [
            step === selectedStep ? "is-current" : "",
            step === currentStep ? "is-actual" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Link
              key={step}
              href={`/admin/progress/destruction/${tournament.id}?step=${step}`}
              className={className}
            >
              {STEP_LABELS[step]}
              {step === currentStep ? <span className="destruction-step-nav__badge">진행중</span> : null}
            </Link>
          );
        })}
      </nav>

      {selectedStep === "PRELIMINARY" || selectedStep === "TOURNAMENT" || selectedStep === "FINAL" ? (
        <DestructionParticipantReplacementManager
          tournamentId={tournament.id}
          participants={participantViewModels}
          replacements={participantReplacementState.items.map((replacement) => ({
            id: replacement.id,
            teamName: replacement.team.name,
            outgoingPlayerName: `${replacement.outgoingPlayer.nickname}#${replacement.outgoingPlayer.tag}`,
            incomingPlayerName: `${replacement.incomingPlayer.nickname}#${replacement.incomingPlayer.tag}`,
            outgoingPosition: replacement.outgoingPosition,
            incomingPosition: replacement.incomingPosition,
            reason: replacement.reason,
            effectiveAt: replacement.effectiveAt.toISOString(),
          }))}
          disabled={
            !participantReplacementState.ready ||
            tournament.status === "COMPLETED" ||
            tournament.status === "CANCELLED"
          }
          unavailableReason={
            !participantReplacementState.ready
              ? "DB 마이그레이션 적용 전입니다. 기존 멸망전 관리는 정상 이용할 수 있으며 참가자 교체만 일시적으로 사용할 수 없습니다."
              : undefined
          }
        />
      ) : null}

      {selectedStep === "RECRUITING" ? (
      <AdminStepSection
        step="RECRUITING"
        currentStep={selectedStep}
        title="1. 모집 현황"
        description="유저 페이지에서 주 포지션과 팀장 선호/비선호로 참가 신청을 받습니다. 5의 배수 또는 포지션 초과 인원은 보류로 정리할 수 있습니다."
      >
        <DestructionRecruitmentManager
          tournamentId={tournament.id}
          applications={applicationViewModels}
          hasTeams={tournament.teams.length > 0}
          hasMatches={tournament.matches.length > 0}
          laneLimits={laneLimits}
          riotVerificationSummary={riotVerificationSummary}
        />
      </AdminStepSection>
      ) : null}

      {selectedStep === "CAPTAINS" ? (
      <AdminStepSection
        step="CAPTAINS"
        currentStep={selectedStep}
        title="2. 팀장 지정"
        description="참가자 중 팀장을 ON/OFF로 지정합니다. 팀장 선호자는 참고값이며, 최종 팀장은 관리자 지정 기준입니다."
      >
        <DestructionTeamForm
          tournamentId={tournament.id}
          applications={applicationViewModels}
          existingTeams={tournament.teams}
          hasMatches={tournament.matches.length > 0}
        />

        {tournament.teams.length === 0 ? (
          <div className="empty-box" style={{ marginTop: 16 }}>
            팀장 지정 후 저장하면 자동으로 팀이 생성되고, 모든 참가 신청자는 경매용 참가자로 확정됩니다.
          </div>
        ) : (
          <div className="admin-event-team-list" style={{ marginTop: 16 }}>
            {tournament.teams.map((team, index) => (
              <div key={team.id} className="admin-event-team-card">
                <h3>
                  {index + 1}. {team.name}
                </h3>

                <div>
                  <span>
                    팀장: {team.captain.nickname}#{team.captain.tag}
                  </span>
                  <span>시작 {team.initialAuctionPoints}P</span>
                  <span>잔여 {team.remainingAuctionPoints}P</span>
                  <span>{team.members.length}/5명</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>
      ) : null}

      {selectedStep === "AUCTION" ? (
      <AdminStepSection
        step="AUCTION"
        currentStep={selectedStep}
        title="3. 경매 진행"
        description="사이트에서 카드를 섞고 참가자를 추첨한 뒤, 채팅 경매 결과를 관리자가 입력합니다."
      >
        <DestructionAuctionManager
          tournamentId={tournament.id}
          teams={tournament.teams}
          participants={participantViewModels}
          hasMatches={tournament.matches.length > 0}
        />
      </AdminStepSection>
      ) : null}

      {selectedStep === "PRELIMINARY" ? (
      <AdminStepSection
        step="PRELIMINARY"
        currentStep={selectedStep}
        title="4. 예선"
        description="조 편성과 예선 경기 순서를 수동 저장하고, 확정 전 상태에서 최종 확인 후 결과 입력을 시작합니다. 승리 1점/패배 0점입니다."
      >
        <DestructionPreliminaryManualManager
          tournamentId={tournament.id}
          teams={tournament.teams}
          matches={preliminaryMatches}
          preliminaryBestOf={tournament.preliminaryBestOf}
          hasInvalidTeamSize={hasInvalidTeamSize || unresolvedAuctionCount > 0}
        />

        <DestructionPreliminaryGenerator
          tournamentId={tournament.id}
          teamCount={tournament.teams.length}
          preliminaryMatchCount={preliminaryMatches.length}
          hasInvalidTeamSize={hasInvalidTeamSize || unresolvedAuctionCount > 0}
        />

        {unconfirmedPreliminaryCount > 0 ? (
          <div className="empty-box">확정 전 예선 경기가 {unconfirmedPreliminaryCount}개 있습니다. 편성 확정 전에는 결과 입력이 잠겨 있습니다.</div>
        ) : null}

        {preliminaryMatches.length === 0 ? (
          <div className="empty-box">생성된 예선 경기가 없습니다.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {preliminaryMatches.map((match) => (
              <article
                key={match.id}
                style={{
                  display: "grid",
                  gap: 16,
                  padding: 18,
                  border: "1px solid rgba(56, 189, 248, 0.22)",
                  borderRadius: 18,
                  background: "rgba(8, 18, 34, 0.82)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        marginBottom: 8,
                        padding: "5px 9px",
                        borderRadius: 999,
                        background: "rgba(14, 165, 233, 0.16)",
                        color: "#7dd3fc",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {match.preliminaryGroup ? `${match.preliminaryGroup}조 · ` : ""}{getStageLabel(match.stage)} · {match.round}경기
                    </span>
                    <h3 style={{ margin: 0, color: "#e5f3ff", fontSize: 18 }}>
                      {match.teamA.name} vs {match.teamB.name}
                    </h3>
                  </div>

                  <span
                    style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: match.winnerTeamId
                        ? "1px solid rgba(34, 211, 238, 0.55)"
                        : match.isConfirmed
                          ? "1px solid rgba(148, 163, 184, 0.28)"
                          : "1px solid rgba(250, 204, 21, 0.45)",
                      background: match.winnerTeamId
                        ? "rgba(14, 165, 233, 0.16)"
                        : match.isConfirmed
                          ? "rgba(15, 23, 42, 0.5)"
                          : "rgba(250, 204, 21, 0.08)",
                      color: match.winnerTeamId ? "#7dd3fc" : match.isConfirmed ? "#cbd5e1" : "#fde68a",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {match.winnerTeamId ? "결과 입력 완료" : match.isConfirmed ? "결과 대기" : "확정 전"}
                  </span>
                </div>

                {match.isConfirmed ? (
                  <DestructionMatchResultForm
                    tournamentId={tournament.id}
                    matchId={match.id}
                    teamA={match.teamA}
                    teamB={match.teamB}
                    participants={participantViewModels}
                    initialWinnerTeamId={match.winnerTeamId}
                    initialMvpPlayerId={match.mvpPlayerId}
                    initialTeamAScore={match.teamAScore}
                    initialTeamBScore={match.teamBScore}
                    bestOf={match.bestOf}
                    mvpManager={getMvpManager(match)}
                  />
                ) : (
                  <div className="empty-box">확정 전 경기입니다. 상단의 예선 편성 확정 후 결과 입력이 가능합니다.</div>
                )}
              </article>
            ))}
          </div>
        )}
      </AdminStepSection>
      ) : null}

      {selectedStep === "TOURNAMENT" ? (
      <AdminStepSection
        step="TOURNAMENT"
        currentStep={selectedStep}
        title="5. 본선 4강"
        description="예선 결과 기준으로 4강 토너먼트를 생성합니다. A/B 조가 있으면 각 조 1·2위 교차 대진, 조가 없으면 전체 상위 4팀 기준입니다."
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
          <div style={{ display: "grid", gap: 14 }}>
            {semiFinalMatches.map((match) => (
              <article
                key={match.id}
                style={{
                  display: "grid",
                  gap: 16,
                  padding: 18,
                  border: "1px solid rgba(56, 189, 248, 0.22)",
                  borderRadius: 18,
                  background: "rgba(8, 18, 34, 0.82)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        marginBottom: 8,
                        padding: "5px 9px",
                        borderRadius: 999,
                        background: "rgba(14, 165, 233, 0.16)",
                        color: "#7dd3fc",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {match.preliminaryGroup ? `${match.preliminaryGroup}조 · ` : ""}{getStageLabel(match.stage)} · {match.round}경기
                    </span>
                    <h3 style={{ margin: 0, color: "#e5f3ff", fontSize: 18 }}>
                      {match.teamA.name} vs {match.teamB.name}
                    </h3>
                  </div>

                  <span
                    style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: match.winnerTeamId ? "1px solid rgba(34, 211, 238, 0.55)" : "1px solid rgba(148, 163, 184, 0.28)",
                      background: match.winnerTeamId ? "rgba(14, 165, 233, 0.16)" : "rgba(15, 23, 42, 0.5)",
                      color: match.winnerTeamId ? "#7dd3fc" : "#cbd5e1",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {match.winnerTeamId ? "결과 입력 완료" : "결과 대기"}
                  </span>
                </div>

                <DestructionMatchResultForm
                  tournamentId={tournament.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={participantViewModels}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                  initialTeamAScore={match.teamAScore}
                  initialTeamBScore={match.teamBScore}
                  bestOf={match.bestOf}
                  mvpManager={getMvpManager(match)}
                />
              </article>
            ))}
          </div>
        )}
      </AdminStepSection>
      ) : null}

      {selectedStep === "FINAL" ? (
      <AdminStepSection
        step="FINAL"
        currentStep={selectedStep}
        title="6. 결승"
        description="4강 승리 팀으로 결승 경기를 생성하고 최종 승리 팀을 입력합니다."
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
          <div style={{ display: "grid", gap: 14 }}>
            {finalMatches.map((match) => (
              <article
                key={match.id}
                style={{
                  display: "grid",
                  gap: 16,
                  padding: 18,
                  border: "1px solid rgba(56, 189, 248, 0.22)",
                  borderRadius: 18,
                  background: "rgba(8, 18, 34, 0.82)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        marginBottom: 8,
                        padding: "5px 9px",
                        borderRadius: 999,
                        background: "rgba(14, 165, 233, 0.16)",
                        color: "#7dd3fc",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {match.preliminaryGroup ? `${match.preliminaryGroup}조 · ` : ""}{getStageLabel(match.stage)} · {match.round}경기
                    </span>
                    <h3 style={{ margin: 0, color: "#e5f3ff", fontSize: 18 }}>
                      {match.teamA.name} vs {match.teamB.name}
                    </h3>
                  </div>

                  <span
                    style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: match.winnerTeamId ? "1px solid rgba(34, 211, 238, 0.55)" : "1px solid rgba(148, 163, 184, 0.28)",
                      background: match.winnerTeamId ? "rgba(14, 165, 233, 0.16)" : "rgba(15, 23, 42, 0.5)",
                      color: match.winnerTeamId ? "#7dd3fc" : "#cbd5e1",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {match.winnerTeamId ? "결과 입력 완료" : "결과 대기"}
                  </span>
                </div>

                <DestructionMatchResultForm
                  tournamentId={tournament.id}
                  matchId={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  participants={participantViewModels}
                  initialWinnerTeamId={match.winnerTeamId}
                  initialMvpPlayerId={match.mvpPlayerId}
                  initialTeamAScore={match.teamAScore}
                  initialTeamBScore={match.teamBScore}
                  bestOf={match.bestOf}
                  mvpManager={getMvpManager(match)}
                />
              </article>
            ))}
          </div>
        )}
      </AdminStepSection>
      ) : null}

      {selectedStep === "COMPLETE" ? (
      <AdminStepSection
        step="COMPLETE"
        currentStep={selectedStep}
        title="7. 최종 완료"
        description="결승 결과가 있으면 우승팀과 MVP가 자동 반영됩니다. 확인 후 멸망전을 종료합니다."
      >
        <div className="empty-box">
          현재 최종값: 우승 팀 {winnerTeam?.name ?? "-"} / MVP{" "}
          {mvpParticipant
            ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}`
            : "-"}
        </div>

        <DestructionCompleteForm
          tournamentId={tournament.id}
          teams={tournament.teams}
          participants={participantViewModels}
          galleryImages={galleryImages}
          initialWinnerTeamId={tournament.winnerTeamId}
          initialMvpPlayerId={tournament.mvpPlayerId}
          initialGalleryImageId={tournament.galleryImageId}
        />
      </AdminStepSection>
      ) : null}
    </main>
  );
}
