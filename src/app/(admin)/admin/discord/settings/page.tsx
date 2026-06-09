"use client";
import DiscordOpsStyles from "../_DiscordOpsStyles";
import DiscordOpsNav from "../_DiscordOpsNav";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { DiscordSettings } from "../_DiscordOverviewTypes";
import { formatDate, secondsToText, useDiscordOverview } from "../_DiscordClientUtils";

function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span>{label}</span><input className="admin-input" value={value} onChange={(e) => onChange(e.target.value.trim())} /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label><span>{label}</span><textarea className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} rows={3} /></label>; }

export default function DiscordSettingsPage() {
  const { data, loading, load } = useDiscordOverview();
  const [settings, setSettings] = useState<DiscordSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.settings) setSettings(data.settings); }, [data]);

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

  const latestBot = data?.heartbeats?.[0];

  return (
    <main className="admin-page discord-ops-page">
      <DiscordOpsStyles />
      <div className="admin-page__header discord-ops-header">
        <div><h1 className="admin-page__title">Discord 운영 설정</h1><p className="admin-page__description">자동화 설정만 관리합니다. Discord 계정 연동은 선택사항이며, 구인·내전 확인은 이름매칭을 함께 사용합니다.</p></div>
        <div className="admin-actions"><Link className="admin-button admin-button--secondary" href="/admin/discord">대시보드</Link><button className="admin-button" type="button" onClick={() => void load()}>새로고침</button></div>
      </div>
      <DiscordOpsNav active="settings" />
      <div className="discord-ops-notice">연동 역할 자동화는 선택 기능입니다. 구인/내전 확인은 Discord ID 연동이 없어도 서버 닉네임 이름 토큰으로 처리됩니다.</div>

      {loading || !data || !settings ? <section className="admin-card"><div className="admin-empty">설정을 불러오는 중입니다.</div></section> : (
        <>
<section className="admin-card discord-ops-panel">
            <div className="admin-section-head"><h2>봇 상태</h2><button type="button" className="chip-button" onClick={handleRoleSync}>역할 동기화 요청</button></div>
            {latestBot ? <div className="discord-ops-kv">
              <div><span>봇</span><strong>{latestBot.botUsername || latestBot.botId}</strong></div>
              <div><span>상태</span><strong>{latestBot.status}</strong></div>
              <div><span>마지막 신호</span><strong>{formatDate(latestBot.updatedAt)}</strong></div>
              <div><span>Uptime</span><strong>{secondsToText(latestBot.uptimeSeconds)}</strong></div>
              <div><span>메모리</span><strong>{latestBot.memoryRssMb ? `${latestBot.memoryRssMb.toFixed(1)}MB` : "-"}</strong></div>
              <div><span>자동 ㅉ</span><strong>{latestBot.autoFinishEnabled ? "ON" : "OFF"}</strong></div>
            </div> : <p className="admin-muted">heartbeat 기록이 없습니다.</p>}
          </section>

          <section className="admin-card discord-ops-panel">
            <div className="admin-section-head"><div><h2>자동화 설정</h2><p className="admin-muted">저장 후 봇이 원격 설정 조회 주기에 자동 반영합니다.</p></div></div>
            <form className="discord-settings-form discord-settings-form--readable" onSubmit={handleSave}>
              <label><span>자동 ㅉ</span><select className="admin-input" value={settings.autoFinishEnabled ? "true" : "false"} onChange={(e) => setSettings({ ...settings, autoFinishEnabled: e.target.value === "true" })}><option value="true">ON</option><option value="false">OFF</option></select></label>
              <label><span>자동 ㅉ 후보 유지 분</span><input className="admin-input" type="number" min="1" max="120" value={settings.autoFinishHoldMinutes} onChange={(e) => setSettings({ ...settings, autoFinishHoldMinutes: Number(e.target.value) })} /></label>
              <label><span>전체 음성방 감시</span><select className="admin-input" value={settings.watchAllVoiceChannels ? "true" : "false"} onChange={(e) => setSettings({ ...settings, watchAllVoiceChannels: e.target.value === "true" })}><option value="true">ON</option><option value="false">OFF</option></select></label>
              <label><span>Heartbeat 주기 초</span><input className="admin-input" type="number" min="10" value={settings.heartbeatIntervalSeconds} onChange={(e) => setSettings({ ...settings, heartbeatIntervalSeconds: Number(e.target.value) })} /></label>
              <label><span>Heartbeat 지연 경고 초</span><input className="admin-input" type="number" min="30" value={settings.staleHeartbeatSeconds} onChange={(e) => setSettings({ ...settings, staleHeartbeatSeconds: Number(e.target.value) })} /></label>
              <TextArea label="감시 채널 ID" value={settings.watchChannelIds.join(",")} onChange={(v) => setSettings({ ...settings, watchChannelIds: split(v) })} />
              <TextArea label="감시 카테고리 ID" value={settings.watchCategoryIds.join(",")} onChange={(v) => setSettings({ ...settings, watchCategoryIds: split(v) })} />
              <Input label="관리자 로그 채널 ID" value={settings.adminLogChannelId || ""} onChange={(v) => setSettings({ ...settings, adminLogChannelId: v || null })} />
              <Input label="공지 채널 ID" value={settings.noticeChannelId || ""} onChange={(v) => setSettings({ ...settings, noticeChannelId: v || null })} />
              <Input label="구인 로그 채널 ID" value={settings.recruitLogChannelId || ""} onChange={(v) => setSettings({ ...settings, recruitLogChannelId: v || null })} />
              <Input label="승인 역할 ID" value={settings.approvedRoleId || ""} onChange={(v) => setSettings({ ...settings, approvedRoleId: v || null })} />
              <Input label="TOP 역할 ID" value={settings.topRoleId || ""} onChange={(v) => setSettings({ ...settings, topRoleId: v || null })} />
              <Input label="JGL 역할 ID" value={settings.jglRoleId || ""} onChange={(v) => setSettings({ ...settings, jglRoleId: v || null })} />
              <Input label="MID 역할 ID" value={settings.midRoleId || ""} onChange={(v) => setSettings({ ...settings, midRoleId: v || null })} />
              <Input label="ADC 역할 ID" value={settings.adcRoleId || ""} onChange={(v) => setSettings({ ...settings, adcRoleId: v || null })} />
              <Input label="SUP 역할 ID" value={settings.supRoleId || ""} onChange={(v) => setSettings({ ...settings, supRoleId: v || null })} />
              <div className="discord-settings-actions"><button className="admin-button" type="submit" disabled={saving}>{saving ? "저장 중" : "설정 저장"}</button></div>
            </form>
          </section>
        </>
      )}
    </main>
  );
}