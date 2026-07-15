import Link from "next/link";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getCurrentUser } from "@/lib/auth/session";
import { getAppHomeSummary } from "@/lib/app/home-summary";
import { prisma } from "@/lib/prisma/client";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
});

function formatWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return "0%";
  const value = Math.round((wins / totalGames) * 1000) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function formatKda(kills?: number | null, deaths?: number | null, assists?: number | null) {
  const d = deaths ?? 0;
  if (d <= 0) return "Perfect";
  return (((kills ?? 0) + (assists ?? 0)) / d).toFixed(2);
}

function typeLabel(type: string) {
  if (type.includes("TEN")) return "10인 내전";
  if (type.includes("EIGHT")) return "8인";
  if (type.includes("FIVE")) return "5인";
  if (type.includes("FOUR")) return "4인";
  if (type.includes("THREE")) return "3인";
  if (type.includes("TWO")) return "2인";
  return "파티";
}

function teamLabel(winner?: string | null) {
  if (winner === "BLUE") return "BLUE 승";
  if (winner === "RED") return "RED 승";
  return "진행";
}

function eventStatusText(status: string) {
  if (status === "PLANNED") return "예정";
  if (status === "RECRUITING") return "모집중";
  if (status === "TEAM_BUILDING") return "팀 구성";
  if (status === "AUCTION") return "경매";
  if (status === "PRELIMINARY") return "예선";
  if (status === "TOURNAMENT") return "본선";
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELLED") return "취소";
  return status;
}

