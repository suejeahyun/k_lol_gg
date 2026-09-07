"use client";

import { Check, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  TEAM_BALANCE_TEAMS,
  type TeamBalanceDraft,
  type TeamBalanceLayoutEntry,
} from "@/modules/team-tools";

import styles from "../../../team-tools.module.css";

const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
const teamLabel = { BLUE: "블루", RED: "레드" } as const;

export function TeamBalanceDraftWorkspace({
  draft,
  endpointBase = `/api/team-tools/drafts/${draft.id}`,
  mode = "OWNER",
}: {
  draft: TeamBalanceDraft;
  endpointBase?: string;
  mode?: "OWNER" | "ADMIN";
}) {
  const router = useRouter();
  const autoCandidates = draft.candidates.filter((candidate) => candidate.source === "AUTO");
  const initialLayout = autoCandidates[0]?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? [];
  const [manualLayout, setManualLayout] = useState<TeamBalanceLayoutEntry[]>(initialLayout);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const participantName = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant.displayName])), [draft.participants]);

  async function mutate(action: "select" | "save" | "reevaluate", body: unknown) {
    setPending(action);
    setMessage("");
    try {
      const response = await fetch(`${endpointBase}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${draft.revision}"`,
          "Idempotency-Key": `team-balance-${action}-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "팀 초안을 변경하지 못했어요.");
      setMessage(action === "save" ? "선택한 팀을 저장했어요." : action === "reevaluate" ? "최신 통계로 다시 계산했어요." : "팀 후보를 선택했어요.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 초안을 변경하지 못했어요.");
    } finally {
      setPending("");
    }
  }

  function updateManual(slot: number, playerId: string) {
    setManualLayout((current) => current.map((entry, index) => index === slot ? { ...entry, playerId } : entry));
    setMessage("");
  }

  return (
    <>
      <section className={styles.draftHeader}>
        <div><span>{mode === "ADMIN" ? "ADMIN REVIEW · " : ""}ROUND {draft.evaluationRound}</span><h1>{draft.title}</h1><p>{mode === "ADMIN" ? `소유 계정 ${draft.ownerUserAccountId} · ` : ""}통계 generation {draft.ratingGeneration ?? "없음 · 중립값 적용"} · revision {draft.revision}</p></div>
        <strong data-status={draft.status}>{draft.status === "SAVED" ? "저장됨" : "평가 완료"}</strong>
      </section>

      <section className={styles.candidateSection} aria-labelledby="candidate-title">
        <div className={styles.heading}><div><span>TOP 3</span><h2 id="candidate-title">자동 추천 후보</h2></div></div>
        <div className={styles.candidateGrid}>
          {autoCandidates.map((candidate) => (
            <article key={candidate.id} data-selected={draft.selectedCandidateSignature === candidate.signature}>
              <header><strong>후보 {candidate.rank}</strong><span>총 페널티 {candidate.score.totalPenalty.toLocaleString()}</span></header>
              <div className={styles.compactTeams}>
                {TEAM_BALANCE_TEAMS.map((team) => <div key={team}><b>{teamLabel[team]}</b>{candidate.assignments.filter((entry) => entry.team === team).map((entry) => <span key={entry.playerId}><small>{positionLabel[entry.position]}</small>{participantName.get(entry.playerId) ?? entry.playerId}</span>)}</div>)}
              </div>
              <p>팀 차이 {candidate.score.teamStrength.difference} · 라인 차이 {candidate.score.positionDifferenceTotal} · 주/부/자동 {candidate.score.preference.mainCount}/{candidate.score.preference.subCount}/{candidate.score.preference.autoCount}</p>
              <button type="button" disabled={Boolean(pending)} onClick={() => mutate("select", { candidateRank: candidate.rank })}><Check size={16} aria-hidden="true" /> 이 후보 선택</button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.manualSection} aria-labelledby="manual-title">
        <div className={styles.heading}><div><span>MANUAL</span><h2 id="manual-title">수동 배치 후 같은 기준으로 재평가</h2></div></div>
        <div className={styles.manualGrid}>
          {manualLayout.map((entry, index) => (
            <label key={`${entry.team}-${entry.position}`}><span>{teamLabel[entry.team]} · {positionLabel[entry.position]}</span><select value={entry.playerId} onChange={(event) => updateManual(index, event.target.value)}>{draft.participants.map((participant) => <option value={participant.playerId} key={participant.playerId}>{participant.displayName}</option>)}</select></label>
          ))}
        </div>
        <button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || manualLayout.length !== 10} onClick={() => mutate("select", { layout: manualLayout })}><SlidersHorizontal size={17} aria-hidden="true" /> 수동 배치 평가·선택</button>
      </section>

      <section className={styles.draftActions} aria-label="초안 작업">
        <button className={styles.primaryButton} type="button" disabled={Boolean(pending) || !draft.selectedCandidateSignature || draft.status === "SAVED"} onClick={() => mutate("save", {})}><Save size={17} aria-hidden="true" /> 선택 팀 저장</button>
        <button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || draft.status === "ARCHIVED"} onClick={() => mutate("reevaluate", {})}><RefreshCw size={17} aria-hidden="true" /> 최신 통계로 재평가</button>
        <p role="status" aria-live="polite">{pending ? "처리 중…" : message}</p>
      </section>
    </>
  );
}
