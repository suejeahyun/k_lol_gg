import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection } from "@/components/app-mobile/AppCards";
import { getAppHomeSummary } from "@/lib/app/home-summary";

export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const { activeRecruitCount, matchCount, playerCount } = await getAppHomeSummary();

  return (
    <AppMobileShell subtitle="K-LOL.GG APP">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">K-LOL.GG APP</div>
        <h1 className="klol-app-title">K-LOL.GG APP</h1>
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
