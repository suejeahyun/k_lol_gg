import Link from "next/link";
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

  return (
    <div className="page-shell">
      <div className="page-header">
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

      <section className="card-grid">
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

      <section className="content-section">
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
            <TierIcon tier={player.currentTier} size={26} showText />
          </div>

          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <TierIcon tier={player.currentTier} size={26} showText />
          </div>
        </div>
      </section>

      <section className="content-section">
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