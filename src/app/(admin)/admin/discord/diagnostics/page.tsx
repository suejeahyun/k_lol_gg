"use client";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";

import Link from "next/link";
import { useDiscordOverview } from "../_DiscordClientUtils";

export default function DiscordDiagnosticsPage() {
  const { data, loading, load } = useDiscordOverview();
  const diagnostics = data?.diagnostics || [];
  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div><h1 className="admin-page__title">Discord 자동화 오류 점검</h1></div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="diagnostics" />
       <section className="admin-card discord-ops-panel">
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