"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminOperationFormDto, OperationFormStatus } from "@/modules/recruiting/operation-forms/domain";

import styles from "./operation-forms.module.css";

export function AdminOperationFormActions({ form }: { form: AdminOperationFormDto }) {
  const router = useRouter(); const [status, setStatus] = useState<OperationFormStatus>(form.status);
  const [adminNote, setAdminNote] = useState(form.adminNote ?? ""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const endpoint = `/api/admin/operation-forms/${form.formType}/${form.id}`;

  async function mutate(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method, credentials: "same-origin", headers: {
          "content-type": "application/json", "If-Match": `\"rev-${form.revision}\"`, "Idempotency-Key": crypto.randomUUID(),
        }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { title?: string } | null;
        setMessage(problem?.title ?? "요청을 처리하지 못했습니다."); return;
      }
      setMessage(method === "DELETE" ? "신청서를 삭제 처리했습니다." : "검토 상태를 저장했습니다."); router.refresh();
    } finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-labelledby="operation-form-actions-title">
    <h2 id="operation-form-actions-title">검토 처리</h2>
    <label className={styles.field}>상태<select value={status} onChange={(event) => setStatus(event.target.value as OperationFormStatus)} disabled={busy}>
      <option value="PENDING">대기</option><option value="IN_REVIEW">검토 중</option><option value="COMPLETED">완료</option><option value="REJECTED">반려</option><option value="CANCELLED">취소</option>
    </select></label>
    <label className={styles.field}>관리 메모<textarea maxLength={2_000} rows={5} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} disabled={busy} /></label>
    <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void mutate("PATCH", { status, adminNote: adminNote.trim() || null })}>상태와 메모 저장</button>
      <button className={styles.danger} type="button" disabled={busy} onClick={() => { const reason = window.prompt("삭제 사유를 입력하세요."); if (reason?.trim()) void mutate("DELETE", { reason: reason.trim() }); }}>삭제 처리</button></div>
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
  </section>;
}
