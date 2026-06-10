import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppMenuCard, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppAdminPage() {
  const [activeRecruits, pendingUsers, recentVoiceEvents] = await Promise.all([
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.userAccount.count({ where: { status: "PENDING" } }).catch(() => 0),
    prisma.discordVoiceEvent.count().catch(() => 0),
  ]);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN APP</div>
        <h1 className="klol-app-title">운영 대시보드</h1>
      </section>

      <AppSection title="운영 상태">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>진행 구인</span>
            <strong>{activeRecruits}</strong>
          </div>
          <div className="klol-app-meta">
            <span>승인 대기</span>
            <strong>{pendingUsers}</strong>
          </div>
          <div className="klol-app-meta">
            <span>음성 로그</span>
            <strong>{recentVoiceEvents}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="관리자 메뉴">
        <div className="klol-app-admin-grid">
          <AppMenuCard href="/admin" title="관리자 HOME" />
          <AppMenuCard href="/admin/recruits" title="구인 현황" />
          <AppMenuCard href="/admin/matches" title="내전 관리" />
          <AppMenuCard href="/admin/discord" title="Discord 운영" />
          <AppMenuCard href="/admin/users" title="회원 목록" />
          <AppMenuCard href="/admin/player-approvals" title="플레이어 승인" />
          <AppMenuCard href="/admin/players" title="플레이어" />
          <AppMenuCard href="/admin/balance" title="팀 밸런스" />
          <AppMenuCard href="/admin/balance/drafts" title="AI 밸런스" />
          <AppMenuCard href="/admin/balance-ai" title="K-LOL MMR" />
          <AppMenuCard href="/admin/operation-forms" title="운영 신청" />
          <AppMenuCard href="/admin/progress/event" title="이벤트" />
          <AppMenuCard href="/admin/progress/destruction" title="멸망전" />
          <AppMenuCard href="/admin/champions" title="챔피언" />
          <AppMenuCard href="/admin/seasons" title="시즌" />
          <AppMenuCard href="/admin/notices" title="공지" />
          <AppMenuCard href="/admin/community/headlines" title="말머리" />
          <AppMenuCard href="/admin/images" title="이미지" />
          <AppMenuCard href="/admin/highlights" title="하이라이트" />
          <AppMenuCard href="/admin/logs" title="관리자 로그" />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
