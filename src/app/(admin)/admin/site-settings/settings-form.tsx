"use client";

import { useState, type FormEvent } from "react";

import type { PublicFeatureFlags, SiteSettings } from "@/modules/operations/domain/site-settings";

import styles from "../operations.module.css";

const featureLabels: Record<keyof PublicFeatureFlags, string> = {
  registrations: "회원가입", matchSubmissions: "경기 제출", teamBalance: "팀 밸런스",
  kakaoHelp: "카카오 도움말", riotIntegration: "Riot 연동", aiAssistant: "AI 도우미",
};

export default function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    const response = await fetch("/api/admin/site-settings", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "If-Match": `"${settings.revision}"`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        brandName: settings.brandName,
        tagline: settings.tagline,
        supportUrl: settings.supportUrl,
        features: settings.features,
        aiAllowedRoles: settings.aiAllowedRoles,
        aiRequestsPerHour: settings.aiRequestsPerHour,
        aiDailyCostLimitMicros: settings.aiDailyCostLimitMicros,
        internalMaintenanceNote: settings.internalMaintenanceNote,
      }),
    }).catch(() => null);
    if (!response?.ok) { setState("error"); return; }
    const body = await response.json() as { settings?: SiteSettings };
    if (!body.settings) { setState("error"); return; }
    setSettings(body.settings);
    setState("saved");
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}><span>브랜드 이름</span><input value={settings.brandName} maxLength={80} onChange={(event) => setSettings({ ...settings, brandName: event.target.value })} /></label>
      <label className={styles.field}><span>소개 문구</span><input value={settings.tagline} maxLength={160} onChange={(event) => setSettings({ ...settings, tagline: event.target.value })} /></label>
      <label className={styles.field}><span>지원 URL (HTTPS)</span><input type="url" value={settings.supportUrl ?? ""} onChange={(event) => setSettings({ ...settings, supportUrl: event.target.value || null })} /></label>
      <div className={styles.checks} aria-label="기능 스위치">
        {(Object.keys(featureLabels) as (keyof PublicFeatureFlags)[]).map((key) => (
          <label className={styles.check} key={key}><input type="checkbox" checked={settings.features[key]} onChange={(event) => setSettings({ ...settings, features: { ...settings.features, [key]: event.target.checked } })} />{featureLabels[key]}</label>
        ))}
      </div>
      <label className={styles.field}><span>AI 시간당 요청 한도</span><input type="number" min={1} max={1000} value={settings.aiRequestsPerHour} onChange={(event) => setSettings({ ...settings, aiRequestsPerHour: Number(event.target.value) })} /></label>
      <label className={styles.field}><span>AI 일일 비용 한도 (micro-unit)</span><input type="number" min={0} max={1_000_000_000} value={settings.aiDailyCostLimitMicros} onChange={(event) => setSettings({ ...settings, aiDailyCostLimitMicros: Number(event.target.value) })} /></label>
      <label className={styles.field}><span>내부 유지보수 메모 (공개되지 않음)</span><textarea rows={4} maxLength={2000} value={settings.internalMaintenanceNote ?? ""} onChange={(event) => setSettings({ ...settings, internalMaintenanceNote: event.target.value || null })} /></label>
      {state === "saved" ? <p className={styles.notice} role="status">설정을 저장했습니다.</p> : null}
      {state === "error" ? <p className={styles.error} role="alert">저장하지 못했습니다. 최신 설정을 다시 불러와 확인해 주세요.</p> : null}
      <div className={styles.actions}><button type="submit" className={styles.button} disabled={state === "saving"}>{state === "saving" ? "저장 중…" : "설정 저장"}</button><span className={styles.muted}>revision {settings.revision}</span></div>
    </form>
  );
}
