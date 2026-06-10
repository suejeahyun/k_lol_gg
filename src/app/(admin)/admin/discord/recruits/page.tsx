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

function formatDateOnly(value?: string | null) {
  if (!value) return "날짜 미상";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function groupAutoFinishedByDate(items: NonNullable<ReturnType<typeof useDiscordOverview>["data"]>["autoFinishedRecruitMonitors"]) {
  const groups = new Map<string, typeof items>();
  for (const item of items || []) {
    const key = item.recruitDate || formatDateOnly(item.autoFinishedAt || item.updatedAt);
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return Array.from(groups.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
}

function simpleReason(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "자동 종료";
  if (raw.includes("all_left") || raw.includes("ALL_LEFT")) return "참가자 퇴장 확인";
  if (raw.length > 28) return `${raw.slice(0, 28)}...`;
  return raw;
}

function displayVoiceRoomName(item: NonNullable<ReturnType<typeof useDiscordOverview>["data"]>["autoFinishedRecruitMonitors"][number]) {
  return item.voiceChannelName || "음성방 이름 미확인";
}

export default function DiscordRecruitPage() {
  const { data, loading, load } = useDiscordOverview();
  const autoFinishedGroups = data ? groupAutoFinishedByDate(data.autoFinishedRecruitMonitors || []) : [];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div>
          <h1 className="admin-page__title">구인 Discord 검증</h1>
        </div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="recruits" />
      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><h2>구인구직 Discord 모임 검증</h2></div>
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
      <section className="admin-card discord-ops-panel">
        <div className="admin-section-head"><h2>자동 종료</h2></div>
        {loading || !data ? (
          <div className="admin-empty">불러오는 중입니다.</div>
        ) : autoFinishedGroups.length === 0 ? (
          <div className="admin-empty">자동 종료된 구인이 없습니다.</div>
        ) : (
          <div className="discord-auto-finish-history">
            {autoFinishedGroups.map(([dateKey, items]) => (
              <div className="discord-auto-finish-day" key={dateKey}>
                <div className="discord-auto-finish-day__head">
                  <strong>{dateKey}</strong>
                  <span>{items.length}건</span>
                </div>
                <div className="discord-auto-finish-cards">
                  {items.map((item) => (
                    <article className="discord-auto-finish-card" key={`${dateKey}-${item.monitorId}`}>
                      <div className="discord-auto-finish-card__main">
                        <div className="discord-auto-finish-field discord-auto-finish-field--no">
                          <span>구인 번호</span>
                          <strong># {item.recruitNo}</strong>
                        </div>
                        <div className="discord-auto-finish-field discord-auto-finish-field--members">
                          <span>파티 인원 이름</span>
                          <ListAll items={item.participantNames} empty="등록된 이름 없음" />
                        </div>
                        <div className="discord-auto-finish-field">
                          <span>확인 인원</span>
                          <strong>{item.lastPresentExpectedCount}/{item.lastExpectedCount || item.participantNames.length || item.maxMembers}</strong>
                        </div>
                        <div className="discord-auto-finish-field">
                          <span>음성방</span>
                          <strong title={displayVoiceRoomName(item)}>{displayVoiceRoomName(item)}</strong>
                        </div>
                        <div className="discord-auto-finish-field">
                          <span>자동종료</span>
                          <strong>{formatDate(item.autoFinishedAt || item.updatedAt)}</strong>
                        </div>
                        <div className="discord-auto-finish-field">
                          <span>사유</span>
                          <strong>{simpleReason(item.autoFinishReason)}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
