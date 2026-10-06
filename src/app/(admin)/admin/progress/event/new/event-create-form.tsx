"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { competitionEventFormatLabel } from "@/modules/competitions/core/display-projection";
import styles from "../event-admin.module.css";

export function EventCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const pending = useRef<{ eventId: string; key: string; body: string } | null>(null);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    setNeedsSignIn(false);
    let confirmed = false;
    try {
      if (!pending.current) {
        const data = new FormData(event.currentTarget);
        const eventId = crypto.randomUUID();
        pending.current = {
          eventId,
          key: `event-create-${crypto.randomUUID()}`,
          body: JSON.stringify({ eventId, settings: {
            title: data.get("title"), description: data.get("description") || null,
            format: data.get("format"),
            recruitmentOpensAt: new Date(String(data.get("recruitmentOpensAt"))).toISOString(),
            recruitmentClosesAt: new Date(String(data.get("recruitmentClosesAt"))).toISOString(),
            bracketBestOf: Number(data.get("bracketBestOf")),
          } }),
        };
      }
      const request = pending.current;
      const response = await fetch("/api/admin/competitions/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": request.key },
        body: request.body,
        signal: AbortSignal.timeout(15_000),
      });
      // Authorization/rate-limit rejection cannot resolve an earlier committed request.
      if ([401, 403, 408, 429].includes(response.status) || response.status >= 500) {
        setNeedsSignIn(response.status === 401 || response.status === 403);
        throw new Error("생성 결과를 확인하지 못했습니다.");
      }
      const body = await response.json() as { detail?: string };
      pending.current = null;
      setUncertain(false);
      if (!response.ok) throw new Error(body.detail ?? "이벤트전을 만들지 못했습니다.");
      confirmed = true;
      router.push(`/admin/progress/event/${request.eventId}`);
      router.refresh();
    } catch (error) {
      setUncertain(pending.current !== null);
      setMessage(pending.current
        ? "생성 결과를 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해 주세요."
        : error instanceof Error ? error.message : "이벤트전을 만들지 못했습니다.");
      if (!confirmed) setBusy(false);
    } finally {
      if (!confirmed) submitting.current = false;
    }
  }

  return <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    <fieldset className={styles.createFields} disabled={busy || uncertain}>
      <legend>이벤트전 설정</legend>
      <label>이벤트 이름<input name="title" maxLength={120} required /></label>
      <label>설명<textarea name="description" maxLength={2000} rows={4} /></label>
      <label>방식<select name="format">{["POSITION", "ARAM"].map((format) => <option key={format} value={format}>{competitionEventFormatLabel(format)}</option>)}</select></label>
      <label>모집 시작<input name="recruitmentOpensAt" type="datetime-local" required /></label>
      <label>모집 마감<input name="recruitmentClosesAt" type="datetime-local" required /></label>
      <label>대진 방식<select name="bracketBestOf">{[1,3,5,7,9].map((bestOf) => <option key={bestOf} value={bestOf}>{bestOf === 1 ? "단판" : `${bestOf}판 ${Math.ceil(bestOf / 2)}선승`}</option>)}</select></label>
    </fieldset>
    <button type="submit" disabled={busy}>{busy ? "생성 중…" : uncertain ? "생성 결과 다시 확인" : "이벤트전 생성"}</button>
    {message ? <p role="alert">{message}</p> : null}
    {needsSignIn ? <a href="/admin/login" target="_blank" rel="noreferrer">관리자 로그인 (새 창)</a> : null}
  </form>;
}
