import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";

type PlayerDetailPageProps = {
  params: Promise<{
    playerId: string;
  }>;
  searchParams: Promise<{
    recentPage?: string;
  }>;
};

const PAGE_SIZE = 10;

export default async function PlayerDetailPage({
  params,
  searchParams,
}: PlayerDetailPageProps) {
  const { playerId: playerIdParam } = await params;
  const { recentPage: recentPageParam } = await searchParams;

  const playerId = Number(playerIdParam);
  const recentPage = Math.max(1, Number(recentPageParam ?? "1") || 1);

  if (Number.isNaN(playerId)) {
    throw new Error("Invalid playerId");
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      name: true,
      nickname: true,
      tag: true,
    },
  });

  if (!player) {
    throw new Error("Player not found");
  }

  const summaryRecords = await prisma.matchParticipant.findMany({
    where: {
      playerId,
    },
    select: {
      kills: true,
      deaths: true,
      assists: true,
      gold: true,
      team: true,
      championId: true,
      game: {
        select: {
          winnerTeam: true,
        },
      },
    },
  });

  const totalGames = summaryRecords.length;
  const wins = summaryRecords.filter(
    (record) => record.team === record.game.winnerTeam
  ).length;
  const losses = totalGames - wins;

  const totalKills = summaryRecords.reduce((sum, record) => sum + record.kills, 0);
  const totalDeaths = summaryRecords.reduce((sum, record) => sum + record.deaths, 0);
  const totalAssists = summaryRecords.reduce((sum, record) => sum + record.assists, 0);
  const totalGold = summaryRecords.reduce((sum, record) => sum + record.gold, 0);

  const winRate =
    totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;

  const kda =
    totalDeaths === 0
      ? Number((totalKills + totalAssists).toFixed(2))
      : Number(((totalKills + totalAssists) / totalDeaths).toFixed(2));

  const avgGold = totalGames > 0 ? Math.round(totalGold / totalGames) : 0;

  const mostChampionsRaw = await prisma.matchParticipant.groupBy({
    by: ["championId"],
    where: {
      playerId,
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
    take: 3,
  });

  const championIds = mostChampionsRaw.map((item) => item.championId);

  const champions = championIds.length
    ? await prisma.champion.findMany({
        where: {
          id: {
            in: championIds,
          },
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      })
    : [];

  const championMap = new Map(champions.map((champion) => [champion.id, champion]));

  const mostChampions = mostChampionsRaw.map((item) => {
    const champion = championMap.get(item.championId);
    const games = item._count.championId;
    const kills = item._sum.kills ?? 0;
    const deaths = item._sum.deaths ?? 0;
    const assists = item._sum.assists ?? 0;
    const championKda =
      deaths === 0
        ? Number((kills + assists).toFixed(2))
        : Number(((kills + assists) / deaths).toFixed(2));

    return {
      championId: item.championId,
      championName: champion?.name ?? "Unknown",
      games,
      kda: championKda,
    };
  });

  const totalRecentCount = await prisma.matchParticipant.count({
    where: {
      playerId,
    },
  });

  const recentRecords = await prisma.matchParticipant.findMany({
    where: {
      playerId,
    },
    orderBy: [
      {
        game: {
          series: {
            matchDate: "desc",
          },
        },
      },
      {
        game: {
          gameNumber: "desc",
        },
      },
    ],
    skip: (recentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      team: true,
      position: true,
      kills: true,
      deaths: true,
      assists: true,
      cs: true,
      gold: true,
      champion: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
      game: {
        select: {
          id: true,
          gameNumber: true,
          winnerTeam: true,
          durationMin: true,
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
  });

  const recentMatches = recentRecords.map((record) => ({
    id: record.id,
    matchId: record.game.series.id,
    matchTitle: record.game.series.title,
    matchDate: record.game.series.matchDate,
    gameId: record.game.id,
    gameNumber: record.game.gameNumber,
    durationMin: record.game.durationMin,
    team: record.team,
    position: record.position,
    result: record.team === record.game.winnerTeam ? "WIN" : "LOSE",
    kills: record.kills,
    deaths: record.deaths,
    assists: record.assists,
    cs: record.cs,
    gold: record.gold,
    champion: record.champion,
  }));

  const totalPages = Math.ceil(totalRecentCount / PAGE_SIZE);

  return (
    <main className="page-container">
      <h1 className="page-title">플레이어 상세</h1>

      <div className="detail-header-card">
        <div className="detail-header-grid">
          <div className="detail-header-label">이름</div>
          <div className="detail-header-value">{player.name}</div>
          <div className="detail-header-label">닉네임#태그</div>
          <div className="detail-header-value">
            {player.nickname}#{player.tag}
          </div>
        </div>
      </div>

      <section className="section-block">
        <div className="detail-board">
          <div className="detail-board__title">요약 통계</div>

          <div className="summary-table-header">
            <div>총 경기</div>
            <div>승</div>
            <div>패</div>
            <div>승률</div>
            <div>KDA</div>
            <div>평균 골드</div>
          </div>

          <div className="summary-table-row">
            <div>{totalGames}</div>
            <div>{wins}</div>
            <div>{losses}</div>
            <div>{winRate}%</div>
            <div>{kda}</div>
            <div>{avgGold}</div>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="detail-board">
          <div className="detail-board__title">모스트 챔피언 TOP 3</div>

          {mostChampions.length === 0 ? (
            <p>데이터가 없습니다.</p>
          ) : (
            <>
              <div className="most-table-header">
                <div>순위</div>
                <div>챔피언</div>
                <div>판수</div>
                <div>KDA</div>
              </div>

              <div className="card-grid">
                {mostChampions.map((champion, index) => (
                  <div key={champion.championId} className="most-table-row">
                    <div>{index + 1}</div>
                    <div>{champion.championName}</div>
                    <div>{champion.games}</div>
                    <div>{champion.kda}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section-block">
        <div className="detail-board">
          <div className="detail-board__title">최근 내전 기록</div>

          {recentMatches.length === 0 ? (
            <p>기록이 없습니다.</p>
          ) : (
            <>
              <div className="recent-table-header">
                <div>날짜</div>
                <div>내전명</div>
                <div>세트</div>
                <div>챔피언</div>
                <div>결과</div>
                <div>포지션</div>
                <div>KDA</div>
                <div>CS</div>
                <div>골드</div>
              </div>

              <div className="card-grid">
                {recentMatches.map((g) => (
                  <div key={g.id} className="recent-table-row">
                    <div>{new Date(g.matchDate).toLocaleDateString("ko-KR")}</div>
                    <div>{g.matchTitle}</div>
                    <div>{g.gameNumber}</div>
                    <div>{g.champion.name}</div>
                    <div>{g.result}</div>
                    <div>{g.position}</div>
                    <div>
                      {g.kills}/{g.deaths}/{g.assists}
                    </div>
                    <div>{g.cs}</div>
                    <div>{g.gold}</div>
                  </div>
                ))}
              </div>

              <Pagination
                currentPage={recentPage}
                totalPages={totalPages}
                basePath={`/players/${playerId}`}
                pageParamName="recentPage"
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}