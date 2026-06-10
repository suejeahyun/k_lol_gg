import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppMenuCard, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppMePage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>> | null = null;
  let player: Awaited<ReturnType<typeof prisma.player.findUnique>> | null = null;
  let errorMessage = "";

  try {
    user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    player = await prisma.player.findUnique({ where: { userAccountId: user.userAccountId } });
  } catch (error) {
    errorMessage = "로그인이 필요합니다.";
  }

  return (
    <AppMobileShell subtitle="내 정보">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">MY PAGE</div>
        <h1 className="klol-app-title">내 정보</h1>
        <p className="klol-app-subtitle">
          {player
            ? `${player.name || player.nickname} · ${player.nickname}#${player.tag}`
            : errorMessage || "계정 정보를 확인합니다."}
        </p>
        <div className="klol-app-actions">
          <a className="klol-app-primary" href={user ? ((user.role === "ADMIN" || user.role === "SUPER_ADMIN") ? "/admin" : "/account") : "/login"}>{user ? ((user.role === "ADMIN" || user.role === "SUPER_ADMIN") ? "관리자" : "계정") : "로그인"}</a>
        </div>
      </section>

      <AppSection title="플레이어 상태">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>이름</span>
            <strong>{player?.name || "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>현재 티어</span>
            <strong>{player?.currentTier || "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>최고 티어</span>
            <strong>{player?.peakTier || "-"}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="메뉴">
        <div className="klol-app-grid">
          {(user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") ? (
            <AppMenuCard href="/admin" title="관리자 페이지" />
          ) : (
            <AppMenuCard href="/account" title="계정" />
          )}
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
