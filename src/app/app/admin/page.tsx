import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings, isSiteFeatureEnabled } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AppAdminPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin");

  const [logs, activeRecruitCount, siteSettings] = await Promise.all([
    prisma.adminLog
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, action: true, message: true, createdAt: true },
      })
      .catch(() => []),
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    getSiteSettings(),
  ]);
  const recruitFeatureEnabled = isSiteFeatureEnabled(siteSettings, "recruit");

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN</div>
        <h1 className="klol-app-title">관리자 HOME</h1>
      </section>

      <AppSection title="운영 상태">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>진행 구인</span>
            <strong>{recruitFeatureEnabled ? `${activeRecruitCount}개` : "잠금"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>관리자</span>
            <strong>{admin.user.role}</strong>
          </div>
        </div>
      </AppSection>

      <PremiumFeatureGate feature="recruit" settings={siteSettings}>
        <AppSection title="구인 기능">
          <div className="klol-app-list-card">
            <span className="klol-app-list-title">
              <strong>카카오 구인현황</strong>
              <span>방별 유료 설정에 따라 모바일 관리자에서도 표시됩니다.</span>
            </span>
          </div>
        </AppSection>
      </PremiumFeatureGate>

      <AppSection title="전체 로그">
        {logs.length === 0 ? (
          <AppEmpty>표시할 로그가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {logs.map((log) => (
              <article className="klol-app-list-card klol-app-log-card" key={log.id}>
                <span className="klol-app-list-title">
                  <strong>{log.action}</strong>
                  <span>{log.message}</span>
                </span>
                <span className="klol-app-stat-value">{formatDate(log.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
