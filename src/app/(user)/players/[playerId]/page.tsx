import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import TierIcon from "@/components/TierIcon";

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

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      participants: {
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
            },
          },
        },
      },
    },
  });

  if (!player) {
    notFound();
  }

  const totalGames = player.participants.length;

  const wins = player.participants.filter(
    (participant) => participant.game.winnerTeam === participant.team
  ).length;

  const losses = totalGames - wins;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  const totalKills = player.participants.reduce(
    (sum, participant) => sum + participant.kills,
    0
  );

  const totalDeaths = player.participants.reduce(
    (sum, participant) => sum + participant.deaths,
    0
  );

  const totalAssists = player.participants.reduce(
    (sum, participant) => sum + participant.assists,
    0
  );

  const avgKda =
    totalGames > 0
      ? totalDeaths === 0
        ? "Perfect"
        : ((totalKills + totalAssists) / totalDeaths).toFixed(2)
      : "0.00";

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
        };

        prev.games += 1;
        prev.kills += participant.kills;
        prev.deaths += participant.deaths;
        prev.assists += participant.assists;

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
          <Link href="/players" className="btn btn-ghost">
            목록으로
          </Link>
        </div>
      </div>

      <section className="content-section player-panel">
        <div className="section-header">
          <h2>기본 정보</h2>
        </div>

        <div className="info-grid">
          <div className="info-card">
            <span className="info-card__label">이름</span>
            <strong className="info-card__value">{player.name}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">닉네임</span>
            <strong className="info-card__value">{player.nickname}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">태그</span>
            <strong className="info-card__value">{player.tag}</strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">최대 티어</span>
            <TierIcon tier={player.peakTier} size={26} showText />
          </div>

          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <TierIcon tier={player.currentTier} size={26} showText />
          </div>
        </div>
      </section>

      <section className="card-grid player-stat-grid">
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
          <span className="stat-card__label">평균 KDA</span>
          <strong className="stat-card__value">{avgKda}</strong>
        </article>
      </section>

      <section className="content-section player-panel champion-section">
        <div className="section-header section-header--split">
          <div>
            <h2>사용 챔피언 통계</h2>
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

              const championKda =
                champion.deaths === 0
                  ? "Perfect"
                  : ((champion.kills + champion.assists) / champion.deaths).toFixed(
                      2
                    );

              return (
                <article
                  key={champion.championId}
                  className="champion-stat-card"
                >
                  <div className="champion-stat-card__main">
                    {champion.imageUrl ? (
                      <Image
                        src={champion.imageUrl}
                        alt={champion.championName}
                        width={52}
                        height={52}
                        className="champion-stat-card__image"
                      />
                    ) : (
                      <div className="champion-stat-card__image champion-stat-card__image--empty" />
                    )}

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
      </section>

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