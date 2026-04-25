import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import MatchSearchBox from "./MatchSearchBox";

type MatchesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    order?: string;
  }>;
};

type SortType = "title" | "matchDate" | "games" | "season";
type OrderType = "asc" | "desc";

const PAGE_SIZE = 10;

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
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

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const query = resolvedSearchParams.q?.trim() ?? "";
  const sort = getSort(resolvedSearchParams.sort);
  const order = getOrder(resolvedSearchParams.order);

  const where = query
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
    : {};

  const matches = await prisma.matchSeries.findMany({
    where,
    include: {
      season: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          games: true,
        },
      },
    },
  });

  const sortedMatches = [...matches].sort((a, b) => {
    let result = 0;

    if (sort === "title") result = a.title.localeCompare(b.title);
    if (sort === "season") result = a.season.name.localeCompare(b.season.name);
    if (sort === "games") result = a._count.games - b._count.games;
    if (sort === "matchDate") result = a.matchDate.getTime() - b.matchDate.getTime();

    return order === "asc" ? result : -result;
  });

  const totalPages = Math.ceil(sortedMatches.length / PAGE_SIZE);

  const pagedMatches = sortedMatches.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function sortLink(field: SortType) {
    const nextOrder = sort === field && order === "desc" ? "asc" : "desc";
    const params = new URLSearchParams();

    if (query) params.set("q", query);
    params.set("sort", field);
    params.set("order", nextOrder);

    return `/matches?${params.toString()}`;
  }

  return (
    <main className="page-container">
      <h1 className="page-title">내전 목록</h1>

      <div className="section-search">
        <MatchSearchBox initialQuery={query} />
      </div>

      {pagedMatches.length === 0 ? (
        <p>검색 결과가 없습니다.</p>
      ) : (
        <>
          <div className="match-row-header">
            <Link href={sortLink("title")}>내전명</Link>
            <Link href={sortLink("season")}>시즌</Link>
            <Link href={sortLink("matchDate")}>날짜</Link>
            <Link href={sortLink("games")}>세트 수</Link>
          </div>

          <div className="card-grid">
            {pagedMatches.map((match) => (
              <Link
                key={match.id}
                href={`/matches/${match.id}`}
                className="match-row-card"
              >
                <div className="match-row-grid">
                  <div className="match-col match-title">{match.title}</div>
                  <div className="match-col">{match.season.name}</div>
                  <div className="match-col">{formatDate(match.matchDate)}</div>
                  <div className="match-col">{match._count.games}</div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/matches"
            query={{ q: query, sort, order }}
          />
        </>
      )}
    </main>
  );
}