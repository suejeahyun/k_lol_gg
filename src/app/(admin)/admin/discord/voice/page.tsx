"use client";

import Link from "next/link";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import { useDiscordOverview } from "../_DiscordClientUtils";

function formatKstDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function displayName(user: { memberDisplayName: string | null; memberNickname: string | null; discordGlobalName: string | null; discordUsername: string | null }) {
  return user.memberDisplayName || user.memberNickname || user.discordGlobalName || user.discordUsername || "이름 없음";
}

export default function DiscordVoicePage() {
  const { data, loading, load } = useDiscordOverview();
  const users = data?.currentVoiceUsers ?? [];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">Discord 음성방 모니터</h1>
          <p className="admin-muted">현재 음성방 접속자, 연동 계정, 연결 플레이어를 확인합니다.</p>
        </div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="voice" />

      <section className="card-grid">
        <div className="stat-card"><span className="stat-card__label">현재 음성 접속</span><strong className="stat-card__value">{users.length.toLocaleString("ko-KR")}</strong></div>
        <div className="stat-card"><span className="stat-card__label">연동 접속</span><strong className="stat-card__value">{users.filter((user) => user.userAccountId).length.toLocaleString("ko-KR")}</strong></div>
        <div className="stat-card"><span className="stat-card__label">미연동 접속</span><strong className="stat-card__value">{users.filter((user) => !user.userAccountId).length.toLocaleString("ko-KR")}</strong></div>
      </section>

      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><div><h2>현재 음성방 접속자</h2><p className="admin-muted">구인검증과 내전출석의 기준이 되는 원본 상태입니다.</p></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>접속자</th><th>채널</th><th>연동 상태</th><th>플레이어</th><th>입장/갱신</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={5}>불러오는 중입니다.</td></tr> : users.length === 0 ? <tr><td colSpan={5}>현재 음성 접속자가 없습니다.</td></tr> : users.map((user) => <tr key={`${user.discordId}-${user.channelName || "unknown"}`}>
            <td><strong>{displayName(user)}</strong><br /><span className="admin-muted">{user.discordId}</span></td>
            <td>{user.channelName || "-"}</td>
            <td>{user.userAccountId ? <span className="discord-status-pill discord-status-ok">연동</span> : <span className="discord-status-pill discord-status-warn">미연동</span>}</td>
            <td>{user.userAccount?.player ? `${user.userAccount.player.nickname}#${user.userAccount.player.tag}` : "-"}<div className="admin-muted">{user.userAccount?.userId || "계정 없음"}</div></td>
            <td>{formatKstDateTime(user.occurredAt)}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}
