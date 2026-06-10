import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppRankingsPage() {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
  });

  const stats = season
    ? await prisma.playerSeasonStat.findMany({
        where: { seasonId: season.id, participationCount: { gte: 1 } },
        include: { player: true },
        orderBy: [{ wins: "desc" }, { mvpCount: "desc" }, { totalGames: "desc" }],
        take: 20,
      })
    : [];

  const sorted = [...stats].sort((a, b) => {
    const awr = a.totalGames ? a.wins / a.totalGames : 0;
    const bwr = b.totalGames ? b.wins / b.totalGames : 0;
    if (bwr !== awr) return bwr - awr;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.mvpCount - a.mvpCount;
  });

  return (
    <AppMobileShell subtitle="시즌 랭킹">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">RANKING</div>
        <h1 className="klol-app-title">랭킹</h1>
        <p className="klol-app-subtitle">{season ? season.name : "활성 시즌 없음"}</p>
        <div className="klol-app-actions">
          <a className="klol-app-primary" href="/rankings">상세 랭킹</a>
          <a className="klol-app-secondary" href="/players">플레이어 검색</a>
        </div>
      </section>

      <AppSection title="상위 20명" caption="승률 우선">
        {sorted.length === 0 ? (
          <AppEmpty>표시할 랭킹 데이터가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {sorted.map((stat, index) => {
              const winRate = stat.totalGames ? Math.round((stat.wins / stat.totalGames) * 1000) / 10 : 0;
              return (
                <a className="klol-app-list-card klol-app-rank-row" href={`/players/${stat.playerId}`} key={stat.id}>
                  <span className="klol-app-rank-no">{index + 1}</span>
                  <span className="klol-app-list-title">
                    <strong>{stat.player.name || stat.player.nickname}</strong>
                    <span>{stat.player.nickname}#{stat.player.tag}</span>
                  </span>
                  <span className="klol-app-stat-value">{winRate}%</span>
                </a>
              );
            })}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