export default async function AppHomePage() {
  const [session, summary, season, siteSettings] = await Promise.all([
    getCurrentUser(),
    getAppHomeSummary(),
    prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
      select: { id: true, name: true },
    }),
    getSiteSettings(),
  ]);
  const recruitFeatureEnabled = isSiteFeatureEnabled(siteSettings, "recruit");

  const [
    myStat,
    myKda,
    recentRecruits,
    recentMatches,
    topStats,
    recentMvp,
    activeEvents,
    activeDestructions,
  ] = await Promise.all([
    session?.playerId && season
      ? prisma.playerSeasonStat.findUnique({
          where: {
            playerId_seasonId: {
              playerId: session.playerId,
              seasonId: season.id,
            },
          },
          select: {
            totalGames: true,
            participationCount: true,
            wins: true,
            losses: true,
            mvpCount: true,
          },
        })
      : Promise.resolve(null),
    session?.playerId && season
      ? prisma.matchParticipant.aggregate({
          where: {
            playerId: session.playerId,
            game: {
              series: {
                seasonId: season.id,
              },
            },
          },
          _sum: {
            kills: true,
            deaths: true,
            assists: true,
          },
        })
      : Promise.resolve(null),
    prisma.recruitParty.findMany({
      where: { status: "IN_PROGRESS" },
      include: {
        members: {
          orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }],
          take: 6,
        },
      },
      orderBy: [{ recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      take: 2,
    }),
    prisma.matchSeries.findMany({
      include: { season: true, games: { orderBy: { gameNumber: "asc" } } },
      orderBy: [{ matchDate: "desc" }, { id: "desc" }],
      take: 3,
    }),
    season
      ? prisma.playerSeasonStat.findMany({
          where: { seasonId: season.id, participationCount: { gte: 1 } },
          include: { player: true },
          orderBy: [{ wins: "desc" }, { participationCount: "desc" }, { mvpCount: "desc" }],
          take: 3,
        })
      : Promise.resolve([]),
    prisma.matchGame.findFirst({
      where: { mvpPlayerId: { not: null } },
      include: {
        series: true,
        participants: { include: { player: true, champion: true } },
      },
      orderBy: { id: "desc" },
    }),
    prisma.eventMatch.findMany({
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      take: 2,
      select: {
        id: true,
        title: true,
        status: true,
        eventDate: true,
        _count: { select: { participants: true, teams: true, matches: true } },
      },
    }),
    prisma.destructionTournament.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 2,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        _count: { select: { participants: true, teams: true, matches: true } },
      },
    }),
  ]);

  const mvpParticipant = recentMvp?.participants.find(
    (participant) => participant.playerId === recentMvp.mvpPlayerId
  );
  const totalMyGames = myStat?.totalGames ?? 0;

  return (
    <AppMobileShell subtitle="모바일 홈">
      <section className="klol-app-hero klol-app-home-hero">
        <div className="klol-app-kicker">K-LOL.GG APP</div>
        <h1 className="klol-app-title">내전 운영 홈</h1>
        <p className="klol-app-subtitle">
          구인, 최근 내전, 랭킹을 빠르게 확인합니다.
        </p>
        <div className="klol-app-actions">
          <Link className="klol-app-primary" href="/app/recruits">구인 보기</Link>
          <Link className="klol-app-secondary" href="/app/players">플레이어 검색</Link>
          <Link className="klol-app-secondary" href="/app/coin-toss">코인토스</Link>
          <Link className="klol-app-secondary" href="/install">앱 설치</Link>
        </div>
      </section>

      <section className="klol-app-section klol-app-home-summary">
        <div className="klol-app-section-head">
          <h2>{session?.playerId ? "내 시즌 요약" : "시즌 요약"}</h2>
          <p>{season?.name ?? "활성 시즌 없음"}</p>
        </div>
        <div className="klol-app-meta-grid klol-app-meta-grid--home">
          <div className="klol-app-meta">
            <span>{session?.playerId ? "내전 참가" : recruitFeatureEnabled ? "진행 구인" : "등록 내전"}</span>
            <strong>
              {session?.playerId
                ? `${myStat?.participationCount ?? 0}회`
                : recruitFeatureEnabled
                  ? `${summary.activeRecruitCount}개`
                  : `${summary.matchCount}개`}
            </strong>
          </div>
          <div className="klol-app-meta">
            <span>{session?.playerId ? "평균 KDA" : "등록 내전"}</span>
            <strong>{session?.playerId ? formatKda(myKda?._sum.kills, myKda?._sum.deaths, myKda?._sum.assists) : `${summary.matchCount}개`}</strong>
          </div>
          <div className="klol-app-meta">
            <span>{session?.playerId ? "MVP" : "활성 유저"}</span>
            <strong>{session?.playerId ? `${myStat?.mvpCount ?? 0}회` : `${summary.playerCount}명`}</strong>
          </div>
          {session?.playerId ? (
            <div className="klol-app-meta">
              <span>승률</span>
              <strong>{formatWinRate(myStat?.wins ?? 0, totalMyGames)}</strong>
            </div>
          ) : null}
        </div>
      </section>

      <PremiumFeatureGate feature="recruit" settings={siteSettings}>
        <AppSection title="활성 구인" caption="전체 보기">
          {recentRecruits.length === 0 ? (
            <AppEmpty>현재 모집 중인 구인이 없습니다.</AppEmpty>
          ) : (
            <div className="klol-app-list">
              {recentRecruits.map((party) => (
                <Link className="klol-app-list-card" href="/app/recruits" key={party.id}>
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>#{party.recruitNo} · {party.title || typeLabel(party.type)}</strong>
                      <span>{party.startTimeText || "시간 미정"} · {party.note || party.tierText || "정보 입력 대기"}</span>
                    </div>
                    <span className="klol-app-badge">{party.members.length}/{party.maxMembers}</span>
                  </div>
                  <p className="klol-app-muted">
                    {party.members.map((member) => member.name).join(" · ") || "참가자 없음"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </AppSection>
      </PremiumFeatureGate>

      <AppSection title="최근 내전" caption="전체 보기">
        {recentMatches.length === 0 ? (
          <AppEmpty>등록된 내전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {recentMatches.map((match) => {
              const lastGame = match.games.at(-1);
              return (
                <Link className="klol-app-list-card" href={`/app/matches/${match.id}`} key={match.id}>
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{match.title}</strong>
                      <span>{dateFormatter.format(match.matchDate)} · {match.season?.name ?? "시즌 없음"}</span>
                    </div>
                    <span className="klol-app-badge klol-app-badge--warn">
                      {lastGame ? teamLabel(lastGame.winnerTeam) : `${match.games.length}세트`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </AppSection>

      <AppSection title="이벤트·멸망전" caption="진행 보기">
        {activeEvents.length === 0 && activeDestructions.length === 0 ? (
          <AppEmpty>진행 중인 이벤트/멸망전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list klol-app-event-list">
            {activeEvents.map((event) => (
              <Link
                className="klol-app-list-card klol-app-event-card"
                href={`/app/progress/event/${event.id}`}
                key={`event-${event.id}`}
              >
                <div className="klol-app-list-top">
                  <div className="klol-app-list-title">
                    <strong>{event.title}</strong>
                    <span>{dateFormatter.format(event.eventDate)} · {event._count.participants}명 · {event._count.teams}팀</span>
                  </div>
                  <span className="klol-app-badge">{eventStatusText(event.status)}</span>
                </div>
              </Link>
            ))}
            {activeDestructions.map((tournament) => (
              <Link
                className="klol-app-list-card klol-app-event-card klol-app-event-card--destruction"
                href={`/app/progress/destruction/${tournament.id}`}
                key={`destruction-${tournament.id}`}
              >
                <div className="klol-app-list-top">
                  <div className="klol-app-list-title">
                    <strong>{tournament.title}</strong>
                    <span>{tournament.startDate ? dateFormatter.format(tournament.startDate) : "일정 미정"} · {tournament._count.participants}명 · {tournament._count.teams}팀</span>
                  </div>
                  <span className="klol-app-badge klol-app-badge--warn">{eventStatusText(tournament.status)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="시즌 TOP 3" caption={season?.name ?? undefined}>
        {topStats.length === 0 ? (
          <AppEmpty>랭킹 데이터가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {topStats.map((stat, index) => (
              <Link className="klol-app-list-card klol-app-rank-row" href={`/app/players/${stat.player.id}`} key={stat.id}>
                <span className="klol-app-rank-no" data-rank={index + 1}>{index + 1}</span>
                <span className="klol-app-list-title">
                  <strong>{stat.player.name}</strong>
                  <span>{stat.player.nickname}#{stat.player.tag}</span>
                </span>
                <span className="klol-app-stat-value">{stat.wins}승</span>
              </Link>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="최근 MVP">
        {mvpParticipant ? (
          <Link className="klol-app-list-card klol-app-home-mvp" href={`/app/matches/${recentMvp?.seriesId}`}>
            <div className="klol-app-list-title">
              <strong>{mvpParticipant.player.name}</strong>
              <span>{mvpParticipant.champion.name} · {recentMvp?.series.title}</span>
            </div>
            <strong className="klol-app-stat-value">
              {formatKda(mvpParticipant.kills, mvpParticipant.deaths, mvpParticipant.assists)}
            </strong>
          </Link>
        ) : (
          <AppEmpty>최근 MVP 데이터가 없습니다.</AppEmpty>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
