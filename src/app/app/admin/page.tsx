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
        <p className="klol-app-subtitle">휴대폰에서 자주 보는 관리자 기능만 모은 앱 화면입니다.</p>
        <div className="klol-app-actions">
          <a className="klol-app-primary" href="/admin">관리자 홈</a>
          <a className="klol-app-secondary" href="/admin/discord">Discord 운영</a>
        </div>
      </section>

      <AppSection title="운영 상태" caption="DB 기준">
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
          <AppMenuCard href="/admin/recruits" title="구인 관리" description="구인 현황, 초기화, 자동종료 상태 관리" />
          <AppMenuCard href="/admin/discord" title="Discord 운영" description="음성방, 모니터, 미연동자, 자동 종료 확인" />
          <AppMenuCard href="/admin/discord/matches" title="내전 검증" description="날짜별 내전 접속/지각/불참 확인" />
          <AppMenuCard href="/admin/users" title="유저 승인" description="가입 승인, Discord 연결 상태, 권한 관리" />
          <AppMenuCard href="/admin/matches/new" title="내전 등록" description="OCR 또는 수동 입력으로 내전 결과 등록" />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
