export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import DiscordUnlinkButton from "./DiscordUnlinkButton";

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

export default async function AccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: {
      player: true,
    },
  });
  if (!user) redirect("/login?next=/account");

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
    <main className="user-page account-page account-page--compact">
      <div className="user-page__header account-page__header">
        <div>
          <h1 className="user-page__title">내 계정</h1>
          <p className="user-page__description">K-LOL.GG 계정과 Discord 연동 상태를 관리합니다.</p>
        </div>
      </div>

      <section className="admin-card account-card account-summary-card">
        <div className="admin-section-head">
          <div>
            <h2>계정 정보</h2>
            <p className="admin-muted">아이디 {user.userId} · 상태 {user.status} · 권한 {user.role}</p>
          </div>
        </div>

        <div className="account-info-grid">
          <div>
            <span>플레이어</span>
            <strong>{user.player ? `${user.player.name} / ${user.player.nickname}#${user.player.tag}` : "미연결"}</strong>
          </div>
          <div>
            <span>현재 티어</span>
            <strong>{user.player?.currentTier || "-"}</strong>
          </div>
          <div>
            <span>최고 티어</span>
            <strong>{user.player?.peakTier || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="admin-card account-card account-discord-card">
        <div className="admin-section-head account-discord-card__head">
          <div>
            <h2>Discord 계정 연동</h2>
            <p className="admin-muted">음성방 검증, 구인 자동화, 역할 동기화 기준으로 사용됩니다.</p>
          </div>
          {user.discordId ? (
            <DiscordUnlinkButton />
          ) : (
            <Link className="admin-button account-discord-card__button" href="/api/auth/discord/start?mode=link&next=/account">
              Discord 연동하기
            </Link>
          )}
        </div>

        {user.discordId ? (
          <div className="discord-profile-card discord-profile-card--compact">
            {user.discordAvatar ? (
              <img src={user.discordAvatar} alt="Discord avatar" />
            ) : (
              <div className="discord-avatar-placeholder">D</div>
            )}
            <div className="discord-profile-card__body">
              <div className="discord-profile-card__title-row">
                <h3>{discordName}</h3>
                <span className="discord-status-pill">연동됨</span>
              </div>
              <dl className="discord-profile-meta">
                <div>
                  <dt>Discord ID</dt>
                  <dd>{user.discordId}</dd>
                </div>
                <div>
                  <dt>연동일</dt>
                  <dd>{formatDate(user.discordLinkedAt)}</dd>
                </div>
                <div>
                  <dt>파싱 정보</dt>
                  <dd>{parsedDiscordName || "-"}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : (
          <div className="account-discord-empty">
            <strong>Discord 계정이 아직 연동되지 않았습니다.</strong>
            <p>연동하면 음성방 기록과 사이트 계정을 정확히 매칭할 수 있습니다.</p>
          </div>
        )}
      </section>
    </main>
  );
}
