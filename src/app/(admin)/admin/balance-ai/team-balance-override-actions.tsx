"use client";

import { FormEvent, useState } from "react";
import { BoundedPicker } from "../matches/bounded-picker";
import styles from "./mmr-admin.module.css";

type Override = { playerId: string; score: number; reason: string; revision: number; configured: boolean; updatedAt: string | null };
export function TeamBalanceOverrideActions({ allowed }: { allowed: boolean }) {
  const [playerId, setPlayerId] = useState("");
  const [current, setCurrent] = useState<Override | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setBusy(true); setCurrent(null); setMessage("");
    try {
      const response = await fetch(`/api/admin/balance-ai/team-overrides?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "보정값을 불러오지 못했습니다.");
      setCurrent(result as Override);
    } catch (error) { setMessage(error instanceof Error ? error.message : "보정값을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || current.playerId !== playerId) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/balance-ai/team-overrides", {
        method: "POST", headers: { "Content-Type": "application/json", "If-Match": `"${current.revision}"`, "Idempotency-Key": `team-override-${crypto.randomUUID()}` },
        body: JSON.stringify({ playerId, score: Number(form.get("score")), reason: form.get("reason") }),
      });
      const result = await response.json();
      if (!response.ok) { if (response.status === 412) setCurrent(null); throw new Error(result.detail ?? "보정값을 저장하지 못했습니다."); }
      setCurrent(result as Override); setMessage("팀 편성 보정값을 저장했습니다. 새 계산 또는 초안 재평가부터 적용됩니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "보정값을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <section className={styles.actions} aria-labelledby="team-override-title">
    <header><h2 id="team-override-title">팀 편성 전용 보정</h2></header>
    <p>MMR 원장과 별개로 팀 편성 점수에 한 번만 반영됩니다. 기존 경기·MMR·저장된 초안은 바꾸지 않습니다. 미설정은 0점이며, 해제할 때는 0점과 사유를 저장하세요.</p>
    <label>플레이어<BoundedPicker ariaLabel="팀 편성 보정 플레이어" value={playerId} options={[]} placeholder="닉네임 또는 Riot ID 검색" remoteEndpoint="/api/admin/matches/editor-options/players" onChange={(value) => { setPlayerId(value); setCurrent(null); setMessage(""); }} /></label>
    <button type="button" disabled={busy || !playerId} onClick={() => void load()}>현재 보정 확인</button>
    {current && current.playerId === playerId ? <form key={`${current.playerId}:${current.revision}`} onSubmit={save}>
      <p>{current.configured ? `현재 ${current.score}점 · ${current.updatedAt ? new Date(current.updatedAt).toLocaleString("ko-KR") : ""}` : "아직 설정되지 않았습니다. 현재 0점으로 계산합니다."}</p>
      <label>보정값(점)<input name="score" type="number" min={-1000} max={1000} step={1} defaultValue={current.score} required disabled={!allowed || busy} /></label>
      <label className={styles.note}>사유<input name="reason" minLength={3} maxLength={300} defaultValue={current.reason} required disabled={!allowed || busy} /></label>
      {allowed ? <button type="submit" disabled={busy}>확인한 보정값 저장</button> : <p>보정 변경은 최고 관리자만 가능합니다.</p>}
    </form> : null}
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
  </section>;
}
