import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
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
    activeRecruitCount,
    matchCount,
    userCount,
    pendingUserCount,
    siteSettings,
    activeEventCount,
    activeDestructionCount,
    pendingOperationCount,
    latestMatch,
    latestEvent,
    latestDestruction,
  ] = await Promise.all([
    prisma.recruitParty.count({ where: { status: "IN_PROGRESS" } }).catch(() => 0),
    prisma.matchSeries.count().catch(() => 0),
    prisma.userAccount.count({ where: { deletedAt: null } }).catch(() => 0),
    prisma.userAccount.count({ where: { deletedAt: null, status: "PENDING" } }).catch(() => 0),
    getSiteSettings(),
    prisma.eventMatch.count({ where: { status: { in: ["RECRUITING", "TEAM_BUILDING", "IN_PROGRESS"] } } }).catch(() => 0),
    prisma.destructionTournament.count({ where: { status: { in: ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT"] } } }).catch(() => 0),
    Promise.all([
      prisma.kakaoFriendApplication.count({ where: { status: "PENDING" } }),
      prisma.kakaoLeaveRequest.count({ where: { status: "PENDING" } }),
      prisma.kakaoMeetupRecord.count({ where: { status: "PENDING" } }),
      prisma.kakaoSuggestionRequest.count({ where: { status: "PENDING" } }),
    ]).then((counts) => counts.reduce((sum, count) => sum + count, 0)).catch(() => 0),
    prisma.matchSeries.findFirst({
      orderBy: [{ matchDate: "desc" }, { id: "desc" }],
      select: { id: true, title: true, matchDate: true, games: { select: { winnerTeam: true } } },
    }).catch(() => null),
    prisma.eventMatch.findFirst({
      orderBy: [{ eventDate: "desc" }, { id: "desc" }],
      select: { id: true, title: true, status: true, eventDate: true, _count: { select: { participants: true, teams: true } } },
    }).catch(() => null),
    prisma.destructionTournament.findFirst({
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      select: { id: true, title: true, status: true, startDate: true, _count: { select: { participants: true, teams: true } } },
    }).catch(() => null),
  ]);
  const recruitFeatureEnabled = isSiteFeatureEnabled(siteSettings, "recruit");
  const balanceAiFeatureEnabled = isSiteFeatureEnabled(siteSettings, "balanceAi");
  const activeProgressCount = activeEventCount + activeDestructionCount;

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero klol-app-admin-hero">
        <div className="klol-app-kicker">ADMIN POCKET CONSOLE</div>
        <h1 className="klol-app-title">운영자 앱</h1>
        <div className="klol-app-admin-hero-actions">
          <Link href="/app/admin/recruits">구인</Link>
          <Link href="/app/admin/matches">내전</Link>
          <Link href="/admin">PC 관리</Link>
        </div>
      </section>

      <div className="klol-app-admin-health-panel">
        <Link href="/admin/site-settings" className="klol-app-admin-health-item" data-state={recruitFeatureEnabled ? "ok" : "locked"}>
          <span>구인 기능</span>
          <strong>{recruitFeatureEnabled ? "오픈" : "잠금"}</strong>
        </Link>
        <Link href="/admin/site-settings" className="klol-app-admin-health-item" data-state={balanceAiFeatureEnabled ? "ok" : "locked"}>
          <span>K-LOL MMR</span>
          <strong>{balanceAiFeatureEnabled ? "오픈" : "잠금"}</strong>
        </Link>
        <Link href="/app/matches?tab=events" className="klol-app-admin-health-item" data-state={activeProgressCount > 0 ? "warn" : "ok"}>
          <span>진행 이벤트</span>
          <strong>{activeProgressCount}</strong>
        </Link>
      </div>

      <AppSection title="오늘 처리">
        <div className="klol-app-admin-command-grid">
          <Link className="klol-app-admin-command-card" href="/app/admin/recruits" data-locked={!recruitFeatureEnabled}>
            <span>진행 구인</span>
            <strong>{recruitFeatureEnabled ? activeRecruitCount : "잠금"}</strong>
            <small>카카오 구인</small>
          </Link>
          <Link className="klol-app-admin-command-card" href="/admin/operation-forms" data-urgent={pendingOperationCount > 0}>
            <span>운영 대기</span>
            <strong>{pendingOperationCount}</strong>
            <small>신청 처리</small>
          </Link>
          <Link className="klol-app-admin-command-card" href="/app/matches?tab=events" data-urgent={activeProgressCount > 0}>
            <span>진행현황</span>
            <strong>{activeProgressCount}</strong>
            <small>이벤트·멸망전</small>
          </Link>
          <Link className="klol-app-admin-command-card" href="/admin/balance-ai" data-locked={!balanceAiFeatureEnabled}>
            <span>AI 밸런스</span>
            <strong>{balanceAiFeatureEnabled ? "ON" : "잠금"}</strong>
            <small>유료 기능</small>
          </Link>
          <Link className="klol-app-admin-command-card" href="/app/admin/users" data-urgent={pendingUserCount > 0}>
            <span>회원 점검</span>
            <strong>{pendingUserCount > 0 ? pendingUserCount : userCount}</strong>
            <small>{pendingUserCount > 0 ? "승인 대기" : "전체 회원"}</small>
          </Link>
          <Link className="klol-app-admin-command-card" href="/admin/riot">
            <span>Riot 연동</span>
            <strong>체크</strong>
            <small>동기화 상태</small>
          </Link>
        </div>
      </AppSection>

      <AppSection title="바로 관리">
        <div className="klol-app-admin-shortcuts">
          <Link href="/app/admin/matches">
            <strong>내전</strong>
            <span>{matchCount}개</span>
          </Link>
          <Link href="/app/admin/users">
            <strong>회원</strong>
            <span>{userCount}명</span>
          </Link>
          <Link href="/admin/discipline">
            <strong>징계</strong>
            <span>주의·벤</span>
          </Link>
          <Link href="/admin/site-settings">
            <strong>설정</strong>
            <span>사이트</span>
          </Link>
          <Link href="/app/coin-toss">
            <strong>코인토스</strong>
            <span>즉시 실행</span>
          </Link>
        </div>
      </AppSection>

      <AppSection title="최근 상황">
        {!latestMatch && !latestEvent && !latestDestruction ? (
          <AppEmpty>확인할 최근 상황이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-admin-brief-list">
            {latestMatch ? (
              <Link className="klol-app-list-card" href={`/app/matches/${latestMatch.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{latestMatch.title}</strong>
                    <span>{formatDate(latestMatch.matchDate)} · {latestMatch.games.length}세트</span>
                  </span>
                  <span className="klol-app-badge">내전</span>
                </div>
              </Link>
            ) : null}
            {latestEvent ? (
              <Link className="klol-app-list-card klol-app-event-card" href={`/app/progress/event/${latestEvent.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{latestEvent.title}</strong>
                    <span>{formatDate(latestEvent.eventDate)} · {latestEvent._count.participants}명 · {latestEvent._count.teams}팀</span>
                  </span>
                  <span className="klol-app-badge">{statusText(latestEvent.status)}</span>
                </div>
              </Link>
            ) : null}
            {latestDestruction ? (
              <Link className="klol-app-list-card klol-app-event-card klol-app-event-card--destruction" href={`/app/progress/destruction/${latestDestruction.id}`}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{latestDestruction.title}</strong>
                    <span>{formatDate(latestDestruction.startDate)} · {latestDestruction._count.participants}명 · {latestDestruction._count.teams}팀</span>
                  </span>
                  <span className="klol-app-badge klol-app-badge--warn">{statusText(latestDestruction.status)}</span>
                </div>
              </Link>
            ) : null}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
