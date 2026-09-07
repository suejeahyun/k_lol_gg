"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../event-admin.module.css";

export function EventCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const eventId = crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/competitions/events", { method: "POST", headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": `event-create-${crypto.randomUUID()}` }, body: JSON.stringify({ eventId, settings: { title: data.get("title"), description: data.get("description") || null, format: data.get("format"), recruitmentOpensAt: new Date(String(data.get("recruitmentOpensAt"))).toISOString(), recruitmentClosesAt: new Date(String(data.get("recruitmentClosesAt"))).toISOString(), bracketBestOf: Number(data.get("bracketBestOf")) } }) });
      const body = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "이벤트전을 만들지 못했습니다.");
      router.push(`/admin/progress/event/${eventId}`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "이벤트전을 만들지 못했습니다."); setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit}><label>이벤트 이름<input name="title" maxLength={120} required /></label><label>설명<textarea name="description" maxLength={2000} rows={4} /></label><label>방식<select name="format"><option>POSITION</option><option>ARAM</option></select></label><label>모집 시작<input name="recruitmentOpensAt" type="datetime-local" required /></label><label>모집 마감<input name="recruitmentClosesAt" type="datetime-local" required /></label><label>대진 방식<select name="bracketBestOf">{[1,3,5,7,9].map((bestOf) => <option key={bestOf} value={bestOf}>BO{bestOf}</option>)}</select></label><button type="submit" disabled={busy}>{busy ? "생성 중…" : "이벤트전 생성"}</button><p role="status" aria-live="polite">{message}</p></form>;
}
