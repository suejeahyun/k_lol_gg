"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "../../events.module.css";

type Application = Readonly<{ participantId: string; mainPosition: string | null; subPositions: readonly string[]; status: "ACTIVE" | "CANCELLED" }> | null;
const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function EventApplicationActions({ eventId, revision, format, open, signedIn, approved, application }: { eventId: string; revision: number; format: "POSITION" | "ARAM"; open: boolean; signedIn: boolean; approved: boolean; application: Application }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function mutate(method: "PUT" | "DELETE", body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/competitions/events/${eventId}/application`, { method, headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": `event-application-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "신청을 처리하지 못했습니다.");
      setMessage(method === "DELETE" ? "신청을 취소했습니다." : "참가 신청을 저장했습니다.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "신청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate("PUT", { participantId: application?.participantId ?? crypto.randomUUID(), mainPosition: format === "ARAM" ? null : data.get("mainPosition"), subPositions: format === "ARAM" ? [] : data.getAll("subPositions") });
  }

  if (!signedIn) return <p className={styles.applicationNotice}>참가 신청은 승인된 계정으로 로그인한 뒤 사용할 수 있어요.</p>;
  if (!approved) return <p className={styles.applicationNotice}>계정 승인과 활성 플레이어 연결이 필요해요.</p>;
  if (!open) return <p className={styles.applicationNotice}>현재는 참가 신청 기간이 아니에요.</p>;
  return <form className={styles.application} onSubmit={submit}>
    <h2>{application?.status === "ACTIVE" ? "내 신청 수정" : "참가 신청"}</h2>
    {format === "POSITION" ? <><label>주 포지션<select name="mainPosition" defaultValue={application?.mainPosition ?? "TOP"}>{positions.map((position) => <option key={position}>{position}</option>)}</select></label><fieldset><legend>부 포지션</legend>{positions.map((position) => <label key={position}><input type="checkbox" name="subPositions" value={position} defaultChecked={application?.subPositions.includes(position)} /> {position}</label>)}</fieldset></> : <p>칼바람 이벤트는 포지션을 선택하지 않아요.</p>}
    <div><button disabled={busy} type="submit">{application?.status === "ACTIVE" ? "신청 수정" : "신청하기"}</button>{application?.status === "ACTIVE" ? <button disabled={busy} type="button" className={styles.secondary} onClick={() => mutate("DELETE", {})}>신청 취소</button> : null}</div>
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message}</p>
  </form>;
}
