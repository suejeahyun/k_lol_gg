"use client";

import { useState, type FormEvent } from "react";
import type { KakaoOperationSettingsDto } from "@/modules/recruiting/kakao-admin/domain";
import styles from "./kakao.module.css";

const labels: Record<Exclude<keyof KakaoOperationSettingsDto, "revision" | "updatedAt" | "maxMessageLength">, string> = {
  globalEnabled: "전체 Kakao 연동", maintenanceMode: "유지보수 모드", playerSearchEnabled: "플레이어 검색",
  seasonApplicationsEnabled: "시즌 참가 동기화", imageReceiveEnabled: "비공개 이미지 수신",
  recruitingEnabled: "파티·스크림·운영 신청서", scheduledNoticeEnabled: "예약 공지 조회",
};

export function KakaoSettingsForm({ initial }: { initial: KakaoOperationSettingsDto }) {
  const [settings, setSettings] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  async function submit(event: FormEvent) {
    event.preventDefault(); setState("saving");
    const payload = Object.fromEntries([...Object.keys(labels), "maxMessageLength"].map((key) => [key, settings[key as keyof KakaoOperationSettingsDto]]));
    const response = await fetch("/api/admin/kakao/settings", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${settings.revision}"`, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) }).catch(() => null);
    if (!response?.ok) { setState("error"); return; }
    const body = await response.json() as { settings?: KakaoOperationSettingsDto };
    if (!body.settings) { setState("error"); return; }
    setSettings(body.settings); setState("saved");
  }
  return <form className={styles.settingsForm} onSubmit={submit}>
    <div className={styles.checks}>{(Object.keys(labels) as (keyof typeof labels)[]).map((key) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}/><span>{labels[key]}</span></label>)}</div>
    <label className={styles.numberField}><span>메시지 최대 길이</span><input type="number" min={100} max={10000} value={settings.maxMessageLength} onChange={(event) => setSettings({ ...settings, maxMessageLength: Number(event.target.value) })}/></label>
    {state === "saved" ? <p role="status">설정을 저장했습니다.</p> : null}{state === "error" ? <p role="alert">저장하지 못했습니다. 최신 revision과 SUPER 2단계 인증을 확인해 주세요.</p> : null}
    <div className={styles.actions}><button type="submit" disabled={state === "saving"}>{state === "saving" ? "저장 중…" : "운영 설정 저장"}</button><small>revision {settings.revision}</small></div>
  </form>;
}
