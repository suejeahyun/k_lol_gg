export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
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
  participationCount: number;
  wins: number;
  losses: number;
  winRate: number;
  mvpCount: number;
};

type SortType = "name" | "totalGames" | "winRate" | "mvpCount";
type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;
const MIN_PARTICIPATION_FOR_TOP3 = 10;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "totalGames" ||
    sort === "winRate" ||
    sort === "mvpCount"
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

function getRankLabel(index: number) {
  if (index === 0) return "1";
  if (index === 1) return "2";
  if (index === 2) return "3";

  return String(index + 1);
}

async function getRankings(seasonId?: string): Promise<RankingApiResponse> {
  const headersList = await headers();

  const host = headersList.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
  const query = seasonId ? `?seasonId=${seasonId}` : "";

  const response = await fetch(`${baseUrl}/api/rankings${query}`, {
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch rankings");
  }

  const data = (await response.json()) as RankingApiResponse;

  return {
    ...data,
    rankings: data.rankings.map((player) => ({
      ...player,
      participationCount:
        typeof player.participationCount === "number"
          ? player.participationCount
          : 0,
      mvpCount: typeof player.mvpCount === "number" ? player.mvpCount : 0,
    })),
  };
}

function TopRankingCard({
  eyebrow,
  title,
  players,
  metricLabel,
  metricValue,
  subMetricValue,
  emptyText,
}: {
  eyebrow: string;
  title: string;
  players: RankingPlayer[];
  metricLabel: string;
  metricValue: (player: RankingPlayer) => string;
  subMetricValue?: (player: RankingPlayer) => string | null;
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

                  {subMetricValue ? (
                    <span>{subMetricValue(player)}</span>
                  ) : null}

                  <span>MVP {player.mvpCount}회</span>
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
    if (sort === "mvpCount") result = a.mvpCount - b.mvpCount;

    return order === "asc" ? result : -result;
  });

  const topWinRate = [...data.rankings]
    .filter((player) => player.participationCount >= MIN_PARTICIPATION_FOR_TOP3)
    .sort((a, b) => {
      return (
        b.winRate - a.winRate ||
        b.participationCount - a.participationCount ||
        b.mvpCount - a.mvpCount ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topParticipation = [...data.rankings]
    .filter((player) => player.participationCount >= MIN_PARTICIPATION_FOR_TOP3)
    .sort((a, b) => {
      return (
        b.participationCount - a.participationCount ||
        b.winRate - a.winRate ||
        b.mvpCount - a.mvpCount ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topMvp = [...data.rankings]
    .filter((player) => player.participationCount >= MIN_PARTICIPATION_FOR_TOP3 && player.mvpCount > 0)
    .sort((a, b) => {
      return (
        b.mvpCount - a.mvpCount ||
        b.winRate - a.winRate ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const totalPages = Math.max(1, Math.ceil(sortedRankings.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedRankings = sortedRankings.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
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
            subMetricValue={(player) => `참여 ${player.participationCount}회`}
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_TOP3}회 이상 플레이어가 없습니다.`}
          />

          <TopRankingCard
            eyebrow="PARTICIPATION"
            title="최다참여 TOP 3"
            players={topParticipation}
            metricLabel="참가 횟수"
            metricValue={(player) => `${player.participationCount}회`}
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_TOP3}회 이상 플레이어가 없습니다.`}
          />

          <TopRankingCard
            eyebrow="MVP"
            title="MVP TOP 3"
            players={topMvp}
            metricLabel="MVP"
            metricValue={(player) => `${player.mvpCount}회`}
            subMetricValue={(player) => `승률 ${formatPercent(player.winRate)}`}
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_TOP3}회 이상 MVP 기록이 없습니다.`}
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
              <span>TOP3 기준 내전 참여 {MIN_PARTICIPATION_FOR_TOP3}회 이상</span>
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
                <Link href={sortLink("mvpCount")}>MVP</Link>
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

                        <div className="ranking-col">{player.mvpCount}</div>
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
