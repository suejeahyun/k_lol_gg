export const dynamic = "force-dynamic";

import type { CSSProperties, ReactNode } from "react";
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
  searchParams?: Promise<{
    step?: string;
  }>;
};

type StepKey = "RECRUITING" | "TEAMS" | "BRACKET" | "COMPLETE";

const STEP_LABELS: Record<StepKey, string> = {
  RECRUITING: "모집 현황",
  TEAMS: "팀 구성",
  BRACKET: "대진/결과",
  COMPLETE: "최종 처리",
};

const STEP_ORDER: StepKey[] = ["RECRUITING", "TEAMS", "BRACKET", "COMPLETE"];

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

function getApplyStatusLabel(status: string) {
  const labels: Record<string, string> = {
    APPLIED: "신청",
    CONFIRMED: "확정",
    RESERVE: "보류",
    REJECTED: "제외",
    CANCELLED: "취소",
  };

  return labels[status] ?? status;
}

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
  if (participantCount === 0) return "RECRUITING";
  if (teamCount === 0) return "TEAMS";
  if (matchCount === 0 || unfinishedMatchCount > 0) return "BRACKET";
  return "COMPLETE";
}

function AdminStepPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-form event-operation-panel">
      <div className="admin-page__header event-operation-panel__header">
        <div>
          <h2 className="admin-event-section-title">{title}</h2>
          <p className="admin-page__description">{description}</p>
        </div>
      </div>
      <div className="event-operation-panel__body">{children}</div>
    </section>
  );
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminEventMatchDetailPage({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const id = Number(eventId);

  if (!Number.isInteger(id) || id <= 0) {
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
        participationApplies: {
          include: {
            player: true,
          },
          orderBy: { createdAt: "asc" },
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
  const hasSubmittedMatchResult = event.matches.some((match) => match.winnerTeamId !== null);
  const unfinishedMatchCount = event.matches.filter((match) => !match.winnerTeamId).length;
  const isParticipantEditLocked = hasGeneratedBracket || hasSubmittedMatchResult;
  const currentStep = getCurrentStep({
    status: event.status,
    participantCount: event.participants.length,
    teamCount: event.teams.length,
    matchCount: event.matches.length,
    unfinishedMatchCount,
  });
  const requestedStep = resolvedSearchParams.step;
  const selectedStep = STEP_ORDER.includes(requestedStep as StepKey)
    ? (requestedStep as StepKey)
    : currentStep;

  const sortedMatches = [...event.matches].sort(
    (a, b) => (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99) || a.round - b.round,
  );

  const activeApplyCount = event.participationApplies.filter(
    (apply) => apply.status === "APPLIED" || apply.status === "CONFIRMED",
  ).length;
  const reserveApplyCount = event.participationApplies.filter((apply) => apply.status === "RESERVE").length;
  const completedMatchCount = event.matches.filter((match) => match.winnerTeamId).length;
  const winnerTeam = event.winnerTeamId
    ? event.teams.find((team) => team.id === event.winnerTeamId)
    : null;
  const mvpParticipant = event.mvpPlayerId
    ? event.participants.find((participant) => participant.playerId === event.mvpPlayerId)
    : null;

  return (
    <main className="admin-page event-admin-detail-page">
      <style>{`
        .event-admin-detail-page { width: min(1500px, calc(100vw - 300px)); max-width: none; }
        .event-admin-hero { border: 1px solid rgba(59,130,246,0.28); border-radius: 22px; padding: 18px; background: linear-gradient(135deg, rgba(15,23,42,0.82), rgba(12,33,65,0.72)); margin-bottom: 16px; }
        .event-admin-detail-page .admin-event-detail-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        .event-step-nav { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 8px; margin: 16px 0 18px; }
        .event-step-nav a { text-decoration: none; border: 1px solid rgba(59,130,246,0.28); border-radius: 12px; padding: 10px 8px; background: rgba(15,23,42,0.62); color: #bcd2ee; text-align: center; font-size: 12px; font-weight: 800; }
        .event-step-nav a.is-current { border-color: rgba(56,189,248,0.82); background: rgba(14,165,233,0.20); color: #f8fbff; box-shadow: 0 0 18px rgba(56,189,248,0.16); }
        .event-step-nav a.is-actual { border-color: rgba(34,197,94,0.55); }
        .event-step-nav__badge { display: block; margin-top: 4px; font-size: 10px; color: #67e8f9; }
        .event-operation-panel { border-radius: 20px; overflow: hidden; }
        .event-operation-panel__header { padding-bottom: 10px; }
        .event-operation-panel__body { padding-top: 8px; }
        .event-operation-two-col { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr); gap: 16px; align-items: start; }
        .event-table-wrap { overflow-x: auto; border: 1px solid rgba(59,130,246,0.24); border-radius: 16px; background: rgba(4,10,24,0.36); }
        .event-table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 12px; }
        .event-table th, .event-table td { padding: 11px 12px; border-bottom: 1px solid rgba(59,130,246,0.16); text-align: left; vertical-align: middle; color: #dbeafe; }
        .event-table th { color: #93c5fd; font-size: 11px; font-weight: 800; background: rgba(15,23,42,0.62); }
        .event-table tr:last-child td { border-bottom: 0; }
        .event-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 46px; padding: 4px 8px; border: 1px solid rgba(56,189,248,0.28); border-radius: 999px; background: rgba(14,165,233,0.12); color: #bfdbfe; font-size: 11px; font-weight: 800; }
        .event-badge--reserve { border-color: rgba(251,191,36,0.45); background: rgba(251,191,36,0.12); color: #fde68a; }
        .event-summary-box { border: 1px solid rgba(59,130,246,0.24); border-radius: 16px; padding: 14px; background: rgba(8,18,34,0.72); display: grid; gap: 10px; }
        .event-summary-line { display: flex; justify-content: space-between; gap: 12px; color: #cbd5e1; font-size: 12px; }
        .event-team-matrix { display: grid; grid-template-columns: 110px repeat(var(--team-count), minmax(150px, 1fr)); border: 1px solid rgba(59,130,246,0.24); border-radius: 18px; overflow: hidden; background: rgba(4,10,24,0.38); }
        .event-team-matrix > div { padding: 12px; border-right: 1px solid rgba(59,130,246,0.16); border-bottom: 1px solid rgba(59,130,246,0.16); min-height: 52px; }
        .event-team-matrix > div:nth-child(var(--matrix-columns)n) { border-right: 0; }
        .event-team-matrix__head { font-weight: 900; color: #e0f2fe; background: rgba(14,165,233,0.12); }
        .event-team-matrix__role { color: #93c5fd; font-weight: 900; }
        .event-team-matrix__name { display: block; color: #f8fbff; font-weight: 800; }
        .event-team-matrix__sub { display: block; margin-top: 4px; color: #93a4bd; font-size: 11px; }
        .event-match-card { display: grid; gap: 16px; padding: 18px; border: 1px solid rgba(56,189,248,0.22); border-radius: 18px; background: rgba(8,18,34,0.82); }
        .event-match-card__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: center; }
        .event-match-card__stage { display: inline-flex; margin-bottom: 8px; padding: 5px 9px; border-radius: 999px; background: rgba(14,165,233,0.16); color: #7dd3fc; font-size: 12px; font-weight: 900; }
        @media (max-width: 1180px) { .event-admin-detail-page { width: 100%; } .event-step-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); } .event-operation-two-col { grid-template-columns: 1fr; } }
      `}</style>

      <div className="admin-page__header event-admin-hero">
        <div>
          <h1 className="admin-page__title">{event.title}</h1>
          <p className="admin-page__description">
            모집 → 팀 구성 → 대진/결과 → 최종 처리 순서로 운영합니다. 멸망전과 동일하게 상단 단계 탭에서 선택한 단계만 표시됩니다.
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
          <span>진행 상태</span>
          <strong>{getStatusLabel(event.status)}</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>현재 단계</span>
          <strong>{STEP_LABELS[currentStep]}</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>진행 방식</span>
          <strong>{event.mode === "POSITION" ? "포지션 · 점수 시드" : "포지션 없음 · 랜덤 시드"}</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>신청 / 보류</span>
          <strong>{activeApplyCount}명 / {reserveApplyCount}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>참가자</span>
          <strong>{event.participants.length}명</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>팀 / 경기</span>
          <strong>{event.teams.length}팀 / {event.matches.length}경기</strong>
        </div>
        <div className="admin-event-detail-card">
          <span>결과</span>
          <strong>{completedMatchCount}경기 완료</strong>
        </div>
      </section>

      <nav className="event-step-nav" aria-label="이벤트 내전 진행 단계">
        {STEP_ORDER.map((step) => {
          const className = [
            step === selectedStep ? "is-current" : "",
            step === currentStep ? "is-actual" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Link key={step} href={`/admin/progress/event/${event.id}?step=${step}`} className={className}>
              {STEP_LABELS[step]}
              {step === currentStep ? <span className="event-step-nav__badge">진행중</span> : null}
            </Link>
          );
        })}
      </nav>

      {selectedStep === "RECRUITING" ? (
        <AdminStepPanel
          title="1. 모집 현황 · 참가자 등록"
          description="유저 신청자와 확정 참가자를 확인하고, 참가자 가져오기 또는 관리자 직접 추가로 확정 명단을 구성합니다."
        >
          <div className="event-operation-two-col">
            <div style={{ display: "grid", gap: 16 }}>
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

              <div>
                <h3 className="admin-event-section-subtitle">확정 참가자</h3>
                {event.participants.length === 0 ? (
                  <div className="empty-box">등록된 확정 참가자가 없습니다.</div>
                ) : (
                  <div className="event-table-wrap">
                    <table className="event-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>이름</th>
                          <th>닉네임#태그</th>
                          <th>라인</th>
                          <th>팀</th>
                          <th>점수</th>
                          <th>관리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.participants.map((participant, index) => (
                          <tr key={participant.id}>
                            <td>{index + 1}</td>
                            <td>{participant.player.name}</td>
                            <td>{participant.player.nickname}#{participant.player.tag}</td>
                            <td><span className="event-badge">{participant.position ?? "-"}</span></td>
                            <td>{participant.team?.name ?? "팀 미배정"}</td>
                            <td>{participant.balanceScore.toFixed(1)}</td>
                            <td>
                              {isParticipantEditLocked ? (
                                <button type="button" className="admin-event-participant-delete-button" disabled>
                                  삭제 잠김
                                </button>
                              ) : (
                                <form action={`/api/admin/event-matches/${event.id}/participants/${participant.id}/delete`} method="POST">
                                  <button type="submit" className="admin-event-participant-delete-button">
                                    삭제
                                  </button>
                                </form>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="event-summary-box">
              <h3 className="admin-event-section-subtitle">참가 신청 현황</h3>
              <div className="event-summary-line"><span>전체 신청</span><strong>{event.participationApplies.length}명</strong></div>
              <div className="event-summary-line"><span>확정 후보</span><strong>{activeApplyCount}명</strong></div>
              <div className="event-summary-line"><span>보류</span><strong>{reserveApplyCount}명</strong></div>
              <div className="event-summary-line"><span>확정 참가자</span><strong>{event.participants.length}명</strong></div>
              <ImportParticipantsButton type="event" targetId={event.id} />

              {event.participationApplies.length === 0 ? (
                <div className="empty-box">유저 참가 신청자가 없습니다.</div>
              ) : (
                <div className="event-table-wrap" style={{ marginTop: 8 }}>
                  <table className="event-table" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>신청자</th>
                        <th>라인</th>
                        <th>상태</th>
                        <th>신청시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.participationApplies.map((apply) => (
                        <tr key={apply.id}>
                          <td>{apply.player.nickname}#{apply.player.tag}</td>
                          <td><span className="event-badge">{apply.mainPosition ?? "-"}</span></td>
                          <td>
                            <span className={apply.status === "RESERVE" ? "event-badge event-badge--reserve" : "event-badge"}>
                              {getApplyStatusLabel(apply.status)}
                            </span>
                          </td>
                          <td>{formatDateTime(apply.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </AdminStepPanel>
      ) : null}

      {selectedStep === "TEAMS" ? (
        <AdminStepPanel
          title="2. 팀 구성"
          description="멸망전의 팀 현황표와 동일하게 라인별 팀 구성을 확인하고, 대진 생성 전까지 드래그로 조정할 수 있습니다."
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
            <div style={{ display: "grid", gap: 18 }}>
              <div
                className="event-team-matrix"
                style={{
                  "--team-count": event.teams.length,
                  "--matrix-columns": event.teams.length + 1,
                } as CSSProperties}
              >
                <div className="event-team-matrix__head">라인</div>
                {event.teams.map((team) => (
                  <div key={team.id} className="event-team-matrix__head">
                    <span className="event-team-matrix__name">{team.name}</span>
                    <span className="event-team-matrix__sub">{team.score.toFixed(1)}점 · {team.members.length}명</span>
                  </div>
                ))}

                {(["TOP", "JGL", "MID", "ADC", "SUP"] as const).map((position) => (
                  <div key={`matrix-row-${position}`} style={{ display: "contents" }}>
                    <div key={`role-${position}`} className="event-team-matrix__role">{position}</div>
                    {event.teams.map((team) => {
                      const member = team.members.find((item) => item.position === position);
                      return (
                        <div key={`${team.id}-${position}`}>
                          {member ? (
                            <>
                              <span className="event-team-matrix__name">{member.player.name}</span>
                              <span className="event-team-matrix__sub">{member.player.nickname}#{member.player.tag}</span>
                            </>
                          ) : (
                            <span className="event-team-matrix__sub">대기</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

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
            </div>
          )}
        </AdminStepPanel>
      ) : null}

      {selectedStep === "BRACKET" ? (
        <AdminStepPanel
          title="3. 대진표 · 결과 입력"
          description="다팀 토너먼트를 생성하고, 경기별 승리팀 버튼으로 결과를 입력합니다. 결승 결과는 최종 처리 값으로 자동 반영됩니다."
        >
          <EventBracketGenerator
            eventId={event.id}
            teamCount={event.teams.length}
            matchCount={event.matches.length}
            defaultSeedMode={event.mode === "POSITION" ? "SCORE" : "RANDOM"}
          />

          {sortedMatches.length === 0 ? (
            <div className="empty-box">생성된 대진표가 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {sortedMatches.map((match) => (
                <article key={match.id} className="event-match-card">
                  <div className="event-match-card__head">
                    <div>
                      <span className="event-match-card__stage">
                        {STAGE_LABELS[match.stage] ?? match.stage} · {match.round}경기
                      </span>
                      <h3 style={{ margin: 0, color: "#e5f3ff", fontSize: 18 }}>
                        {match.teamA.name} vs {match.teamB.name}
                      </h3>
                    </div>
                    <span className={match.winnerTeamId ? "event-badge" : "event-badge event-badge--reserve"}>
                      {match.winnerTeamId ? "결과 입력 완료" : "결과 대기"}
                    </span>
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
                </article>
              ))}
            </div>
          )}
        </AdminStepPanel>
      ) : null}

      {selectedStep === "COMPLETE" ? (
        <AdminStepPanel
          title="4. 최종 처리"
          description="우승팀을 선택하면 MVP는 해당 우승팀 소속 참가자 중에서만 선택합니다. 갤러리 이미지는 추후 생성 후 다시 연결할 수 있습니다."
        >
          <div className="empty-box" style={{ marginBottom: 12 }}>
            현재 최종값: 우승 팀 {winnerTeam?.name ?? "-"} / MVP {mvpParticipant ? `${mvpParticipant.player.nickname}#${mvpParticipant.player.tag}` : "-"}
          </div>
          <EventCompleteForm
            eventId={event.id}
            teams={event.teams}
            participants={event.participants}
            galleryImages={galleryImages}
            initialWinnerTeamId={event.winnerTeamId}
            initialMvpPlayerId={event.mvpPlayerId}
            initialGalleryImageId={event.galleryImageId}
          />
        </AdminStepPanel>
      ) : null}
    </main>
  );
}
