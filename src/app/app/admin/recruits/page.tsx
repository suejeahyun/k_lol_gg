import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import PremiumFeatureGate from "@/components/PremiumFeatureGate";
import { getSiteSettings } from "@/lib/site/settings";

export const dynamic = "force-dynamic";

function statusText(status: string) {
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "FINISHED") return "종료";
  if (status === "CANCELED") return "취소";
  if (status === "RESET") return "초기화";
  return status;
}

function statusBadgeClass(status: string) {
  if (status === "IN_PROGRESS") return "klol-app-badge klol-app-badge--warn";
  if (status === "FINISHED" || status === "CANCELED" || status === "RESET") return "klol-app-badge klol-app-badge--muted";
  return "klol-app-badge";
}

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

export default async function AppAdminRecruitsPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin/recruits");

  const [parties, siteSettings] = await Promise.all([
    prisma.recruitParty
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
          updatedAt: true,
        },
      })
      .catch(() => []),
    getSiteSettings(),
  ]);
  const activeCount = parties.filter((party) => party.status === "IN_PROGRESS").length;
  const finishedCount = parties.filter((party) => party.status === "FINISHED").length;
  const closedCount = parties.filter((party) => party.status === "CANCELED" || party.status === "RESET").length;

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · RECRUIT</div>
        <h1 className="klol-app-title">구인 현황</h1>
        <div className="klol-app-admin-hero-actions">
          <Link href="/admin/kakao/recruits">PC 관리</Link>
          <Link href="/admin/kakao/settings">설정</Link>
          <Link href="/admin/logs/kakao">로그</Link>
        </div>
      </section>

      <PremiumFeatureGate feature="recruit" settings={siteSettings}>
        <div className="klol-app-meta-grid klol-app-admin-status-grid">
          <div className="klol-app-meta">
            <span>진행</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="klol-app-meta">
            <span>종료</span>
            <strong>{finishedCount}</strong>
          </div>
          <div className="klol-app-meta">
            <span>닫힘</span>
            <strong>{closedCount}</strong>
          </div>
          <div className="klol-app-meta">
            <span>최근 조회</span>
            <strong>{parties.length}</strong>
          </div>
        </div>

        <AppSection title="최근 구인">
          {parties.length === 0 ? (
            <AppEmpty>표시할 구인이 없습니다.</AppEmpty>
          ) : (
            <div className="klol-app-list">
              {parties.map((party) => (
                <Link className="klol-app-list-card" href="/admin/kakao/recruits" key={party.id} data-muted={party.status !== "IN_PROGRESS"}>
                  <div className="klol-app-list-top">
                    <span className="klol-app-list-title">
                      <strong>#{party.recruitNo} {party.title || "구인"}</strong>
                      <span>{party.hostName || "주최자 미입력"} · {party.roomName || "음성방 미정"}</span>
                    </span>
                    <span className={statusBadgeClass(party.status)}>{statusText(party.status)}</span>
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
                      <span>갱신</span>
                      <strong>{formatDate(party.updatedAt)}</strong>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </AppSection>
      </PremiumFeatureGate>
    </AppMobileShell>
  );
}
