"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Overview = {
  summary: {
    approvedUsers: number;
    linkedUsers: number;
    unlinkedApprovedUsers: number;
    linkRate: number;
    recentEventCount: number;
    currentVoiceUserCount: number;
    currentLinkedVoiceUserCount: number;
    currentUnlinkedVoiceUserCount: number;
    activeMonitorCount: number;
    healthyBotCount: number;
    recruitReadyCount: number;
    recruitNeedsCheckCount: number;
  };
  settings: DiscordSettings;
  heartbeats: Array<{ botId: string; status: string; botUsername: string | null; updatedAt: string; uptimeSeconds: number; memoryRssMb: number | null; voiceMemberCount: number; autoFinishEnabled: boolean; lastError: string | null }>;
  currentVoiceUsers: Array<{ id: number; discordId: string; eventType: string; channelName: string | null; memberDisplayName: string | null; memberNickname: string | null; discordUsername: string | null; discordGlobalName: string | null; occurredAt: string; userAccountId: number | null; userAccount?: { userId: string; discordServerNickname: string | null; discordGlobalName: string | null; discordUsername: string | null; player: { name: string | null; nickname: string; tag: string } | null } | null }>;
  recentUnlinkedEvents: Array<{ id: number; discordId: string; eventType: string; channelName: string | null; memberDisplayName: string | null; memberNickname: string | null; discordUsername: string | null; discordGlobalName: string | null; occurredAt: string }>;
  activeMonitors: Array<{ id: number; status: string; voiceChannelId: string | null; lastExpectedCount: number; lastPresentExpectedCount: number; lastNonParticipantCount: number; updatedAt: string; party: { id: number; recruitNo: number; title: string; type: string; status: string } }>;
  recruitVerifications: Array<{
    partyId: number;
    recruitNo: number;
    title: string;
    type: string;
    status: string;
    partyStatus: string;
    maxMembers: number;
    activeMemberCount: number;
    linkedCount: number;
    presentCount: number;
    matchedByNameCount: number;
    ambiguousCount: number;
    missingCount: number;
    unlinkedCount: number;
    voiceChannelId: string | null;
    monitorStatus: string | null;
    lastScannedAt: string | null;
    finishCandidateStartedAt: string | null;
    autoFinishedAt: string | null;
    autoFinishReason: string | null;
    presentParticipants: string[];
    missingParticipants: string[];
    unlinkedParticipants: string[];
  }>;
  linkLogs: Array<{ id: number; action: string; discordId: string | null; discordServerNickname: string | null; discordGlobalName: string | null; discordUsername: string | null; reason: string | null; createdAt: string; userAccount: { userId: string; player: { name: string | null; nickname: string; tag: string } | null } | null }>;
};

