"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { OwnDestructionApplicationDto, OwnDestructionMvpBallotDto } from "@/modules/competitions/destruction";
import { publicParticipationStatusLabel } from "@/modules/competitions/core";
import styles from "../../events.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function DestructionOwnerActions({ tournamentId, revision, status, signedIn, approved, application, mvpBallots, focusTarget = null }: Readonly<{
  tournamentId: string;
  revision: number;
  status: string;
  signedIn: boolean;
  approved: boolean;
  application: OwnDestructionApplicationDto | null;
  mvpBallots: readonly OwnDestructionMvpBallotDto[];
  focusTarget?: "apply" | "mvp" | null;
}>) {
  const router = useRouter();
  const applicationRef = useRef<HTMLDivElement>(null);
  const mvpRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const eligibleBallots = application ? mvpBallots : [];
  const selectedBallot = eligibleBallots.find((ballot) => ballot.fixtureId === selectedFixtureId) ?? eligibleBallots[0];

  useLayoutEffect(() => {
    const target = focusTarget === "apply" ? applicationRef.current : focusTarget === "mvp" ? mvpRef.current : null;
    if (!target) return;
    const targetTop = target.getBoundingClientRect().top;
    if (targetTop < 0 || targetTop > window.innerHeight * 0.75) target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }, [focusTarget]);

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

  if (!signedIn) return <section className={styles.application}><div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2><p>참가 신청은 로그인이 필요합니다.</p><Link href={`/login?next=${encodeURIComponent(`/competitions/destruction/${tournamentId}?action=apply`)}`}>로그인</Link></div><div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2><p>투표는 로그인 후 이용할 수 있어요.</p></div></section>;
  if (!approved) return <section className={styles.application} role="status"><div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2><p>승인된 플레이어 계정만 참가 신청을 할 수 있어요.</p></div><div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2><p>계정 승인과 활성 플레이어 연결이 필요해요.</p></div></section>;

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/application`, "PUT", { applicationId: application?.applicationId ?? crypto.randomUUID(), position: data.get("position") });
  }

  function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/mvp-vote`, "POST", { fixtureId: selectedBallot?.fixtureId, candidatePlayerId: data.get("candidatePlayerId") });
  }

  return <section className={styles.application} aria-label="내 참가 신청과 MVP 투표">
    <div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2>{status === "RECRUITING" ? <form onSubmit={submitApplication}><label>주 포지션<select name="position" defaultValue={application?.position ?? "TOP"}>{positions.map((lane) => <option key={lane}>{lane}</option>)}</select></label><button disabled={busy}>{application ? "신청 수정" : "참가 신청"}</button>{application && ["APPLIED", "RESERVE"].includes(application.status) ? <button className={styles.secondary} type="button" disabled={busy} onClick={() => void mutate(`/api/competitions/destruction/${tournamentId}/application`, "DELETE", {})}>신청 취소</button> : null}</form> : <p>현재는 참가 신청 기간이 아닙니다.</p>}</div>
    <div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2>{["PRELIMINARY", "TOURNAMENT"].includes(status) && eligibleBallots.length ? <form onSubmit={submitVote}><label>투표할 경기<select value={selectedBallot?.fixtureId ?? ""} onChange={(event) => setSelectedFixtureId(event.target.value)}>{eligibleBallots.map((ballot) => <option key={ballot.fixtureId} value={ballot.fixtureId}>{ballot.fixtureName}</option>)}</select></label><label>MVP 후보<select key={selectedBallot?.fixtureId ?? "empty"} name="candidatePlayerId" required defaultValue=""><option value="" disabled>선수를 선택해 주세요</option>{selectedBallot?.candidates.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.playerName}</option>)}</select></label><button disabled={busy || !selectedBallot}>MVP 투표·재투표</button></form> : ["PRELIMINARY", "TOURNAMENT"].includes(status) ? <p>현재 내가 투표할 수 있는 경기가 없습니다.</p> : <p>경기가 시작되면 MVP 투표가 열려요.</p>}</div>
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message || (application ? `현재 신청 상태: ${publicParticipationStatusLabel(application.status)}` : "")}</p>
  </section>;
}
