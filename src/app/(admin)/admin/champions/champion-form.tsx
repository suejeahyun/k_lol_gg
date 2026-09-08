"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminChampionDto } from "@/modules/champions";

import styles from "@/components/admin/media/admin-media.module.css";

export function ChampionForm({ initial }: { initial?: AdminChampionDto }) {
  const router = useRouter();
  const [key, setKey] = useState(initial?.key ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setMessage("");
    const response = await fetch(initial ? `/api/admin/champions/${encodeURIComponent(initial.key)}` : "/api/admin/champions", {
      method: initial ? "PATCH" : "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(initial ? { displayName, status } : { key, displayName }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null) as AdminChampionDto & { detail?: string } | null;
    if (!response?.ok || !body) { setMessage(body?.detail ?? "저장하지 못했습니다. 최신 상태와 관리자 인증을 확인해 주세요."); setPending(false); return; }
    setRevision(body.revision);
    setStatus(body.status);
    router.push(`/admin/champions/${encodeURIComponent(body.key)}/edit`); router.refresh();
    setPending(false);
  }

  async function deactivate() {
    if (!initial || !window.confirm(`${initial.displayName} 챔피언을 비활성화할까요? 과거 경기 기록은 유지됩니다.`)) return;
    setPending(true); setMessage("");
    const response = await fetch(`/api/admin/champions/${encodeURIComponent(initial.key)}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "If-Match": `"${revision}"`, "Idempotency-Key": crypto.randomUUID() },
    }).catch(() => null);
    const body = await response?.json().catch(() => null) as AdminChampionDto & { detail?: string } | null;
    if (!response?.ok || !body) { setMessage(body?.detail ?? "비활성화하지 못했습니다. 최신 상태를 다시 불러와 주세요."); setPending(false); return; }
    setRevision(body.revision);
    setStatus(body.status);
    setPending(false);
    router.refresh();
  }

  return <form className={styles.form} onSubmit={submit}><label>고정 키<input value={key} onChange={(event) => setKey(event.target.value)} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}" maxLength={64} disabled={Boolean(initial) || pending} required /><span className={styles.hint}>예: ahri · 등록 후에는 변경할 수 없습니다.</span></label><label>표시 이름<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} disabled={pending} required /></label>{initial ? <label>상태<select value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "INACTIVE")} disabled={pending}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label> : null}<p className={styles.notice}>고정 키는 경기 원장과 연결되므로 등록 후 유지됩니다. 사용 중단은 기록 삭제 대신 비활성화로 처리합니다.</p><div className={styles.actions}><button className={styles.submit} type="submit" disabled={pending}>{pending ? "저장 중…" : initial ? "변경 저장" : "챔피언 등록"}</button>{initial && status === "ACTIVE" ? <button className={styles.danger} type="button" disabled={pending} onClick={deactivate}>비활성화</button> : null}</div>{message ? <p className={styles.error} role="alert">{message}</p> : null}</form>;
}
