import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

type AppHubTab = "matches" | "recruits" | "rankings" | "events";

type AppMatchesPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const tabItems: Array<{ key: AppHubTab; label: string; href: string }> = [
  { key: "matches", label: "내전", href: "/app/matches?tab=matches" },
  { key: "recruits", label: "구인", href: "/app/matches?tab=recruits" },
  { key: "rankings", label: "랭킹", href: "/app/matches?tab=rankings" },
  { key: "events", label: "이벤트", href: "/app/matches?tab=events" },
];

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
});

function normalizeTab(tab?: string): AppHubTab {
  if (tab === "recruits" || tab === "rankings" || tab === "events") return tab;
  return "matches";
}

function winnerText(games: { winnerTeam: string | null }[]) {
  const blue = games.filter((game) => game.winnerTeam === "BLUE").length;
  const red = games.filter((game) => game.winnerTeam === "RED").length;
  if (!blue && !red) return `${games.length}세트`;
  if (blue === red) return "진행";
  return blue > red ? "BLUE 승" : "RED 승";
}

function recruitStatusText(status: string) {
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "FINISHED") return "마감";
  if (status === "CANCELED") return "취소";
  if (status === "RESET") return "초기화";
  return status;
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

function formatWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return "0%";
  const value = Math.round((wins / totalGames) * 1000) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export default async function AppMatchesPage({ searchParams }: AppMatchesPageProps) {
  const params = await searchParams;
  const activeTab = normalizeTab(params?.tab);

  const [siteSettings, matches, recruits, season, events, destructions] = await Promise.all([
    getSiteSettings(),
    prisma.matchSeries.findMany({
      include: { season: true, games: { orderBy: { gameNumber: "asc" } } },
      orderBy: [{ matchDate: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.recruitParty.findMany({
      include: {
        members: { orderBy: [{ slotNo: "asc" }, { createdAt: "asc" }], take: 8 },
      },
      orderBy: [{ status: "asc" }, { recruitDate: "desc" }, { resetSeq: "desc" }, { recruitNo: "asc" }],
      take: 20,
    }),
    prisma.season.findFirst({
      where: { isActive: true },
      orderBy: { id: "desc" },
      select: { id: true, name: true },
    }),
    prisma.eventMatch.findMany({
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      take: 8,
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
      take: 8,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        _count: { select: { participants: true, teams: true, matches: true } },
      },
    }),
  ]);

  const rankingStats = season
    ? await prisma.playerSeasonStat.findMany({
        where: { seasonId: season.id, participationCount: { gte: 1 } },
        include: { player: true },
        orderBy: [{ wins: "desc" }, { participationCount: "desc" }, { mvpCount: "desc" }],
        take: 10,
      })
    : [];

  return (
    <AppMobileShell subtitle="내전 허브">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">PLAY HUB</div>
        <h1 className="klol-app-title">내전·구인·랭킹</h1>
        <nav className="klol-app-subtabs" aria-label="모바일 플레이 탭">
          {tabItems.map((item) => (
            <Link href={item.href} key={item.key} data-active={activeTab === item.key}>
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      {activeTab === "matches" ? (
        <AppSection title="최근 내전" caption={`${matches.length}개`}>
          {matches.length === 0 ? (
            <AppEmpty>등록된 내전이 없습니다.</AppEmpty>
          ) : (
            <div className="klol-app-list">
              {matches.map((match) => (
                <Link className="klol-app-list-card" href={`/app/matches/${match.id}`} key={match.id}>
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{match.title}</strong>
                      <span>{dateFormatter.format(match.matchDate)} · {match.season?.name ?? "시즌 없음"}</span>
                    </div>
                    <span className="klol-app-badge klol-app-badge--warn">{winnerText(match.games)}</span>
                  </div>
                  <div className="klol-app-meta-grid klol-app-meta-grid--compact">
                    <div className="klol-app-meta">
                      <span>세트</span>
                      <strong>{match.games.length}세트</strong>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AppSection>
      ) : null}

      {activeTab === "recruits" ? (
        <PremiumFeatureGate feature="recruit" settings={siteSettings}>
          <AppSection title="구인 현황" caption={`${recruits.length}개`}>
            {recruits.length === 0 ? (
              <AppEmpty>현재 표시할 구인이 없습니다.</AppEmpty>
            ) : (
              <div className="klol-app-list">
                {recruits.map((party) => (
                  <Link className="klol-app-list-card" href="/app/recruits" key={party.id}>
                    <div className="klol-app-list-top">
                      <div className="klol-app-list-title">
                        <strong>#{party.recruitNo} · {party.title}</strong>
                        <span>{party.startTimeText || "시간 미정"} · {party.roomName || party.tierText || "게임 정보 미입력"}</span>
                      </div>
                      <span className="klol-app-badge">{recruitStatusText(party.status)}</span>
                    </div>
                    <div className="klol-app-meta-grid">
                      <div className="klol-app-meta">
                        <span>인원</span>
                        <strong>{party.members.length}/{party.maxMembers}</strong>
                      </div>
                      <div className="klol-app-meta">
                        <span>타입</span>
                        <strong>{party.type.replaceAll("_", " ")}</strong>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AppSection>
        </PremiumFeatureGate>
      ) : null}

      {activeTab === "rankings" ? (
        <AppSection title="시즌 랭킹" caption={season?.name}>
          {rankingStats.length === 0 ? (
            <AppEmpty>랭킹 데이터가 없습니다.</AppEmpty>
          ) : (
            <div className="klol-app-list">
              {rankingStats.map((stat, index) => (
                <Link className="klol-app-list-card klol-app-rank-row" href={`/app/players/${stat.player.id}`} key={stat.id}>
                  <span className="klol-app-rank-no" data-rank={index + 1}>{index + 1}</span>
                  <span className="klol-app-list-title">
                    <strong>{stat.player.name || stat.player.nickname}</strong>
                    <span>{stat.player.nickname}#{stat.player.tag}</span>
                  </span>
                  <span className="klol-app-stat-value">{formatWinRate(stat.wins, stat.totalGames)}</span>
                </Link>
              ))}
            </div>
          )}
        </AppSection>
      ) : null}

      {activeTab === "events" ? (
        <>
          <AppSection title="이벤트 내전" caption={`${events.length}개`}>
            {events.length === 0 ? (
              <AppEmpty>진행 중인 이벤트 내전이 없습니다.</AppEmpty>
            ) : (
              <div className="klol-app-list">
                {events.map((event) => (
                  <Link className="klol-app-list-card klol-app-event-card" href={`/app/progress/event/${event.id}`} key={`event-${event.id}`}>
                    <div className="klol-app-list-top">
                      <span className="klol-app-list-title">
                        <strong>{event.title}</strong>
                        <span>{dateFormatter.format(event.eventDate)} · {event._count.teams}팀 · {event._count.matches}경기</span>
                      </span>
                      <span className="klol-app-badge">{eventStatusText(event.status)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AppSection>

          <AppSection title="멸망전" caption={`${destructions.length}개`}>
            {destructions.length === 0 ? (
              <AppEmpty>진행 중인 멸망전이 없습니다.</AppEmpty>
            ) : (
              <div className="klol-app-list">
                {destructions.map((tournament) => (
                  <Link className="klol-app-list-card klol-app-event-card klol-app-event-card--destruction" href={`/app/progress/destruction/${tournament.id}`} key={`destruction-${tournament.id}`}>
                    <div className="klol-app-list-top">
                      <span className="klol-app-list-title">
                        <strong>{tournament.title}</strong>
                        <span>{tournament.startDate ? dateFormatter.format(tournament.startDate) : "일정 미정"} · {tournament._count.participants}명 · {tournament._count.teams}팀</span>
                      </span>
                      <span className="klol-app-badge klol-app-badge--warn">{eventStatusText(tournament.status)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </AppSection>
        </>
      ) : null}
    </AppMobileShell>
  );
}
