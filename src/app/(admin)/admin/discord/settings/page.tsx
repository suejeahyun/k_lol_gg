"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { DiscordSettings } from "../_DiscordOverviewTypes";
import { formatDate, secondsToText, useDiscordOverview } from "../_DiscordClientUtils";
import styles from "../DiscordReadable.module.css";

function split(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}
function joinIds(value: string[] | null | undefined) {
  return (value ?? []).join("\n");
}
function updateNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className={styles.fieldLabel}>{label}<input className={styles.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim())} /></label>;
}
function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className={styles.fieldLabel}>{label}<input className={styles.input} type="number" min={min} max={max} value={value} onChange={(e) => onChange(updateNumber(e.target.value))} /></label>;
}
function SelectBoolean({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.fieldLabel}>{label}<select className={styles.select} value={value ? "true" : "false"} onChange={(e) => onChange(e.target.value === "true")}><option value="true">ON</option><option value="false">OFF</option></select></label>;
}
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className={`${styles.fieldLabel} ${styles.formFull}`}>{label}<textarea className={styles.textarea} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={4} /></label>;
}

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
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>DISCORD SETTINGS</p>
            <h1 className={styles.title}>Discord 운영 설정</h1>
            <p className={styles.desc}>자동마감, 지각 경고, 감시 채널, 역할 ID를 구역별로 분리했습니다. ID 입력 영역은 줄바꿈 입력을 지원합니다.</p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/admin/discord">대시보드</Link>
            <button className={styles.button} type="button" onClick={() => void load()}>새로고침</button>
          </div>
        </div>

        {loading || !data || !settings ? <section className={styles.card}><div className={styles.empty}>설정을 불러오는 중입니다.</div></section> : (
          <>
            <section className={styles.statsGrid}>
              <div className={styles.statCard}><span className={styles.statLabel}>봇 상태</span><strong className={styles.statValue}>{latestBot?.status || "-"}</strong><div className={styles.statHint}>{latestBot?.botUsername || latestBot?.botId || "heartbeat 없음"}</div></div>
              <div className={styles.statCard}><span className={styles.statLabel}>마지막 신호</span><strong className={styles.statValue}>{latestBot ? formatDate(latestBot.updatedAt) : "-"}</strong><div className={styles.statHint}>봇 heartbeat 기준</div></div>
              <div className={styles.statCard}><span className={styles.statLabel}>자동 ㅉ</span><strong className={styles.statValue}>{settings.autoFinishEnabled ? "ON" : "OFF"}</strong><div className={styles.statHint}>{settings.autoFinishHoldMinutes}분 유지</div></div>
              <div className={styles.statCard}><span className={styles.statLabel}>감시 방식</span><strong className={styles.statValue}>{settings.watchAllVoiceChannels ? "전체" : "지정"}</strong><div className={styles.statHint}>채널 {(settings.watchChannelIds ?? []).length}개 · 카테고리 {(settings.watchCategoryIds ?? []).length}개</div></div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHead}>
                <div><h2 className={styles.cardTitle}>봇 상태 요약</h2><p className={styles.cardMeta}>상태 확인용 영역입니다. 설정 변경은 아래 폼에서 진행합니다.</p></div>
                <button type="button" className={styles.linkButton} onClick={handleRoleSync}>역할 동기화 요청</button>
              </div>
              {latestBot ? <div className={styles.settingsGrid}>
                <div className={styles.kvCard}><span>봇</span><strong>{latestBot.botUsername || latestBot.botId}</strong></div>
                <div className={styles.kvCard}><span>Uptime</span><strong>{secondsToText(latestBot.uptimeSeconds)}</strong></div>
                <div className={styles.kvCard}><span>메모리</span><strong>{latestBot.memoryRssMb ? `${latestBot.memoryRssMb.toFixed(1)}MB` : "-"}</strong></div>
                <div className={styles.kvCard}><span>자동마감</span><strong>{latestBot.autoFinishEnabled ? "ON" : "OFF"}</strong></div>
                <div className={styles.kvCard}><span>마지막 오류</span><strong>{latestBot.lastError || "없음"}</strong></div>
                <div className={styles.kvCard}><span>음성 인원</span><strong>{latestBot.voiceMemberCount ?? 0}명</strong></div>
              </div> : <div className={styles.empty}>heartbeat 기록이 없습니다.</div>}
            </section>

            <form className={styles.card} onSubmit={handleSave}>
              <section className={styles.formSection}>
                <h2 className={styles.formSectionTitle}>자동화</h2>
                <p className={styles.formSectionDesc}>구인 자동마감, 지각 경고, heartbeat 기준값을 관리합니다.</p>
                <div className={styles.formGridThree}>
                  <SelectBoolean label="자동 ㅉ" value={settings.autoFinishEnabled} onChange={(value) => setSettings({ ...settings, autoFinishEnabled: value })} />
                  <NumberInput label="자동 ㅉ 후보 유지 분" min={1} max={120} value={settings.autoFinishHoldMinutes} onChange={(value) => setSettings({ ...settings, autoFinishHoldMinutes: value })} />
                  <SelectBoolean label="구인 지각 자동 경고" value={settings.recruitLateWarningEnabled} onChange={(value) => setSettings({ ...settings, recruitLateWarningEnabled: value })} />
                  <NumberInput label="구인 지각 유예 분" min={0} max={120} value={settings.recruitLateWarningGraceMinutes} onChange={(value) => setSettings({ ...settings, recruitLateWarningGraceMinutes: value })} />
                  <SelectBoolean label="구인 지각 개인 DM" value={settings.recruitLateWarningDmEnabled} onChange={(value) => setSettings({ ...settings, recruitLateWarningDmEnabled: value })} />
                  <SelectBoolean label="전체 음성방 감시" value={settings.watchAllVoiceChannels} onChange={(value) => setSettings({ ...settings, watchAllVoiceChannels: value })} />
                  <NumberInput label="Heartbeat 주기 초" min={10} value={settings.heartbeatIntervalSeconds} onChange={(value) => setSettings({ ...settings, heartbeatIntervalSeconds: value })} />
                  <NumberInput label="Heartbeat 지연 경고 초" min={30} value={settings.staleHeartbeatSeconds} onChange={(value) => setSettings({ ...settings, staleHeartbeatSeconds: value })} />
                </div>
              </section>

              <section className={styles.formSection}>
                <h2 className={styles.formSectionTitle}>감시 대상</h2>
                <p className={styles.formSectionDesc}>감시할 채널/카테고리 ID를 줄바꿈 또는 쉼표로 입력합니다.</p>
                <div className={styles.formGrid}>
                  <TextArea label="감시 채널 ID" value={joinIds(settings.watchChannelIds)} onChange={(value) => setSettings({ ...settings, watchChannelIds: split(value) })} placeholder="1234567890\n2345678901" />
                  <TextArea label="감시 카테고리 ID" value={joinIds(settings.watchCategoryIds)} onChange={(value) => setSettings({ ...settings, watchCategoryIds: split(value) })} placeholder="1234567890" />
                </div>
              </section>

              <section className={styles.formSection}>
                <h2 className={styles.formSectionTitle}>채널 ID</h2>
                <p className={styles.formSectionDesc}>로그, 공지, 구인 알림이 전송될 채널을 지정합니다.</p>
                <div className={styles.formGrid}>
                  <TextInput label="관리자 로그 채널 ID" value={settings.adminLogChannelId || ""} onChange={(value) => setSettings({ ...settings, adminLogChannelId: value || null })} />
                  <TextInput label="공지 채널 ID" value={settings.noticeChannelId || ""} onChange={(value) => setSettings({ ...settings, noticeChannelId: value || null })} />
                  <TextInput label="구인 로그 채널 ID" value={settings.recruitLogChannelId || ""} onChange={(value) => setSettings({ ...settings, recruitLogChannelId: value || null })} />
                </div>
              </section>

              <section className={styles.formSection}>
                <h2 className={styles.formSectionTitle}>역할 ID</h2>
                <p className={styles.formSectionDesc}>승인 역할과 라인별 역할을 지정합니다. 비워두면 해당 역할은 동기화하지 않습니다.</p>
                <div className={styles.formGridThree}>
                  <TextInput label="승인 역할 ID" value={settings.approvedRoleId || ""} onChange={(value) => setSettings({ ...settings, approvedRoleId: value || null })} />
                  <TextInput label="TOP 역할 ID" value={settings.topRoleId || ""} onChange={(value) => setSettings({ ...settings, topRoleId: value || null })} />
                  <TextInput label="JGL 역할 ID" value={settings.jglRoleId || ""} onChange={(value) => setSettings({ ...settings, jglRoleId: value || null })} />
                  <TextInput label="MID 역할 ID" value={settings.midRoleId || ""} onChange={(value) => setSettings({ ...settings, midRoleId: value || null })} />
                  <TextInput label="ADC 역할 ID" value={settings.adcRoleId || ""} onChange={(value) => setSettings({ ...settings, adcRoleId: value || null })} />
                  <TextInput label="SUP 역할 ID" value={settings.supRoleId || ""} onChange={(value) => setSettings({ ...settings, supRoleId: value || null })} />
                </div>
              </section>

              <div className={styles.saveFooter}><button className={styles.button} type="submit" disabled={saving}>{saving ? "저장 중" : "설정 저장"}</button></div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
