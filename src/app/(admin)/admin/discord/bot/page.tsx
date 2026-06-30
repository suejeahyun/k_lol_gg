"use client";

import Link from "next/link";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";
import { useDiscordOverview } from "../_DiscordClientUtils";

function formatKstDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function DiscordBotPage() {
  const { data, loading, load } = useDiscordOverview();
  const heartbeats = data?.heartbeats ?? [];
  const diagnostics = data?.diagnostics ?? [];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">Discord 봇 상태</h1>
          <p className="admin-muted">Heartbeat, 메모리, 자동화 오류를 봇 기준으로 확인합니다.</p>
        </div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="bot" />

      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><div><h2>Heartbeat</h2><p className="admin-muted">봇 서버가 전송한 최신 상태입니다.</p></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>봇</th><th>상태</th><th>업데이트</th><th>업타임</th><th>메모리</th><th>음성 인원</th><th>마지막 오류</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={7}>불러오는 중입니다.</td></tr> : heartbeats.length === 0 ? <tr><td colSpan={7}>Heartbeat 기록이 없습니다.</td></tr> : heartbeats.map((bot) => <tr key={bot.botId}>
            <td><strong>{bot.botUsername || bot.botId}</strong><br /><span className="admin-muted">{bot.botId}</span></td>
            <td><span className={`discord-status-pill discord-status-${bot.status.toLowerCase()}`}>{bot.status}</span></td>
            <td>{formatKstDateTime(bot.updatedAt)}</td>
            <td>{Math.floor(bot.uptimeSeconds / 3600).toLocaleString("ko-KR")}시간</td>
            <td>{bot.memoryRssMb == null ? "-" : `${bot.memoryRssMb}MB`}</td>
            <td>{bot.voiceMemberCount}</td>
            <td className="admin-muted">{bot.lastError || "-"}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><div><h2>자동화 오류 점검</h2><p className="admin-muted">기존 오류 점검 페이지를 봇 상태 하위로 정리했습니다.</p></div><Link className="admin-button admin-button--ghost" href="/admin/discord/diagnostics">기존 오류 페이지</Link></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>수준</th><th>항목</th><th>상태</th><th>조치</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={4}>불러오는 중입니다.</td></tr> : diagnostics.length === 0 ? <tr><td colSpan={4}>점검 결과가 없습니다.</td></tr> : diagnostics.map((item) => <tr key={item.code}>
            <td><span className={`discord-status-pill discord-status-${item.level.toLowerCase()}`}>{item.level}</span></td>
            <td><strong>{item.title}</strong><br /><span className="admin-muted">{item.code}</span></td>
            <td>{item.message}</td>
            <td>{item.action || "-"}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}
