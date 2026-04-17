import Pagination from "@/components/Pagination";

type PlayerSummary = {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgGold: number;
};

type RecentMatch = {
  id: number;
  matchId: number;
  matchTitle: string;
  matchDate: string;
  gameId: number;
  gameNumber: number;
  durationMin: number;
  team: "BLUE" | "RED";
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP";
  result: "WIN" | "LOSE";
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  champion: {
    id: number;
    name: string;
    imageUrl: string;
  };
};

type RecentResponse = {
  items: RecentMatch[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type PlayerDetailPageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ recentPage?: string }>;
};

async function getPlayerSummary(playerId: string): Promise<PlayerSummary> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/stats/player/${playerId}/summary`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch player summary");
  }

  return response.json();
}

async function getRecentMatches(playerId: string, recentPage: number): Promise<RecentResponse> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/stats/player/${playerId}/recent?page=${recentPage}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch recent matches");
  }

  return response.json();
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: PlayerDetailPageProps) {
  const { playerId } = await params;
  const resolvedSearchParams = await searchParams;
  const recentPage = Math.max(1, Number(resolvedSearchParams.recentPage ?? "1") || 1);

  const [summary, recentResponse] = await Promise.all([
    getPlayerSummary(playerId),
    getRecentMatches(playerId, recentPage),
  ]);

  return (
    <main style={{ padding: "24px" }}>
      <h1>플레이어 상세</h1>

      <section style={{ marginTop: "24px", marginBottom: "32px" }}>
        <h2>요약 통계</h2>
        <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
          <div>총 경기: {summary.totalGames}</div>
          <div>승 / 패: {summary.wins}승 {summary.losses}패</div>
          <div>승률: {summary.winRate}%</div>
          <div>KDA: {summary.kda}</div>
          <div>평균 골드: {summary.avgGold}</div>
        </div>
      </section>

      <section>
        <h2>최근 내전 기록</h2>

        {recentResponse.items.length === 0 ? (
          <p style={{ marginTop: "12px" }}>기록이 없습니다.</p>
        ) : (
          <>
            <div style={{ display: "grid", gap: "16px", marginTop: "12px" }}>
              {recentResponse.items.map((match) => (
                <div
                  key={match.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                    {match.matchTitle} - {match.gameNumber}세트
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    날짜: {new Date(match.matchDate).toLocaleString("ko-KR")}
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    결과: {match.result} / 팀: {match.team} / 포지션: {match.position}
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    챔피언: {match.champion.name}
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    KDA: {match.kills}/{match.deaths}/{match.assists}
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    CS: {match.cs} / 골드: {match.gold}
                  </div>
                  <div>게임 시간: {match.durationMin}분</div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={recentResponse.pagination.currentPage}
              totalPages={recentResponse.pagination.totalPages}
              basePath={`/players/${playerId}`}
              query={{ recentPage }}
            />
          </>
        )}
      </section>
    </main>
  );
}