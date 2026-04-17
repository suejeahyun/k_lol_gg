import Link from "next/link";
import { prisma } from "@/lib/prisma/client";

type PageProps = {
  params: Promise<{ playerId: string }>;
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

export default async function PlayerDetailPage({ params }: PageProps) {
  const { playerId } = await params;
  const id = Number(playerId);

  if (Number.isNaN(id)) {
    throw new Error("Invalid playerId");
  }

  const player = await prisma.player.findUnique({
    where: { id },
  });

  if (!player) {
    throw new Error("Player not found");
  }

  const summaryRecords = await prisma.matchParticipant.findMany({
    where: {
      playerId: id,
    },
    include: {
      game: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  const totalGames = summaryRecords.length;

  const wins = summaryRecords.filter(
    (record: (typeof summaryRecords)[number]) =>
      record.team === record.game.winnerTeam
  ).length;

  const losses = totalGames - wins;

  const totalKills = summaryRecords.reduce(
    (sum: number, record: (typeof summaryRecords)[number]) => sum + record.kills,
    0
  );

  const totalDeaths = summaryRecords.reduce(
    (sum: number, record: (typeof summaryRecords)[number]) =>
      sum + record.deaths,
    0
  );

  const totalAssists = summaryRecords.reduce(
    (sum: number, record: (typeof summaryRecords)[number]) =>
      sum + record.assists,
    0
  );

  const totalGold = summaryRecords.reduce(
    (sum: number, record: (typeof summaryRecords)[number]) => sum + record.gold,
    0
  );

  const winRate =
    totalGames === 0 ? 0 : Number(((wins / totalGames) * 100).toFixed(1));

  const kda =
    totalDeaths === 0
      ? totalKills + totalAssists
      : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

  const avgGold =
    totalGames === 0 ? 0 : Math.round(totalGold / totalGames);

  const mostChampionsRaw = await prisma.matchParticipant.groupBy({
    by: ["championId"],
    where: {
      playerId: id,
    },
    _count: {
      championId: true,
    },
    _sum: {
      kills: true,
      deaths: true,
      assists: true,
    },
    orderBy: {
      _count: {
        championId: "desc",
      },
    },
    take: 5,
  });

  const championIds = mostChampionsRaw.map(
    (item: (typeof mostChampionsRaw)[number]) => item.championId
  );

  const champions = await prisma.champion.findMany({
    where: {
      id: {
        in: championIds,
      },
    },
  });

  const championMap = new Map(
    champions.map((champion: (typeof champions)[number]) => [
      champion.id,
      champion,
    ])
  );

  const mostChampions = mostChampionsRaw.map(
    (item: (typeof mostChampionsRaw)[number]) => {
      const champion = championMap.get(item.championId);
      const games = item._count.championId;
      const kills = item._sum.kills ?? 0;
      const deaths = item._sum.deaths ?? 0;
      const assists = item._sum.assists ?? 0;

      const championKda =
        deaths === 0
          ? kills + assists
          : Number(((kills + assists) / deaths).toFixed(2));

      return {
        championId: item.championId,
        championName: champion?.name ?? "알 수 없음",
        imageUrl: champion?.imageUrl ?? "",
        games,
        kills,
        deaths,
        assists,
        kda: championKda,
      };
    }
  );

  const recentRecords = await prisma.matchParticipant.findMany({
    where: {
      playerId: id,
    },
    include: {
      champion: true,
      game: {
        include: {
          series: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
    take: 10,
  });

  const recentMatches = recentRecords.map(
    (record: (typeof recentRecords)[number]) => ({
      id: record.id,
      matchId: record.game.series.id,
      matchTitle: record.game.series.title,
      matchDate: record.game.series.matchDate,
      gameId: record.game.id,
      gameNumber: record.game.gameNumber,
      durationMin: record.game.durationMin,
      team: record.team,
      result: record.team === record.game.winnerTeam ? "WIN" : "LOSE",
      position: record.position,
      championName: record.champion.name,
      championImageUrl: record.champion.imageUrl,
      kills: record.kills,
      deaths: record.deaths,
      assists: record.assists,
      cs: record.cs,
      gold: record.gold,
    })
  );

  return (
    <main className="page-container">
      <h1 className="page-title">
        {player.name} / {player.nickname}#{player.tag}
      </h1>

      <section className="detail-board">
        <div className="detail-board__title">요약 통계</div>
        <div className="detail-header-grid">
          <div className="detail-header-label">총 경기</div>
          <div className="detail-header-value">{totalGames}</div>

          <div className="detail-header-label">승 / 패</div>
          <div className="detail-header-value">
            {wins}승 {losses}패
          </div>

          <div className="detail-header-label">승률</div>
          <div className="detail-header-value">{winRate}%</div>

          <div className="detail-header-label">KDA</div>
          <div className="detail-header-value">{kda}</div>

          <div className="detail-header-label">평균 골드</div>
          <div className="detail-header-value">{avgGold}</div>
        </div>
      </section>

      <section className="detail-board">
        <div className="detail-board__title">많이 한 챔피언</div>
        <div className="card-grid">
          {mostChampions.map((champion: (typeof mostChampions)[number], index: number) => (
            <div key={`${champion.championId}-${index}`} className="match-detail-row">
              <div>{champion.championName}</div>
              <div>{champion.games}판</div>
              <div>
                {champion.kills}/{champion.deaths}/{champion.assists}
              </div>
              <div>KDA {champion.kda}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-board">
        <div className="detail-board__title">최근 경기</div>
        <div className="card-grid">
          {recentMatches.map((g: (typeof recentMatches)[number]) => (
            <Link
              key={g.id}
              href={`/matches/${g.matchId}`}
              className="match-detail-row"
            >
              <div>{g.matchTitle}</div>
              <div>{formatDate(g.matchDate)}</div>
              <div>{g.gameNumber}세트</div>
              <div>{g.position}</div>
              <div>{g.championName}</div>
              <div>{g.result}</div>
              <div>
                {g.kills}/{g.deaths}/{g.assists}
              </div>
              <div>{g.cs}</div>
              <div>{g.gold}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}