"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type { AdminOperationFormDto, OperationFormStatus } from "@/modules/recruiting/operation-forms/domain";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import { formatRevisionEtag } from "@/platform/http/concurrency";

import styles from "@/components/admin/admin-operations.module.css";

export function AdminOperationFormActions({ form }: { form: AdminOperationFormDto }) {
  const router = useRouter(); const [status, setStatus] = useState<OperationFormStatus>(form.status);
  const [adminNote, setAdminNote] = useState(form.adminNote ?? ""); const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [recovery, setRecovery] = useState<"reload" | "login" | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const sending = useRef(false);
  const mutationKeys = useRef(new ClientMutationKeyStore("operation-form")).current;
  const busy = pending || refreshing || completed;
  const endpoint = `/api/admin/operation-forms/${form.formType}/${form.id}`;
  const detailPath = `/admin/operation-forms/${form.formType}/${form.id}`;

  async function mutate(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    if (busy || sending.current || recovery) return;
    sending.current = true;
    setPending(true); setMessage("");
    const ticket = mutationKeys.issue(`${method}:${endpoint}`, form.revision, body);
    try {
      const response = await fetch(endpoint, {
        method, credentials: "same-origin", headers: {
          "content-type": "application/json", "If-Match": formatRevisionEtag(form.revision), "Idempotency-Key": ticket.key,
        }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { title?: string; detail?: string } | null;
        setRecovery(response.status === 412 ? "reload" : response.status === 401 ? "login" : null);
        setMessage(problem?.detail ?? problem?.title ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요."); return;
      }
      await response.json();
      mutationKeys.complete(ticket);
      setMessage(method === "DELETE" ? "신청서를 삭제 처리했습니다." : "검토 상태를 저장했습니다.");
      if (method === "DELETE") {
        setCompleted(true);
        router.replace(`/admin/operation-forms/${form.formType}`);
      } else startRefresh(() => router.refresh());
    } catch {
      setMessage("요청을 완료하지 못했습니다. 다시 시도해 주세요.");
    } finally { sending.current = false; setPending(false); }
  }

  return <section className={`${styles.panel} ${styles.form}`} aria-labelledby="operation-form-actions-title">
    <h2 id="operation-form-actions-title">검토 처리</h2>
    <label className={styles.field}>상태<select value={status} onChange={(event) => setStatus(event.target.value as OperationFormStatus)} disabled={busy}>
      <option value="PENDING">대기</option><option value="IN_REVIEW">검토 중</option><option value="COMPLETED">완료</option><option value="REJECTED">반려</option><option value="CANCELLED">취소</option>
    </select></label>
    <label className={styles.field}>관리 메모<textarea maxLength={2_000} rows={5} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} disabled={busy} /></label>
    <div className={styles.actions}><button type="button" disabled={busy || Boolean(recovery)} onClick={() => mutate("PATCH", { status, adminNote: adminNote.trim() || null })}>상태와 메모 저장</button>
      <button className={styles.danger} type="button" disabled={busy || Boolean(recovery)} onClick={() => { if (busy || sending.current || recovery) return; const reason = window.prompt("삭제 사유를 입력하세요."); if (reason?.trim()) return mutate("DELETE", { reason: reason.trim() }); }}>삭제 처리</button>
      {recovery === "reload" ? <button type="button" disabled={busy} onClick={() => { setStatus(form.status); setAdminNote(form.adminNote ?? ""); setRecovery(null); setMessage(""); startRefresh(() => router.refresh()); }}>입력 버리고 최신 내용 불러오기</button> : null}
      {recovery === "login" ? <Link href={`/admin/login?next=${encodeURIComponent(detailPath)}`}>관리자 로그인</Link> : null}</div>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </section>;
}
