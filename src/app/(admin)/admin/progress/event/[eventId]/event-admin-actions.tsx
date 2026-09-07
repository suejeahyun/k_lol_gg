"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { EventAggregate } from "@/modules/competitions/events";
import styles from "../event-admin.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function EventAdminActions({ event }: { event: EventAggregate }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function command(type: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/competitions/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${event.revision}"`, "Idempotency-Key": `event-${type.toLocaleLowerCase()}-${crypto.randomUUID()}` }, body: JSON.stringify({ type, payload }) });
      const body = await response.json() as { detail?: string; correctionPlan?: { invalidatedResultFixtureIds?: string[] } };
      if (!response.ok) throw new Error(body.detail ?? "이벤트 작업을 완료하지 못했습니다.");
      const invalidated = body.correctionPlan?.invalidatedResultFixtureIds?.length ?? 0;
      setMessage(invalidated ? `정정 완료: 하위 결과 ${invalidated}건을 무효화했습니다.` : "작업을 반영했습니다.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "이벤트 작업을 완료하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function addParticipant(form: FormEvent<HTMLFormElement>) {
    form.preventDefault(); const data = new FormData(form.currentTarget);
    void command("ADD_PARTICIPANT", { participant: { participantId: crypto.randomUUID(), playerId: data.get("playerId"), mainPosition: event.settings.format === "ARAM" ? null : data.get("mainPosition"), subPositions: [] } });
  }

  function result(form: FormEvent<HTMLFormElement>, fixtureId: string, correction: boolean) {
    form.preventDefault(); const data = new FormData(form.currentTarget);
    void command(correction ? "CORRECT_RESULT" : "RECORD_RESULT", { fixtureId, teamAScore: Number(data.get("teamAScore")), teamBScore: Number(data.get("teamBScore")), winnerTeamId: data.get("winnerTeamId") });
  }

  const status = event.lifecycle.status;
  return <section className={styles.actions} aria-labelledby="event-actions-title"><h2 id="event-actions-title">현재 단계 작업</h2><div className={styles.actionsGrid}>
    {status === "PLANNED" ? <button className={styles.primary} disabled={busy} onClick={() => command("START_RECRUITMENT", {})}>모집 시작</button> : null}
    {status === "RECRUITING" ? <><form className={styles.form} onSubmit={addParticipant}><strong>참가자 추가</strong><label>플레이어 UUID<input name="playerId" required /></label>{event.settings.format === "POSITION" ? <label>주 포지션<select name="mainPosition">{positions.map((position) => <option key={position}>{position}</option>)}</select></label> : null}<button disabled={busy}>추가</button></form><button className={styles.primary} disabled={busy || event.participants.filter((item) => item.status === "ACTIVE").length !== 10} onClick={() => command("CLOSE_RECRUITMENT", {})}>10명 모집 마감</button></> : null}
    {status === "TEAM_BUILDING" && event.teams.length === 0 ? <button className={styles.primary} disabled={busy} onClick={() => command("BUILD_TEAMS", {})}>S06로 팀 자동 편성</button> : null}
    {status === "TEAM_BUILDING" && event.teams.length > 0 ? <button className={styles.primary} disabled={busy} onClick={() => command("GENERATE_BRACKET", {})}>대진 생성</button> : null}
    {status === "IN_PROGRESS" ? event.bracket?.fixtures.filter((fixture) => fixture.teamAId && fixture.teamBId).map((fixture) => <form className={styles.form} key={fixture.id} onSubmit={(form) => result(form, fixture.id, Boolean(fixture.result))}><strong>R{fixture.roundNumber} · {fixture.result ? "결과 정정" : "결과 입력"}</strong><label>팀 A 점수<input name="teamAScore" type="number" min={0} max={9} defaultValue={fixture.result?.teamAScore ?? 0} required /></label><label>팀 B 점수<input name="teamBScore" type="number" min={0} max={9} defaultValue={fixture.result?.teamBScore ?? 0} required /></label><label>승리 팀<select name="winnerTeamId" defaultValue={fixture.result?.winnerTeamId ?? fixture.teamAId!}><option value={fixture.teamAId!}>{fixture.teamAId}</option><option value={fixture.teamBId!}>{fixture.teamBId}</option></select></label><button disabled={busy}>{fixture.result ? "정정" : "저장"}</button></form>) : null}
    {status === "IN_PROGRESS" && event.bracket?.championTeamId ? <form className={styles.form} onSubmit={(form) => { form.preventDefault(); const data = new FormData(form.currentTarget); void command("COMPLETE_EVENT", { mvpParticipantId: data.get("mvpParticipantId") || null }); }}><strong>이벤트 완료</strong><label>MVP 참가자 ID (선택)<input name="mvpParticipantId" /></label><button disabled={busy}>우승·완료 확정</button></form> : null}
    {status !== "COMPLETED" && status !== "CANCELLED" ? <form className={styles.form} onSubmit={(form) => { form.preventDefault(); void command("CANCEL_EVENT", { reason: new FormData(form.currentTarget).get("reason") }); }}><strong>이벤트 취소</strong><label>취소 사유<input name="reason" maxLength={500} required /></label><button className={styles.danger} disabled={busy}>취소</button></form> : null}
    {status === "CANCELLED" ? <button className={styles.primary} disabled={busy} onClick={() => command("RESTORE_EVENT", {})}>이전 단계로 복구</button> : null}
  </div><p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p></section>;
}
