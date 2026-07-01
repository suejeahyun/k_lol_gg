import Link from "next/link";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection } from "@/components/app-mobile/AppCards";
import { AppDiscordLinkButton } from "@/components/app-mobile/AppDiscordLinkButton";

export const dynamic = "force-dynamic";

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

type AppMeUser = NonNullable<Awaited<ReturnType<typeof prisma.userAccount.findUnique>>> & {
  player?: Awaited<ReturnType<typeof prisma.player.findUnique>> | null;
};

function formatDiscordName(user: AppMeUser | null) {
  if (!user) return "-";
  return user.discordServerNickname || user.discordGlobalName || user.discordUsername || "연동됨";
}

export default async function AppMePage() {
  let session: Awaited<ReturnType<typeof getCurrentUser>> | null = null;
  let user: AppMeUser | null = null;
  let player: Awaited<ReturnType<typeof prisma.player.findUnique>> | null = null;
  let errorMessage = "";

  try {
    session = await getCurrentUser();
    if (!session) throw new Error("UNAUTHORIZED");

    user = (await prisma.userAccount.findUnique({
      where: { id: session.userAccountId },
      include: { player: true },
    })) as AppMeUser | null;

    player = user?.player ?? null;
  } catch {
    errorMessage = "로그인이 필요합니다.";
  }

  const isAdmin = isAdminRole(user?.role ?? session?.role);
  const discordLinked = Boolean(user?.discordId);
  const discordName = formatDiscordName(user);

  return (
    <AppMobileShell subtitle="K-LOL.GG APP">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">MY PAGE</div>
        <h1 className="klol-app-title">내정보</h1>
        <p className="klol-app-subtitle">
          {player
            ? `${player.name || player.nickname} · ${player.nickname}#${player.tag}`
            : errorMessage || user?.userId || "계정 정보를 확인합니다."}
        </p>
        <div className="klol-app-actions klol-app-actions--keep">
          {!user ? (
            <Link className="klol-app-primary" href="/app/login?next=/app/me">로그인</Link>
          ) : (
            <Link className="klol-app-primary" href="/app/account">계정 관리</Link>
          )}
        </div>
      </section>

      <AppSection title="계정">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>아이디</span>
            <strong>{user?.userId || "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>권한</span>
            <strong>{isAdmin ? "관리자" : user ? "일반" : "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>상태</span>
            <strong>{user?.status || "-"}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="플레이어">
        <div className="klol-app-meta-grid">
          <div className="klol-app-meta">
            <span>이름</span>
            <strong>{player?.name || "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>닉네임</span>
            <strong>{player ? `${player.nickname}#${player.tag}` : "-"}</strong>
          </div>
          <div className="klol-app-meta">
            <span>현재 티어</span>
            <strong>{player?.currentTier || "-"}</strong>
          </div>
        </div>
      </AppSection>

      <AppSection title="Discord">
        <div className="klol-app-discord-card">
          <div>
            <span className="klol-app-discord-label">연동 상태</span>
            <strong>{discordLinked ? "연동됨" : "미연동"}</strong>
            <p>{discordLinked ? discordName : "Discord 계정을 연결하면 음성방/구인 확인에 사용할 수 있습니다."}</p>
          </div>
          <div className="klol-app-actions klol-app-actions--keep klol-app-actions--inline">
            <AppDiscordLinkButton linked={discordLinked} disabled={!user} next="/app/account" />
          </div>
        </div>
      </AppSection>
    </AppMobileShell>
  );
}
