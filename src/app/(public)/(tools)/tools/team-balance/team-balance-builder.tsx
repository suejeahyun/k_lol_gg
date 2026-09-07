"use client";

import { Plus, RotateCcw, Scale } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { TEAM_BALANCE_POSITIONS, TEAM_BALANCE_PREFERENCES } from "@/modules/team-tools";

import styles from "../team-tools.module.css";

type Row = {
  playerId: string;
  firstPosition: (typeof TEAM_BALANCE_POSITIONS)[number];
  firstPreference: (typeof TEAM_BALANCE_PREFERENCES)[number];
  secondPosition: "" | (typeof TEAM_BALANCE_POSITIONS)[number];
  secondPreference: (typeof TEAM_BALANCE_PREFERENCES)[number];
};

const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
const preferenceLabel = { MAIN: "주 포지션", SUB: "부 포지션", AUTO: "자동 배치 가능" } as const;

function initialRows(): Row[] {
  return Array.from({ length: 10 }, (_, index) => ({
    playerId: "",
    firstPosition: TEAM_BALANCE_POSITIONS[index % 5]!,
    firstPreference: "MAIN",
    secondPosition: "",
    secondPreference: "SUB",
  }));
}

export function TeamBalanceBuilder({ players }: { players: readonly { id: string; label: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("오늘의 내전");
  const [rows, setRows] = useState(initialRows);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ids = rows.map((row) => row.playerId);
    if (ids.some((id) => !id) || new Set(ids).size !== 10) {
      setMessage("서로 다른 활성 플레이어 10명을 선택해 주세요.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/team-tools/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": '"0"',
          "Idempotency-Key": `team-balance-create-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          title,
          participants: rows.map((row) => ({
            playerId: row.playerId,
            eligiblePositions: [
              { position: row.firstPosition, preference: row.firstPreference },
              ...(row.secondPosition && row.secondPosition !== row.firstPosition
                ? [{ position: row.secondPosition, preference: row.secondPreference }]
                : []),
            ],
          })),
        }),
      });
      const body = await response.json() as { detail?: string; location?: string };
      if (!response.ok || !body.location) throw new Error(body.detail ?? "팀 후보를 계산하지 못했어요.");
      router.push(body.location);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 후보를 계산하지 못했어요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.balanceForm} onSubmit={submit}>
      <div className={styles.heading}>
        <div><span>NEW DRAFT</span><h2>참가자와 가능한 포지션</h2></div>
        <strong className={styles.count}>10명 고정</strong>
      </div>
      <label className={styles.fieldLabel}>초안 이름<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
      <div className={styles.balanceRows}>
        {rows.map((row, index) => (
          <fieldset key={index}>
            <legend>{index + 1}번 참가자</legend>
            <label>플레이어<select value={row.playerId} onChange={(event) => update(index, { playerId: event.target.value })} required><option value="">선택</option>{players.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}</select></label>
            <label>첫 포지션<select value={row.firstPosition} onChange={(event) => update(index, { firstPosition: event.target.value as Row["firstPosition"] })}>{TEAM_BALANCE_POSITIONS.map((position) => <option key={position} value={position}>{positionLabel[position]}</option>)}</select></label>
            <label>첫 선호<select value={row.firstPreference} onChange={(event) => update(index, { firstPreference: event.target.value as Row["firstPreference"] })}>{TEAM_BALANCE_PREFERENCES.map((preference) => <option key={preference} value={preference}>{preferenceLabel[preference]}</option>)}</select></label>
            <label>추가 포지션<select value={row.secondPosition} onChange={(event) => update(index, { secondPosition: event.target.value as Row["secondPosition"] })}><option value="">없음</option>{TEAM_BALANCE_POSITIONS.map((position) => <option key={position} value={position}>{positionLabel[position]}</option>)}</select></label>
            <label>추가 선호<select value={row.secondPreference} disabled={!row.secondPosition} onChange={(event) => update(index, { secondPreference: event.target.value as Row["secondPreference"] })}>{TEAM_BALANCE_PREFERENCES.map((preference) => <option key={preference} value={preference}>{preferenceLabel[preference]}</option>)}</select></label>
          </fieldset>
        ))}
      </div>
      {message ? <p className={styles.error} role="alert">{message}</p> : null}
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="submit" disabled={pending}><Scale size={18} aria-hidden="true" /> {pending ? "계산 중…" : "상위 3개 계산"}</button>
        <button className={styles.secondaryButton} type="button" disabled={pending} onClick={() => { setRows(initialRows()); setMessage(""); }}><RotateCcw size={17} aria-hidden="true" /> 입력 초기화</button>
        <span className={styles.stageHint}><Plus size={14} aria-hidden="true" /> 표본이 없으면 중립 점수 50으로 계산합니다.</span>
      </div>
    </form>
  );
}
