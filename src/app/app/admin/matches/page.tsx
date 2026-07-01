import { redirect } from "next/navigation";
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
        games: { select: { winnerTeam: true }, orderBy: { gameNumber: "asc" } },
      },
    })
    .catch(() => []);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · MATCH</div>
        <h1 className="klol-app-title">내전 관리</h1>
      </section>

      <AppSection title="최근 내전">
        {matches.length === 0 ? (
          <AppEmpty>표시할 내전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {matches.map((match) => (
              <article className="klol-app-list-card" key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.title}</strong>
                    <span>{match.games.length}세트</span>
                  </span>
                  <span className="klol-app-badge klol-app-badge--warn">{winnerText(match.games)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
