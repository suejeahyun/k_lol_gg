import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";
import DestructionStandingsBoard from "@/components/destruction/DestructionStandingsBoard";
import { resolvePublicPlayerDisplayName } from "@/lib/public/player";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 멸망전 상세",
  description: "멸망전 팀 구성과 예선·본선 결과를 모바일에서 확인하세요.",
};

type AppDestructionDetailPageProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

function positionText(position?: string | null) {
  return position ?? "-";
}

export default async function AppDestructionDetailPage({ params }: AppDestructionDetailPageProps) {
  const { tournamentId } = await params;
  const id = Number(tournamentId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    select: {
      title: true,
      teams: {
        select: {
          id: true,
          name: true,
          preliminaryGroup: true,
          points: true,
          wins: true,
          losses: true,
          captain: { select: { nickname: true, tag: true } },
          members: {
            select: {
              id: true,
              position: true,
              player: { select: { nickname: true, tag: true } },
            },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ preliminaryGroup: "asc" }, { id: "asc" }],
      },
      matches: {
        select: {
          id: true,
          stage: true,
          round: true,
          preliminaryGroup: true,
          teamAId: true,
          teamBId: true,
          winnerTeamId: true,
          mvpFinalizedAt: true,
          isConfirmed: true,
          matchDate: true,
          bestOf: true,
          teamAScore: true,
          teamBScore: true,
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
          mvpPlayer: { select: { nickname: true, tag: true } },
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
        take: 16,
      },
    },
  });

  if (!tournament) notFound();

  const matchesWithResult = tournament.matches.filter((match) => match.winnerTeamId && (match.stage !== "PRELIMINARY" || match.isConfirmed));
  const pendingMvpMatches = matchesWithResult.filter((match) => !match.mvpFinalizedAt);
  const preliminaryMatches = tournament.matches.filter(
    (match) => match.stage === "PRELIMINARY" && match.isConfirmed,
  );

  return (
    <AppMobileShell subtitle="멸망전">
      <section className="klol-app-hero klol-app-event-detail-hero klol-app-event-detail-hero--destruction">
        <div className="klol-app-kicker">DESTRUCTION MATCH</div>
        <h1 className="klol-app-title">{tournament.title}</h1>
        <div className="klol-app-actions klol-app-actions--keep">
          <Link className="klol-app-secondary" href="/app/matches?tab=events">
            목록
          </Link>
        </div>
      </section>

      <AppSection title="팀 구성">
        {tournament.teams.length === 0 ? (
          <AppEmpty>아직 구성된 팀이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {tournament.teams.map((team) => (
              <article className="klol-app-list-card klol-app-event-team" key={team.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{team.name}</strong>
                    <span>주장 {resolvePublicPlayerDisplayName(team.captain)} · {team.members.length}명</span>
                  </span>
                  <span className="klol-app-badge">{team.points}점</span>
                </div>
                <p className="klol-app-muted">
                  {team.members
                    .map(
                      (member) =>
                        `${positionText(member.position)} ${resolvePublicPlayerDisplayName(member.player)}`,
                    )
                    .join(" · ") || "팀원 없음"}
                </p>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      {preliminaryMatches.length > 0 ? (
        <AppSection title="예선 조별 순위" caption="전적 · 세트 득실 · 최근 결과">
          <DestructionStandingsBoard
            title={tournament.title}
            teams={tournament.teams}
            matches={tournament.matches}
          />
        </AppSection>
      ) : null}

      <AppSection title="예선·본선">
        {tournament.matches.length === 0 ? (
          <AppEmpty>등록된 경기가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {tournament.matches.map((match) => (
              <article className="klol-app-list-card" key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.teamA.name} vs {match.teamB.name}</strong>
                    <span>
                      {match.stage} · ROUND {match.round} · BO{match.bestOf}
                      {match.mvpPlayer
                        ? ` · MVP ${resolvePublicPlayerDisplayName(match.mvpPlayer)}`
                        : ""}
                    </span>
                  </span>
                  <span className="klol-app-badge">
                    {match.isConfirmed ? `${match.teamAScore}:${match.teamBScore}` : "대기"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>

      {matchesWithResult.length ? (
        <AppSection
          title="경기 MVP 투표"
          caption={
            pendingMvpMatches.length
              ? `${pendingMvpMatches.length}개 진행 중`
              : "확정 결과"
          }
        >
          <div className="klol-app-list-card destruction-mvp-app-cta">
            <p>예선과 본선을 오가지 않고 전용 페이지에서 투표할 수 있습니다.</p>
            <Link className="klol-app-primary" href={`/app/progress/destruction/${id}/mvp-vote`}>
              {pendingMvpMatches.length ? "MVP 투표하러 가기" : "MVP 결과 보기"}
            </Link>
          </div>
        </AppSection>
      ) : null}
    </AppMobileShell>
  );
}
