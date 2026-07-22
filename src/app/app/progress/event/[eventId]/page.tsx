import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 이벤트 상세",
  description: "이벤트 내전의 참가자와 경기 결과를 모바일에서 확인하세요.",
};

type AppEventDetailPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

function eventStatusText(status: string) {
  if (status === "PLANNED") return "예정";
  if (status === "RECRUITING") return "모집중";
  if (status === "TEAM_BUILDING") return "팀 구성";
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELLED") return "취소";
  return status;
}

function positionText(position?: string | null) {
  return position ?? "-";
}

export default async function AppEventDetailPage({ params }: AppEventDetailPageProps) {
  const { eventId } = await params;
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const event = await prisma.eventMatch.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      eventDate: true,
      teams: {
        select: {
          id: true,
          name: true,
          seed: true,
          score: true,
          members: {
            select: {
              position: true,
              player: { select: { name: true } },
            },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ seed: "asc" }, { id: "asc" }],
      },
      participants: {
        select: {
          id: true,
          position: true,
          player: { select: { name: true, nickname: true, tag: true } },
        },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        take: 20,
      },
      matches: {
        select: {
          id: true,
          stage: true,
          round: true,
          winnerTeamId: true,
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
        take: 12,
      },
    },
  });

  if (!event) notFound();

  return (
    <AppMobileShell subtitle="이벤트 내전">
      <section className="klol-app-hero klol-app-event-detail-hero">
        <div className="klol-app-kicker">EVENT MATCH</div>
        <h1 className="klol-app-title">{event.title}</h1>
        <div className="klol-app-actions klol-app-actions--keep">
          <Link className="klol-app-secondary" href="/app/matches?tab=events">
            목록
          </Link>
        </div>
      </section>

      <AppSection title="진행 요약">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>상태</span>
            <strong>{eventStatusText(event.status)}</strong>
          </div>
          <div className="klol-app-meta">
            <span>일시</span>
            <strong>{dateFormatter.format(event.eventDate)}</strong>
          </div>
          <div className="klol-app-meta">
            <span>참가자</span>
            <strong>{event.participants.length}명</strong>
          </div>
          <div className="klol-app-meta">
            <span>팀/경기</span>
            <strong>{event.teams.length}팀 · {event.matches.length}경기</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="팀 구성">
        {event.teams.length === 0 ? (
          <AppEmpty>아직 구성된 팀이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {event.teams.map((team) => (
              <article className="klol-app-list-card klol-app-event-team" key={team.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{team.name}</strong>
                    <span>{team.members.length}명 · 시드 {team.seed ?? "-"}</span>
                  </span>
                  <span className="klol-app-badge">{team.score.toFixed(1)}</span>
                </div>
                <p className="klol-app-muted">
                  {team.members.map((member) => `${positionText(member.position)} ${member.player.name}`).join(" · ") || "팀원 없음"}
                </p>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="참가자">
        {event.participants.length === 0 ? (
          <AppEmpty>참가자가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {event.participants.map((participant) => (
              <article className="klol-app-list-card" key={participant.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{participant.player.name}</strong>
                    <span>{participant.player.nickname}#{participant.player.tag}</span>
                  </span>
                  <span className="klol-app-badge">{positionText(participant.position)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="대진·결과">
        {event.matches.length === 0 ? (
          <AppEmpty>등록된 경기가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {event.matches.map((match) => (
              <article className="klol-app-list-card" key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                    <span>{match.stage} · ROUND {match.round}</span>
                  </span>
                  <span className="klol-app-badge">
                    {match.winnerTeamId ? "완료" : "대기"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
