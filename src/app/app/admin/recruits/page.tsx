import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

function statusText(status: string) {
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "FINISHED") return "종료";
  if (status === "CANCELED") return "취소";
  if (status === "RESET") return "초기화";
  return status;
}

export default async function AppAdminRecruitsPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/login");

  const parties = await prisma.recruitParty
    .findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 30,
      select: {
        id: true,
        recruitNo: true,
        title: true,
        status: true,
        maxMembers: true,
        startTimeText: true,
        roomName: true,
        hostName: true,
        members: { select: { id: true } },
        discordMonitor: {
          select: {
            status: true,
            lastPresentExpectedCount: true,
            lastExpectedCount: true,
            lastScannedAt: true,
          },
        },
      },
    })
    .catch(() => []);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · RECRUIT</div>
        <h1 className="klol-app-title">구인 현황</h1>
      </section>

      <AppSection title="최근 구인">
        {parties.length === 0 ? (
          <AppEmpty>표시할 구인이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {parties.map((party) => (
              <article className="klol-app-list-card" key={party.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>#{party.recruitNo} {party.title || "구인"}</strong>
                    <span>{party.hostName || "주최자 미입력"} · {party.roomName || "음성방 미정"}</span>
                  </span>
                  <span className="klol-app-badge">{statusText(party.status)}</span>
                </div>
                <div className="klol-app-meta-grid">
                  <div className="klol-app-meta">
                    <span>인원</span>
                    <strong>{party.members.length}/{party.maxMembers}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>시간</span>
                    <strong>{party.startTimeText || "미정"}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>디코</span>
                    <strong>{party.discordMonitor?.lastPresentExpectedCount ?? 0}/{party.discordMonitor?.lastExpectedCount ?? 0}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
