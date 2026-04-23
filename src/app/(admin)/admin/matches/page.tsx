import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import MatchDeleteButton from "./[matchId]/MatchDeleteButton";

type AdminMatchesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
};

const PAGE_SIZE = 10;

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

export default async function AdminMatchesPage({
  searchParams,
}: AdminMatchesPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = Math.max(1, Number(resolvedSearchParams.page ?? "1") || 1);
  const query = resolvedSearchParams.q?.trim() ?? "";

  const where = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { season: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const totalCount = await prisma.matchSeries.count({ where });

  const matches = await prisma.matchSeries.findMany({
    where,
    orderBy: {
      matchDate: "desc",
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="page-container">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          관리자 - 내전 목록
        </h1>
      </div>

      <form
        method="get"
        className="section-search"
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="제목 / 시즌명 검색"
          className="app-input"
        />
        <button type="submit" className="app-button">
          검색
        </button>
      </form>

      {matches.length === 0 ? (
        <p>등록된 내전이 없습니다.</p>
      ) : (
        <>
          <div className="player-row-header admin-match-row-header">
            <div>제목</div>
            <div>날짜</div>
            <div>시즌</div>
            <div>세트 수</div>
            <div>관리</div>
          </div>

          <div className="card-grid">
            {matches.map((match: (typeof matches)[number]) => (
              <div key={match.id} className="admin-player-row-card">
                <div className="admin-match-row-grid">
                  <div className="player-col player-name">{match.title}</div>
                  <div className="player-col">{formatDate(match.matchDate)}</div>
                  <div className="player-col">{match.season.name}</div>
                  <div className="player-col">{match._count.games}</div>

                  <div className="admin-player-actions">
                    <Link href={`/matches/${match.id}`} className="chip-button">
                      상세
                    </Link>

                    <Link
                      href={`/admin/matches/${match.id}/edit`}
                      className="chip-button"
                    >
                      수정
                    </Link>

                    <MatchDeleteButton matchId={match.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/admin/matches"
            query={query ? { q: query } : undefined}
          />
        </>
      )}
    </main>
  );
}