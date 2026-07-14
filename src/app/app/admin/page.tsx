import { redirect } from "next/navigation";
import Link from "next/link";
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

function statusText(status: string) {
  if (status === "RECRUITING") return "모집중";
  if (status === "TEAMING") return "팀 구성";
  if (status === "TEAM_BUILDING") return "팀 구성";
  if (status === "AUCTION") return "경매";
  if (status === "IN_PROGRESS") return "진행중";
  if (status === "PRELIMINARY") return "예선";
  if (status === "TOURNAMENT") return "본선";
  if (status === "COMPLETED") return "완료";
  if (status === "CANCELED" || status === "CANCELLED") return "취소";
  return status;
}

export default async function AppAdminPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin");

  const [
    logs,
    activeRecruitCount,
    matchCount,
    userCount,
    siteSettings,
    activeEventCount,
    activeDestructionCount,
    pendingOperationCount,
    recentMatches,
    recentEvents,
    recentDestructions,
  ] = await Promise.all([
    prisma.adminLog
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, action: true, message: true, createdAt: true },
      })
      .catch(() => []),
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    prisma.userAccount.count({ where: { deletedAt: null } }).catch(() => 0),
    getSiteSettings(),
    prisma.eventMatch.count({ where: { status: { in: ["RECRUITING", "TEAM_BUILDING", "IN_PROGRESS"] } } }).catch(() => 0),
    prisma.destructionTournament.count({ where: { status: { in: ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT"] } } }).catch(() => 0),
    Promise.all([
      prisma.kakaoFriendApplication.count({ where: { status: "PENDING" } }),
      prisma.kakaoLeaveRequest.count({ where: { status: "PENDING" } }),
      prisma.kakaoMeetupRecord.count({ where: { status: "PENDING" } }),
      prisma.kakaoSuggestionRequest.count({ where: { status: "PENDING" } }),
    ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)).catch(() => 0),
    prisma.matchSeries.findMany({
      orderBy: [{ matchDate: "desc" }, { id: "desc" }],
      take: 3,
      select: { id: true, title: true, matchDate: true, games: { select: { winnerTeam: true } } },
    }).catch(() => []),
    prisma.eventMatch.findMany({
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      take: 2,
      select: { id: true, title: true, status: true, eventDate: true, _count: { select: { participants: true, teams: true } } },
    }).catch(() => []),
    prisma.destructionTournament.findMany({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      take: 2,
      select: { id: true, title: true, status: true, startDate: true, _count: { select: { participants: true, teams: true } } },
    }).catch(() => []),
  ]);
  const recruitFeatureEnabled = isSiteFeatureEnabled(siteSettings, "recruit");
  const balanceAiFeatureEnabled = isSiteFeatureEnabled(siteSettings, "balanceAi");

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero klol-app-admin-hero">
        <div className="klol-app-kicker">ADMIN COMMAND</div>
        <h1 className="klol-app-title">운영자 홈</h1>
        <p className="klol-app-subtitle">모바일에서는 확인과 긴급 조치만 빠르게 처리합니다.</p>
      </section>

      <AppSection title="오늘 운영판">
        <div className="klol-app-meta-grid klol-app-admin-status-grid">
          <div className="klol-app-meta">
            <span>진행 구인</span>
            <strong>{recruitFeatureEnabled ? `${activeRecruitCount}개` : "잠금"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>내전</span>
            <strong>{matchCount}개</strong>
          </div>
          <div className="klol-app-meta">
            <span>회원</span>
            <strong>{userCount}명</strong>
          </div>
          <div className="klol-app-meta">
            <span>진행 이벤트</span>
            <strong>{activeEventCount + activeDestructionCount}개</strong>
          </div>
          <div className="klol-app-meta">
            <span>운영 대기</span>
            <strong>{pendingOperationCount}건</strong>
          </div>
          <div className="klol-app-meta">
            <span>AI 밸런스</span>
            <strong>{balanceAiFeatureEnabled ? "활성" : "잠금"}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="빠른 확인">
        <div className="klol-app-grid">
          <Link className="klol-app-card" href="/app/admin/matches">
            <strong>내전</strong>
            <small>{matchCount}개</small>
          </Link>
          <Link className="klol-app-card" href="/app/admin/recruits">
            <strong>구인</strong>
            <small>{recruitFeatureEnabled ? `${activeRecruitCount}개 진행` : "잠금"}</small>
          </Link>
          <Link className="klol-app-card" href="/app/admin/users">
            <strong>회원</strong>
            <small>{userCount}명</small>
          </Link>
          <Link className="klol-app-card" href="/app/matches?tab=events">
            <strong>진행현황</strong>
            <small>이벤트 {activeEventCount} · 멸망전 {activeDestructionCount}</small>
          </Link>
          <Link className="klol-app-card" href="/admin/operation-forms">
            <strong>운영신청</strong>
            <small>{pendingOperationCount}건 대기</small>
          </Link>
          <Link className="klol-app-card" href="/admin">
            <strong>PC 관리자</strong>
            <small>전체 운영</small>
          </Link>
        </div>
      </AppSection>

      <AppSection title="최근 내전">
        {recentMatches.length === 0 ? (
          <AppEmpty>최근 내전이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {recentMatches.map((match) => (
              <Link className="klol-app-list-card" href={`/app/matches/${match.id}`} key={match.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{match.title}</strong>
                    <span>{formatDate(match.matchDate)} · {match.games.length}세트</span>
                  </span>
                  <span className="klol-app-badge klol-app-badge--warn">확인</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AppSection>

      <AppSection title="이벤트·멸망전">
        {recentEvents.length === 0 && recentDestructions.length === 0 ? (
          <AppEmpty>최근 진행 항목이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {recentEvents.map((event) => (
              <Link className="klol-app-list-card klol-app-event-card" href={`/app/progress/event/${event.id}`} key={`event-${event.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{event.title}</strong>
                    <span>{formatDate(event.eventDate)} · {event._count.participants}명 · {event._count.teams}팀</span>
                  </span>
                  <span className="klol-app-badge">{statusText(event.status)}</span>
                </div>
              </Link>
            ))}
            {recentDestructions.map((tournament) => (
              <Link className="klol-app-list-card klol-app-event-card klol-app-event-card--destruction" href={`/app/progress/destruction/${tournament.id}`} key={`destruction-${tournament.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{tournament.title}</strong>
                    <span>{formatDate(tournament.startDate)} · {tournament._count.participants}명 · {tournament._count.teams}팀</span>
                  </span>
                  <span className="klol-app-badge klol-app-badge--warn">{statusText(tournament.status)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </AppSection>

      <PremiumFeatureGate feature="recruit" settings={siteSettings}>
        <AppSection title="구인 기능">
          <div className="klol-app-list-card">
            <span className="klol-app-list-title">
              <strong>카카오 구인현황</strong>
              <span>{activeRecruitCount}개 진행중</span>
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
