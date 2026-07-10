import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

type AppRankingStat = {
  id: number;
  totalGames: number;
  participationCount: number;
  wins: number;
  losses: number;
  mvpCount: number;
  player: {
    id: number;
    name: string;
    nickname: string;
    tag: string;
  };
};

function formatWinRate(stat: AppRankingStat) {
  const games = stat.totalGames || stat.wins + stat.losses;
  if (!games) return "0%";
  const value = Math.round((stat.wins / games) * 1000) / 10;
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function getPlayerName(stat: AppRankingStat) {
  return stat.player.name || stat.player.nickname || "미입력";
}

function RankingMiniList({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: AppRankingStat[];
  metric: (stat: AppRankingStat) => string;
}) {
  return (
    <AppSection title={title}>
      {rows.length === 0 ? (
        <AppEmpty>표시할 데이터가 없습니다.</AppEmpty>
      ) : (
        <div className="klol-app-list">
          {rows.map((stat, index) => (
            <Link className="klol-app-list-card klol-app-rank-row" href={`/app/players/${stat.player.id}`} key={`${title}-${stat.id}`}>
              <span className="klol-app-rank-no" data-rank={index + 1}>{index + 1}</span>
              <span className="klol-app-list-title">
                <strong>{getPlayerName(stat)}</strong>
                <span>{stat.player.nickname}#{stat.player.tag}</span>
              </span>
              <span className="klol-app-stat-value">{metric(stat)}</span>
            </Link>
          ))}
        </div>
      )}
    </AppSection>
  );
}

export default async function AppRankingsPage() {
  const season = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
  });

  const stats = season
    ? await prisma.playerSeasonStat.findMany({
        where: { seasonId: season.id, participationCount: { gte: 10 } },
        include: { player: true },
      })
    : [];

  const topWinRate = [...stats]
    .sort((a, b) => {
      const ag = a.totalGames || a.wins + a.losses;
      const bg = b.totalGames || b.wins + b.losses;
      const awr = ag ? a.wins / ag : 0;
      const bwr = bg ? b.wins / bg : 0;
      return bwr - awr || b.participationCount - a.participationCount || b.mvpCount - a.mvpCount;
    })
    .slice(0, 3);

  const topParticipation = [...stats]
    .sort((a, b) => b.participationCount - a.participationCount || b.wins - a.wins || b.mvpCount - a.mvpCount)
    .slice(0, 3);

  const topMvp = [...stats]
    .sort((a, b) => b.mvpCount - a.mvpCount || b.participationCount - a.participationCount || b.wins - a.wins)
    .slice(0, 3);

  const overall = [...stats]
    .sort((a, b) => b.wins - a.wins || b.participationCount - a.participationCount || b.mvpCount - a.mvpCount)
    .slice(0, 30);

  return (
    <AppMobileShell subtitle="시즌 랭킹">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">RANKING</div>
        <h1 className="klol-app-title">랭킹 TOP 3</h1>
      </section>

      <RankingMiniList title="승률 TOP 3" rows={topWinRate} metric={(stat) => `${formatWinRate(stat)} · ${stat.participationCount}회`} />
      <RankingMiniList title="최다참여 TOP 3" rows={topParticipation} metric={(stat) => `${stat.participationCount}회`} />
      <RankingMiniList title="MVP TOP 3" rows={topMvp} metric={(stat) => `${stat.mvpCount}회`} />

      <AppSection title="전체 랭킹" caption={season?.name}>
        {overall.length === 0 ? (
          <AppEmpty>랭킹 데이터가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {overall.map((stat, index) => (
              <Link className="klol-app-list-card klol-app-rank-row" href={`/app/players/${stat.player.id}`} key={`overall-${stat.id}`}>
                <span className="klol-app-rank-no" data-rank={index + 1}>{index + 1}</span>
                <span className="klol-app-list-title">
                  <strong>{getPlayerName(stat)}</strong>
                  <span>{stat.player.nickname}#{stat.player.tag}</span>
                </span>
                <span className="klol-app-stat-value">{stat.wins}승</span>
              </Link>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
