import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { parsePositivePage } from "@/lib/http/pagination";
import { prisma } from "@/lib/prisma/client";
import { resolvePublicPlayerDisplayName } from "@/lib/public/player";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 플레이어 목록",
  description: "K-LOL.GG 플레이어 전적과 티어를 모바일에서 확인하세요.",
};

type AppPlayersPageProps = {
  searchParams?: Promise<{
    q?: string;
    page?: string;
  }>;
};

function normalizeSearch(value?: string) {
  return value?.trim().slice(0, 40) ?? "";
}

function getWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return 0;
  return Math.round((wins / totalGames) * 1000) / 10;
}

const PAGE_SIZE = 24;

async function getAppPlayers(q: string, requestedPage: number) {
  const where = q
    ? {
        isActive: true,
        OR: [
          { nickname: { contains: q, mode: "insensitive" as const } },
          { tag: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { isActive: true };
  const totalCount = await prisma.player.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const players = await prisma.player.findMany({
    where,
    orderBy: [{ nickname: "asc" }, { tag: "asc" }, { id: "asc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      nickname: true,
      tag: true,
      currentTier: true,
      peakTier: true,
      seasonStats: {
        orderBy: { seasonId: "desc" },
        take: 1,
        select: {
          totalGames: true,
          participationCount: true,
          wins: true,
          mvpCount: true,
        },
      },
    },
  });

  return {
    players: players.map((player) => ({
      ...player,
      displayName: resolvePublicPlayerDisplayName(player),
    })),
    totalCount,
    totalPages,
    currentPage,
  };
}

const getCachedAppPlayers = unstable_cache(
  async (page: number) => getAppPlayers("", page),
  ["app-players-catalog-v2"],
  { revalidate: 60, tags: ["players", "rankings", "stats-top"] },
);

export default async function AppPlayersPage({ searchParams }: AppPlayersPageProps) {
  const params = await searchParams;
  const q = normalizeSearch(params?.q);
  const requestedPage = parsePositivePage(params?.page);
  const { players, totalCount, totalPages, currentPage } = q
    ? await getAppPlayers(q, requestedPage)
    : await getCachedAppPlayers(requestedPage);
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);

  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (page > 1) query.set("page", String(page));
    const value = query.toString();
    return value ? `/app/players?${value}` : "/app/players";
  };

  return (
    <AppMobileShell subtitle="플레이어">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">PLAYER</div>
        <h1 className="klol-app-title">플레이어 목록</h1>
      </section>

      <AppSection title="검색">
        <form className="klol-app-search" action="/app/players" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="닉네임 또는 태그 검색"
            aria-label="플레이어 검색"
          />
          <button type="submit">검색</button>
        </form>
      </AppSection>

      <AppSection
        title={
          q
            ? `검색 결과 ${totalCount}명 · ${rangeStart}-${rangeEnd}`
            : `전체 ${totalCount}명 · ${rangeStart}-${rangeEnd}`
        }
      >
        <div className="klol-app-list klol-app-player-list">
          {players.length === 0 ? (
            <AppEmpty>플레이어가 없습니다.</AppEmpty>
          ) : (
            players.map((player) => {
              const stat = player.seasonStats[0];
              const totalGames = stat?.totalGames ?? 0;
              const winRate = getWinRate(stat?.wins ?? 0, totalGames);

              return (
                <Link key={player.id} href={`/app/players/${player.id}`} className="klol-app-list-card klol-app-player-card">
                  <div className="klol-app-list-top">
                    <div className="klol-app-list-title">
                      <strong>{player.displayName}</strong>
                      <span>{player.currentTier ?? "티어 미입력"}</span>
                    </div>
                    <span className="klol-app-badge">상세</span>
                  </div>
                  <div className="klol-app-meta-grid klol-app-meta-grid--player">
                    <div className="klol-app-meta">
                      <span>현재</span>
                      <strong>{player.currentTier ?? "미입력"}</strong>
                    </div>
                    <div className="klol-app-meta">
                      <span>참여</span>
                      <strong>{stat?.participationCount ?? 0}회</strong>
                    </div>
                    <div className="klol-app-meta">
                      <span>MVP</span>
                      <strong>{stat?.mvpCount ?? 0}회</strong>
                    </div>
                    <div className="klol-app-meta">
                      <span>승률</span>
                      <strong>{winRate}%</strong>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {totalPages > 1 ? (
          <nav className="klol-app-pagination" aria-label="플레이어 목록 페이지">
            {currentPage > 1 ? (
              <Link href={pageHref(currentPage - 1)}>이전</Link>
            ) : (
              <span aria-disabled="true">이전</span>
            )}
            <strong>{currentPage} / {totalPages}</strong>
            {currentPage < totalPages ? (
              <Link href={pageHref(currentPage + 1)}>다음</Link>
            ) : (
              <span aria-disabled="true">다음</span>
            )}
          </nav>
        ) : null}
      </AppSection>
    </AppMobileShell>
  );
}
