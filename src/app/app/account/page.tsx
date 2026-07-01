import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { AppMobileShell } from "@/components/app-mobile/AppMobileShell";
import { AppSection, AppEmpty } from "@/components/app-mobile/AppCards";
import { AppDiscordLinkButton } from "@/components/app-mobile/AppDiscordLinkButton";
import { AppLogoutButton } from "@/components/app-mobile/AppLogoutButton";

export const dynamic = "force-dynamic";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}


export default async function AppAccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/app/login?next=/app/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: { player: true },
  });

  if (!user) redirect("/app/login?next=/app/account");

  const discordLinked = Boolean(user.discordId);
  const discordName = user.discordServerNickname || user.discordGlobalName || user.discordUsername || "연동됨";
  const parsedDiscordName = [
    user.discordParsedBirthYear,
    user.discordParsedName,
    user.discordParsedNickname,
    user.discordParsedTier,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AppMobileShell subtitle="K-LOL.GG APP">
      <section className="klol-app-hero">
        <div className="klol-app-kicker">ACCOUNT</div>
        <h1 className="klol-app-title">계정관리</h1>
        <p className="klol-app-subtitle">계정, 플레이어, Discord 연동 상태를 앱에서 관리합니다.</p>
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

      <AppSection title="Discord 계정 연동">
        <div className="klol-app-discord-card klol-app-discord-card--profile">
          <div className="klol-app-discord-profile">
            {user.discordAvatar ? (
              <img src={user.discordAvatar} alt="Discord avatar" />
            ) : (
              <div className="klol-app-discord-avatar">D</div>
            )}
            <div>
              <span className="klol-app-discord-label">연동 상태</span>
              <strong>{discordLinked ? discordName : "미연동"}</strong>
              <p>{discordLinked ? "음성방 검증과 구인 확인에 사용됩니다." : "Discord를 연결하면 음성방 기록을 사이트 계정과 매칭할 수 있습니다."}</p>
            </div>
          </div>

          <div className="klol-app-meta-grid klol-app-meta-grid--compact">
            <div className="klol-app-meta">
              <span>Discord ID</span>
              <strong>{user.discordId || "-"}</strong>
            </div>
            <div className="klol-app-meta">
              <span>연동일</span>
              <strong>{formatDate(user.discordLinkedAt)}</strong>
            </div>
            <div className="klol-app-meta">
              <span>파싱 정보</span>
              <strong>{parsedDiscordName || "-"}</strong>
            </div>
          </div>

          <div className="klol-app-actions klol-app-actions--keep klol-app-actions--inline">
            <AppDiscordLinkButton linked={discordLinked} next="/app/account" />
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
