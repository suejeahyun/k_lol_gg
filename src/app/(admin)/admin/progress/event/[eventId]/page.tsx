export const dynamic = "force-dynamic";


import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

import EventTeamGenerator from "@/components/admin/EventTeamGenerator";
import EventBracketGenerator from "@/components/admin/EventBracketGenerator";
import EventMatchResultForm from "@/components/admin/EventMatchResultForm";
import EventCompleteForm from "@/components/admin/EventCompleteForm";
import ImportParticipantsButton from "@/components/admin/ImportParticipantsButton";
import AdminTeamDragManager from "@/components/admin/AdminTeamDragManager";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

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
          orderBy: {
            id: "asc",
          },
        },
        teams: {
          include: {
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
            seed: "asc",
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
          },
          orderBy: {
            id: "asc",
          },
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

  if (!event) {
    notFound();
  }

  const hasSubmittedMatchResult = event.matches.some(
    (match) => match.winnerTeamId !== null || match.mvpPlayerId !== null,
  );

  return (
    <main className="admin-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">{event.title}</h1>
          <p className="admin-page__description">
            이벤트 내전 참가자 등록, 팀 구성, 대진표, 결과를 관리합니다.
          </p>
        </div>

        <div className="admin-event-detail-actions">
          <ImportParticipantsButton type="event" targetId={event.id} />

          <Link href="/admin/progress/event" className="chip-button">
            목록
          </Link>
        </div>
      </div>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">참가자 등록</h2>
            <p className="admin-page__description">
              참가자 가져오기 후 저장된 확정 참가자 목록입니다.
            </p>
          </div>
        </div>

        {event.participants.length === 0 ? (
          <div className="empty-box">등록된 참가자가 없습니다.</div>
        ) : (
          <div className="admin-event-participant-list">
            {event.participants.map((participant, index) => (
              <div
                key={participant.id}
                className="admin-event-participant-row admin-event-participant-row--with-actions"
              >
                <div className="admin-event-participant-count">
                  {index + 1}
                </div>

                <span>
                  {participant.player.nickname}#{participant.player.tag}
                </span>

                <span>{participant.position ?? "-"}</span>

                <span>{participant.team?.name ?? "팀 미배정"}</span>

                <form
                  action={`/api/admin/event-matches/${event.id}/participants/${participant.id}/delete`}
                  method="POST"
                >
                  <button
                    type="submit"
                    className="admin-event-participant-delete-button"
                  >
                    삭제
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">팀 구성</h2>
            <p className="admin-page__description">
              참가자 점수를 계산한 뒤 5명 단위로 팀을 자동 생성합니다.
            </p>
          </div>
        </div>

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
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">대진표</h2>
            <p className="admin-page__description">
              생성된 팀을 기준으로 대진을 생성합니다.
            </p>
          </div>
        </div>

        <EventBracketGenerator
          eventId={event.id}
          teamCount={event.teams.length}
          matchCount={event.matches.length}
        />

        {event.matches.length > 0 ? (
          <div className="admin-event-bracket-list">
            {event.matches.map((match) => (
              <div key={match.id} className="admin-event-bracket-row">
                <div>
                  <strong>
                    {match.teamA?.name ?? "미정"} vs{" "}
                    {match.teamB?.name ?? "미정"}
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
      </section>

      <section className="admin-form">
        <div className="admin-page__header">
          <div>
            <h2 className="admin-event-section-title">최종 처리</h2>
            <p className="admin-page__description">
              우승팀, MVP, 우승 이미지를 등록하고 이벤트를 종료합니다.
            </p>
          </div>
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
      </section>
    </main>
  );
}