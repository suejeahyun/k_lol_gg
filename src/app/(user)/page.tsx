import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma/client";
import Top3Slider from "../../components/Top3Slider";

type TopApiResponse = {
  currentSeason: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  previousSeason: {
    id: number;
    name: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  currentTop3: Array<{
    playerId: number;
    name: string;
    nickname: string;
    tag: string;
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    kda: number;
    avgGold: number;
  }>;
  previousTop3: Array<{
    playerId: number;
    name: string;
    nickname: string;
    tag: string;
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    kda: number;
    avgGold: number;
  }>;
};

async function getTopPlayers(): Promise<TopApiResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const response = await fetch(`${baseUrl}/api/stats/top`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch top players");
  }

  return response.json();
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("ko-KR");
}

export default async function HomePage() {
  const [topData, recentMatches] = await Promise.all([
    getTopPlayers(),
    prisma.matchSeries.findMany({
      orderBy: {
        matchDate: "desc",
      },
      take: 5,
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
    }),
  ]);

  const safeTopData = {
    currentSeason: topData?.currentSeason ?? null,
    previousSeason: topData?.previousSeason ?? null,
    currentTop3: topData?.currentTop3 ?? [],
    previousTop3: topData?.previousTop3 ?? [],
  };

  return (
    <main className="page-container">
      <section className="section-block">
        <div className="card">
          <div className="page-title" style={{ marginBottom: "12px" }}>
            K-LOL.GG
          </div>

          <div style={{ color: "#4b5563", lineHeight: 1.7, marginBottom: "18px" }}>
            내전 기록, 플레이어 통계, 시즌 랭킹을 한 번에 확인하는 페이지입니다.
          </div>

          <div className="social-link-row">
            <a
              href="https://open.kakao.com/o/gGQ80Ucf"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link-card"
            >
              <Image
                src="/kakao.png"
                alt="카카오톡"
                width={56}
                height={56}
                className="social-link-image"
              />
            </a>

            <a
              href="https://discord.com/invite/bgHV4nqwN9"
              target="_blank"
              rel="noopener noreferrer"
              className="social-link-card"
            >
              <Image
                src="/discord.png"
                alt="디스코드"
                width={56}
                height={56}
                className="social-link-image"
              />
            </a>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="home-top3-grid">
          <Top3Slider
            title="전 시즌 승률 TOP 3"
            seasonName={safeTopData.previousSeason?.name ?? null}
            players={safeTopData.previousTop3}
          />

          <Top3Slider
            title="현 시즌 현재 TOP 3"
            seasonName={safeTopData.currentSeason?.name ?? null}
            players={safeTopData.currentTop3}
          />
        </div>
      </section>

      <section className="section-block">
        <div className="card">
          <div className="list-card__title" style={{ marginBottom: "16px" }}>
            최근 내전
          </div>

          {recentMatches.length === 0 ? (
            <p>등록된 내전이 없습니다.</p>
          ) : (
            <div className="card-grid">
              {recentMatches.map((match: (typeof recentMatches)[number]) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="list-card"
                >
                  <div className="list-card__title">{match.title}</div>

                  <div className="list-card__meta">
                    <div>시즌: {match.season.name}</div>
                    <div>날짜: {formatDate(match.matchDate)}</div>
                    <div>세트 수: {match._count.games}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}