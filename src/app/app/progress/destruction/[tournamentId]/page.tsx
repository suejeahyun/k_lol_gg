import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import DestructionMvpBallot from "@/components/destruction/DestructionMvpBallot";

export const dynamic = "force-dynamic";

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

  const currentUser = await getCurrentUser();

  const tournament = await prisma.destructionTournament.findUnique({
    where: { id },
    include: {
      teams: {
        include: {
          captain: true,
          members: {
            include: { player: true },
            orderBy: [{ position: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ preliminaryGroup: "asc" }, { id: "asc" }],
      },
      participants: {
        include: { player: true, team: true },
        orderBy: [{ isCaptain: "desc" }, { position: "asc" }, { id: "asc" }],
        take: 30,
      },
      matches: {
        include: {
          teamA: true,
          teamB: true,
          mvpPlayer: true,
          mvpVotes: { where: { voterUserAccountId: currentUser?.userAccountId ?? -1 }, select: { candidatePlayerId: true } },
        },
        orderBy: [{ stage: "asc" }, { round: "asc" }],
        take: 16,
      },
    },
  });

  if (!tournament) notFound();

  const matchesWithResult = tournament.matches.filter((match) => match.winnerTeamId && (match.stage !== "PRELIMINARY" || match.isConfirmed));
  const pendingMvpMatches = matchesWithResult.filter((match) => !match.mvpFinalizedAt);
  const renderMvpBallot = (match: (typeof tournament.matches)[number]) => {
    const matchParticipants = tournament.participants.filter(
      (participant) => participant.teamId === match.teamAId || participant.teamId === match.teamBId,
    );
    const isMatchParticipant = Boolean(currentUser?.playerId && matchParticipants.some((participant) => participant.playerId === currentUser.playerId));
    const canVote = currentUser?.status === "APPROVED" && isMatchParticipant && matchParticipants.length === 10;
    const candidates = matchParticipants.map((participant) => ({
      id: participant.playerId,
      name: participant.player.name,
      nickname: participant.player.nickname,
      tag: participant.player.tag,
      position: participant.position,
      teamSide: participant.teamId === match.teamAId ? "A" as const : "B" as const,
      selectable: participant.playerId !== currentUser?.playerId &&
        (match.mvpRevoteCandidateIds.length === 0 || match.mvpRevoteCandidateIds.includes(participant.playerId)),
      unavailableLabel: participant.playerId === currentUser?.playerId ? "본인 제외" : "재투표 대상 아님",
    }));
    return (
      <DestructionMvpBallot
        matchId={match.id}
        candidates={candidates}
        initialVotePlayerId={match.mvpVotes[0]?.candidatePlayerId ?? null}
        finalizedMvp={match.mvpPlayer ? {
          id: match.mvpPlayer.id,
          name: match.mvpPlayer.name,
          nickname: match.mvpPlayer.nickname,
          tag: match.mvpPlayer.tag,
          method: match.mvpSelectionMethod,
        } : null}
        canVote={canVote}
        teamLayout={{ teamAName: match.teamA.name, teamBName: match.teamB.name }}
        voteRound={match.mvpVoteRound}
        unavailableMessage={!currentUser ? "로그인 후 투표할 수 있습니다." : !isMatchParticipant ? "해당 경기 참가자 10명만 투표할 수 있습니다." : matchParticipants.length !== 10 ? "경기 참가자 10명이 확정되어야 투표할 수 있습니다." : undefined}
      />
    );
  };

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
                    <span>주장 {team.captain.name} · {team.members.length}명</span>
                  </span>
                  <span className="klol-app-badge">{team.points}점</span>
                </div>
                <p className="klol-app-muted">
                  {team.members.map((member) => `${positionText(member.position)} ${member.player.name}`).join(" · ") || "팀원 없음"}
                </p>
              </article>
            ))}
          </div>
        )}
      </AppSection>

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
                      {match.mvpPlayer ? ` · MVP ${match.mvpPlayer.name} (${match.mvpPlayer.nickname}#${match.mvpPlayer.tag})` : ""}
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

      {pendingMvpMatches.length ? (
        <AppSection title="경기 MVP 투표" caption="참가자 10명 · 본인 제외">
          <div className="klol-app-list destruction-mvp-mobile-list">
            {pendingMvpMatches.map((match) => (
              <article className="klol-app-list-card destruction-mvp-mobile-card" key={`mvp-${match.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.teamA.name} {match.teamAScore}:{match.teamBScore} {match.teamB.name}</strong>
                    <span>{match.stage} · ROUND {match.round} · 전체 세트 합산</span>
                  </span>
                </div>
                {renderMvpBallot(match)}
              </article>
            ))}
          </div>
        </AppSection>
      ) : null}
    </AppMobileShell>
  );
}
