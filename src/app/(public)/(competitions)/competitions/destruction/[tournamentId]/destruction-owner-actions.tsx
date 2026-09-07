"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { OwnDestructionApplicationDto } from "@/modules/competitions/destruction";
import styles from "../../events.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function DestructionOwnerActions({ tournamentId, revision, status, signedIn, approved, application }: Readonly<{
  tournamentId: string;
  revision: number;
  status: string;
  signedIn: boolean;
  approved: boolean;
  application: OwnDestructionApplicationDto | null;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function mutate(path: string, method: "PUT" | "DELETE" | "POST", body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json", "If-Match": `"${revision}"`, "Idempotency-Key": `destruction-owner-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "요청을 처리하지 못했습니다.");
      setMessage("요청을 반영했습니다."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (!signedIn) return <section className={styles.applicationNotice}><p>참가 신청과 MVP 투표는 로그인이 필요합니다.</p><Link href={`/login?next=${encodeURIComponent(`/competitions/destruction/${tournamentId}`)}`}>로그인</Link></section>;
  if (!approved) return <section className={styles.applicationNotice} role="status">승인된 플레이어 계정만 참가 신청과 투표를 할 수 있어요.</section>;

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/application`, "PUT", { applicationId: application?.applicationId ?? crypto.randomUUID(), position: data.get("position") });
  }

  function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/mvp-vote`, "POST", { fixtureId: data.get("fixtureId"), candidatePlayerId: data.get("candidatePlayerId") });
  }

  return <section className={styles.application} aria-labelledby="destruction-owner-title">
    <h2 id="destruction-owner-title">내 참가 신청·MVP 투표</h2>
    {status === "RECRUITING" ? <form onSubmit={submitApplication}><label>주 포지션<select name="position" defaultValue={application?.position ?? "TOP"}>{positions.map((lane) => <option key={lane}>{lane}</option>)}</select></label><button disabled={busy}>{application ? "신청 수정" : "참가 신청"}</button>{application && ["APPLIED", "RESERVE"].includes(application.status) ? <button className={styles.secondary} type="button" disabled={busy} onClick={() => void mutate(`/api/competitions/destruction/${tournamentId}/application`, "DELETE", {})}>신청 취소</button> : null}</form> : <p>현재는 참가 신청 기간이 아닙니다.</p>}
    {["PRELIMINARY", "TOURNAMENT"].includes(status) ? <form onSubmit={submitVote}><label>경기 ID<input name="fixtureId" required /></label><label>후보 플레이어 UUID<input name="candidatePlayerId" required /></label><button disabled={busy}>MVP 투표·재투표</button></form> : null}
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message || (application ? `현재 신청 상태: ${application.status}` : "")}</p>
  </section>;
}
