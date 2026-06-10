import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

const formatDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AppMatchesPage() {
  const matches = await prisma.matchSeries.findMany({
    include: { season: true, games: true },
    orderBy: { matchDate: "desc" },
    take: 20,
  });

  return (
    <AppMobileShell subtitle="내전 기록">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">MATCHES</div>
        <h1 className="klol-app-title">최근 내전</h1>
      </section>

      <AppSection title="최근 20개">
        {matches.length === 0 ? (
          <AppEmpty>등록된 내전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {matches.map((match) => (
              <Link className="klol-app-list-card" href={`/app/matches/${match.id}`} key={match.id}>
                <div className="klol-app-list-top">
                  <div className="klol-app-list-title">
                    <strong>{match.title}</strong>
                    <span>{formatDate.format(match.matchDate)} · {match.season?.name ?? "시즌 없음"}</span>
                  </div>
                  <span className="klol-app-badge klol-app-badge--warn">{match.games.length}세트</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
