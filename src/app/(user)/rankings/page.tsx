import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import RankingSeasonFilter from "@/components/RankingSeasonFilter";
import Pagination from "@/components/Pagination";

type RankingsPageProps = {
  searchParams: Promise<{
    seasonId?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
};

type RankingApiResponse = {
  season: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  rankings: Array<{
    playerId: number;
    name: string;
    nickname: string;
    tag: string;
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    kda: number;
  }>;
};

type SortType = "name" | "totalGames" | "winRate" | "kda" ;
type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "totalGames" ||
    sort === "kda"
  ) {
    return sort;
  }
  return "winRate";
}

function getOrder(order?: string): OrderType {
  return order === "asc" ? "asc" : "desc";
}

async function getRankings(seasonId?: string): Promise<RankingApiResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const query = seasonId ? `?seasonId=${seasonId}` : "";
  const response = await fetch(`${baseUrl}/api/rankings${query}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch rankings");
  }

  return response.json();
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const seasonId = resolvedSearchParams.seasonId;
  const sort = getSort(resolvedSearchParams.sort);
  const order = getOrder(resolvedSearchParams.order);
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);

  const [data, seasons] = await Promise.all([
    getRankings(seasonId),
    prisma.season.findMany({
      orderBy: { id: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    }),
  ]);

  const sortedRankings = [...data.rankings].sort((a, b) => {
    let result = 0;

    if (sort === "name") result = a.name.localeCompare(b.name);
    if (sort === "totalGames") result = a.totalGames - b.totalGames;
    if (sort === "winRate") result = a.winRate - b.winRate;
    if (sort === "kda") result = a.kda - b.kda;

    return order === "asc" ? result : -result;
  });

  const totalPages = Math.max(1, Math.ceil(sortedRankings.length / PAGE_SIZE));
  const pagedRankings = sortedRankings.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();

    if (seasonId) params.set("seasonId", seasonId);
    params.set("sort", field);
    params.set("order", nextOrder);
    params.set("page", "1");

    return `/rankings?${params.toString()}`;
  }

  return (
    <main className="page-container">
      <h1 className="page-title">랭킹</h1>

      <RankingSeasonFilter
        seasons={seasons}
        selectedSeasonId={seasonId ? Number(seasonId) : data.season?.id}
      />

      <div className="ranking-board">
        <div className="ranking-board__title">
          기준 시즌: {data.season ? data.season.name : "없음"}
        </div>

        {sortedRankings.length === 0 ? (
          <p>랭킹 데이터가 없습니다.</p>
        ) : (
          <>
            <div className="ranking-row-header">
              <div>순위</div>
              <Link href={sortLink("name")}>이름</Link>
              <div>닉네임#태그</div>
              <Link href={sortLink("totalGames")}>총 경기</Link>
              <Link href={sortLink("winRate")}>승률</Link>
              <Link href={sortLink("kda")}>KDA</Link>
            </div>

            <div className="card-grid">
              {pagedRankings.map((player, index) => (
                <Link
                  key={player.playerId}
                  href={`/players/${player.playerId}`}
                  className="ranking-row-card"
                >
                  <div className="ranking-row-grid">
                    <div className="ranking-col ranking-rank">
                      {(currentPage - 1) * PAGE_SIZE + index + 1}
                    </div>
                    <div className="ranking-col ranking-name">{player.name}</div>
                    <div className="ranking-col">
                      {player.nickname}#{player.tag}
                    </div>
                    <div className="ranking-col">{player.totalGames}</div>
                    <div className="ranking-col">{player.winRate}%</div>
                    <div className="ranking-col">{player.kda}</div>
                  </div>
                </Link>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath="/rankings"
              query={{
                seasonId,
                sort,
                order,
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}