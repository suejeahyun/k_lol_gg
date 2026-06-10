import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppEmpty, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppAdminUsersPage() {
  const admin = await requireAdminRequest();
  if (!admin) redirect("/login");

  const users = await prisma.userAccount
    .findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        discordServerNickname: true,
        player: { select: { name: true, nickname: true, tag: true } },
      },
    })
    .catch(() => []);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP" mode="admin">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ADMIN · USER</div>
        <h1 className="klol-app-title">회원 현황</h1>
      </section>

      <AppSection title="회원 목록">
        {users.length === 0 ? (
          <AppEmpty>표시할 회원이 없습니다.</AppEmpty>
        ) : (
          <div className="klol-app-list">
            {users.map((user) => (
              <article className="klol-app-list-card" key={user.id}>
                <div className="klol-app-list-top">
                  <span className="klol-app-list-title">
                    <strong>{user.player?.name || user.discordServerNickname || user.userId}</strong>
                    <span>{user.player ? `${user.player.nickname}#${user.player.tag}` : "플레이어 미연결"}</span>
                  </span>
                  <span className="klol-app-badge">{user.status}</span>
                </div>
                <div className="klol-app-meta-grid">
                  <div className="klol-app-meta">
                    <span>권한</span>
                    <strong>{user.role}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>계정</span>
                    <strong>{user.userId}</strong>
                  </div>
                  <div className="klol-app-meta">
                    <span>디코</span>
                    <strong>{user.discordServerNickname ? "연동" : "미연동"}</strong>
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
