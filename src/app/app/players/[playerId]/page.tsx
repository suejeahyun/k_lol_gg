import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";
import { formatRiotPosition, formatRiotTier } from "@/lib/riot/player-analysis";

export const dynamic = "force-dynamic";

type AppPlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

function formatDate(value: string | number | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function getWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return 0;
  return Math.round((wins / totalGames) * 1000) / 10;
}

export default async function AppPlayerDetailPage({ params }: AppPlayerDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const currentSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  const player = await prisma.player.findFirst({
    where: { id, isActive: true },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
      currentTier: true,
      peakTier: true,
      createdAt: true,
      seasonStats: {
        where: currentSeason ? { seasonId: currentSeason.id } : undefined,
        take: 1,
        select: {
          totalGames: true,
          participationCount: true,
          wins: true,
          losses: true,
          mvpCount: true,
        },
      },
      championStats: {
        where: currentSeason ? { seasonId: currentSeason.id } : undefined,
        orderBy: [{ games: "desc" }, { wins: "desc" }],
        take: 5,
        select: {
          games: true,
          wins: true,
          mvpCount: true,
          champion: {
            select: {
              name: true,
            },
          },
        },
      },
      riotAccount: {
        select: {
          gameName: true,
          tagLine: true,
          lastSyncedAt: true,
          syncStatus: true,
        },
      },
      soloRankSnapshot: {
        select: {
          tier: true,
          rank: true,
          leaguePoints: true,
          wins: true,
          losses: true,
          winRate: true,
          updatedAt: true,
        },
      },
      soloMatches: {
        orderBy: { gameCreation: "desc" },
        take: 20,
        select: {
          championName: true,
          position: true,
          kills: true,
          deaths: true,
          assists: true,
          win: true,
          totalDamageDealtToChampions: true,
          visionScore: true,
        },
      },
      participants: {
        where: currentSeason
          ? {
              game: {
                series: {
                  seasonId: currentSeason.id,
                },
              },
            }
          : undefined,
        orderBy: {
          game: {
            series: {
              matchDate: "desc",
            },
          },
        },
        take: 10,
        select: {
          id: true,
          team: true,
          position: true,
          kills: true,
          deaths: true,
          assists: true,
          champion: {
            select: {
              name: true,
            },
          },
          game: {
            select: {
              id: true,
              gameNumber: true,
              winnerTeam: true,
              series: {
                select: {
                  id: true,
                  title: true,
                  matchDate: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const stat = player.seasonStats[0];
  const totalGames = stat?.totalGames ?? player.participants.length;
  const wins = stat?.wins ?? player.participants.filter((item) => item.game.winnerTeam === item.team).length;
  const losses = stat?.losses ?? Math.max(totalGames - wins, 0);
  const participationCount = stat?.participationCount ?? 0;
  const mvpCount = stat?.mvpCount ?? 0;
  const winRate = getWinRate(wins, totalGames);

  const soloMatches = player.soloMatches;
  const soloGames = soloMatches.length;
  const soloWins = soloMatches.filter((match) => match.win).length;
  const soloLosses = soloGames - soloWins;
  const soloWinRate = getWinRate(soloWins, soloGames);
  const soloKills = soloMatches.reduce((sum, match) => sum + match.kills, 0);
  const soloDeaths = soloMatches.reduce((sum, match) => sum + match.deaths, 0);
  const soloAssists = soloMatches.reduce((sum, match) => sum + match.assists, 0);
  const soloKda = soloDeaths <= 0
    ? Number((soloKills + soloAssists).toFixed(2))
    : Number(((soloKills + soloAssists) / soloDeaths).toFixed(2));
  const mainSoloPosition = Array.from(
    soloMatches
      .reduce((map, match) => {
        const key = match.position || "UNKNOWN";
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ).sort((a, b) => b[1] - a[1])[0] ?? null;
  const averageSoloDamage = soloGames > 0
    ? Math.round(soloMatches.reduce((sum, match) => sum + match.totalDamageDealtToChampions, 0) / soloGames)
    : 0;

  return (
    <AppMobileShell subtitle="플레이어 상세">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">PLAYER DETAIL</div>
        <h1 className="klol-app-title">{player.name}</h1>
        <p className="klol-app-subtitle">{player.nickname}#{player.tag}</p>
        <Link className="klol-app-secondary klol-app-full-link" href="/app/players">
          플레이어 목록으로
        </Link>
      </section>

      <AppSection title="프로필">
        <div className="klol-app-meta-grid klol-app-meta-grid--player-detail">
          <div className="klol-app-meta">
            <span>현재 티어</span>
            <strong>{player.currentTier ?? "미입력"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>최고 티어</span>
            <strong>{player.peakTier ?? "미입력"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>등록일</span>
            <strong>{formatDate(player.createdAt)}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="현재 시즌 기록" caption={currentSeason?.name ?? "활성 시즌 없음"}>
        <div className="klol-app-meta-grid klol-app-meta-grid--player-detail">
          <div className="klol-app-meta">
            <span>참여</span>
            <strong>{participationCount}회</strong>
          </div>
          <div className="klol-app-meta">
            <span>총 경기</span>
            <strong>{totalGames}경기</strong>
          </div>
          <div className="klol-app-meta">
            <span>승패</span>
            <strong>{wins}승 {losses}패</strong>
          </div>
          <div className="klol-app-meta">
            <span>승률</span>
            <strong>{winRate}%</strong>
          </div>
          <div className="klol-app-meta">
            <span>MVP</span>
            <strong>{mvpCount}회</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="Riot 솔랭 요약" caption={player.riotAccount ? `${player.riotAccount.gameName}#${player.riotAccount.tagLine}` : "Riot 미연동"}>
        <div className="klol-app-meta-grid klol-app-meta-grid--player-detail">
          <div className="klol-app-meta">
            <span>솔로랭크</span>
            <strong>
              {formatRiotTier(
                player.soloRankSnapshot?.tier,
                player.soloRankSnapshot?.rank,
                player.soloRankSnapshot?.leaguePoints,
              )}
            </strong>
          </div>
          <div className="klol-app-meta">
            <span>최근 승률</span>
            <strong>{soloWinRate}%</strong>
          </div>
          <div className="klol-app-meta">
            <span>최근 승패</span>
            <strong>{soloWins}승 {soloLosses}패</strong>
          </div>
          <div className="klol-app-meta">
            <span>최근 KDA</span>
            <strong>{soloKda}</strong>
          </div>
          <div className="klol-app-meta">
            <span>주 라인</span>
            <strong>{formatRiotPosition(mainSoloPosition?.[0])}</strong>
          </div>
          <div className="klol-app-meta">
            <span>평균 딜량</span>
            <strong>{averageSoloDamage.toLocaleString("ko-KR")}</strong>
          </div>
        </div>
        <p className="klol-app-muted" style={{ marginTop: 10 }}>
          Riot 데이터는 저장된 캐시 기준입니다. 실제 API 호출은 동기화 버튼 또는 관리자 동기화에서만 실행됩니다.
        </p>
        <Link className="klol-app-secondary klol-app-full-link" href={`/players/${player.id}/riot`}>
          PC Riot 상세 보기
        </Link>
      </AppSection>

      <AppSection title="주요 챔피언">
        <div className="klol-app-list">
          {player.championStats.length === 0 ? (
            <AppEmpty>챔피언 기록이 없습니다.</AppEmpty>
          ) : (
            player.championStats.map((item) => {
              const championWinRate = getWinRate(item.wins, item.games);
              return (
                <article key={item.champion.name} className="klol-app-list-card klol-app-plain-card">
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{item.champion.name}</strong>
                      <span>{item.wins}승 {item.games - item.wins}패 · MVP {item.mvpCount}회</span>
                    </div>
                    <span className="klol-app-badge">{item.games}회</span>
                  </div>
                  <p className="klol-app-muted">승률 {championWinRate}%</p>
                </article>
              );
            })
          )}
        </div>
      </AppSection>

      <AppSection title="최근 내전">
        <div className="klol-app-list">
          {player.participants.length === 0 ? (
            <AppEmpty>최근 내전 기록이 없습니다.</AppEmpty>
          ) : (
            player.participants.map((item) => {
              const isWin = item.game.winnerTeam === item.team;
              return (
                <Link key={item.id} href={`/app/matches/${item.game.series.id}`} className="klol-app-list-card klol-app-match-mini">
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{item.game.series.title}</strong>
                      <span>{formatDate(item.game.series.matchDate)} · 세트 {item.game.gameNumber}</span>
                    </div>
                    <span className={`klol-app-badge ${isWin ? "" : "klol-app-badge--warn"}`}>
                      {isWin ? "승리" : "패배"}
                    </span>
                  </div>
                  <div className="klol-app-player-kda">
                    <span>{item.position}</span>
                    <strong>{item.champion.name}</strong>
                    <b>{item.kills} / {item.deaths} / {item.assists}</b>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
