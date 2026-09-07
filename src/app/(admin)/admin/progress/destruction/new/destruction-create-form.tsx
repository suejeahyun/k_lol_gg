"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { DESTRUCTION_PRELIMINARY_FORMATS } from "@/modules/competitions/destruction";
import styles from "../../event/event-admin.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function DestructionCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const tournamentId = crypto.randomUUID();
    try {
      const teamCount = Number(data.get("teamCount"));
      const laneLimits = Object.fromEntries(positions.map((position) => [position, Number(data.get(position))]));
      const response = await fetch("/api/admin/competitions/destruction", { method: "POST", headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": `destruction-create-${crypto.randomUUID()}` }, body: JSON.stringify({ tournamentId, title: data.get("title"), configuration: { preliminaryFormat: data.get("preliminaryFormat"), preliminaryRoundCount: Number(data.get("preliminaryRoundCount")), teamCount, laneLimits } }) });
      const body = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "멸망전을 만들지 못했습니다.");
      router.push(`/admin/progress/destruction/${tournamentId}`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "멸망전을 만들지 못했습니다."); setBusy(false); }
  }

  return <form className={styles.form} onSubmit={submit}><label>멸망전 이름<input name="title" maxLength={120} required /></label><label>팀 수<input name="teamCount" type="number" min={4} max={32} defaultValue={4} required /></label><label>예선 방식<select name="preliminaryFormat">{DESTRUCTION_PRELIMINARY_FORMATS.map((format) => <option key={format}>{format}</option>)}</select></label><label>스위스·랜덤 라운드 수<input name="preliminaryRoundCount" type="number" min={1} max={10} defaultValue={3} /></label><fieldset><legend>포지션별 모집 상한</legend>{positions.map((position) => <label key={position}>{position}<input name={position} type="number" min={4} max={99} defaultValue={8} required /></label>)}</fieldset><button disabled={busy}>{busy ? "생성 중…" : "멸망전 생성"}</button><p role="status" aria-live="polite">{message}</p></form>;
}
