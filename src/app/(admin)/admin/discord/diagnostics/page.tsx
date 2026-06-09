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
        <div><h1 className="admin-page__title">Discord 자동화 오류 점검</h1><p className="admin-page__description">봇 heartbeat, 감시 범위, 자동 ㅉ 설정, 구인 모니터 갱신 지연 등 실제 작동 문제만 분리해서 확인합니다. Discord ID 미연동은 오류로 보지 않습니다.</p></div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="diagnostics" />
      <div className="discord-ops-notice">이름매칭이 가능하므로 Discord 계정 미연동 자체는 오류가 아닙니다. 동명이인, 감시 범위 없음, heartbeat 지연처럼 자동화에 직접 영향을 주는 항목만 조치 대상으로 봅니다.</div>
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