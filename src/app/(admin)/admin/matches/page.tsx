import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import Pagination from "@/components/Pagination";
import MatchDeleteButton from "./[matchId]/MatchDeleteButton";

export const dynamic = "force-dynamic";

type AdminMatchesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
  }>;
};

const PAGE_SIZE = 12;

export default async function AdminMatchesPage({ searchParams }: AdminMatchesPageProps) {
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
    orderBy: { matchDate: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      games: {
        orderBy: { gameNumber: "asc" },
        select: { winnerTeam: true },
      },
    },
  });
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="admin-page admin-mobile-simple-page admin-matches-simple-page">
      <div className="admin-page__header admin-mobile-simple-header">
        <div>
          <p className="admin-page__kicker">MATCH ADMIN</p>
          <h1 className="admin-page__title">관리자 내전</h1>
          <p className="admin-page__description">내전명과 관리 버튼만 표시합니다.</p>
        </div>
      </div>

      <form method="get" className="admin-filter-bar admin-mobile-simple-filter">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="내전명 검색"
          className="admin-input"
        />
        <button type="submit" className="admin-button">검색</button>
      </form>

      <section className="admin-card admin-mobile-simple-card">
        <div className="admin-section-head">
          <div>
            <h2>내전 목록</h2>
            <p className="admin-muted">총 {totalCount.toLocaleString("ko-KR")}개</p>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="admin-empty">등록된 내전이 없습니다.</div>
        ) : (
          <div className="admin-simple-list admin-simple-match-list">
            {matches.map((match) => (
              <article key={match.id} className="admin-simple-list-row admin-simple-match-row">
                <div className="admin-simple-list-row__main">
                  <strong className="admin-simple-list-row__title">{match.title}</strong>
                  <span className="admin-simple-list-row__sub">승리팀 {summarizeWinnerTeam(match.games)}</span>
                </div>
                <div className="admin-simple-actions">
                  <Link href={`/matches/${match.id}`} className="chip-button">상세</Link>
                  <Link href={`/admin/matches/${match.id}/edit`} className="chip-button">수정</Link>
                  <MatchDeleteButton matchId={match.id} matchTitle={match.title} />
                </div>
              </article>
            ))}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/admin/matches"
          query={query ? { q: query } : undefined}
        />
      </section>
    </main>
  );
}

function summarizeWinnerTeam(games: Array<{ winnerTeam: string }>) {
  if (!games.length) return "미정";
  const blue = games.filter((game) => game.winnerTeam === "BLUE").length;
  const red = games.filter((game) => game.winnerTeam === "RED").length;

  if (blue === red) return "미정";
  return blue > red ? `블루 ${blue}:${red}` : `레드 ${red}:${blue}`;
}
