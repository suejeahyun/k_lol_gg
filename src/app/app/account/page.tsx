import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection, AppEmpty } from "@/components/app-mobile/AppCards";
import { AppLogoutButton } from "@/components/app-mobile/AppLogoutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모바일 계정 정보",
  robots: { index: false, follow: false },
};


export default async function AppAccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/app/login?next=/app/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: { player: true },
  });

  if (!user) redirect("/app/login?next=/app/account");


  return (
    <AppMobileShell subtitle="K-LOL.GG APP">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ACCOUNT</div>
        <h1 className="klol-app-title">계정관리</h1>
      </section>

      <AppSection title="계정 정보">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>아이디</span>
            <strong>{user.userId}</strong>
          </div>
          <div className="klol-app-meta">
            <span>상태</span>
            <strong>{user.status}</strong>
          </div>
          <div className="klol-app-meta">
            <span>권한</span>
            <strong>{user.role}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="내 플레이어 정보">
        {user.player ? (
          <div className="klol-app-meta-grid">
            <div className="klol-app-meta">
              <span>플레이어</span>
              <strong>{user.player.name} / {user.player.nickname}#{user.player.tag}</strong>
            </div>
            <div className="klol-app-meta">
              <span>현재 티어</span>
              <strong>{user.player.currentTier || "-"}</strong>
            </div>
            <div className="klol-app-meta">
              <span>최고 티어</span>
              <strong>{user.player.peakTier || "-"}</strong>
            </div>
          </div>
        ) : (
          <AppEmpty>연결된 플레이어 정보가 없습니다.</AppEmpty>
        )}
      </AppSection>

      <AppSection title="로그아웃">
        <div className="klol-app-actions klol-app-actions--keep">
          <AppLogoutButton />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
