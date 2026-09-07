"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { DestructionAggregate } from "@/modules/competitions/destruction";
import styles from "../../event/event-admin.module.css";

export function DestructionAdminActions({ destruction }: { destruction: DestructionAggregate }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function command(type: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/competitions/destruction/${destruction.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${destruction.revision}"`, "Idempotency-Key": `destruction-${type.toLocaleLowerCase()}-${crypto.randomUUID()}` }, body: JSON.stringify({ type, payload }) });
      const body = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "멸망전 작업을 완료하지 못했습니다.");
      setMessage("작업을 반영했습니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "멸망전 작업을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function formPayload(event: FormEvent<HTMLFormElement>) { event.preventDefault(); return new FormData(event.currentTarget); }
  const status = destruction.lifecycle.status;

  return <section className={styles.actions} aria-labelledby="destruction-actions-title"><h2 id="destruction-actions-title">현재 단계 작업</h2><div className={styles.actionsGrid}>
    {status === "PLANNED" ? <button className={styles.primary} disabled={busy} onClick={() => void command("START_RECRUITMENT", {})}>모집 시작</button> : null}
    {status === "RECRUITING" ? <><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("SET_APPLICATION_STATUS", { applicationId: data.get("applicationId"), status: data.get("status") }); }}><strong>신청 심사</strong><label>신청 UUID<input name="applicationId" required /></label><label>상태<select name="status"><option>CONFIRMED</option><option>RESERVE</option><option>REJECTED</option></select></label><button disabled={busy}>반영</button></form><button className={styles.primary} disabled={busy} onClick={() => void command("CLOSE_RECRUITMENT", {})}>팀별 정확히 5인 모집 마감</button></> : null}
    {status === "TEAM_BUILDING" ? <><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); try { void command("CONFIRM_TEAMS", { seed: data.get("seed"), captains: JSON.parse(String(data.get("captains"))) }); } catch { setMessage("주장 JSON 형식을 확인해 주세요."); } }}><strong>주장·경매 포인트 확정</strong><label>seed<input name="seed" minLength={8} maxLength={128} required /></label><label>주장 JSON<textarea name="captains" rows={5} placeholder='[{"teamId":"UUID","name":"팀","participantId":"UUID","baselineValue":50}]' required /></label><button disabled={busy}>팀 확정</button></form>{destruction.teams.length ? <button className={styles.primary} disabled={busy} onClick={() => void command("START_AUCTION", {})}>seeded 경매 시작</button> : null}</> : null}
    {status === "AUCTION" ? <><button className={styles.primary} disabled={busy} onClick={() => void command("DRAW_AUCTION", {})}>다음 선수 추첨</button><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("HOLD_AUCTION", { participantId: data.get("participantId") }); }}><strong>보류</strong><label>참가자 UUID<input name="participantId" required /></label><button disabled={busy}>보류</button></form><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("SELL_AUCTION", { participantId: data.get("participantId"), teamId: data.get("teamId"), purchasePoints: Number(data.get("purchasePoints")) }); }}><strong>낙찰</strong><label>참가자 UUID<input name="participantId" required /></label><label>팀 UUID<input name="teamId" required /></label><label>낙찰 포인트<input name="purchasePoints" type="number" min={0} max={1000000} required /></label><button disabled={busy}>낙찰</button></form><button className={styles.primary} disabled={busy} onClick={() => void command("PUBLISH_PRELIMINARY", {})}>예선 대진 공개</button></> : null}
    {status === "PRELIMINARY" ? <><ResultForm busy={busy} label="예선 결과 입력·정정" onSubmit={(payload, correction) => command(correction ? "CORRECT_PRELIMINARY_RESULT" : "RECORD_PRELIMINARY_RESULT", payload)} /><button className={styles.primary} disabled={busy} onClick={() => void command("PUBLISH_TOURNAMENT", {})}>상위 4팀 본선 공개</button></> : null}
    {status === "TOURNAMENT" ? <><ResultForm busy={busy} label="본선 결과 입력·정정" onSubmit={(payload, correction) => command(correction ? "CORRECT_TOURNAMENT_RESULT" : "RECORD_TOURNAMENT_RESULT", payload)} /><form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("REPLACE_PARTICIPANT", { replacementId: crypto.randomUUID(), participantId: data.get("participantId"), incomingPlayerId: data.get("incomingPlayerId"), incomingPosition: data.get("incomingPosition"), reason: data.get("reason") }); }}><strong>선수 교체 · SUPER</strong><label>참가자 UUID<input name="participantId" required /></label><label>새 플레이어 UUID<input name="incomingPlayerId" required /></label><label>포지션<select name="incomingPosition">{["TOP","JGL","MID","ADC","SUP"].map((lane) => <option key={lane}>{lane}</option>)}</select></label><label>사유<input name="reason" minLength={2} maxLength={500} required /></label><button disabled={busy}>교체</button></form><MvpAdminForm busy={busy} command={command} /><button className={styles.primary} disabled={busy || !destruction.tournamentBracket?.championTeamId} onClick={() => void command("COMPLETE_DESTRUCTION", {})}>전체 경기 확정·완료</button></> : null}
    {status !== "COMPLETED" && status !== "CANCELLED" ? <form className={styles.form} onSubmit={(event) => { const data = formPayload(event); void command("CANCEL_DESTRUCTION", { reason: data.get("reason") }); }}><strong>대회 취소</strong><label>취소 사유<input name="reason" minLength={2} maxLength={300} required /></label><button className={styles.danger} disabled={busy}>취소</button></form> : null}
    {status === "CANCELLED" ? <button className={styles.primary} disabled={busy} onClick={() => void command("RESTORE_DESTRUCTION", {})}>이전 단계 복구 · SUPER</button> : null}
  </div><p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p></section>;
}

function ResultForm({ busy, label, onSubmit }: { busy: boolean; label: string; onSubmit: (payload: Record<string, unknown>, correction: boolean) => Promise<void> }) {
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit({ fixtureId: data.get("fixtureId"), teamAScore: Number(data.get("teamAScore")), teamBScore: Number(data.get("teamBScore")), winnerTeamId: data.get("winnerTeamId") }, data.get("correction") === "on"); }}><strong>{label}</strong><label>경기 ID<input name="fixtureId" required /></label><label>A 점수<input name="teamAScore" type="number" min={0} max={9} required /></label><label>B 점수<input name="teamBScore" type="number" min={0} max={9} required /></label><label>승리 팀 ID<input name="winnerTeamId" required /></label><label><input name="correction" type="checkbox" /> 기존 결과 정정 · SUPER</label><button disabled={busy}>저장</button></form>;
}

function MvpAdminForm({ busy, command }: { busy: boolean; command: (type: string, payload: Record<string, unknown>) => Promise<void> }) {
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const fixtureId = data.get("fixtureId"); const playerId = data.get("playerId"); void command(playerId ? "ASSIGN_MVP" : "RESET_MVP", playerId ? { fixtureId, playerId } : { fixtureId }); }}><strong>MVP 재투표·직접 지정 · SUPER</strong><label>경기 ID<input name="fixtureId" required /></label><label>직접 지정 플레이어 UUID (비우면 재투표)<input name="playerId" /></label><button disabled={busy}>MVP 처리</button></form>;
}
