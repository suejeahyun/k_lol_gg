export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

import EventTeamGenerator from "@/components/admin/EventTeamGenerator";
import EventBracketGenerator from "@/components/admin/EventBracketGenerator";
import EventMatchResultForm from "@/components/admin/EventMatchResultForm";
import EventCompleteForm from "@/components/admin/EventCompleteForm";
import ImportParticipantsButton from "@/components/admin/ImportParticipantsButton";
import EventParticipantManualAddForm from "@/components/admin/EventParticipantManualAddForm";
import AdminTeamDragManager from "@/components/admin/AdminTeamDragManager";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

type StepKey = "PARTICIPANTS" | "TEAMS" | "BRACKET" | "COMPLETE";

const STAGE_LABELS: Record<string, string> = {
  ROUND_OF_32: "32강",
  ROUND_OF_16: "16강",
  QUARTER_FINAL: "8강",
  SEMI_FINAL: "4강",
  FINAL: "결승",
};

const STAGE_ORDER: Record<string, number> = {
  ROUND_OF_32: 1,
  ROUND_OF_16: 2,
  QUARTER_FINAL: 3,
  SEMI_FINAL: 4,
  FINAL: 5,
};

function getCurrentStep({
  status,
  participantCount,
  teamCount,
  matchCount,
  unfinishedMatchCount,
}: {
  status: string;
  participantCount: number;
  teamCount: number;
  matchCount: number;
  unfinishedMatchCount: number;
}): StepKey {
  if (status === "COMPLETED") return "COMPLETE";
  if (participantCount === 0) return "PARTICIPANTS";
  if (teamCount === 0) return "TEAMS";
  if (matchCount === 0 || unfinishedMatchCount > 0) return "BRACKET";
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

export default async function AdminEventMatchDetailPage({ params }: PageProps) {
  const { eventId } = await params;
  const id = Number(eventId);

  if (Number.isNaN(id)) {
    notFound();
  }

  const [event, galleryImages] = await Promise.all([
    prisma.eventMatch.findUnique({
      where: { id },
      include: {
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
    }),

    prisma.galleryImage.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
  ]);

  if (!event) {
    notFound();
  }

  const hasGeneratedBracket = event.matches.length > 0;
  const hasSubmittedMatchResult = event.matches.some(
    (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
  );
  const unfinishedMatchCount = event.matches.filter((match) => !match.winnerTeamId)
    .length;
  const isParticipantEditLocked = hasGeneratedBracket || hasSubmittedMatchResult;
  const currentStep = getCurrentStep({
    status: event.status,
    participantCount: event.participants.length,
    teamCount: event.teams.length,
    matchCount: event.matches.length,
    unfinishedMatchCount,
  });
  const sortedMatches = [...event.matches].sort(
    (a, b) => (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99) || a.round - b.round,
  );

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{event.title}</h1>
          <p className="admin-page__description">
            현재 단계만 펼쳐서 표시합니다. 다른 단계는 제목을 눌러 확인할 수 있습니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <ImportParticipantsButton type="event" targetId={event.id} />

          <Link href="/admin/progress/event" className="chip-button">
            목록
          </Link>
        </div>
      </div>

      <section className="admin-event-detail-grid">
        <div className="admin-event-detail-card">
          <span>상태</span>
          <strong>{event.status}</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>진행 방식</span>
          <strong>{event.mode === "POSITION" ? "포지션 · 점수 시드" : "포지션 없음 · 랜덤 시드"}</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>참가자</span>
          <strong>{event.participants.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>팀 / 경기</span>
          <strong>{event.teams.length}팀 / {event.matches.length}경기</strong>
        </div>
      </section>

      <AdminStepSection
        step="PARTICIPANTS"
        currentStep={currentStep}
        title="1. 참가자 등록"
        description="참가자 가져오기 또는 관리자 직접 추가로 확정 참가자를 관리합니다."
      >
        <EventParticipantManualAddForm
          eventId={event.id}
          mode={event.mode}
          teams={event.teams.map((team) => ({
            id: team.id,
            name: team.name,
            seed: team.seed,
            score: team.score,
          }))}
          existingPlayerIds={event.participants.map((participant) => participant.playerId)}
          disabled={isParticipantEditLocked}
          disabledReason={
            isParticipantEditLocked
              ? "대진표 또는 결과가 생성된 이벤트는 참가자를 추가할 수 없습니다."
              : undefined
          }
        />

        {event.participants.length === 0 ? (
          <div className="empty-box">등록된 참가자가 없습니다.</div>
        ) : (
          <div className="admin-event-participant-list">
            {event.participants.map((participant, index) => (
              <div
                key={participant.id}
                className="admin-event-participant-row admin-event-participant-row--with-actions"
              >
                <div className="admin-event-participant-count">{index + 1}</div>
                <span>{participant.player.nickname}#{participant.player.tag}</span>
                <span>{participant.position ?? "-"}</span>
                <span>{participant.team?.name ?? "팀 미배정"}</span>

                {isParticipantEditLocked ? (
                  <button type="button" className="admin-event-participant-delete-button" disabled>
                    삭제 잠김
                  </button>
                ) : (
                  <form
                    action={`/api/admin/event-matches/${event.id}/participants/${participant.id}/delete`}
                    method="POST"
                  >
                    <button type="submit" className="admin-event-participant-delete-button">
                      삭제
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="TEAMS"
        currentStep={currentStep}
        title="2. 팀 구성"
        description="자동 생성 또는 직접 배정 후 대진 생성 전까지 드래그로 조정할 수 있습니다."
      >
        <EventTeamGenerator
          eventId={event.id}
          mode={event.mode}
          participants={event.participants}
          hasTeams={event.teams.length > 0}
        />

        {event.teams.length === 0 ? (
          <div className="empty-box">생성된 팀이 없습니다.</div>
        ) : (
          <AdminTeamDragManager
            mode="event"
            targetId={event.id}
            teams={event.teams}
            participants={event.participants}
            disabled={hasSubmittedMatchResult}
            lockReason={
              hasSubmittedMatchResult
                ? "이미 결과가 저장된 경기가 있어 팀 구성을 수정할 수 없습니다."
                : undefined
            }
          />
        )}
      </AdminStepSection>

      <AdminStepSection
        step="BRACKET"
        currentStep={currentStep}
        title="3. 대진표 / 결과 입력"
        description="다팀 토너먼트를 생성하고, 각 경기 결과 입력 시 다음 라운드가 자동 생성됩니다."
      >
        <EventBracketGenerator
          eventId={event.id}
          teamCount={event.teams.length}
          matchCount={event.matches.length}
          defaultSeedMode={event.mode === "POSITION" ? "SCORE" : "RANDOM"}
        />

        {sortedMatches.length > 0 ? (
          <div className="admin-event-bracket-list">
            {sortedMatches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <span>{STAGE_LABELS[match.stage] ?? match.stage} · {match.round}경기</span>
                  <strong>
                    {match.teamA?.name ?? "미정"} vs {match.teamB?.name ?? "미정"}
                  </strong>
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
        ) : (
          <div className="empty-box">생성된 대진표가 없습니다.</div>
        )}
      </AdminStepSection>

      <AdminStepSection
        step="COMPLETE"
        currentStep={currentStep}
        title="4. 최종 처리"
        description="결승 결과가 있으면 우승팀과 MVP가 자동 반영됩니다. 확인 후 이벤트를 종료합니다."
      >
        <EventCompleteForm
          eventId={event.id}
          teams={event.teams}
          participants={event.participants}
          galleryImages={galleryImages}
          initialWinnerTeamId={event.winnerTeamId}
          initialMvpPlayerId={event.mvpPlayerId}
          initialGalleryImageId={event.galleryImageId}
        />
      </AdminStepSection>
    </main>
  );
}
