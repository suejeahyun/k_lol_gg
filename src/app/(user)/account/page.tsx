export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import DiscordUnlinkButton from "./DiscordUnlinkButton";
import UserLogoutButton from "@/components/UserLogoutButton";

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

function getDiscordMessage(code: string | undefined) {
  switch (code) {
    case "linked":
      return { type: "success", text: "Discord 계정 연동이 완료되었습니다." };
    case "unlinked":
      return { type: "info", text: "Discord 계정 연동을 해제했습니다." };
    case "duplicate":
      return { type: "error", text: "이미 다른 계정에 연동된 Discord 계정입니다. 관리자 페이지에서 기존 연동을 먼저 해제해야 합니다." };
    case "invalid_state":
      return { type: "error", text: "Discord 연동 요청이 만료되었습니다. 다시 시도하세요." };
    case "missing_code":
      return { type: "error", text: "Discord 인증 코드가 전달되지 않았습니다. OAuth 설정과 Redirect URI를 확인하세요." };
    case "cancelled":
      return { type: "info", text: "Discord 연동이 취소되었습니다." };
    case "failed":
      return { type: "error", text: "Discord 연동 처리 중 오류가 발생했습니다. 환경변수와 Discord 개발자 포털 Redirect URI를 확인하세요." };
    default:
      return null;
  }
}

type AccountPageProps = {
  searchParams?: Promise<{ discord?: string }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const discordMessage = getDiscordMessage(resolvedSearchParams.discord);

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
          <h1 className="user-page__title">내 정보</h1>
        </div>
      </div>

      {discordMessage ? (
        <div className={`account-discord-alert account-discord-alert--${discordMessage.type}`} role="status">
          {discordMessage.text}
        </div>
      ) : null}

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
            <a className="admin-button account-discord-card__button" href="/api/auth/discord/start?mode=link&next=/account">
              Discord 연동하기
            </a>
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

      <section className="account-action-grid" aria-label="내정보 수정 메뉴">
        <Link className="account-action-card" href="/account/tier">
          <span className="account-action-card__eyebrow">PLAYER</span>
          <strong>계정 정보 수정</strong>
          <p>현재티어와 최고티어를 수정합니다.</p>
          <span className="account-action-card__cta">수정하기</span>
        </Link>

        <Link className="account-action-card" href="/account/password">
          <span className="account-action-card__eyebrow">SECURITY</span>
          <strong>비밀번호 변경</strong>
          <p>현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>
          <span className="account-action-card__cta">변경하기</span>
        </Link>
      </section>
    </main>
  );
}

