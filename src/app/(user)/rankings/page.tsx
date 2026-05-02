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
  rankings: RankingPlayer[];
};

type RankingPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
};

type SortType = "name" | "totalGames" | "winRate" | "kda";
type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;
const MIN_GAMES_FOR_TOP_RATE = 3;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "totalGames" ||
    sort === "winRate" ||
    sort === "kda"
  ) {
    return sort;
  }

  return "winRate";
}

function getOrder(order?: string): OrderType {
  return order === "asc" ? "asc" : "desc";
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";

  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatKda(value: number) {
  if (!Number.isFinite(value)) return "0";

  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2);
}

function getRankLabel(index: number) {
  if (index === 0) return "1";
  if (index === 1) return "2";
  if (index === 2) return "3";

  return String(index + 1);
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

function TopRankingCard({
  eyebrow,
  title,
  players,
  metricLabel,
  metricValue,
  emptyText,
}: {
  eyebrow: string;
  title: string;
  players: RankingPlayer[];
  metricLabel: string;
  metricValue: (player: RankingPlayer) => string;
  emptyText: string;
}) {
  return (
    <section className="ranking-top-card">
      <div className="ranking-top-card__header">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>

      {players.length === 0 ? (
        <div className="ranking-top-card__empty">{emptyText}</div>
      ) : (
        <div className="ranking-top-card__list">
          {players.map((player, index) => (
            <Link
              key={`${title}-${player.playerId}`}
              href={`/players/${player.playerId}`}
              className={`ranking-top-player ranking-top-player--${index + 1}`}
            >
              <div className="ranking-top-player__rank">
                {getRankLabel(index)}
              </div>

              <div className="ranking-top-player__content">
                <div className="ranking-top-player__main">
                  <strong>{player.name}</strong>
                  <span>
                    {player.nickname}#{player.tag}
                  </span>
                </div>

                <div className="ranking-top-player__stats">
                  <span>
                    {metricLabel} <b>{metricValue(player)}</b>
                  </span>
                  <span>총 {player.totalGames}경기</span>
                  <span>KDA {formatKda(player.kda)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function RankingsPage({ searchParams }: RankingsPageProps) {
  const resolvedSearchParams = await searchParams;

  const seasonId = resolvedSearchParams.seasonId;
  const sort = getSort(resolvedSearchParams.sort);
  const order = getOrder(resolvedSearchParams.order);
  const currentPage = Math.max(
    1,
    Number(resolvedSearchParams.page ?? "1") || 1
  );

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

  const topWinRate = [...data.rankings]
    .filter((player) => player.totalGames >= MIN_GAMES_FOR_TOP_RATE)
    .sort((a, b) => {
      return (
        b.winRate - a.winRate ||
        b.totalGames - a.totalGames ||
        b.kda - a.kda ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topParticipation = [...data.rankings]
    .sort((a, b) => {
      return (
        b.totalGames - a.totalGames ||
        b.winRate - a.winRate ||
        b.kda - a.kda ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topKda = [...data.rankings]
    .filter((player) => player.totalGames >= MIN_GAMES_FOR_TOP_RATE)
    .sort((a, b) => {
      return (
        b.kda - a.kda ||
        b.totalGames - a.totalGames ||
        b.winRate - a.winRate ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const totalPages = Math.max(1, Math.ceil(sortedRankings.length / PAGE_SIZE));

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedRankings = sortedRankings.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
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
      <div className="page-header">
        <div>
          <p className="page-eyebrow">RANKING</p>
          <h1 className="page-title">랭킹</h1>
        </div>
      </div>

      <section className="card balance-form-card ranking-page-card">
        <RankingSeasonFilter
          seasons={seasons}
          selectedSeasonId={seasonId ? Number(seasonId) : data.season?.id}
        />

        <section className="ranking-top-grid" aria-label="랭킹 TOP3">
          <TopRankingCard
            eyebrow="WIN RATE"
            title="승률 TOP 3"
            players={topWinRate}
            metricLabel="승률"
            metricValue={(player) => formatPercent(player.winRate)}
            emptyText={`최소 ${MIN_GAMES_FOR_TOP_RATE}경기 이상 플레이어가 없습니다.`}
          />

          <TopRankingCard
            eyebrow="PARTICIPATION"
            title="최다참여 TOP 3"
            players={topParticipation}
            metricLabel="참여"
            metricValue={(player) => `${player.totalGames}경기`}
            emptyText="참여 기록이 없습니다."
          />

          <TopRankingCard
            eyebrow="KDA"
            title="KDA TOP 3"
            players={topKda}
            metricLabel="KDA"
            metricValue={(player) => formatKda(player.kda)}
            emptyText={`최소 ${MIN_GAMES_FOR_TOP_RATE}경기 이상 플레이어가 없습니다.`}
          />
        </section>

        <div className="ranking-board">
          <div className="ranking-board__head">
            <div>
              <p className="ranking-board__eyebrow">CURRENT SEASON</p>
              <h2 className="ranking-board__title">
                기준 시즌: {data.season ? data.season.name : "없음"}
              </h2>
            </div>

            <div className="ranking-board__summary">
              <span>총 {sortedRankings.length}명</span>
              <span>승률 TOP 기준 {MIN_GAMES_FOR_TOP_RATE}경기 이상</span>
            </div>
          </div>

          {sortedRankings.length === 0 ? (
            <p className="ranking-empty">랭킹 데이터가 없습니다.</p>
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

              <div className="ranking-list">
                {pagedRankings.map((player, index) => {
                  const rank = (safeCurrentPage - 1) * PAGE_SIZE + index + 1;

                  return (
                    <Link
                      key={player.playerId}
                      href={`/players/${player.playerId}`}
                      className="ranking-row-card"
                    >
                      <div className="ranking-row-grid">
                        <div
                          className={`ranking-col ranking-rank ${
                            rank <= 3 ? `ranking-rank--top-${rank}` : ""
                          }`}
                        >
                          {rank}
                        </div>

                        <div className="ranking-col ranking-name">
                          {player.name}
                        </div>

                        <div className="ranking-col ranking-riot">
                          {player.nickname}#{player.tag}
                        </div>

                        <div className="ranking-col">{player.totalGames}</div>

                        <div className="ranking-col">
                          {formatPercent(player.winRate)}
                        </div>

                        <div className="ranking-col">
                          {formatKda(player.kda)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <Pagination
                currentPage={safeCurrentPage}
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
      </section>
    </main>
  );
}