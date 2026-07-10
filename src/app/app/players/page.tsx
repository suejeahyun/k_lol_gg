import Link from "next/link";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { prisma } from "@/lib/prisma/client";

export const dynamic = "force-dynamic";

type AppPlayersPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

function normalizeSearch(value?: string) {
  return value?.trim().slice(0, 40) ?? "";
}

function getWinRate(wins: number, totalGames: number) {
  if (totalGames <= 0) return 0;
  return Math.round((wins / totalGames) * 1000) / 10;
}

const DEFAULT_VISIBLE_PLAYERS = 12;
const SEARCH_VISIBLE_PLAYERS = 80;

export default async function AppPlayersPage({ searchParams }: AppPlayersPageProps) {
  const params = await searchParams;
  const q = normalizeSearch(params?.q);

  const where = q
    ? {
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { nickname: { contains: q, mode: "insensitive" as const } },
          { tag: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { isActive: true };

  const take = q ? SEARCH_VISIBLE_PLAYERS : DEFAULT_VISIBLE_PLAYERS;
  const [players, totalCount] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: [{ name: "asc" }, { nickname: "asc" }],
      take,
      select: {
        id: true,
        name: true,
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
    }),
    prisma.player.count({ where }),
  ]);

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
            placeholder="이름, 닉네임, 태그 검색"
            aria-label="플레이어 검색"
          />
          <button type="submit">검색</button>
        </form>
      </AppSection>

      <AppSection
        title={
          q
            ? `검색 결과 ${totalCount}명`
            : `전체 ${totalCount}명 · ${players.length}명 표시`
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
                      <strong>{player.name}</strong>
                      <span>{player.nickname}#{player.tag}</span>
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
      </AppSection>
    </AppMobileShell>
  );
}
