import { prisma } from "@/lib/prisma/client";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

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
  const logs = await prisma.adminLog
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, message: true, createdAt: true },
    })
    .catch(() => []);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN</div>
        <h1 className="klol-app-title">관리자 HOME</h1>
      </section>

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
