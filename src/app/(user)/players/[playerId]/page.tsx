import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma/client";

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
            <strong className="info-card__value">
              {player.peakTier ?? "-"}
            </strong>
          </div>

          <div className="info-card">
            <span className="info-card__label">현재 티어</span>
            <strong className="info-card__value">
              {player.currentTier ?? "-"}
            </strong>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-header">
          <h2>최근 경기</h2>
        </div>

        {player.participants.length === 0 ? (
          <div className="empty-state">아직 등록된 경기 데이터가 없습니다.</div>
        ) : (
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>시즌</th>
                  <th>내전명</th>
                  <th>세트</th>
                  <th>팀</th>
                  <th>포지션</th>
                  <th>챔피언</th>
                  <th>K / D / A</th>
                  <th>CS</th>
                  <th>골드</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {player.participants.slice(0, 10).map((participant) => {
                  const isWin = participant.game.winnerTeam === participant.team;

                  return (
                    <tr key={participant.id}>
                      <td>{formatDateTime(participant.game.series.matchDate)}</td>
                      <td>{participant.game.series.season.name}</td>
                      <td>{participant.game.series.title}</td>
                      <td>{participant.game.gameNumber}세트</td>
                      <td>{participant.team}</td>
                      <td>{participant.position}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <Image
                            src={participant.champion.imageUrl}
                            alt={participant.champion.name}
                            width={28}
                            height={28}
                            style={{ borderRadius: 6 }}
                          />
                          <span>{participant.champion.name}</span>
                        </div>
                      </td>
                      <td>
                        {participant.kills} / {participant.deaths} /{" "}
                        {participant.assists}
                      </td>
                      <td>{participant.cs}</td>
                      <td>{participant.gold}</td>
                      <td>{isWin ? "승" : "패"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}