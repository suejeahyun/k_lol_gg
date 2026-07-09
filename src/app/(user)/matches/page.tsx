export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import MatchSearchBox from "./MatchSearchBox";

type MatchesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    seasonId?: string;
    sort?: string;
    order?: string;
    range?: string;
    winner?: string;
    status?: string;
  }>;
};

type SortType = "title" | "games" | "season";
type OrderType = "asc" | "desc";
type WinnerTeam = "BLUE" | "RED" | "미정";

const PAGE_SIZE = 10;

const RANGE_FILTERS = [
  { value: "ALL", label: "전체 기간" },
  { value: "today", label: "오늘" },
  { value: "week", label: "이번 주" },
] as const;

const WINNER_FILTERS = [
  { value: "ALL", label: "전체 결과" },
  { value: "BLUE", label: "BLUE 승" },
  { value: "RED", label: "RED 승" },
] as const;

const STATUS_FILTERS = [
  { value: "ALL", label: "전체 상태" },
  { value: "completed", label: "완료" },
] as const;

function getSort(sort?: string): SortType {
  if (sort === "title" || sort === "games" || sort === "season") {
    return sort;
  }

  return "title";
}

function getOrder(order?: string): OrderType {
  return order === "asc" ? "asc" : "desc";
}

function getFilterValue<T extends readonly { value: string }[]>(
  filters: T,
  value?: string,
) {
  const normalized = value?.trim() ?? "ALL";
  return filters.some((filter) => filter.value === normalized)
    ? normalized
    : "ALL";
}

function getDateRange(rangeFilter: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (rangeFilter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { gte: start, lte: end };
  }

  if (rangeFilter === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    return { gte: start, lte: end };
  }

  return null;
}

function getWinnerTeam(blueWins: number, redWins: number): WinnerTeam {
  if (blueWins > redWins) return "BLUE";
  if (redWins > blueWins) return "RED";
  return "미정";
}

