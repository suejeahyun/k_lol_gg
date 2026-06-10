import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const [activeRecruitCount, matchCount, playerCount] = await Promise.all([
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    prisma.player.count({ where: { isActive: true } }).catch(() => 0),
  ]);

  return (
    <AppMobileShell subtitle="내전·구인·랭킹 앱 화면">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">K-LOL.GG APP</div>
        <h1 className="klol-app-title">필요한 기능만 빠르게 보는 앱 화면</h1>
      </section>

      <AppSection title="현재 상태">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>진행 구인</span>
            <strong>{activeRecruitCount}개</strong>
          </div>
          <div className="klol-app-meta">
            <span>등록 내전</span>
            <strong>{matchCount}개</strong>
          </div>
          <div className="klol-app-meta">
            <span>활성 유저</span>
            <strong>{playerCount}명</strong>
          </div>
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
