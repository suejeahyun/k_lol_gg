import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
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

export default async function AppAdminDiscordPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin/discord");

  const [heartbeat, events] = await Promise.all([
    prisma.discordBotHeartbeat
      .findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          status: true,
          botUsername: true,
          voiceMemberCount: true,
          watchedChannelCount: true,
          autoFinishEnabled: true,
          updatedAt: true,
        },
      })
      .catch(() => null),
    prisma.discordVoiceEvent
      .findMany({
        orderBy: { occurredAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          memberDisplayName: true,
          discordServerNickname: true,
          channelName: true,
          occurredAt: true,
        },
      })
      .catch(() => []),
  ]);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · DISCORD</div>
        <h1 className="klol-app-title">디스코드 현황</h1>
      </section>

      <AppSection title="봇 상태">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>상태</span>
            <strong>{heartbeat?.status || "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>음성</span>
            <strong>{heartbeat?.voiceMemberCount ?? 0}명</strong>
          </div>
          <div className="klol-app-meta">
            <span>자동종료</span>
            <strong>{heartbeat?.autoFinishEnabled ? "ON" : "OFF"}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="최근 음성 로그">
        {events.length === 0 ? (
          <AppEmpty>표시할 디스코드 로그가 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {events.map((event) => (
              <article className="klol-app-list-card" key={event.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{event.memberDisplayName || event.discordServerNickname || "미확인"}</strong>
                    <span>{event.eventType} · {event.channelName || "채널 미확인"}</span>
                  </span>
                  <span className="klol-app-stat-value">{formatDate(event.occurredAt)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
