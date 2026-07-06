export const dynamic = "force-dynamic";


import Link from "next/link";
import SafeChampionImage from "@/components/SafeChampionImage";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import TierIcon from "@/components/TierIcon";
import SoloRankSection from "@/components/SoloRankSection";
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
          <Link className="btn btn-ghost" href="/me/riot">
            내 Riot 연동
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

      <section className="content-section player-panel">
        <div className="section-header section-header--split">
          <div>
            <h2>내전 분석</h2>
            <p className="section-subtitle">
              현재 시즌{currentSeason ? `(${currentSeason.name})` : ""} 내전 기록 기준 통계입니다.
            </p>
          </div>
        </div>

        <div className="card-grid player-stat-grid">
          <article className="stat-card">
            <span className="stat-card__label">참여 횟수</span>
            <strong className="stat-card__value">{participationCount}회</strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">총 경기</span>
            <strong className="stat-card__value">{totalGames}</strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">승 / 패</span>
            <strong className="stat-card__value">
              {wins}승 {losses}패
            </strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">승률</span>
            <strong className="stat-card__value">{winRate}%</strong>
          </article>

          <article className="stat-card">
            <span className="stat-card__label">MVP</span>
            <strong className="stat-card__value">{mvpCount}회</strong>
          </article>
        </div>
      </section>

      <section className="content-section player-panel champion-section">
        <div className="section-header section-header--split">
          <div>
            <h2>내전 사용 챔피언 통계</h2>
            <p className="section-subtitle">
              내전에서 사용한 챔피언별 픽 횟수와 승률입니다.
            </p>
          </div>
        </div>

        {championStats.length === 0 ? (
          <div className="empty-box">사용한 챔피언 기록이 없습니다.</div>
        ) : (
          <div className="champion-stat-grid">
            {championStats.map((champion) => {
              const championLosses = champion.games - champion.wins;
              const championWinRate = Math.round(
                (champion.wins / champion.games) * 100
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
                        {champion.wins}승 {championLosses}패 · MVP {champion.mvpCount}회
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
      </section>

      <SoloRankSection playerId={player.id} />

      <section className="content-section player-panel">
        <div className="section-header">
          <h2>내전 최근 기록</h2>
        </div>

        {player.participants.length === 0 ? (
          <div className="empty-box">등록된 내전 기록이 없습니다.</div>
        ) : (
          <div className="match-list">
            {player.participants.map((participant) => {
              const isWin = participant.game.winnerTeam === participant.team;

              return (
                <article
                  key={participant.id}
                  className={`match-card ${
                    isWin ? "match-card--win" : "match-card--loss"
                  }`}
                >
                  <div className="match-card__top">
                    <div>
                      <strong className="match-card__queue">
                        {participant.game.series.title}
                      </strong>
                      <p className="match-card__date">
                        {formatDateTime(participant.game.series.matchDate)}
                      </p>
                    </div>

                    <div className="match-card__result">
                      <span>{isWin ? "승리" : "패배"}</span>
                      <span>세트 {participant.game.gameNumber}</span>
                    </div>
                  </div>

                  <div className="match-card__body">
                    <div className="match-card__champion">
                      <strong>{participant.champion.name}</strong>
                      <span>{participant.position}</span>
                    </div>

                    <div className="match-card__score">
                      <strong>
                        {participant.kills} / {participant.deaths} /{" "}
                        {participant.assists}
                      </strong>
                      <span>팀 {participant.team}</span>
                    </div>

                    <div className="match-card__damage">
                      <span>시즌 {participant.game.series.season.name}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}