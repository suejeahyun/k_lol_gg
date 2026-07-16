import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

function winnerText(games: { winnerTeam: string }[]) {
  const red = games.filter((game) => game.winnerTeam === "RED").length;
  const blue = games.filter((game) => game.winnerTeam === "BLUE").length;
  if (red === blue) return "동률";
  return red > blue ? "RED" : "BLUE";
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default async function AppAdminMatchesPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin/matches");

  const matches = await prisma.matchSeries
    .findMany({
      orderBy: [{ title: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        matchDate: true,
        games: { select: { winnerTeam: true }, orderBy: { gameNumber: "asc" } },
      },
    })
    .catch(() => []);
  const totalSets = matches.reduce((sum, match) => sum + match.games.length, 0);
  const latestMatch = matches[0] ?? null;

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · MATCH</div>
        <h1 className="klol-app-title">내전 관리</h1>
        <div className="klol-app-admin-hero-actions">
          <Link href="/admin/matches/new">내전 등록</Link>
          <Link href="/admin/matches">PC 관리</Link>
        </div>
      </section>

      <div className="klol-app-meta-grid klol-app-admin-status-grid">
        <div className="klol-app-meta">
          <span>최근 내전</span>
          <strong>{matches.length}</strong>
        </div>
        <div className="klol-app-meta">
          <span>세트</span>
          <strong>{totalSets}</strong>
        </div>
        <div className="klol-app-meta">
          <span>최신</span>
          <strong>{latestMatch ? formatDate(latestMatch.matchDate) : "-"}</strong>
        </div>
        <div className="klol-app-meta">
          <span>등록</span>
          <strong>가능</strong>
        </div>
      </div>

      <AppSection title="최근 내전">
        {matches.length === 0 ? (
          <AppEmpty>표시할 내전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {matches.map((match) => (
              <Link className="klol-app-list-card" href={`/admin/matches/${match.id}/edit`} key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.title}</strong>
                    <span>{formatDate(match.matchDate)} · {match.games.length}세트</span>
                  </span>
                  <span className="klol-app-badge klol-app-badge--warn">{winnerText(match.games)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
