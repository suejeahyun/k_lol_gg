export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCachedSeasonRankingPlayers } from "@/lib/stats/season-performance";
import RankingSeasonFilter from "@/components/RankingSeasonFilter";
import Pagination from "@/components/Pagination";
import { parsePositivePage } from "@/lib/http/pagination";

export const metadata: Metadata = {
  title: "시즌 랭킹",
  description: "K-LOL.GG 시즌별 승률, 참여, MVP 랭킹을 확인하세요.",
  alternates: { canonical: "/rankings" },
};

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

function getRankMedalSrc(rank: number) {
  if (rank >= 1 && rank <= 3) {
    return `/images/rank-medals/rank-medal-${rank}.png`;
  }

  return null;
}

function RankMedal({
  rank,
  compact = false,
}: {
  rank: number;
  compact?: boolean;
}) {
  const medalSrc = getRankMedalSrc(rank);

  if (!medalSrc) {
    return <>{rank}</>;
  }

  return (
    <span
      className={`ranking-medal ranking-medal--rank-${rank}${
        compact ? " ranking-medal--compact" : ""
      }`}
      role="img"
      aria-label={`${rank}위`}
      title={`${rank}위`}
    >
      <Image
        src={medalSrc}
        alt=""
        aria-hidden="true"
        width={96}
        height={96}
        className="ranking-medal__image"
      />
    </span>
  );
}

async function getRankings(seasonId?: string): Promise<RankingApiResponse> {
  const parsedSeasonId = Number(seasonId);
  const selectedSeasonId = Number.isInteger(parsedSeasonId) && parsedSeasonId > 0
    ? parsedSeasonId
    : null;
  const season = selectedSeasonId
    ? await prisma.season.findUnique({
        where: { id: selectedSeasonId },
        select: { id: true, name: true, isActive: true, createdAt: true },
      })
    : await prisma.season.findFirst({
        where: { isActive: true },
        orderBy: { id: "desc" },
        select: { id: true, name: true, isActive: true, createdAt: true },
      });

  if (!season) {
    return { season: null, rankings: [] };
  }

  const rankings = await getCachedSeasonRankingPlayers(season.id);

  return {
    season: {
      ...season,
      createdAt: season.createdAt.toISOString(),
    },
    rankings: rankings.map((player) => ({
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
                <RankMedal rank={index + 1} />
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
  const currentPage = parsePositivePage(resolvedSearchParams.page);

  const [data, seasons, currentUser] = await Promise.all([
    getRankings(seasonId),
    prisma.season.findMany({
      orderBy: { id: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    }),
    getCurrentUser(),
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

  const rankingBasis = [...eligibleRankings].sort((a, b) => {
    return (
      b.winRate - a.winRate ||
      b.participationCount - a.participationCount ||
      b.mvpCount - a.mvpCount ||
      a.name.localeCompare(b.name)
    );
  });

  const myPlayerId = currentUser?.playerId ?? null;
  const myRanking = myPlayerId
    ? data.rankings.find((player) => player.playerId === myPlayerId) ?? null
    : null;
  const myRankIndex = myPlayerId
    ? rankingBasis.findIndex((player) => player.playerId === myPlayerId)
    : -1;
  const myRankText = myPlayerId
    ? myRankIndex >= 0
      ? `${myRankIndex + 1}위`
      : myRanking
        ? "기준 미달"
        : "기록 없음"
    : "로그인 필요";

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

        <section className="ranking-my-grid" aria-label="내 랭킹 요약">
          <article className="ranking-my-card ranking-my-card--primary">
            <span>내 랭킹</span>
            <strong>{myRankText}</strong>
            <small>참여 {MIN_PARTICIPATION_FOR_RANKING}회 이상 기준</small>
          </article>

          <article className="ranking-my-card">
            <span>내 승률</span>
            <strong>{myRanking ? formatPercent(myRanking.winRate) : "-"}</strong>
            <small>
              {myRanking
                ? `${myRanking.wins}승 ${myRanking.losses}패`
                : "연결된 기록 없음"}
            </small>
          </article>

          <article className="ranking-my-card">
            <span>내 참여 내전 횟수</span>
            <strong>
              {myRanking ? `${myRanking.participationCount}회` : "-"}
            </strong>
            <small>{myRanking ? `총 ${myRanking.totalGames}세트` : "로그인 후 확인"}</small>
          </article>
        </section>

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
              <span>전체 랭킹 기준 내전 참여 {MIN_PARTICIPATION_FOR_RANKING}회 이상</span>
            </div>
          </div>

          {sortedRankings.length === 0 ? (
            <p className="ranking-empty">내전 참여 {MIN_PARTICIPATION_FOR_RANKING}회 이상 랭킹 데이터가 없습니다.</p>
          ) : (
            <>
              <div className="ranking-row-header">
                <div>순위</div>
                <Link href={sortLink("name")}>이름</Link>
                <div>닉네임#태그</div>
                <Link href={sortLink("participationCount")}>참여</Link>
                <Link href={sortLink("totalGames")}>세트</Link>
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
                      className={`ranking-row-card ${
                        player.playerId === myPlayerId
                          ? "ranking-row-card--me"
                          : ""
                      }`}
                    >
                      <div className="ranking-row-grid">
                        <div
                          className={`ranking-col ranking-rank ${
                            rank <= 3 ? `ranking-rank--top-${rank}` : ""
                          }`}
                        >
                          <RankMedal rank={rank} compact />
                        </div>

                        <div className="ranking-col ranking-name">
                          {player.name}
                        </div>

                        <div className="ranking-col ranking-riot">
                          {player.nickname}#{player.tag}
                        </div>

                        <div className="ranking-col">{player.participationCount}회</div>

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
                  sort: sort !== "winRate" || order !== "desc" ? sort : undefined,
                  order: sort !== "winRate" || order !== "desc" ? order : undefined,
                }}
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
