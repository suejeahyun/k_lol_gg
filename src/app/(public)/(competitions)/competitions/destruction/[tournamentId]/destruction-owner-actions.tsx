"use client";

import { FormEvent, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDestructionMutation } from "@/components/competitions/destruction/use-destruction-mutation";
import { APPLICATION_STATUS_LABEL } from "@/modules/competitions/destruction/workflow";
import { competitionPositionLabel } from "@/modules/competitions/core/display-projection";
import { MAX_REPORTED_GAMES, selfReportedRating, type SelfReportedModeRecord } from "@/modules/competitions/destruction/self-reported-rating";

import type { OwnDestructionApplicationDto, OwnDestructionMvpBallotDto } from "@/modules/competitions/destruction";
import styles from "../../events.module.css";

const positions = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

export function DestructionOwnerActions({ tournamentId, revision, status, signedIn, approved, application, mvpBallots, focusTarget = null, available = true, gameMode = "CLASSIC" }: Readonly<{
  tournamentId: string;
  revision: number;
  status: string;
  gameMode?: string;
  signedIn: boolean;
  approved: boolean;
  application: OwnDestructionApplicationDto | null;
  mvpBallots: readonly OwnDestructionMvpBallotDto[];
  focusTarget?: "apply" | "mvp" | null;
  available?: boolean;
}>) {
  const { busy, message, mutate, retryAvailable, retry, refresh } = useDestructionMutation(revision);
  const applicationRef = useRef<HTMLDivElement>(null);
  const mvpRef = useRef<HTMLDivElement>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const eligibleBallots = mvpBallots;
  const selectedBallot = eligibleBallots.find((ballot) => ballot.fixtureId === selectedFixtureId) ?? eligibleBallots[0];

  useLayoutEffect(() => {
    const target = focusTarget === "apply" ? applicationRef.current : focusTarget === "mvp" ? mvpRef.current : null;
    if (!target) return;
    const targetTop = target.getBoundingClientRect().top;
    if (targetTop < 0 || targetTop > window.innerHeight * 0.75) target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });
  }, [focusTarget]);

  if (!available) return <section className={styles.application} role="alert"><p>내 신청·투표 정보를 불러오지 못했습니다. 최신 상태를 확인한 뒤 다시 이용해 주세요.</p><button type="button" onClick={refresh}>다시 불러오기</button></section>;


  if (!signedIn) return <section className={styles.application}><div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2><p>참가 신청은 로그인이 필요합니다.</p><Link href={`/login?next=${encodeURIComponent(`/competitions/destruction/${tournamentId}?action=apply`)}`}>로그인</Link></div><div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2><p>투표는 로그인 후 이용할 수 있어요.</p></div></section>;
  if (!approved) return <section className={styles.application} role="status"><div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2><p>승인된 플레이어 계정만 참가 신청을 할 수 있어요.</p></div><div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2><p>계정 승인과 활성 플레이어 연결이 필요해요.</p></div></section>;

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/application`, "PUT", { applicationId: application?.applicationId ?? crypto.randomUUID(), position: data.get("position"), captainVolunteer: application?.status === "CONFIRMED" ? application.captainVolunteer : data.get("captainVolunteer") === "true",
      ...(gameMode === "CLASSIC" ? {} : { modeRecord: { wins: Number(data.get("wins")), losses: Number(data.get("losses")) } }) });
  }

  function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(`/api/competitions/destruction/${tournamentId}/mvp-vote`, "POST", { fixtureId: selectedBallot?.fixtureId, candidatePlayerId: data.get("candidatePlayerId") });
  }

  return <section className={styles.application} aria-label="내 참가 신청과 MVP 투표">
    <div ref={applicationRef} id="destruction-application" tabIndex={-1} role="region" aria-labelledby="destruction-application-title"><h2 id="destruction-application-title">참가 신청</h2>
      {(status === "RECRUITING" && application?.status !== "CONFIRMED") || application?.canEditModeRecord ? <form className={gameMode === "CLASSIC" ? undefined : styles.modeRecordForm} onSubmit={submitApplication}>
        {gameMode === "CLASSIC" ? <label>주 포지션<select name="position" defaultValue={application?.position ?? "TOP"}>{positions.map((lane) => <option key={lane} value={lane}>{competitionPositionLabel(lane)}</option>)}</select></label> : <>
          <p>{application?.status === "CONFIRMED" ? "참가가 확정되었습니다. 주장·팀 확정 전까지 승수·패수를 수정할 수 있습니다." : "포지션 구분 없이 참가 신청합니다."}</p>
          <ModeRecordFields key={application?.selfReportedRecord?.submittedAt ?? "new"} gameMode={gameMode} record={application?.selfReportedRecord} />
        </>}
        {application?.status !== "CONFIRMED" ? <><label>참가 역할<select key={`${application?.applicationId ?? "new"}:${application?.captainVolunteer ?? false}`} name="captainVolunteer" defaultValue={String(application?.captainVolunteer ?? false)}><option value="false">일반 선수</option><option value="true">주장 지원</option></select></label><p>주장 지원자는 운영자가 확인한 뒤 주장 확정 단계에서 선정합니다.</p></> : null}
        <button disabled={busy || retryAvailable}>{application?.status === "CONFIRMED" ? "승패 저장·점수 재계산" : application && ["APPLIED", "RESERVE"].includes(application.status) ? "신청 수정" : "참가 신청"}</button>
        {application && ["APPLIED", "RESERVE"].includes(application.status) ? <button className={styles.secondary} type="button" disabled={busy || retryAvailable} onClick={() => void mutate(`/api/competitions/destruction/${tournamentId}/application`, "DELETE", {})}>신청 취소</button> : null}
      </form> : <><p>{application?.status === "CONFIRMED" ? "참가가 확정되었습니다. 변경이 필요하면 운영자에게 요청해 주세요." : "현재는 참가 신청 기간이 아닙니다."}</p>{application?.selfReportedRecord ? <p>본인 기재: {application.selfReportedRecord.wins}승 {application.selfReportedRecord.losses}패 · 승패 수정 마감</p> : null}</>}
    </div>
    <div ref={mvpRef} id="destruction-mvp" tabIndex={-1} role="region" aria-labelledby="destruction-mvp-title"><h2 id="destruction-mvp-title">MVP 투표</h2>{["PRELIMINARY", "TOURNAMENT"].includes(status) && eligibleBallots.length ? <form onSubmit={submitVote}><label>투표할 경기<select value={selectedBallot?.fixtureId ?? ""} onChange={(event) => setSelectedFixtureId(event.target.value)}>{eligibleBallots.map((ballot) => <option key={ballot.fixtureId} value={ballot.fixtureId}>{ballot.fixtureName}</option>)}</select></label><label>MVP 후보<select key={selectedBallot?.fixtureId ?? "empty"} name="candidatePlayerId" required defaultValue=""><option value="" disabled>선수를 선택해 주세요</option>{selectedBallot?.candidates.map((candidate) => <option key={candidate.playerId} value={candidate.playerId}>{candidate.playerName}</option>)}</select></label><button disabled={busy || retryAvailable || !selectedBallot}>MVP 투표·재투표</button></form> : ["PRELIMINARY", "TOURNAMENT"].includes(status) ? <p>현재 내가 투표할 수 있는 경기가 없습니다.</p> : <p>경기가 시작되면 MVP 투표가 열려요.</p>}</div>
    {retryAvailable ? <button type="button" disabled={busy} onClick={() => void retry()}>요청 결과 다시 확인</button> : null}
    <p role="status" aria-live="polite">{busy ? "처리 중…" : message || (application ? `내 신청: ${APPLICATION_STATUS_LABEL[application.status]} · ${application.captainVolunteer ? "주장 지원" : "일반 선수"}` : "")}</p>
  </section>;
}

function ModeRecordFields({ gameMode, record }: { gameMode: string; record?: SelfReportedModeRecord }) {
  const [wins, setWins] = useState(record ? String(record.wins) : "");
  const [losses, setLosses] = useState(record ? String(record.losses) : "");
  const total = Number(wins) + Number(losses);
  const valid = wins !== "" && losses !== "" && [Number(wins), Number(losses)].every((n) => Number.isSafeInteger(n) && n >= 0) && total <= MAX_REPORTED_GAMES;
  const score = valid ? selfReportedRating({ mode: gameMode === "ARAM_MAYHEM" ? "ARAM_MAYHEM" : "ARAM", wins: Number(wins), losses: Number(losses), submittedAt: "" }, "").score : null;
  return <fieldset className={styles.modeRecord}><legend>{gameMode === "ARAM_MAYHEM" ? "증바람" : "일반 칼바람"} 누적 승패</legend>
    <p>연결된 본인 계정의 해당 모드 누적 승수·패수를 숫자로 입력해 주세요. 본인 기재 자료로 평가에 반영됩니다.</p>
    <label>승수<input name="wins" type="number" inputMode="numeric" min={0} max={MAX_REPORTED_GAMES} step={1} required value={wins} onChange={(event) => setWins(event.target.value)} /></label>
    <label>패수<input name="losses" type="number" inputMode="numeric" min={0} max={Math.max(0, MAX_REPORTED_GAMES - Number(wins || 0))} step={1} required value={losses} onChange={(event) => setLosses(event.target.value)} /></label>
    <p role="status" aria-live="polite">{valid ? `총 ${total}판 · ${total ? `승률 ${(Number(wins) / total * 100).toFixed(2)}% · 보정 점수 ${score!.toFixed(2)}` : "0승 0패는 평가 대기"}` : "승수와 패수를 입력해 주세요."}</p>
    <p>표본이 적으면 50점 쪽으로 보정합니다. 주장·팀 확정 후에는 입력값과 평가가 고정됩니다.</p>
  </fieldset>;
}