type DiscordSettings = {
  autoFinishEnabled: boolean;
  autoFinishHoldMinutes: number;
  watchAllVoiceChannels: boolean;
  watchChannelIds: string[];
  watchCategoryIds: string[];
  adminLogChannelId: string | null;
  noticeChannelId: string | null;
  recruitLogChannelId: string | null;
  approvedRoleId: string | null;
  topRoleId: string | null;
  jglRoleId: string | null;
  midRoleId: string | null;
  adcRoleId: string | null;
  supRoleId: string | null;
  heartbeatIntervalSeconds: number;
  staleHeartbeatSeconds: number;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function userLabel(event: Overview["currentVoiceUsers"][number] | Overview["recentUnlinkedEvents"][number]) {
  if ("userAccount" in event && event.userAccount) {
    const player = event.userAccount.player;
    return player ? `${player.name || "-"} / ${player.nickname}#${player.tag}` : event.userAccount.userId;
  }
  return event.memberDisplayName || event.memberNickname || event.discordGlobalName || event.discordUsername || `Discord ${event.discordId.slice(-4)}`;
}

function secondsToText(value: number) {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function AdminDiscordPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<DiscordSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/discord/overview", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Discord 운영 현황 조회 실패");
    setData(json);
    setSettings(json.settings);
    setLoading(false);
  }

  useEffect(() => { void load().catch((error) => { console.error(error); setLoading(false); }); }, []);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/discord/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "설정 저장 실패");
      alert("Discord 운영 설정을 저장했습니다. 봇은 다음 설정 조회 주기에 반영합니다.");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "설정 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleSync = async () => {
    const ok = confirm("Discord 역할 전체 동기화 요청 로그를 남기겠습니까?");
    if (!ok) return;
    const res = await fetch("/api/admin/discord/roles/sync", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    alert(json.message || (res.ok ? "요청 완료" : "요청 실패"));
  };

  return (
    <main className="admin-page discord-operation-page">
      <div className="admin-page__header">
        <div>
          <h1 className="admin-page__title">Discord 운영 시스템 설정</h1>
          <p className="admin-page__description">봇 상태, 현재 음성방, 구인 검증, 운영 설정을 관리합니다. 상세 로그는 메인 화면에서 확인합니다.</p>
        </div>
        <div className="admin-actions">
          <button className="admin-button" type="button" onClick={() => void load()}>새로고침</button>
          <Link className="admin-button admin-button--secondary" href="/admin/discord">상세 로그 메인</Link>
        </div>
      </div>

      {loading || !data || !settings ? <section className="admin-card"><div className="admin-empty">Discord 운영 현황을 불러오는 중입니다.</div></section> : (
        <>
          <section className="admin-card discord-help-card">
            <div className="admin-section-head"><h2>설정 화면 기능 설명</h2></div>
            <div className="discord-help-grid">
              <div><strong>봇 상태</strong><span>Heartbeat 기준으로 봇이 살아있는지, 마지막 신호, 메모리, 자동 ㅉ 상태를 확인합니다.</span></div>
              <div><strong>현재 음성방 접속자</strong><span>최근 JOIN/MOVE/LEAVE 로그를 기준으로 현재 접속 중으로 추정되는 유저를 보여줍니다.</span></div>
              <div><strong>미연동 Discord 접속자</strong><span>음성방 기록은 있지만 사이트 계정과 연결되지 않은 Discord 유저입니다.</span></div>
              <div><strong>구인 Discord 검증</strong><span>구인 참가자가 실제 디스코드 음성방에 모였는지, 누가 미접속인지, 전원 퇴장 후 자동 ㅉ 후보인지 확인합니다.</span></div>
              <div><strong>Discord 운영 설정</strong><span>자동 ㅉ, 감시 채널, 로그 채널, 승인 역할 ID를 저장합니다. 봇은 설정 조회 주기에 반영합니다.</span></div>
              <div><strong>감사 로그</strong><span>Discord 계정 연동, 해제, 관리자 강제 해제 같은 계정 관련 기록입니다.</span></div>
            </div>
          </section>

          <section className="discord-stat-grid">
            <Stat label="봇 정상" value={`${data.summary.healthyBotCount}개`} caption="heartbeat 기준" />
            <Stat label="연동률" value={`${data.summary.linkRate}%`} caption={`${data.summary.linkedUsers}/${data.summary.approvedUsers}명`} />
            <Stat label="현재 음성방" value={`${data.summary.currentVoiceUserCount}명`} caption={`연동 ${data.summary.currentLinkedVoiceUserCount} / 미연동 ${data.summary.currentUnlinkedVoiceUserCount}`} />
            <Stat label="구인 감시" value={`${data.summary.activeMonitorCount}건`} caption="ACTIVE / 후보" />
            <Stat label="구인 모임 확인" value={`${data.summary.recruitReadyCount || 0}건`} caption={`확인 필요 ${data.summary.recruitNeedsCheckCount || 0}건`} />
            <Stat label="최근 이벤트" value={`${data.summary.recentEventCount}건`} caption="최근 6시간" />
          </section>

          <section className="admin-card">
            <div className="admin-section-head"><h2>봇 상태</h2><button type="button" className="chip-button" onClick={handleRoleSync}>역할 동기화 요청</button></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>봇</th><th>상태</th><th>마지막 신호</th><th>Uptime</th><th>메모리</th><th>음성 인원</th><th>자동 ㅉ</th><th>오류</th></tr></thead><tbody>
              {data.heartbeats.length === 0 ? <tr><td colSpan={8}>heartbeat 기록이 없습니다.</td></tr> : data.heartbeats.map((bot) => <tr key={bot.botId}><td>{bot.botUsername || bot.botId}</td><td>{bot.status}</td><td>{formatDate(bot.updatedAt)}</td><td>{secondsToText(bot.uptimeSeconds)}</td><td>{bot.memoryRssMb ? `${bot.memoryRssMb.toFixed(1)}MB` : "-"}</td><td>{bot.voiceMemberCount}</td><td>{bot.autoFinishEnabled ? "ON" : "OFF"}</td><td>{bot.lastError || "-"}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className="admin-card">
            <h2>현재 음성방 접속자</h2>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>유저</th><th>연동</th><th>채널</th><th>마지막 이벤트</th><th>일시</th></tr></thead><tbody>
              {data.currentVoiceUsers.length === 0 ? <tr><td colSpan={5}>현재 추정 접속자가 없습니다.</td></tr> : data.currentVoiceUsers.map((event) => <tr key={`${event.discordId}-${event.id}`}><td>{userLabel(event)}</td><td>{event.userAccountId ? "연동" : "미연동"}</td><td>{event.channelName || "-"}</td><td>{event.eventType}</td><td>{formatDate(event.occurredAt)}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className="admin-card">
            <h2>미연동 Discord 접속자</h2>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Discord</th><th>ID</th><th>채널</th><th>이벤트</th><th>일시</th></tr></thead><tbody>
              {data.recentUnlinkedEvents.length === 0 ? <tr><td colSpan={5}>최근 미연동 이벤트가 없습니다.</td></tr> : data.recentUnlinkedEvents.map((event) => <tr key={event.id}><td>{userLabel(event)}</td><td>{event.discordId}</td><td>{event.channelName || "-"}</td><td>{event.eventType}</td><td>{formatDate(event.occurredAt)}</td></tr>)}
            </tbody></table></div>
          </section>

          <section className="admin-card">
            <div className="admin-section-head">
              <div>
                <h2>구인구직 Discord 모임 검증</h2>
                <p className="admin-page__description">진행중인 구인이 실제 음성방에 제대로 모였는지 확인합니다. Discord 연동이 없어도 서버 닉네임의 이름 토큰과 카카오톡/구인 참가자 이름이 정확히 같으면 참가로 인정합니다.</p>
              </div>
            </div>
            <div className="admin-table-wrap"><table className="admin-table discord-recruit-check-table"><thead><tr><th>구인</th><th>상태</th><th>인원</th><th>현재 접속</th><th>이름매칭</th><th>미접속</th><th>확인필요</th><th>음성방</th><th>갱신</th></tr></thead><tbody>
              {data.recruitVerifications.length === 0 ? <tr><td colSpan={9}>진행중인 구인이 없습니다.</td></tr> : data.recruitVerifications.map((item) => <tr key={item.partyId}>
                <td><strong>#{item.recruitNo}</strong> · {item.title}</td>
                <td><span className={`discord-status-pill discord-status-${item.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel(item.status)}</span></td>
                <td>{item.activeMemberCount}/{item.maxMembers}</td>
                <td title={item.presentParticipants.join("\n")}>{item.presentCount}명</td>
                <td>{item.matchedByNameCount > 0 ? `${item.matchedByNameCount}명` : "-"}</td>
                <td title={item.missingParticipants.join("\n")}>{item.missingCount > 0 ? item.missingParticipants.slice(0, 2).join(", ") + (item.missingParticipants.length > 2 ? ` 외 ${item.missingParticipants.length - 2}` : "") : "-"}</td>
                <td title={item.unlinkedParticipants.join("\n")}>{item.ambiguousCount > 0 ? `동명이인 ${item.ambiguousCount}` : item.unlinkedCount > 0 ? item.unlinkedParticipants.slice(0, 2).join(", ") + (item.unlinkedParticipants.length > 2 ? ` 외 ${item.unlinkedParticipants.length - 2}` : "") : "-"}</td>
                <td>{item.voiceChannelId || "-"}</td>
                <td>{formatDate(item.lastScannedAt)}</td>
              </tr>)}
            </tbody></table></div>
          </section>

          <section className="admin-card">
            <h2>Discord 운영 설정</h2>
            <form className="discord-settings-form" onSubmit={handleSave}>
              <label><span>자동 ㅉ</span><select className="admin-input" value={settings.autoFinishEnabled ? "true" : "false"} onChange={(e) => setSettings({ ...settings, autoFinishEnabled: e.target.value === "true" })}><option value="true">ON</option><option value="false">OFF</option></select></label>
              <label><span>자동 ㅉ 후보 유지 분</span><input className="admin-input" type="number" value={settings.autoFinishHoldMinutes} onChange={(e) => setSettings({ ...settings, autoFinishHoldMinutes: Number(e.target.value) })} /></label>
              <label><span>전체 음성방 감시</span><select className="admin-input" value={settings.watchAllVoiceChannels ? "true" : "false"} onChange={(e) => setSettings({ ...settings, watchAllVoiceChannels: e.target.value === "true" })}><option value="true">ON</option><option value="false">OFF</option></select></label>
              <TextArea label="감시 채널 ID" value={settings.watchChannelIds.join(",")} onChange={(v) => setSettings({ ...settings, watchChannelIds: split(v) })} />
              <TextArea label="감시 카테고리 ID" value={settings.watchCategoryIds.join(",")} onChange={(v) => setSettings({ ...settings, watchCategoryIds: split(v) })} />
              <Input label="관리자 로그 채널 ID" value={settings.adminLogChannelId || ""} onChange={(v) => setSettings({ ...settings, adminLogChannelId: v || null })} />
              <Input label="공지 채널 ID" value={settings.noticeChannelId || ""} onChange={(v) => setSettings({ ...settings, noticeChannelId: v || null })} />
              <Input label="구인 로그 채널 ID" value={settings.recruitLogChannelId || ""} onChange={(v) => setSettings({ ...settings, recruitLogChannelId: v || null })} />
              <Input label="승인 역할 ID" value={settings.approvedRoleId || ""} onChange={(v) => setSettings({ ...settings, approvedRoleId: v || null })} />
              <button className="admin-button" type="submit" disabled={saving}>{saving ? "저장 중" : "설정 저장"}</button>
            </form>
          </section>

          <section className="admin-card">
            <h2>최근 Discord 연동 감사 로그</h2>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>일시</th><th>작업</th><th>계정</th><th>Discord</th><th>사유</th></tr></thead><tbody>
              {data.linkLogs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt)}</td><td>{log.action}</td><td>{log.userAccount?.player ? `${log.userAccount.player.name || "-"} / ${log.userAccount.player.nickname}#${log.userAccount.player.tag}` : log.userAccount?.userId || "-"}</td><td>{log.discordServerNickname || log.discordGlobalName || log.discordUsername || log.discordId || "-"}</td><td>{log.reason || "-"}</td></tr>)}
            </tbody></table></div>
          </section>
        </>
      )}
      <style>{`
        .discord-help-card { margin-bottom: 16px; }
        .discord-help-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .discord-help-grid div { display: grid; gap: 6px; padding: 14px; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 14px; background: rgba(2, 6, 23, 0.34); }
        .discord-help-grid strong { color: #e5e7eb; font-size: 13px; }
        .discord-help-grid span { color: #94a3b8; font-size: 12px; line-height: 1.55; }
        .discord-recruit-check-table td { vertical-align: top; }
        .discord-status-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 74px; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; border: 1px solid rgba(148, 163, 184, 0.24); background: rgba(15, 23, 42, 0.7); color: #dbeafe; white-space: nowrap; }
        .discord-status-assembled { border-color: rgba(34, 197, 94, .45); color: #bbf7d0; background: rgba(22, 101, 52, .25); }
        .discord-status-assembled-with-extra { border-color: rgba(250, 204, 21, .45); color: #fef08a; background: rgba(113, 63, 18, .25); }
        .discord-status-gathering { border-color: rgba(59, 130, 246, .45); color: #bfdbfe; background: rgba(30, 64, 175, .25); }
        .discord-status-finish-candidate { border-color: rgba(248, 113, 113, .45); color: #fecaca; background: rgba(127, 29, 29, .28); }
        .discord-status-auto-finished { border-color: rgba(20, 184, 166, .45); color: #ccfbf1; background: rgba(19, 78, 74, .28); }
        .discord-status-discord-link-incomplete, .discord-status-recruit-not-full { border-color: rgba(251, 146, 60, .45); color: #fed7aa; background: rgba(124, 45, 18, .25); }
        @media (max-width: 1100px) { .discord-help-grid { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    ASSEMBLED: "모임 완료",
    ASSEMBLED_WITH_EXTRA: "모임 완료+외부",
    GATHERING: "모이는 중",
    WAITING: "대기",
    RECRUIT_NOT_FULL: "구인 미충족",
    DISCORD_LINK_INCOMPLETE: "연동 부족",
    FINISH_CANDIDATE: "ㅉ 후보",
    AUTO_FINISHED: "자동 ㅉ 완료",
    ACTIVE: "감시 중",
  };
  return map[status] || status;
}

function Stat({ label, value, caption }: { label: string; value: string; caption: string }) {
  return <div className="discord-stat-card"><div className="discord-stat-label">{label}</div><div className="discord-stat-value">{value}</div><div className="discord-stat-caption">{caption}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input className="admin-input" value={value} onChange={(e) => onChange(e.target.value.trim())} /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><textarea className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} rows={3} /></label>;
}

function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
