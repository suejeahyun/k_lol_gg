"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "./discipline.module.css";

export function AdminDisciplineCreateForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("saving");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/discipline-records", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ userAccountId: null, playerId: null, targetName: data.get("targetName"), targetNickname: data.get("targetNickname") || null, targetTagLine: data.get("targetTagLine") || null, type: data.get("type"), category: data.get("category"), source: data.get("source"), reason: data.get("reason"), internalNote: data.get("internalNote") || null }) }).catch(() => null);
    if (!response?.ok) { setState("error"); return; }
    const body = await response.json() as { record?: { id?: string } };
    if (!body.record?.id) { setState("error"); return; }
    router.push(`/admin/discipline/${body.record.id}`); router.refresh();
  }
  return <form className={`${styles.panel} ${styles.form}`} onSubmit={submit}>
    <label className={styles.field}><span>대상 이름</span><input name="targetName" required maxLength={100} /></label><div className={styles.detailGrid}><label className={styles.field}><span>Riot 닉네임 (선택)</span><input name="targetNickname" maxLength={64} /></label><label className={styles.field}><span>태그 (선택)</span><input name="targetTagLine" maxLength={32} /></label></div>
    <div className={styles.detailGrid}><label className={styles.field}><span>유형</span><select name="type"><option value="CAUTION">주의</option><option value="WARNING">경고</option><option value="BAN">이용 제한</option></select></label><label className={styles.field}><span>분류</span><select name="category"><option value="GENERAL">일반</option><option value="INHOUSE">내전</option></select></label></div>
    <label className={styles.field}><span>출처</span><input name="source" required maxLength={64} placeholder="신고, 운영 확인 등" /></label><label className={styles.field}><span>사유</span><textarea name="reason" required maxLength={1000} rows={5} /></label><label className={styles.field}><span>내부 메모 (비공개)</span><textarea name="internalNote" maxLength={2000} rows={3} /></label>
    {state === "error" ? <p className={styles.error} role="alert">등록하지 못했습니다. 입력과 최신 관리자 인증 상태를 확인해 주세요.</p> : null}<button className={styles.button} disabled={state === "saving"}>{state === "saving" ? "등록 중…" : "징계 기록 등록"}</button>
  </form>;
}
