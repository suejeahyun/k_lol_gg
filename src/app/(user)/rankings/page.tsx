export const dynamic = "force-dynamic";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma/client";
import RankingSeasonFilter from "@/components/RankingSeasonFilter";

type RankingsPageProps = {
  searchParams: Promise<{
    seasonId?: string;
    sort?: string;
    order?: string;
    page?: string;
    q?: string;
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

type SortType = "name" | "participationCount" | "totalGames" | "winRate" | "mvpCount";
type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;
const MIN_PARTICIPATION_FOR_RANKING = 10;

function getSort(sort?: string): SortType {
  if (
    sort === "name" ||
    sort === "participationCount" ||
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
            <article
              key={`${title}-${player.playerId}`}
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

                  {metricLabel !== "MVP" ? (
                    <span>MVP {player.mvpCount}회</span>
                  ) : null}
                </div>
              </div>
            </article>
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
  const query = resolvedSearchParams.q?.trim() ?? "";

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

  const eligibleRankings = data.rankings.filter(
    (player) => player.participationCount >= MIN_PARTICIPATION_FOR_RANKING,
  );

  const sortedRankings = [...eligibleRankings].sort((a, b) => {
    let result = 0;

    if (sort === "name") result = a.name.localeCompare(b.name);
    if (sort === "participationCount") result = a.participationCount - b.participationCount;
    if (sort === "totalGames") result = a.totalGames - b.totalGames;
    if (sort === "winRate") result = a.winRate - b.winRate;
    if (sort === "mvpCount") result = a.mvpCount - b.mvpCount;

    return order === "asc" ? result : -result;
  });

  const rankedRankings = sortedRankings.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  const searchedRankings = query
    ? rankedRankings.filter((player) => {
        const keyword = query.toLowerCase();
        return [player.name, player.nickname, player.tag, `${player.nickname}#${player.tag}`]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
    : [];

  const topWinRate = [...eligibleRankings]
    .sort((a, b) => {
      return (
        b.winRate - a.winRate ||
        b.participationCount - a.participationCount ||
        b.mvpCount - a.mvpCount ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topParticipation = [...eligibleRankings]
    .sort((a, b) => {
      return (
        b.participationCount - a.participationCount ||
        b.winRate - a.winRate ||
        b.mvpCount - a.mvpCount ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);

  const topMvp = [...eligibleRankings]
    .filter((player) => player.mvpCount > 0)
    .sort((a, b) => {
      return (
        b.mvpCount - a.mvpCount ||
        b.winRate - a.winRate ||
        a.name.localeCompare(b.name)
      );
    })
    .slice(0, 3);


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
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_RANKING}회 이상 플레이어가 없습니다.`}
          />

          <TopRankingCard
            eyebrow="PARTICIPATION"
            title="최다참여 TOP 3"
            players={topParticipation}
            metricLabel="참가 횟수"
            metricValue={(player) => `${player.participationCount}회`}
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_RANKING}회 이상 플레이어가 없습니다.`}
          />

          <TopRankingCard
            eyebrow="MVP"
            title="MVP TOP 3"
            players={topMvp}
            metricLabel="MVP"
            metricValue={(player) => `${player.mvpCount}회`}
            subMetricValue={(player) => `참여 ${player.participationCount}회 · 승률 ${formatPercent(player.winRate)}`}
            emptyText={`내전 참여 ${MIN_PARTICIPATION_FOR_RANKING}회 이상 MVP 기록이 없습니다.`}
          />
        </section>

        <div className="ranking-board ranking-board--simple">
          <div className="ranking-board__head">
            <div>
              <p className="ranking-board__eyebrow">SEARCH RANK</p>
              <h2 className="ranking-board__title">이름으로 순위 검색</h2>
            </div>

            <div className="ranking-board__summary">
              <span>총 {sortedRankings.length}명</span>
              <span>기준 {MIN_PARTICIPATION_FOR_RANKING}회 이상</span>
            </div>
          </div>

          <form className="ranking-search-form" action="/rankings">
            {seasonId ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
            <input
              name="q"
              defaultValue={query}
              placeholder="이름 또는 닉네임 검색"
              aria-label="랭킹 이름 검색"
            />
            <button type="submit">검색</button>
          </form>

          {!query ? (
            <p className="ranking-empty ranking-empty--compact">이름을 검색하면 해당 플레이어의 순위만 표시됩니다.</p>
          ) : searchedRankings.length === 0 ? (
            <p className="ranking-empty ranking-empty--compact">검색 결과가 없습니다.</p>
          ) : (
            <div className="ranking-search-list">
              {searchedRankings.slice(0, 10).map((player) => (
                <article
                  key={player.playerId}
                  className="ranking-search-card"
                >
                  <strong>{player.rank}등</strong>
                  <span>{player.name}</span>
                  <small>{player.nickname}#{player.tag}</small>
                  <em>승률 {formatPercent(player.winRate)} · 참여 {player.participationCount}회 · MVP {player.mvpCount}회</em>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
