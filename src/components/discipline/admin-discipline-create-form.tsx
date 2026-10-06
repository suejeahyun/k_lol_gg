"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { BoundedPicker, type BoundedPickerOption } from "@/app/(admin)/admin/matches/bounded-picker";
import { ClientMutationKeyStore, type MutationKeyTicket } from "@/modules/seasons/application/client-mutation-key-store";

import styles from "@/components/admin/admin-operations.module.css";

export function AdminDisciplineCreateForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [targetKey, setTargetKey] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [userAccountId, setUserAccountId] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetNickname, setTargetNickname] = useState("");
  const [targetTagLine, setTargetTagLine] = useState("");
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const keys = useRef(new ClientMutationKeyStore("admin-discipline-create")).current;
  const request = useRef<{ ticket: MutationKeyTicket; body: string; uncertain: boolean } | null>(null);
  const submitting = useRef(false);

  function selectTarget(value: string, option?: BoundedPickerOption) {
    setTargetKey(value);
    const metadata = option?.metadata;
    setPlayerId(metadata?.playerId ?? "");
    setUserAccountId(metadata?.accountId ?? "");
    setTargetName(metadata?.targetName ?? "");
    setTargetNickname(metadata?.nickname ?? "");
    setTargetTagLine(metadata?.tagLine ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setState("saving"); setMessage(""); setNeedsSignIn(false);
    let confirmed = false;
    try {
      if (!request.current) {
        const data = new FormData(event.currentTarget);
        const payload = { userAccountId: data.get("userAccountId") || null, playerId: data.get("playerId") || null, targetName: data.get("targetName"), targetNickname: data.get("targetNickname") || null, targetTagLine: data.get("targetTagLine") || null, type: data.get("type"), category: data.get("category"), source: data.get("source"), reason: data.get("reason"), internalNote: data.get("internalNote") || null };
        request.current = { ticket: keys.issue("POST:/api/admin/discipline-records", 0, payload), body: JSON.stringify(payload), uncertain: false };
      }
      const pending = request.current;
      const response = await fetch("/api/admin/discipline-records", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": pending.ticket.key }, body: pending.body, signal: AbortSignal.timeout(15_000) });
      if (response.status >= 500) throw new Error("등록 결과를 확인하지 못했습니다.");
      const body = await response.json() as { detail?: string; record?: { id?: string } };
      if (!response.ok) {
        setNeedsSignIn(response.status === 401 || response.status === 403);
        if (!pending.uncertain || ![401, 403, 408, 429].includes(response.status)) {
          keys.complete(pending.ticket); request.current = null;
        }
        throw new Error(body.detail ?? "등록하지 못했습니다. 입력과 관리자 인증 상태를 확인해 주세요.");
      }
      if (!body.record?.id) throw new Error("등록 결과를 확인하지 못했습니다.");
      keys.complete(pending.ticket); request.current = null; confirmed = true; setUncertain(false);
      router.push(`/admin/discipline/${body.record.id}`); router.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "등록 결과를 확인하지 못했습니다.";
      if (request.current) request.current.uncertain = true;
      setUncertain(request.current !== null);
      setMessage(request.current ? `${detail} 같은 요청의 결과를 다시 확인해 주세요.` : detail);
      if (!confirmed) setState("error");
    } finally {
      if (!confirmed) submitting.current = false;
    }
  }
  return <form className={`${styles.panel} ${styles.form}`} onSubmit={submit} aria-busy={state === "saving"}>
    <fieldset className={styles.createFields} disabled={state === "saving" || uncertain}>
    <legend className="sr-only">징계 기록 입력</legend>
    <div className={styles.field}><span>등록된 플레이어·계정 찾기 (선택)</span><BoundedPicker ariaLabel="징계 대상 플레이어 또는 계정" value={targetKey} options={[]} placeholder="이름, 로그인 ID 또는 Riot ID 검색" remoteEndpoint="/api/admin/discipline-records/target-options" onChange={selectTarget} /><small>검색어 2자 이상</small></div>
    <input name="userAccountId" type="hidden" value={userAccountId} /><input name="playerId" type="hidden" value={playerId} />
    <label className={styles.field}><span>대상 표시 이름</span><input name="targetName" required maxLength={100} value={targetName} onChange={(event) => setTargetName(event.target.value)} /></label><div className={styles.detailGrid}><label className={styles.field}><span>Riot 닉네임 (선택)</span><input name="targetNickname" maxLength={64} value={targetNickname} onChange={(event) => setTargetNickname(event.target.value)} /></label><label className={styles.field}><span>태그 (선택)</span><input name="targetTagLine" maxLength={32} value={targetTagLine} onChange={(event) => setTargetTagLine(event.target.value)} /></label></div>
    <div className={styles.detailGrid}><label className={styles.field}><span>유형</span><select name="type"><option value="CAUTION">주의</option><option value="WARNING">경고</option><option value="BAN">이용 제한</option></select></label><label className={styles.field}><span>분류</span><select name="category"><option value="GENERAL">일반</option><option value="INHOUSE">내전</option></select></label></div>
    <label className={styles.field}><span>출처</span><input name="source" required maxLength={64} placeholder="신고, 운영 확인 등" /></label><label className={styles.field}><span>사유</span><textarea name="reason" required maxLength={1000} rows={5} /></label><label className={styles.field}><span>내부 메모 (비공개)</span><textarea name="internalNote" maxLength={2000} rows={3} /></label>
    </fieldset>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}<button type="submit" className={styles.button} disabled={state === "saving"}>{state === "saving" ? "등록 중…" : uncertain ? "등록 결과 다시 확인" : "징계 기록 등록"}</button>
    {needsSignIn ? <a href="/admin/login" target="_blank" rel="noreferrer">관리자 로그인 (새 창)</a> : null}
  </form>;
}
