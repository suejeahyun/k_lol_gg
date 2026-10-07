"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type { OwnerDisciplineTaskDto } from "@/modules/discipline/application/ports";
import { PRIVATE_ASSET_MAX_BYTES } from "@/modules/assets/domain/private-asset";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import styles from "./discipline.module.css";

const statusLabel = { REQUIRED: "업로드 필요", AWAITING_UPLOAD: "추가 업로드 필요", PENDING_REVIEW: "검토 대기", REJECTED: "보완 필요", APPROVED: "승인 완료", CANCELLED: "취소됨" } as const;
async function sha256(file: File) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((value) => value.toString(16).padStart(2, "0")).join(""); }

export function OwnerDisciplineTasks({ tasks }: { tasks: readonly OwnerDisciplineTaskDto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const sending = useRef(false);
  const keys = useRef(new ClientMutationKeyStore("discipline-evidence")).current;
  const refresh = () => startTransition(() => router.refresh());
  function confirmedRevision(body: unknown, task: OwnerDisciplineTaskDto, expectedRevision: number) {
    const result = body as { taskId?: string; revision?: number } | null;
    if (result?.taskId !== task.id || typeof result.revision !== "number" || !Number.isSafeInteger(result.revision) || result.revision <= expectedRevision) throw new Error("UNCONFIRMED_EVIDENCE");
    return result.revision;
  }
  async function upload(task: OwnerDisciplineTaskDto, files: FileList | null) {
    if (!files?.length || sending.current || refreshing) return;
    sending.current = true;
    setBusy(task.id); setMessage(null); let revision = task.revision;
    try {
      for (const file of Array.from(files).slice(0, task.remainingEvidenceCount)) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 12 || file.size > PRIVATE_ASSET_MAX_BYTES) {
          setMessage("PNG, JPEG, WebP 이미지만 파일당 4MiB 이하로 선택해 주세요."); break;
        }
        const digest = await sha256(file);
        const response = await fetch(`/api/me/discipline/tasks/${task.id}/evidence`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type, "If-Match": `"${revision}"`, "Idempotency-Key": crypto.randomUUID(), "X-Content-Sha256": digest, "X-Upload-File-Name": encodeURIComponent(file.name) }, body: file, signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error("UNCONFIRMED_EVIDENCE");
        revision = confirmedRevision(await response.json(), task, revision);
      }
    } catch {
      setMessage("이미지 검사 또는 제출을 완료하지 못했습니다. 최신 목록에서 저장본이 있으면 ‘제출 이어하기’를 눌러 주세요.");
    } finally {
      setBusy(null); refresh(); sending.current = false;
    }
  }
  async function submitReady(task: OwnerDisciplineTaskDto, assetId: string) {
    if (sending.current || refreshing) return;
    sending.current = true;
    setBusy(task.id); setMessage(null);
    const path = `/api/me/discipline/tasks/${task.id}/evidence/${assetId}/submit`;
    const ticket = keys.issue(`POST:${path}`, task.revision, {});
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": `"${task.revision}"`, "Idempotency-Key": ticket.key }, body: "{}", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        if ([400, 404, 409, 412, 422].includes(response.status)) keys.complete(ticket);
        throw new Error("UNCONFIRMED_EVIDENCE");
      }
      confirmedRevision(await response.json(), task, task.revision);
      keys.complete(ticket);
    } catch {
      setMessage("저장본의 제출 결과를 확인하지 못했습니다. 최신 상태를 확인한 뒤 ‘제출 이어하기’를 다시 눌러 주세요.");
    } finally {
      setBusy(null); refresh(); sending.current = false;
    }
  }
  return <>{message ? <p className={styles.error} role="alert">{message}</p> : null}{busy !== null || refreshing ? <p role="status" aria-live="polite">{busy !== null ? "이미지 제출 중…" : "최신 과제 상태 확인 중…"}</p> : null}<section className={styles.tasks} aria-label="경고 해소 과제" aria-busy={busy !== null || refreshing}>{tasks.map((task) => <article className={styles.panel} id={`task-${task.id}`} key={task.id}>
    <div className={styles.taskHeader}><div><span className={styles.eyebrow}>{task.publicCode}</span><h2>{task.category === "INHOUSE" ? "내전" : "일반"} 경고 해소 과제</h2></div><span className={styles.badge}>{statusLabel[task.status]}</span></div>
    <div className={styles.progressLine}><span>{task.submittedEvidenceCount} / {task.requiredGameCount}장</span><span>기한 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(task.dueAt))}</span></div><div className={styles.progress}><i style={{ width: `${task.submittedEvidenceCount / task.requiredGameCount * 100}%` }} /></div>
    {task.reviewNote ? <p className={task.status === "REJECTED" ? styles.error : styles.notice}>검토 메모: {task.reviewNote}</p> : null}
    {task.evidence.length ? <div className={styles.evidence}>{task.evidence.map((item, index) => item.status === "READY" && item.submittedAt === null ? <button key={item.assetId} type="button" disabled={busy !== null || refreshing} onClick={() => submitReady(task, item.assetId)}>저장본 {index + 1}<br />제출 이어하기</button> : <a key={item.assetId} href={`/api/me/discipline/assets/${item.assetId}`} target="_blank" rel="noreferrer">증거 {index + 1}<br />{item.submittedAt ? "제출됨" : item.status}</a>)}</div> : null}
    {["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(task.status) && task.remainingEvidenceCount > 0 ? <label className={styles.upload}><strong>이미지 선택</strong><input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy !== null || refreshing} onChange={(event) => { const input = event.currentTarget; return upload(task, input.files).finally(() => { input.value = ""; }); }} /><span className={styles.muted}>PNG/JPEG/WebP · 파일당 4MiB 이하 · 최대 {task.remainingEvidenceCount}장</span></label> : null}
  </article>)}</section></>;
}
