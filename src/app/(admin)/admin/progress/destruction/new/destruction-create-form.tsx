"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DESTRUCTION_PRELIMINARY_FORMATS } from "@/modules/competitions/destruction/configuration";
import { competitionPositionLabel, competitionPreliminaryFormatLabel } from "@/modules/competitions/core/display-projection";
import styles from "@/components/competitions/destruction/workspace.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function DestructionCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [teamCount, setTeamCount] = useState(4);
  const [gameMode, setGameMode] = useState("CLASSIC");
  const positional = gameMode === "CLASSIC";
  const [format, setFormat] = useState<string>("FULL_ROUND_ROBIN_BO3");
  const pending = useRef<{ tournamentId: string; key: string; body: string } | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const teamCount = Number(data.get("teamCount"));
      const recruitment = positional ? { laneLimits: Object.fromEntries(positions.map((position) => [position, Number(data.get(position))])) } : { recruitmentLimit: Number(data.get("recruitmentLimit")) };
      const tournamentId = pending.current?.tournamentId ?? crypto.randomUUID();
      pending.current ??= { tournamentId, key: `destruction-create-${crypto.randomUUID()}`, body: JSON.stringify({ tournamentId, title: data.get("title"), configuration: { gameMode: data.get("gameMode"), preliminaryFormat: data.get("preliminaryFormat"), preliminaryRoundCount: Number(data.get("preliminaryRoundCount")), teamCount, ...recruitment } }) };
      const response = await fetch("/api/admin/competitions/destruction", { method: "POST", headers: { "Content-Type": "application/json", "X-Destruction-Revision": '"0"', "Idempotency-Key": pending.current.key }, body: pending.current.body, signal: AbortSignal.timeout(15_000) });
      if (response.status >= 500) throw new Error("생성 결과를 확인하지 못했습니다. 다시 실행하면 이전 요청 결과를 확인합니다.");
      const body = await response.json() as { detail?: string };
      pending.current = null;
      if (!response.ok) throw new Error(body.detail ?? "멸망전을 만들지 못했습니다.");
      router.push(`/admin/progress/destruction/${tournamentId}`); router.refresh();
    } catch (error) { setMessage(pending.current ? "연결이 끊겨 생성 결과를 확인하지 못했습니다. 다시 실행하면 입력했던 이전 요청을 중복 생성 없이 확인합니다." : error instanceof Error ? error.message : "멸망전을 만들지 못했습니다."); setBusy(false); }
    finally { submitting.current = false; }
  }

  return <section className={styles.workspace}><form className={`${styles.panel} ${styles.form}`} onSubmit={submit}>
    <h2>새 멸망전 설정</h2><label>대회 게임 모드<select name="gameMode" value={gameMode} onChange={(event) => setGameMode(event.target.value)}><option value="CLASSIC">소환사의 협곡 멸망전</option><option value="ARAM">칼바람 멸망전 · 일반 칼바람 전적</option><option value="ARAM_MAYHEM">증바람 멸망전 · 증강 칼바람 전적</option></select></label><p>칼바람·증바람은 해당 모드의 최근 최대 100판으로 대회 경매용 임시 등급을 계산합니다. 증바람은 운영자 확인 전적을 입력하며, 칼바람은 Riot 조회 또는 운영자 확인 입력을 사용합니다. 출처를 구분해 표시합니다.</p><label>멸망전 이름<input name="title" maxLength={120} required /></label><label>팀 수<input name="teamCount" type="number" min={4} max={99} value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))} required /></label>
    <p>참가 확정 {teamCount * 5}명 · {positional ? `포지션별 ${teamCount}명` : "포지션 구분 없음"} · 본선 4강·결승 BO3</p>
    <label>예선 방식<select name="preliminaryFormat" value={format} onChange={(event) => setFormat(event.target.value)}>{DESTRUCTION_PRELIMINARY_FORMATS.map((option) => <option key={option} value={option}>{competitionPreliminaryFormatLabel(option)}</option>)}</select></label>
    {/^(SWISS|RANDOM)_/.test(format) ? <><label>예선 라운드 수<input name="preliminaryRoundCount" type="number" min={1} max={10} defaultValue={3} required /></label><p>기존 고정 라운드 대진을 유지합니다. 승점에 따른 상대 재배정은 적용되지 않습니다.</p></> : <input type="hidden" name="preliminaryRoundCount" value={1} />}
    {positional ? <fieldset><legend>포지션별 모집 상한</legend>{positions.map((position) => <label key={position}>{competitionPositionLabel(position)}<input name={position} type="number" min={Math.max(4, teamCount)} max={99} defaultValue={8} required /></label>)}</fieldset> : <label>총 모집 상한<input key={teamCount} name="recruitmentLimit" type="number" min={teamCount * 5} max={495} defaultValue={Math.min(495, teamCount * 10)} required /></label>}
    <p>모집 상한은 심사 대기·예비·참가 확정 인원을 합산합니다. {positional ? "각 포지션에서 팀 수만큼 참가자를 확정하면 모집을 마감할 수 있습니다." : `포지션 선택 없이 신청하며, 총 ${teamCount * 5}명을 확정하면 모집을 마감할 수 있습니다. 경매에서도 포지션 제한 없이 팀당 5명을 편성합니다.`}</p>
    <button className={styles.primary} type="submit" disabled={busy}>{busy ? "생성 중…" : "멸망전 생성"}</button><p role="status" aria-live="polite">{message}</p>
  </form></section>;
}
