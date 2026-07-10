export const dynamic = "force-dynamic";


import Link from "next/link";
import SafeChampionImage from "@/components/SafeChampionImage";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import TierIcon from "@/components/TierIcon";
import SoloRankSection from "@/components/SoloRankSection";
import PlayerAnalysisTabs from "@/components/PlayerAnalysisTabs";
import { getGameMvpParticipant } from "@/lib/mvp";
import { ensureSeasonStats, getWinRate } from "@/lib/stats/season-performance";

type PlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
};

function formatDateTime(value: string | number | Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

const POSITION_ORDER = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

const POSITION_LABELS: Record<(typeof POSITION_ORDER)[number], string> = {
  TOP: "TOP",
  JGL: "JGL",
  MID: "MID",
  ADC: "ADC",
  SUP: "SUP",
};

function formatKdaValue(kills: number, deaths: number, assists: number) {
  if (kills + deaths + assists === 0) {
    return "0.00";
  }

  if (deaths === 0) {
    return (kills + assists).toFixed(2);
  }

  return ((kills + assists) / deaths).toFixed(2);
}

function getRadarPoint(index: number, ratio: number) {
  const center = 110;
  const radius = 82;
  const angle = (-90 + index * 72) * (Math.PI / 180);

  return {
    x: center + Math.cos(angle) * radius * ratio,
    y: center + Math.sin(angle) * radius * ratio,
  };
}

function getRadarPolygonPoints(values: number[]) {
  return values
    .map((value, index) => {
      const point = getRadarPoint(index, value);

      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");
}

export default async function PlayerDetailPage({
  params,
}: PlayerDetailPageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (!Number.isInteger(id)) {
    notFound();
  }

  const currentSeason = await prisma.season.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });

  if (currentSeason) {
    await ensureSeasonStats(currentSeason.id);
  }

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      seasonStats: {
        where: { seasonId: currentSeason?.id ?? -1 },
        select: {
          totalGames: true,
          participationCount: true,
          wins: true,
          losses: true,
          mvpCount: true,
        },
        take: 1,
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
          : { id: -1 },
        orderBy: {
          game: {
            series: {
              matchDate: "desc",
            },
          },
        },
        include: {
          champion: true,
          game: {
            include: {
              series: {
                include: {
                  season: true,
                },
              },
              participants: {
                select: {
                  playerId: true,
                  kills: true,
                  deaths: true,
                  assists: true,
                  team: true,
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

  const seasonStat = player.seasonStats[0] ?? null;
  const totalGames = seasonStat?.totalGames ?? player.participants.length;
  const participationCount = seasonStat?.participationCount ?? 0;
  const wins = seasonStat?.wins ?? player.participants.filter(
    (participant) => participant.game.winnerTeam === participant.team
  ).length;

  const losses = seasonStat?.losses ?? totalGames - wins;
  const winRate = getWinRate(wins, totalGames);

  const getMvpPlayerId = (participant: (typeof player.participants)[number]) => {
    if (participant.game.mvpPlayerId) return participant.game.mvpPlayerId;

    const mvp = getGameMvpParticipant(
      participant.game.participants,
      participant.game.winnerTeam,
    );

    return mvp?.playerId ?? null;
  };

  const mvpCount = seasonStat?.mvpCount ?? player.participants.filter((participant) => {
    return getMvpPlayerId(participant) === player.id;
  }).length;

  const championStats = Array.from(
    player.participants
      .reduce((map, participant) => {
        const championId = participant.champion.id;
        const isWin = participant.game.winnerTeam === participant.team;

        const prev = map.get(championId) ?? {
          championId,
          championName: participant.champion.name,
          imageUrl: participant.champion.imageUrl,
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          mvpCount: 0,
        };

        prev.games += 1;
        prev.kills += participant.kills;
        prev.deaths += participant.deaths;
        prev.assists += participant.assists;

        if (getMvpPlayerId(participant) === player.id) {
          prev.mvpCount += 1;
        }

        if (isWin) {
          prev.wins += 1;
        }

        map.set(championId, prev);
        return map;
      }, new Map<
        number,
        {
          championId: number;
          championName: string;
          imageUrl: string | null;
          games: number;
          wins: number;
          kills: number;
          deaths: number;
          assists: number;
          mvpCount: number;
        }
      >())
      .values()
  ).sort((a, b) => b.games - a.games || b.wins - a.wins);

  const totalKills = player.participants.reduce(
    (sum, participant) => sum + participant.kills,
    0,
  );
  const totalDeaths = player.participants.reduce(
    (sum, participant) => sum + participant.deaths,
    0,
  );
  const totalAssists = player.participants.reduce(
    (sum, participant) => sum + participant.assists,
    0,
  );
  const averageKda = formatKdaValue(totalKills, totalDeaths, totalAssists);
  const topChampionStats = championStats.slice(0, 6);
  const recentParticipants = player.participants.slice(0, 8);
  const positionTotal = player.participants.length;
  const positionStats = POSITION_ORDER.map((position) => {
    const positionParticipants = player.participants.filter(
      (participant) => participant.position === position,
    );
    const positionWins = positionParticipants.filter(
      (participant) => participant.game.winnerTeam === participant.team,
    ).length;
    const games = positionParticipants.length;
    const share = positionTotal > 0 ? Math.round((games / positionTotal) * 100) : 0;

    return {
      position,
      label: POSITION_LABELS[position],
      games,
      wins: positionWins,
      winRate: games > 0 ? Math.round((positionWins / games) * 100) : 0,
      share,
    };
  });
  const maxPositionGames = Math.max(
    ...positionStats.map((stat) => stat.games),
    1,
  );
  const radarGuidePoints = [0.25, 0.5, 0.75, 1].map((ratio) =>
    getRadarPolygonPoints(POSITION_ORDER.map(() => ratio)),
  );
  const radarShapePoints = getRadarPolygonPoints(
    positionStats.map((stat) => {
      if (stat.games <= 0) {
        return 0;
      }

      return Math.max(0.12, stat.games / maxPositionGames);
    }),
  );
  const radarLabelPoints = POSITION_ORDER.map((_, index) =>
    getRadarPoint(index, 1.22),
  );
  const radarDotPoints = positionStats.map((stat, index) =>
    getRadarPoint(
      index,
      stat.games <= 0 ? 0 : Math.max(0.12, stat.games / maxPositionGames),
    ),
  );

  return (
    <div className="page-shell player-detail-page">
      <div className="page-header player-hero">
        <div>
          <p className="page-eyebrow">플레이어 상세</p>
          <h1 className="page-title">
            {player.name} ({player.nickname}#{player.tag})
          </h1>
          <p className="page-description">
            등록일: {formatDateTime(player.createdAt)}
          </p>
        </div>

        <div className="page-actions">
          <Link className="btn btn-primary" href={`/players/${player.id}/riot`}>
            Riot 솔랭 상세
          </Link>
        </div>
      </div>

      <section className="content-section player-panel">
        <div className="section-header">
          <h2>프로필 카드</h2>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <span className="info-card__label">이름</span>
            <strong className="info-card__value">{player.name}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">닉네임#태그</span>
            <strong className="info-card__value">
              {player.nickname}#{player.tag}
            </strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <TierIcon tier={player.currentTier} size={26} showText />
          </div>

          <div className="info-card">
            <span className="info-card__label">최고 티어</span>
            <TierIcon tier={player.peakTier} size={26} showText />
          </div>
        </div>
      </section>

      <PlayerAnalysisTabs
        civilMeta={`${participationCount}회 · 승률 ${winRate}%`}
        soloMeta="Riot API 솔랭"
        solo={<SoloRankSection playerId={player.id} />}
        civil={
          <div className="civil-analysis-stack">
            <div className="civil-analysis-grid">
              <article className="civil-radar-card">
                <div className="section-header section-header--split">
                  <div>
                    <p className="section-kicker">POSITION MAP</p>
                    <h3>라인별 출전 분포</h3>
                    <p className="section-subtitle">
                      현재 시즌{currentSeason ? ` ${currentSeason.name}` : ""} 기준입니다.
                    </p>
                  </div>
                </div>

                <div className="position-radar-layout">
                  <div className="position-radar">
                    <svg viewBox="0 0 220 220" aria-hidden="true">
                      {radarGuidePoints.map((points, index) => (
                        <polygon
                          key={points}
                          points={points}
                          className={`position-radar__guide position-radar__guide--${index + 1}`}
                        />
                      ))}
                      {POSITION_ORDER.map((_, index) => {
                        const point = getRadarPoint(index, 1);

                        return (
                          <line
                            key={`axis-${index}`}
                            x1="110"
                            y1="110"
                            x2={point.x}
                            y2={point.y}
                            className="position-radar__axis"
                          />
                        );
                      })}
                      <polygon
                        points={radarShapePoints}
                        className="position-radar__shape"
                      />
                      {radarDotPoints.map((point, index) => (
                        <circle
                          key={`dot-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          className="position-radar__dot"
                        />
                      ))}
                      {radarLabelPoints.map((point, index) => (
                        <text
                          key={`label-${POSITION_ORDER[index]}`}
                          x={point.x}
                          y={point.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="position-radar__label"
                        >
                          {POSITION_ORDER[index]}
                        </text>
                      ))}
                    </svg>
                  </div>

                  <div className="civil-line-list">
                    {positionStats.map((stat) => (
                      <div key={stat.position} className="civil-line-row">
                        <div className="civil-line-row__top">
                          <strong>{stat.label}</strong>
                          <span>
                            {stat.games}회 · 승률 {stat.winRate}%
                          </span>
                        </div>
                        <div className="civil-line-row__bar">
                          <span style={{ width: `${stat.share}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="civil-kpi-board">
                <div className="section-header section-header--split">
                  <div>
                    <p className="section-kicker">CIVIL WAR STATS</p>
                    <h3>내전 핵심 지표</h3>
                  </div>
                </div>

                <div className="civil-metric-grid">
                  <article>
                    <span>참여 횟수</span>
                    <strong>{participationCount}회</strong>
                  </article>
                  <article>
                    <span>총 경기</span>
                    <strong>{totalGames}</strong>
                  </article>
                  <article>
                    <span>승 / 패</span>
                    <strong>
                      {wins}승 {losses}패
                    </strong>
                  </article>
                  <article>
                    <span>승률</span>
                    <strong>{winRate}%</strong>
                  </article>
                  <article>
                    <span>평균 KDA</span>
                    <strong>{averageKda}</strong>
                  </article>
                  <article>
                    <span>MVP</span>
                    <strong>{mvpCount}회</strong>
                  </article>
                </div>
              </article>
            </div>

            <div className="civil-detail-grid">
              <article className="civil-mini-panel">
                <div className="section-header section-header--split">
                  <div>
                    <p className="section-kicker">CHAMPION POOL</p>
                    <h3>내전 챔피언 TOP 6</h3>
                  </div>
                </div>

                {topChampionStats.length === 0 ? (
                  <div className="empty-box">사용한 챔피언 기록이 없습니다.</div>
                ) : (
                  <div className="champion-stat-grid champion-stat-grid--compact">
                    {topChampionStats.map((champion) => {
                      const championLosses = champion.games - champion.wins;
                      const championWinRate = Math.round(
                        (champion.wins / champion.games) * 100,
                      );
                      const championKda = formatKdaValue(
                        champion.kills,
                        champion.deaths,
                        champion.assists,
                      );

                      return (
                        <article
                          key={champion.championId}
                          className="champion-stat-card"
                        >
                          <div className="champion-stat-card__main">
                            <SafeChampionImage
                              src={champion.imageUrl}
                              alt={champion.championName}
                              width={52}
                              height={52}
                              className="champion-stat-card__image"
                              fallbackClassName="champion-stat-card__image champion-stat-card__image--empty"
                            />

                            <div className="champion-stat-card__text">
                              <strong>{champion.championName}</strong>
                              <span>
                                {champion.wins}승 {championLosses}패 · KDA {championKda}
                              </span>
                            </div>
                          </div>

                          <div className="champion-stat-card__numbers">
                            <strong>{champion.games}회</strong>
                            <span>승률 {championWinRate}%</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="civil-mini-panel">
                <div className="section-header section-header--split">
                  <div>
                    <p className="section-kicker">RECENT HISTORY</p>
                    <h3>내전 최근 기록</h3>
                  </div>
                  <Link className="btn btn-ghost btn-sm" href="/matches">
                    전체 보기
                  </Link>
                </div>

                {recentParticipants.length === 0 ? (
                  <div className="empty-box">등록된 내전 기록이 없습니다.</div>
                ) : (
                  <div className="civil-recent-list">
                    {recentParticipants.map((participant) => {
                      const isWin = participant.game.winnerTeam === participant.team;

                      return (
                        <Link
                          key={participant.id}
                          href={`/matches/${participant.game.series.id}`}
                          className={`civil-recent-row ${
                            isWin ? "civil-recent-row--win" : "civil-recent-row--loss"
                          }`}
                        >
                          <SafeChampionImage
                            src={participant.champion.imageUrl}
                            alt={participant.champion.name}
                            width={38}
                            height={38}
                            className="civil-recent-row__champion"
                            fallbackClassName="civil-recent-row__champion civil-recent-row__champion--empty"
                          />
                          <div className="civil-recent-row__main">
                            <strong>{participant.game.series.title}</strong>
                            <span>
                              {participant.position} · {formatDateTime(participant.game.series.matchDate)}
                            </span>
                          </div>
                          <div className="civil-recent-row__score">
                            <strong>
                              {participant.kills}/{participant.deaths}/{participant.assists}
                            </strong>
                            <span>{isWin ? "WIN" : "LOSS"} · 세트 {participant.game.gameNumber}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>
          </div>
        }
      />
    </div>
  );
}
