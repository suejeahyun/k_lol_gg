export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import DiscordUnlinkButton from "./DiscordUnlinkButton";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { hour12: true });
}

function eventLabel(value: string) {
  if (value === "JOIN") return "입장";
  if (value === "MOVE") return "이동";
  if (value === "LEAVE") return "퇴장";
  return value;
}

export default async function AccountPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login?next=/account");

  const user = await prisma.userAccount.findUnique({
    where: { id: session.userAccountId },
    include: {
      player: true,
      discordAccountLinkLogs: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });
  if (!user) redirect("/login?next=/account");

  const recentVoiceEvents = user.discordId ? await prisma.discordVoiceEvent.findMany({
    where: { discordId: user.discordId },
    orderBy: { occurredAt: "desc" },
    take: 8,
  }) : [];

  const discordName = user.discordServerNickname || user.discordGlobalName || user.discordUsername || "연동됨";

  return (
    <main className="user-page account-page">
      <div className="user-page__header">
        <div>
          <h1 className="user-page__title">내 계정</h1>
          <p className="user-page__description">K-LOL.GG 계정과 Discord 연동 상태를 관리합니다.</p>
        </div>
      </div>

      <section className="admin-card account-card">
        <div className="admin-section-head">
          <div>
            <h2>계정 정보</h2>
            <p className="admin-muted">아이디 {user.userId} · 상태 {user.status} · 권한 {user.role}</p>
          </div>
        </div>
        <div className="discord-detail-grid">
          <div><span>플레이어</span><strong>{user.player ? `${user.player.name} / ${user.player.nickname}#${user.player.tag}` : "미연결"}</strong></div>
          <div><span>현재 티어</span><strong>{user.player?.currentTier || "-"}</strong></div>
          <div><span>최고 티어</span><strong>{user.player?.peakTier || "-"}</strong></div>
        </div>
      </section>

      <section className="admin-card account-card">
        <div className="admin-section-head">
          <div>
            <h2>Discord 계정 연동</h2>
            <p className="admin-muted">음성방 검증, 구인 자동화, 역할 동기화 기준으로 사용됩니다.</p>
          </div>
          {user.discordId ? <DiscordUnlinkButton /> : (
            <Link className="admin-button" href="/api/auth/discord/start?mode=link&next=/account">Discord 연동하기</Link>
          )}
        </div>

        {user.discordId ? (
          <div className="discord-profile-card">
            {user.discordAvatar ? <img src={user.discordAvatar} alt="Discord avatar" /> : <div className="discord-avatar-placeholder">D</div>}
            <div>
              <h3>{discordName}</h3>
              <p>Discord ID: {user.discordId}</p>
              <p>연동 상태: {user.discordLinkStatus} · 연동일: {formatDate(user.discordLinkedAt)}</p>
              <p>파싱: {[user.discordParsedBirthYear, user.discordParsedName, user.discordParsedNickname, user.discordParsedTier].filter(Boolean).join(" ") || "-"}</p>
            </div>
          </div>
        ) : (
          <div className="admin-empty">Discord 계정이 아직 연동되지 않았습니다. 연동하면 음성방 기록과 사이트 계정을 정확히 매칭할 수 있습니다.</div>
        )}
      </section>

      <section className="admin-card account-card">
        <h2>최근 Discord 음성 기록</h2>
        {recentVoiceEvents.length === 0 ? <p className="admin-muted">최근 음성 이벤트가 없습니다.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>일시</th><th>이벤트</th><th>채널</th><th>이전 채널</th></tr></thead>
              <tbody>{recentVoiceEvents.map((event) => (
                <tr key={event.id}><td>{formatDate(event.occurredAt)}</td><td>{eventLabel(event.eventType)}</td><td>{event.channelName || event.channelId || "-"}</td><td>{event.previousChannelName || event.previousChannelId || "-"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-card account-card">
        <h2>Discord 연동 로그</h2>
        {user.discordAccountLinkLogs.length === 0 ? <p className="admin-muted">연동 로그가 없습니다.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>일시</th><th>작업</th><th>Discord</th><th>사유</th></tr></thead>
              <tbody>{user.discordAccountLinkLogs.map((log) => (
                <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.action}</td><td>{log.discordServerNickname || log.discordGlobalName || log.discordUsername || log.discordId || "-"}</td><td>{log.reason || "-"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
