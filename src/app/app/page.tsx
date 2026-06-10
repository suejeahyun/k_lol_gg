import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppMenuCard, AppSection } from "@/components/app-mobile/AppCards";

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
        <p className="klol-app-subtitle">
          기존 화면 크기별 CSS 전환을 제거하고, `/app` 전용 화면에서 구인·내전·랭킹·내 정보를 앱처럼 사용합니다.
        </p>
        <div className="klol-app-actions">
          <a className="klol-app-primary" href="/app/recruits">구인 보기</a>
          <a className="klol-app-secondary" href="/app/admin">운영 보기</a>
        </div>
      </section>

      <AppSection title="현재 상태" caption="실시간 DB 기준">
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

      <AppSection title="바로가기">
        <div className="klol-app-grid">
          <AppMenuCard href="/app/recruits" title="구인 현황" description="모집 중 파티와 인원 상태 확인" />
          <AppMenuCard href="/app/matches" title="내전 기록" description="최근 내전과 세트 수 확인" />
          <AppMenuCard href="/app/rankings" title="랭킹" description="시즌 승률·참여·MVP 순위" />
          <AppMenuCard href="/app/me" title="내 정보" description="플레이어/계정 연결 확인" />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