function getWinnerLabel(winnerTeam: WinnerTeam): string {
  if (winnerTeam === "BLUE") return "블루";
  if (winnerTeam === "RED") return "레드";
  return "미정";
}

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const resolvedSearchParams = await searchParams;

  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const query = resolvedSearchParams.q?.trim() ?? "";
  const sort = getSort(resolvedSearchParams.sort);
  const order = getOrder(resolvedSearchParams.order);
  const rangeFilter = getFilterValue(RANGE_FILTERS, resolvedSearchParams.range);
  const winnerFilter = getFilterValue(WINNER_FILTERS, resolvedSearchParams.winner);
  const statusFilter = getFilterValue(STATUS_FILTERS, resolvedSearchParams.status);
  const dateRange = getDateRange(rangeFilter);

  const parsedSeasonId = Number(resolvedSearchParams.seasonId);
  const selectedSeasonId =
    Number.isInteger(parsedSeasonId) && parsedSeasonId > 0
      ? parsedSeasonId
      : undefined;

  const seasons = await prisma.season.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  });

  const where = {
    ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
    ...(dateRange ? { matchDate: dateRange } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            {
              season: {
                name: { contains: query, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "season"
      ? { season: { name: order } }
      : { title: order };

  const totalCount = await prisma.matchSeries.count({ where });
  const needsClientPaging =
    sort === "games" || winnerFilter !== "ALL" || statusFilter !== "ALL";
  const serverTotalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const serverSafeCurrentPage = Math.min(currentPage, serverTotalPages);

  const [matches, totalSetCount, latestMatchRecord] = await Promise.all([
    prisma.matchSeries.findMany({
      where,
      orderBy,
      skip: needsClientPaging ? undefined : (serverSafeCurrentPage - 1) * PAGE_SIZE,
      take: needsClientPaging ? Math.min(Math.max(totalCount, PAGE_SIZE), 500) : PAGE_SIZE,
      include: {
        season: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        games: {
          orderBy: {
            gameNumber: "asc",
          },
          select: {
            id: true,
            gameNumber: true,
            winnerTeam: true,
            participants: {
              select: {
                playerId: true,
              },
            },
          },
        },
        _count: {
          select: {
            games: true,
          },
        },
      },
    }),
    prisma.matchGame.count({
      where: {
        series: where,
      },
    }),
    prisma.matchSeries.findFirst({
      where,
      orderBy: [{ title: "desc" }, { id: "desc" }],
      select: { id: true, title: true },
    }),
  ]);

  const enrichedMatches = matches.map((match) => {
    const blueWins = match.games.filter(
      (game) => game.winnerTeam === "BLUE"
    ).length;

    const redWins = match.games.filter(
      (game) => game.winnerTeam === "RED"
    ).length;

    const winnerTeam = getWinnerTeam(blueWins, redWins);

    const participantIds = new Set(
      match.games.flatMap((game) =>
        game.participants.map((participant) => participant.playerId)
      )
    );

    return {
      ...match,
      blueWins,
      redWins,
      winnerTeam,
      participantsCount: participantIds.size,
    };
  });

  const filteredMatches = enrichedMatches.filter((match) => {
    const matchesWinner =
      winnerFilter === "ALL" || match.winnerTeam === winnerFilter;
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "completed" && match._count.games > 0);

    return matchesWinner && matchesStatus;
  });

  const orderedMatches =
    sort === "games"
      ? [...filteredMatches]
          .sort((a, b) =>
            order === "asc"
              ? a._count.games - b._count.games
              : b._count.games - a._count.games,
          )
      : filteredMatches;

  const effectiveTotalCount = needsClientPaging
    ? orderedMatches.length
    : totalCount;
  const totalPages = Math.max(1, Math.ceil(effectiveTotalCount / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedMatches = needsClientPaging
    ? orderedMatches.slice(
        (safeCurrentPage - 1) * PAGE_SIZE,
        safeCurrentPage * PAGE_SIZE,
      )
    : orderedMatches;

  const latestMatch = latestMatchRecord;

  const activeSeason =
    seasons.find((season) => season.isActive) ?? seasons[0] ?? null;

  function buildMatchesHref({
    nextSort = sort,
    nextOrder = order,
    nextRange = rangeFilter,
    nextWinner = winnerFilter,
    nextStatus = statusFilter,
    page = "1",
  }: {
    nextSort?: SortType;
    nextOrder?: OrderType;
    nextRange?: string;
    nextWinner?: string;
    nextStatus?: string;
    page?: string;
  } = {}) {
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (selectedSeasonId) params.set("seasonId", String(selectedSeasonId));
    if (nextRange !== "ALL") params.set("range", nextRange);
    if (nextWinner !== "ALL") params.set("winner", nextWinner);
    if (nextStatus !== "ALL") params.set("status", nextStatus);

    params.set("sort", nextSort);
    params.set("order", nextOrder);
    params.set("page", page);

    return `/matches?${params.toString()}`;
  }

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    return buildMatchesHref({
      nextSort: field,
      nextOrder,
    });
  }

  return (
    <main className="page-container matches-page-v2">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">CIVIL WAR LIST</p>
          <h1 className="page-title">내전 목록</h1>
        </div>
      </div>

      <section className="card balance-form-card match-list-page-card">
        <div className="section-search">
          <MatchSearchBox
            initialQuery={query}
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
          />
        </div>

        <div className="match-filter-rail" aria-label="내전 필터">
          <div className="match-filter-rail__group">
            <span>기간</span>
            <div>
              {RANGE_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildMatchesHref({ nextRange: filter.value })}
                  className={`match-filter-chip ${
                    rangeFilter === filter.value
                      ? "match-filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="match-filter-rail__group">
            <span>승리팀</span>
            <div>
              {WINNER_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildMatchesHref({ nextWinner: filter.value })}
                  className={`match-filter-chip ${
                    winnerFilter === filter.value
                      ? "match-filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="match-filter-rail__group">
            <span>상태</span>
            <div>
              {STATUS_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildMatchesHref({ nextStatus: filter.value })}
                  className={`match-filter-chip ${
                    statusFilter === filter.value
                      ? "match-filter-chip--active"
                      : ""
                  }`}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <section className="match-summary-grid" aria-label="내전 요약">
          <div className="match-summary-card match-summary-card--season">
            <span>현재 시즌</span>
            <strong>{activeSeason ? activeSeason.name : "없음"}</strong>
          </div>

          <div className="match-summary-card match-summary-card--latest">
            <span>최근 내전</span>
            <strong>{latestMatch ? latestMatch.title : "없음"}</strong>
          </div>

          <div className="match-summary-card match-summary-card--count">
            <span>총 내전 수</span>
            <strong>{effectiveTotalCount}</strong>
          </div>

          <div className="match-summary-card match-summary-card--count">
            <span>총 세트 수</span>
            <strong>{totalSetCount}</strong>
          </div>
        </section>

        <div className="match-list-board matches-list-v4__board">
          <div className="match-list-board__head">
            <div>
              <p className="match-list-board__eyebrow">MATCH HISTORY</p>
              <h2>내전 기록</h2>
            </div>

            <div className="match-list-board__meta">
              <span>검색 결과 {effectiveTotalCount}개</span>
              <span>{order === "desc" ? "내림차순" : "오름차순"}</span>
            </div>
          </div>

          {pagedMatches.length === 0 ? (
            <p className="match-empty">검색 결과가 없습니다.</p>
          ) : (
            <>
              <div className="match-row-header matches-list-v4__header">
                <Link
                  href={sortLink("title")}
                  className="matches-list-v4__head-title"
                >
                  내전명
                </Link>

                <Link
                  href={sortLink("season")}
                  className="matches-list-v4__head-season"
                >
                  시즌
                </Link>

                <div className="matches-list-v4__head-score">스코어</div>

                <div className="matches-list-v4__head-winner">승리팀</div>

                <Link
                  href={sortLink("games")}
                  className="matches-list-v4__head-set"
                >
                  세트수
                </Link>
              </div>

              <div className="match-list matches-list-v4__list">
                {pagedMatches.map((match) => (
                  <Link
                    key={match.id}
                    href={`/matches/${match.id}`}
                    className="match-row-card matches-list-v4__card"
                  >
                    <div className="match-row-grid matches-list-v4__row">
                      <div className="match-col matches-list-v4__title">
                        <strong>{match.title}</strong>
                      </div>

                      <div className="match-col matches-list-v4__season">
                        <strong>{match.season.name}</strong>
                      </div>

                      <div className="match-col matches-list-v4__score-cell">
                        <div className="matches-list-v4__score">
                          <span className="matches-list-v4__score-blue">
                            BLUE {match.blueWins}
                          </span>
                          <b>:</b>
                          <span className="matches-list-v4__score-red">
                            {match.redWins} RED
                          </span>
                        </div>
                      </div>

                      <div className="match-col matches-list-v4__winner">
                        <span
                          className={`matches-list-v4__winner-badge ${
                            match.winnerTeam === "BLUE"
                              ? "matches-list-v4__winner-badge--blue"
                              : match.winnerTeam === "RED"
                                ? "matches-list-v4__winner-badge--red"
                                : "matches-list-v4__winner-badge--pending"
                          }`}
                        >
                          승리팀 {getWinnerLabel(match.winnerTeam)}
                        </span>
                      </div>

                      <div className="match-col matches-list-v4__set">
                        <span>세트수 {match._count.games}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Pagination
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                basePath="/matches"
                query={{
                  q: query,
                  seasonId: selectedSeasonId
                    ? String(selectedSeasonId)
                    : undefined,
                  sort,
                  order,
                  range: rangeFilter !== "ALL" ? rangeFilter : undefined,
                  winner: winnerFilter !== "ALL" ? winnerFilter : undefined,
                  status: statusFilter !== "ALL" ? statusFilter : undefined,
                }}
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
