"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MMR_POSITIONS } from "@/modules/mmr";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import { BoundedPicker } from "../matches/bounded-picker";

import styles from "./mmr-admin.module.css";

type PendingMmrCommand = Readonly<{
  path: "recalculate" | "adjustments";
  body: Record<string, unknown>;
  generation: number;
}>;

export function MmrAdminActions({
  generation,
  formulaVersion,
  formulaTransition,
  allowed,
  startWithRecalculateConfirmation = false,
}: {
  generation: number;
  formulaVersion: string | null;
  formulaTransition: "ADMIN_RECALCULATION_REQUIRED" | null;
  allowed: boolean;
  startWithRecalculateConfirmation?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [completedGeneration, setCompletedGeneration] = useState<number | null>(null);
  const [retryRequest, setRetryRequest] = useState<PendingMmrCommand | null>(null);
  const [recovery, setRecovery] = useState<"login" | "reload" | null>(null);
  const [message, setMessage] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [confirmingRecalculation, setConfirmingRecalculation] = useState(startWithRecalculateConfirmation);
  const sending = useRef(false);
  const confirmedGeneration = useRef<number | null>(null);
  const mutationKeys = useRef(new ClientMutationKeyStore("mmr-admin")).current;
  const adjustmentForm = useRef<HTMLFormElement>(null);
  const busy = pending || refreshing;
  const awaitingGeneration = completedGeneration !== null && generation < completedGeneration;
  const locked = busy || awaitingGeneration || retryRequest !== null || recovery !== null;

  async function command(path: PendingMmrCommand["path"], body: PendingMmrCommand["body"], expectedGeneration = generation) {
    if (!allowed || sending.current || busy || (confirmedGeneration.current !== null && generation < confirmedGeneration.current)) return;
    sending.current = true;
    setPending(true);
    setRecovery(null);
    setMessage("");
    const request = { path, body, generation: expectedGeneration };
    const ticket = mutationKeys.issue(path, expectedGeneration, body);
    try {
      const response = await fetch(`/api/admin/balance-ai/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${expectedGeneration}"`,
          "Idempotency-Key": ticket.key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { detail?: unknown } | null;
        if (response.status === 401 || response.status === 403) {
          setRetryRequest(request);
          setRecovery("login");
          setMessage(response.status === 401 ? "관리자 세션이 만료되었습니다. 다시 로그인한 뒤 같은 요청을 확인해 주세요." : "최고 관리자 권한이 필요합니다. 계정을 확인한 뒤 같은 요청을 다시 확인해 주세요.");
        } else if (response.status === 412) {
          setRetryRequest(null);
          setRecovery("reload");
          setMessage("계산 결과가 변경되었습니다. 최신 결과를 확인한 뒤 다시 요청해 주세요.");
        } else if (response.status >= 500 || response.status === 408 || response.status === 429) {
          setRetryRequest(request);
          setMessage("완료 여부를 확인하지 못했습니다. 잠시 후 같은 요청을 다시 확인해 주세요.");
        } else {
          setRetryRequest(null);
          setMessage(typeof problem?.detail === "string" ? problem.detail : "MMR 작업을 완료하지 못했습니다. 입력을 확인해 주세요.");
        }
        return;
      }
      const result = await response.json() as Record<string, unknown> | null;
      if (!result || typeof result !== "object" || Array.isArray(result) ||
        typeof result.generation !== "number" || !Number.isSafeInteger(result.generation) || result.generation !== expectedGeneration + 1 ||
        result.revision !== result.generation ||
        (path === "recalculate" ? typeof result.consumedEventCount !== "number" || !Number.isSafeInteger(result.consumedEventCount) || result.consumedEventCount < 0 : result.playerId !== body.playerId)) {
        throw new Error("UNCONFIRMED_MMR_COMMAND");
      }
      mutationKeys.complete(ticket);
      confirmedGeneration.current = result.generation;
      setCompletedGeneration(result.generation);
      setRetryRequest(null);
      if (path === "adjustments") { setPlayerId(""); adjustmentForm.current?.reset(); }
      setMessage(path === "recalculate" ? "전체 원장을 다시 계산했습니다." : "조정 원장을 추가하고 다시 계산했습니다.");
      startRefresh(() => router.refresh());
    } catch {
      setRetryRequest(request);
      setMessage("완료 여부를 확인하지 못했습니다. 같은 요청을 다시 확인해 주세요.");
    } finally { sending.current = false; setPending(false); }
  }

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || sending.current || !playerId) return;
    const data = new FormData(event.currentTarget);
    void command("adjustments", {
      playerId,
      position: data.get("position") || null,
      deltaBp: Number(data.get("deltaBp")),
      reasonCode: data.get("reasonCode"),
      publicNote: data.get("publicNote"),
    });
  }

  if (!allowed) return <p className={styles.notice}>조회: 관리자 · 전체 재계산·조정: 최고 관리자</p>;
  return (
    <section className={styles.actions} aria-labelledby="mmr-actions-title" aria-busy={busy}>
      <header><h2 id="mmr-actions-title">보호된 MMR 작업</h2><button type="button" disabled={locked} onClick={() => { if (!locked && !sending.current) setConfirmingRecalculation(true); }}>전체 원장 재계산</button></header>
      <form ref={adjustmentForm} onSubmit={submitAdjustment}>
        <fieldset className={styles.adjustmentFields} disabled={locked} aria-label="MMR 수동 조정">
        <label><span>플레이어</span><BoundedPicker ariaLabel="MMR 수동 조정 플레이어" value={playerId} options={[]} placeholder="닉네임 또는 Riot ID 검색" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={setPlayerId} /></label>
        <label>포지션<select name="position"><option value="">종합</option>{MMR_POSITIONS.map((position) => <option key={position}>{position}</option>)}</select></label>
        <label>조정값(bp)<input name="deltaBp" type="number" min={-1000} max={1000} required /></label>
        <label>사유 코드<input name="reasonCode" pattern="[A-Za-z][A-Za-z0-9_]{0,63}" required /></label>
        <label className={styles.note}>공개 설명<input name="publicNote" maxLength={300} required /></label>
        <button type="submit" disabled={locked || !playerId}>조정 원장 추가</button>
        </fieldset>
      </form>
      {recovery === "login" ? <p><Link href="/admin/login?next=%2Fadmin%2Fbalance-ai" target="_blank" rel="noopener noreferrer">새 창에서 관리자 로그인</Link></p> : null}
      {retryRequest ? <p><button type="button" disabled={busy} onClick={() => command(retryRequest.path, retryRequest.body, retryRequest.generation)}>{recovery === "login" ? "로그인 후 같은 요청 다시 확인" : "같은 요청 다시 확인"}</button></p> : null}
      {recovery === "reload" ? <p><button type="button" disabled={busy} onClick={() => { setRecovery(null); setPlayerId(""); adjustmentForm.current?.reset(); startRefresh(() => router.refresh()); }}>입력 버리고 최신 결과 불러오기</button></p> : null}
      {awaitingGeneration && !busy ? <p><button type="button" onClick={() => startRefresh(() => router.refresh())}>최신 계산 결과 다시 불러오기</button></p> : null}
      <p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
      {confirmingRecalculation ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="mmr-recalculate-title" aria-describedby="mmr-recalculate-description">
            <h3 id="mmr-recalculate-title">전체 MMR 원장을 다시 계산할까요?</h3>
            <p id="mmr-recalculate-description">{formulaTransition === "ADMIN_RECALCULATION_REQUIRED" ? `현재 게시 generation ${generation}의 ${formulaVersion ?? "기존"} 공식에서 V2_DETERMINISTIC_1 공식으로 전환합니다. 자동 전환은 없으며, 확인하면 새 generation을 계산해 게시합니다.` : "공개된 모든 경기와 수동 조정 원장을 처음부터 재생합니다. 현재 generation이 바뀐 경우 작업은 안전하게 거부됩니다."}</p>
            <div>
              <button type="button" className={styles.cancelButton} disabled={busy} onClick={() => setConfirmingRecalculation(false)}>취소</button>
              <button type="button" disabled={locked} autoFocus onClick={() => { if (locked || sending.current) return; setConfirmingRecalculation(false); void command("recalculate", {}); }}>확인 후 재계산</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
