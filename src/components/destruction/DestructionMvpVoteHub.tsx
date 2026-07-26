import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import DestructionMvpBallot from "@/components/destruction/DestructionMvpBallot";

function getStageLabel(stage: string) {
  const labels: Record<string, string> = {
    PRELIMINARY: "예선",
    SEMI_FINAL: "4강",
    FINAL: "결승",
  };
  return labels[stage] ?? stage;
}

function formatDate(value: Date | null) {
  if (!value) return "일정 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(value);
}

export default async function DestructionMvpVoteHub({
  tournamentId,
  appMode = false,
}: {
  tournamentId: number;
  appMode?: boolean;
}) {
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) notFound();

  const currentUserPromise = getCurrentUser();
  const publicMatchWhere = {
    tournamentId,
    winnerTeamId: { not: null },
    tournament: { status: { not: "CANCELLED" as const } },
    OR: [
      { stage: "PRELIMINARY" as const, isConfirmed: true },
      { stage: { not: "PRELIMINARY" as const } },
    ],
  };

  const [currentUser, tournament, openMatches, recentFinalizedMatches] = await Promise.all([
    currentUserPromise,
    prisma.destructionTournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, title: true, status: true },
    }),
    prisma.destructionMatch.findMany({
      where: {
        ...publicMatchWhere,
        mvpFinalizedAt: null,
      },
      include: {
        teamA: true,
        teamB: true,
        mvpPlayer: true,
        tournament: {
          select: {
            id: true,
            title: true,
            status: true,
            participants: {
              include: { player: true },
              orderBy: [{ position: "asc" }, { id: "asc" }],
            },
          },
        },
      },
      orderBy: [{ matchDate: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
    prisma.destructionMatch.findMany({
      where: {
        ...publicMatchWhere,
        mvpFinalizedAt: { not: null },
      },
      include: {
        teamA: true,
        teamB: true,
        mvpPlayer: true,
        tournament: {
          select: {
            id: true,
            title: true,
            status: true,
            participants: {
              include: { player: true },
              orderBy: [{ position: "asc" }, { id: "asc" }],
            },
          },
        },
      },
      orderBy: [{ mvpFinalizedAt: "desc" }],
      take: 8,
    }),
  ]);

  if (!tournament) notFound();

  const matchIds = [...openMatches, ...recentFinalizedMatches].map((match) => match.id);
  const currentUserVotes =
    currentUser && matchIds.length > 0
      ? await prisma.destructionMatchMvpVote.findMany({
          where: {
            voterUserAccountId: currentUser.userAccountId,
            matchId: { in: matchIds },
          },
          select: { matchId: true, candidatePlayerId: true },
        })
      : [];
  const currentUserVoteByMatch = new Map(
    currentUserVotes.map((vote) => [vote.matchId, vote.candidatePlayerId]),
  );

  const isEligibleMatch = (match: (typeof openMatches)[number]) =>
    Boolean(
      currentUser?.playerId &&
        match.tournament.participants.some(
          (participant) =>
            participant.playerId === currentUser.playerId &&
            (participant.teamId === match.teamAId || participant.teamId === match.teamBId),
        ),
    );

  const orderedOpenMatches = [...openMatches].sort(
    (a, b) => Number(isEligibleMatch(b)) - Number(isEligibleMatch(a)),
  );
  const myOpenVoteCount = orderedOpenMatches.filter(isEligibleMatch).length;
  const detailHref =
    appMode
      ? `/app/progress/destruction/${tournamentId}`
      : `/progress/destruction/${tournamentId}`;

  const renderBallot = (match: (typeof openMatches)[number]) => {
    const matchParticipants = match.tournament.participants.filter(
      (participant) =>
        participant.teamId === match.teamAId || participant.teamId === match.teamBId,
    );
    const isMatchParticipant = Boolean(
      currentUser?.playerId &&
        matchParticipants.some(
          (participant) => participant.playerId === currentUser.playerId,
        ),
    );
    const canVote =
      currentUser?.status === "APPROVED" &&
      isMatchParticipant &&
      matchParticipants.length === 10;
    const candidates = matchParticipants.map((participant) => ({
      id: participant.playerId,
      name: participant.player.name,
      nickname: participant.player.nickname,
      tag: participant.player.tag,
      position: participant.position,
      teamSide:
        participant.teamId === match.teamAId ? ("A" as const) : ("B" as const),
      selectable:
        participant.playerId !== currentUser?.playerId &&
        (match.mvpRevoteCandidateIds.length === 0 ||
          match.mvpRevoteCandidateIds.includes(participant.playerId)),
      unavailableLabel:
        participant.playerId === currentUser?.playerId
          ? "본인 제외"
          : "재투표 대상 아님",
    }));

    return (
      <DestructionMvpBallot
        matchId={match.id}
        candidates={candidates}
        initialVotePlayerId={currentUserVoteByMatch.get(match.id) ?? null}
        finalizedMvp={
          match.mvpPlayer
            ? {
                id: match.mvpPlayer.id,
                name: match.mvpPlayer.name,
                nickname: match.mvpPlayer.nickname,
                tag: match.mvpPlayer.tag,
                method: match.mvpSelectionMethod,
              }
            : null
        }
        canVote={canVote}
        teamLayout={{ teamAName: match.teamA.name, teamBName: match.teamB.name }}
        voteRound={match.mvpVoteRound}
        unavailableMessage={
          !currentUser
            ? "로그인 후 투표할 수 있습니다."
            : !isMatchParticipant
              ? "해당 경기 참가자 10명만 투표할 수 있습니다."
              : matchParticipants.length !== 10
                ? "경기 참가자 10명이 확정되어야 투표할 수 있습니다."
                : undefined
        }
      />
    );
  };

  return (
    <div className={`destruction-mvp-hub${appMode ? " destruction-mvp-hub--app" : ""}`}>
      <section className="destruction-mvp-hub__hero">
        <div>
          <p className="page-eyebrow">DESTRUCTION MVP</p>
          <h1>{tournament.title} MVP 투표</h1>
          <p>
            이 멸망전의 예선·4강·결승 MVP 투표와 확정 결과를 한곳에서 확인하세요.
          </p>
        </div>
        <Link
          className={appMode ? "klol-app-secondary" : "btn btn-ghost"}
          href={detailHref}
        >
          멸망전 상세
        </Link>
      </section>

      <section className="destruction-mvp-hub__summary" aria-label="MVP 투표 현황">
        <div data-tone={myOpenVoteCount > 0 ? "primary" : "default"}>
          <span>내가 참여한 미확정 경기</span>
          <strong>{myOpenVoteCount}개</strong>
        </div>
        <div>
          <span>이 멸망전 진행 중 투표</span>
          <strong>{openMatches.length}개</strong>
        </div>
        <div>
          <span>최근 확정 MVP</span>
          <strong>{recentFinalizedMatches.length}개</strong>
        </div>
      </section>

      {!currentUser ? (
        <div className="destruction-mvp-hub__notice">
          <strong>로그인이 필요합니다.</strong>
          <span>경기 결과는 볼 수 있지만 MVP 선택은 로그인한 참가자만 가능합니다.</span>
          <Link href={appMode ? "/app/login" : "/login"}>로그인</Link>
        </div>
      ) : myOpenVoteCount === 0 ? (
        <div className="destruction-mvp-hub__notice">
          <strong>현재 참여할 투표가 없습니다.</strong>
          <span>내가 참가한 경기 결과가 확정되면 이곳에 먼저 표시됩니다.</span>
        </div>
      ) : null}

      <section className="destruction-mvp-hub__section">
        <div className="section-header">
          <h2>진행 중인 투표</h2>
          <p className="page-description">
            내가 참여한 경기가 위에 표시됩니다. 확정 전까지 선택을 변경할 수 있습니다.
          </p>
        </div>

        {orderedOpenMatches.length === 0 ? (
          <div className="empty-box">현재 진행 중인 MVP 투표가 없습니다.</div>
        ) : (
          <div className="destruction-mvp-match-list">
            {orderedOpenMatches.map((match) => (
              <article
                className="destruction-mvp-match-card destruction-mvp-hub__match"
                data-eligible={isEligibleMatch(match)}
                key={match.id}
              >
                <div className="destruction-mvp-hub__match-meta">
                  <div className="destruction-mvp-match-card__title">
                    <span>
                      {match.tournament.title} · {getStageLabel(match.stage)} ·{" "}
                      {match.round}경기
                    </span>
                    <strong>
                      {match.teamA.name} {match.teamAScore} : {match.teamBScore}{" "}
                      {match.teamB.name}
                    </strong>
                    <small>{formatDate(match.matchDate)}</small>
                  </div>
                  <Link href={detailHref}>대회 상세</Link>
                </div>
                {renderBallot(match)}
              </article>
            ))}
          </div>
        )}
      </section>

      {recentFinalizedMatches.length > 0 ? (
        <section className="destruction-mvp-hub__section">
          <div className="section-header">
            <h2>최근 확정 MVP</h2>
          </div>
          <div className="destruction-mvp-hub__finalized">
            {recentFinalizedMatches.map((match) => (
              <Link href={detailHref} key={match.id}>
                <span>
                  {match.tournament.title} · {getStageLabel(match.stage)}{" "}
                  {match.round}경기
                </span>
                <strong>
                  {match.mvpPlayer
                    ? `${match.mvpPlayer.name} (${match.mvpPlayer.nickname}#${match.mvpPlayer.tag})`
                    : "확정 정보 없음"}
                </strong>
                <small>
                  {match.teamA.name} {match.teamAScore}:{match.teamBScore}{" "}
                  {match.teamB.name}
                </small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
