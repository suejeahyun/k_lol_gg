"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminDisciplineRecordDto } from "@/modules/discipline/application/ports";
import styles from "./discipline.module.css";

export function AdminDisciplineActions({ record, canManage }: { record: AdminDisciplineRecordDto; canManage: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [note, setNote] = useState(record.internalNote ?? ""); const [reason, setReason] = useState(record.reason); const [reviewNote, setReviewNote] = useState("");
  async function mutate(url: string, method: "PATCH" | "DELETE", revision: number, body: unknown) {
    setBusy(true); setError(false); const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }).catch(() => null); setBusy(false); if (!response?.ok) { setError(true); return; } router.refresh();
  }
  if (!canManage) return <section className={`${styles.panel} ${styles.form}`}><h2>읽기 전용</h2><p className={styles.notice}>징계 기록의 수정·취소와 증빙 검토는 최고 관리자만 할 수 있습니다.</p></section>;
  return <section className={`${styles.panel} ${styles.form}`}><h2>최고 관리자 작업</h2><label className={styles.field}><span>사유</span><textarea rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className={styles.field}><span>내부 메모</span><textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label><div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => mutate(`/api/admin/discipline-records/${record.id}`, "PATCH", record.revision, { reason, internalNote: note || null })}>내용 저장</button>{record.active ? <button type="button" className={styles.link} disabled={busy} onClick={() => mutate(`/api/admin/discipline-records/${record.id}`, "DELETE", record.revision, { reason: "최고 관리자 취소" })}>기록 취소</button> : null}</div>
    {record.task?.status === "PENDING_REVIEW" ? <><label className={styles.field}><span>검토 메모</span><textarea rows={3} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => mutate(`/api/admin/discipline-tasks/${record.task!.id}/review`, "PATCH", record.task!.revision, { decision: "APPROVE", reviewNote })}>과제 승인</button><button type="button" className={styles.link} disabled={busy || !reviewNote.trim()} onClick={() => mutate(`/api/admin/discipline-tasks/${record.task!.id}/review`, "PATCH", record.task!.revision, { decision: "REJECT", reviewNote })}>보완 요청</button><button type="button" className={styles.link} disabled={busy || !reviewNote.trim()} onClick={() => mutate(`/api/admin/discipline-tasks/${record.task!.id}/review`, "PATCH", record.task!.revision, { decision: "CANCEL", reviewNote })}>과제 취소</button></div></> : null}
    {error ? <p className={styles.error} role="alert">처리하지 못했습니다. 최신 revision과 관리자 TOTP 세션을 확인해 주세요.</p> : null}</section>;
}
