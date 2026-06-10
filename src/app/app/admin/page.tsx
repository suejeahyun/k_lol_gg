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
    <AppMobileShell subtitle="관리자 운영">
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

      <AppSection title="관리자 바로가기">
        <div className="klol-app-admin-grid">
          <AppMenuCard href="/admin/recruits" title="구인 관리" />
          <AppMenuCard href="/admin/matches" title="내전 관리" />
          <AppMenuCard href="/admin/discord" title="Discord 운영" />
          <AppMenuCard href="/admin/users" title="유저 관리" />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
