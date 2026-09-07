"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { OwnerDisciplineTaskDto } from "@/modules/discipline/application/ports";
import styles from "./discipline.module.css";

const statusLabel = { REQUIRED: "업로드 필요", AWAITING_UPLOAD: "추가 업로드 필요", PENDING_REVIEW: "검토 대기", REJECTED: "보완 필요", APPROVED: "승인 완료", CANCELLED: "취소됨" } as const;
async function sha256(file: File) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export function OwnerDisciplineTasks({ tasks }: { tasks: readonly OwnerDisciplineTaskDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function upload(task: OwnerDisciplineTaskDto, files: FileList | null) {
    if (!files?.length) return;
    setBusy(task.id); setMessage(null); let revision = task.revision;
    for (const file of Array.from(files).slice(0, task.remainingEvidenceCount)) {
      const digest = await sha256(file);
      const response = await fetch(`/api/me/discipline/tasks/${task.id}/evidence`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type, "If-Match": `"${revision}"`, "Idempotency-Key": crypto.randomUUID(), "X-Content-Sha256": digest, "X-Upload-File-Name": encodeURIComponent(file.name) }, body: file }).catch(() => null);
      if (!response?.ok) { setMessage("일부 파일을 저장하지 못했습니다. 이미 저장된 파일은 유지되므로 새로고침 후 이어서 제출해 주세요."); break; }
      const body = await response.json() as { revision?: number }; if (typeof body.revision === "number") revision = body.revision;
    }
    setBusy(null); router.refresh();
  }
  async function submitReady(task: OwnerDisciplineTaskDto, assetId: string) {
    setBusy(task.id); setMessage(null);
    const response = await fetch(`/api/me/discipline/tasks/${task.id}/evidence/${assetId}/submit`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${task.revision}"`, "Idempotency-Key": crypto.randomUUID() }, body: "{}" }).catch(() => null);
    if (!response?.ok) setMessage("저장된 이미지를 제출하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.");
    setBusy(null); router.refresh();
  }
  return <>{message ? <p className={styles.error} role="alert">{message}</p> : null}<section className={styles.tasks}>{tasks.map((task) => <article className={styles.panel} key={task.id}>
    <div className={styles.taskHeader}><div><span className={styles.eyebrow}>{task.publicCode}</span><h2>{task.category === "INHOUSE" ? "내전" : "일반"} 경고 해소 과제</h2></div><span className={styles.badge}>{statusLabel[task.status]}</span></div>
    <div className={styles.progressLine}><span>{task.submittedEvidenceCount} / {task.requiredGameCount}장</span><span>기한 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(task.dueAt))}</span></div><div className={styles.progress}><i style={{ width: `${task.submittedEvidenceCount / task.requiredGameCount * 100}%` }} /></div>
    {task.reviewNote ? <p className={task.status === "REJECTED" ? styles.error : styles.notice}>검토 메모: {task.reviewNote}</p> : null}
    {task.evidence.length ? <div className={styles.evidence}>{task.evidence.map((item, index) => item.status === "READY" && item.submittedAt === null ? <button key={item.assetId} type="button" disabled={busy === task.id} onClick={() => submitReady(task, item.assetId)}>저장본 {index + 1}<br />제출 이어하기</button> : <a key={item.assetId} href={`/api/me/discipline/assets/${item.assetId}`} target="_blank" rel="noreferrer">증거 {index + 1}<br />{item.submittedAt ? "제출됨" : item.status}</a>)}</div> : null}
    {["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(task.status) && task.remainingEvidenceCount > 0 ? <label className={styles.upload}><strong>이미지 선택</strong><input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy === task.id} onChange={(event) => upload(task, event.target.files)} /><span className={styles.muted}>PNG/JPEG/WebP · 파일당 8MiB 이하 · 최대 {task.remainingEvidenceCount}장</span></label> : null}
  </article>)}</section></>;
}
