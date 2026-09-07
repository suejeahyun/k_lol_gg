"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { MMR_POSITIONS } from "@/modules/mmr";
import { BoundedPicker } from "../matches/bounded-picker";

import styles from "./mmr-admin.module.css";

export function MmrAdminActions({ generation, allowed }: { generation: number; allowed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [playerId, setPlayerId] = useState("");

  async function command(path: "recalculate" | "adjustments", body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/balance-ai/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${generation}"`,
          "Idempotency-Key": `mmr-${path}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "MMR 작업을 완료하지 못했습니다.");
      setMessage(path === "recalculate" ? "전체 원장을 다시 계산했습니다." : "조정 원장을 추가하고 다시 계산했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "MMR 작업을 완료하지 못했습니다.");
    } finally { setBusy(false); }
  }

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void command("adjustments", {
      playerId,
      position: data.get("position") || null,
      deltaBp: Number(data.get("deltaBp")),
      reasonCode: data.get("reasonCode"),
      publicNote: data.get("publicNote"),
    });
  }

  if (!allowed) return <p className={styles.notice}>조회는 ADMIN, 전체 재계산과 수동 조정은 SUPER_ADMIN만 가능합니다.</p>;
  return (
    <section className={styles.actions} aria-labelledby="mmr-actions-title">
      <header><h2 id="mmr-actions-title">보호된 MMR 작업</h2><button type="button" disabled={busy} onClick={() => command("recalculate", {})}>전체 원장 재계산</button></header>
      <form onSubmit={submitAdjustment}>
        <label><span>플레이어</span><BoundedPicker ariaLabel="MMR 수동 조정 플레이어" value={playerId} options={[]} placeholder="닉네임 또는 Riot ID 검색" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={setPlayerId} /></label>
        <label>포지션<select name="position"><option value="">종합</option>{MMR_POSITIONS.map((position) => <option key={position}>{position}</option>)}</select></label>
        <label>조정값(bp)<input name="deltaBp" type="number" min={-1000} max={1000} required /></label>
        <label>사유 코드<input name="reasonCode" pattern="[A-Za-z][A-Za-z0-9_]{0,63}" required /></label>
        <label className={styles.note}>공개 설명<input name="publicNote" maxLength={300} required /></label>
        <button type="submit" disabled={busy || !playerId}>조정 원장 추가</button>
      </form>
      <p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
    </section>
  );
}
