"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./admin-media.module.css";

export function AdminPrivateAssetDelete({ assetId, disabled }: { assetId: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestDeletion() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/admin/private-assets/${assetId}`, { method: "DELETE", credentials: "same-origin" });
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      if (!response.ok) { setMessage(payload?.detail ?? "삭제 대기 요청을 처리하지 못했습니다."); return; }
      router.refresh();
    } catch { setMessage("네트워크 연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }

  return <div className={styles.deleteBox}>
    <button className={styles.dangerButton} disabled={disabled || busy} type="button" onClick={() => void requestDeletion()}>{busy ? "요청 중…" : disabled ? "이미 삭제 대기 중" : "안전 삭제 요청"}</button>
    <p>즉시 지우지 않고 DELETE_PENDING으로 전환합니다. 실제 저장소 정리는 별도 작업자가 감사 기록과 함께 수행합니다.</p>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
  </div>;
}
