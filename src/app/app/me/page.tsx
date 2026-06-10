import { prisma } from "@/lib/prisma/client";
import { requireApprovedUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppMenuCard, AppSection } from "@/components/app-mobile/AppCards";

export const dynamic = "force-dynamic";

export default async function AppMePage() {
  let user: Awaited<ReturnType<typeof requireApprovedUser>> | null = null;
  let player: Awaited<ReturnType<typeof prisma.player.findUnique>> | null = null;
  let errorMessage = "";

  try {
    user = await requireApprovedUser();
    player = await prisma.player.findUnique({ where: { userAccountId: user.userAccountId } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_APPROVED") {
      errorMessage = "관리자 승인 후 이용 가능합니다.";
    } else {
      errorMessage = "로그인이 필요합니다.";
    }
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
          <a className="klol-app-primary" href={user ? "/account" : "/login"}>{user ? "계정 관리" : "로그인"}</a>
          <a className="klol-app-secondary" href="/signup">회원가입</a>
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

      <AppSection title="바로가기">
        <div className="klol-app-grid">
          <AppMenuCard href="/account" title="계정/Discord" description="계정 연결 상태와 Discord 연동 관리" />
          <AppMenuCard href="/participation" title="참가 신청" description="시즌 참가 신청 및 상태 확인" />
          <AppMenuCard href="/balance" title="팀 밸런스" description="내전 팀 밸런스 도구로 이동" />
          <AppMenuCard href="/community" title="커뮤니티" description="게시판과 건의사항 확인" />
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
