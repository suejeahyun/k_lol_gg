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
  }>;
};

type SortType = "title" | "matchDate" | "games" | "season";
type OrderType = "asc" | "desc";
type WinnerTeam = "BLUE" | "RED" | "미정";

const PAGE_SIZE = 10;

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSort(sort?: string): SortType {
  if (
    sort === "title" ||
    sort === "matchDate" ||
    sort === "games" ||
    sort === "season"
  ) {
    return sort;
  }

  return "matchDate";
}

function getOrder(order?: string): OrderType {
  return order === "asc" ? "asc" : "desc";
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

  const matches = await prisma.matchSeries.findMany({
    where,
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
  });

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

  const sortedMatches = [...enrichedMatches].sort((a, b) => {
    let result = 0;

    if (sort === "title") result = a.title.localeCompare(b.title);
    if (sort === "season") result = a.season.name.localeCompare(b.season.name);
    if (sort === "games") result = a._count.games - b._count.games;
    if (sort === "matchDate") {
      result = a.matchDate.getTime() - b.matchDate.getTime();
    }

    return order === "asc" ? result : -result;
  });

  const totalPages = Math.max(1, Math.ceil(sortedMatches.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedMatches = sortedMatches.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );

  const totalSetCount = enrichedMatches.reduce(
    (sum, match) => sum + match._count.games,
    0
  );

  const latestMatch = [...enrichedMatches].sort(
    (a, b) => b.matchDate.getTime() - a.matchDate.getTime()
  )[0];

  const activeSeason =
    seasons.find((season) => season.isActive) ?? seasons[0] ?? null;

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    if (selectedSeasonId) params.set("seasonId", String(selectedSeasonId));

    params.set("sort", field);
    params.set("order", nextOrder);
    params.set("page", "1");

    return `/matches?${params.toString()}`;
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
            <strong>{enrichedMatches.length}</strong>
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
              <span>검색 결과 {sortedMatches.length}개</span>
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

                <Link
                  href={sortLink("matchDate")}
                  className="matches-list-v4__head-date"
                >
                  날짜
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

                      <div className="match-col matches-list-v4__date">
                        {formatDate(match.matchDate)}
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
                }}
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}