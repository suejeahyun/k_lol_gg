"use client";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";

import Link from "next/link";
import { formatDate, statusLabel, useDiscordOverview } from "../_DiscordClientUtils";

function ListAll({ items, empty = "-" }: { items?: string[]; empty?: string }) {
  if (!items || items.length === 0) return <span>{empty}</span>;

  return (
    <ol className="discord-inline-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>
          <span className="discord-inline-list__index">{index + 1}.</span>
          <span className="discord-inline-list__text">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function ChannelList({ items, fallback = "-" }: { items?: string[]; fallback?: string }) {
  if (!items || items.length === 0) return <span>{fallback}</span>;
  return <ListAll items={items} />;
}

export default function DiscordRecruitPage() {
  const { data, loading, load } = useDiscordOverview();
  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">구인 Discord 검증</h1>
          <p className="admin-page__description">구인 등록 전 이미 음성방에 들어와 있던 경우, 일부만 모인 경우, 구경 인원이 있는 경우까지 분리해서 확인합니다.</p>
        </div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="recruits" />
      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><h2>구인구직 Discord 모임 검증</h2></div>
        <p className="admin-muted" style={{ marginTop: -6 }}>자동 ㅉ은 “같은 음성방에서 구인 참가자 1명 이상 확인 → 이후 해당 방에서 매칭 인원 0명 → 보류 시간 경과” 기준입니다. 다른 방 인원은 합산하지 않고, 관전/외부 인원은 참가자로 계산하지 않습니다.</p>
        {loading || !data ? <div className="admin-empty">불러오는 중입니다.</div> : <div className="admin-table-wrap"><table className="admin-table discord-compact-table"><thead><tr><th>구인</th><th>상태</th><th>구인 인원</th><th>Discord 확인</th><th>구경/외부</th><th>미확인</th><th>오류/예외</th><th>음성방</th><th>갱신</th></tr></thead><tbody>
          {data.recruitVerifications.length === 0 ? <tr><td colSpan={9}>진행중인 구인이 없습니다.</td></tr> : data.recruitVerifications.map((item) => <tr key={item.partyId}>
            <td><strong>#{item.recruitNo}</strong><br /><span className="admin-muted">{item.title}</span><div className="discord-scenario-list">{item.scenarioLabels?.map((label) => <span className="discord-scenario-chip" key={label}>{label}</span>)}</div></td>
            <td><span className={`discord-status-pill discord-status-${item.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel(item.status)}</span></td>
            <td>{item.activeMemberCount}/{item.maxMembers}</td>
            <td title={item.presentParticipants.join("\n")}>{item.presentCount}명<br /><span className="admin-muted">이름 {item.matchedByNameCount}명</span></td>
            <td title={(item.nonParticipantDisplayNames || []).join("\n")}><ListAll items={item.nonParticipantDisplayNames} /></td>
            <td title={item.missingParticipants.join("\n")}><ListAll items={item.missingParticipants} /></td>
            <td title={item.unlinkedParticipants.join("\n")}>{item.ambiguousCount > 0 ? `동명이인 ${item.ambiguousCount}` : item.channelReestimated ? "방 재추정" : "-"}</td>
            <td title={item.voiceChannelId || ""}><ChannelList items={item.guessedChannelNames} fallback={item.voiceChannelId || "-"} /></td>
            <td>{formatDate(item.lastScannedAt)}</td>
          </tr>)}
        </tbody></table></div>}
      </section>
    </main>
  );
}
