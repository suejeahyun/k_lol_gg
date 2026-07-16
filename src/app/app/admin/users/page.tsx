import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";
import { AppAdminUserActions } from "@/components/app-mobile/AppAdminUserActions";

export const dynamic = "force-dynamic";

function statusText(status: string) {
  if (status === "APPROVED") return "승인";
  if (status === "PENDING") return "대기";
  if (status === "REJECTED") return "거절";
  if (status === "SUSPENDED") return "정지";
  return status;
}

function statusBadgeClass(status: string) {
  if (status === "PENDING") return "klol-app-badge klol-app-badge--warn";
  if (status === "REJECTED" || status === "SUSPENDED") return "klol-app-badge klol-app-badge--muted";
  return "klol-app-badge";
}

function maskUserId(userId: string) {
  if (userId.length <= 5) return userId;
  return `${userId.slice(0, 3)}***${userId.slice(-2)}`;
}

export default async function AppAdminUsersPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/app/login?next=/app/admin/users");

  const users = await prisma.userAccount
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        player: { select: { id: true, name: true, nickname: true, tag: true } },
      },
    })
    .catch(() => []);
  const approvedCount = users.filter((user) => user.status === "APPROVED").length;
  const pendingCount = users.filter((user) => user.status === "PENDING").length;
  const linkedCount = users.filter((user) => Boolean(user.player)).length;
  const adminCount = users.filter((user) => user.role === "ADMIN" || user.role === "SUPER_ADMIN").length;

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · USER</div>
        <h1 className="klol-app-title">회원 현황</h1>
        <div className="klol-app-admin-hero-actions">
          <Link href="/admin/users">PC 회원</Link>
          <Link href="/admin/players">플레이어</Link>
        </div>
      </section>

      <div className="klol-app-meta-grid klol-app-admin-status-grid">
        <div className="klol-app-meta">
          <span>승인</span>
          <strong>{approvedCount}</strong>
        </div>
        <div className="klol-app-meta">
          <span>대기</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="klol-app-meta">
          <span>연동</span>
          <strong>{linkedCount}</strong>
        </div>
        <div className="klol-app-meta">
          <span>운영자</span>
          <strong>{adminCount}</strong>
        </div>
      </div>

      <AppSection title="회원 목록">
        {users.length === 0 ? (
          <AppEmpty>표시할 회원이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {users.map((user) => (
              <article className="klol-app-list-card" key={user.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{user.player?.name || user.userId}</strong>
                    <span>{user.player ? `${user.player.nickname}#${user.player.tag}` : "플레이어 미연결"}</span>
                  </span>
                  <span className={statusBadgeClass(user.status)}>{statusText(user.status)}</span>
                </div>
                <div className="klol-app-meta-grid">
                  <div className="klol-app-meta">
                    <span>권한</span>
                    <strong>{user.role}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>계정</span>
                    <strong>{maskUserId(user.userId)}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>연동</span>
                    <strong>{user.player ? "완료" : "없음"}</strong>
                  </div>
                </div>
                <div className="klol-app-admin-card-actions">
                  <Link className="klol-app-mini-link" href={`/admin/users/${user.id}`}>상세</Link>
                  {user.player ? <Link className="klol-app-mini-link" href={`/admin/players/${user.player.id}`}>플레이어</Link> : null}
                </div>
                <AppAdminUserActions
                  userAccountId={user.id}
                  status={user.status}
                  canApprove={Boolean(user.player)}
                />
              </article>
            ))}
          </div>
        )}
      </AppSection>
    </AppMobileShell>
  );
}
