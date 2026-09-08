"use client";

import Link from "next/link";
import { ArrowRight, Check, GripVertical, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
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
  const selectedCandidate = draft.candidates.find((candidate) => candidate.signature === draft.selectedCandidateSignature) ?? null;
  const initialLayout = (selectedCandidate ?? autoCandidates[0])?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? [];
  const [manualLayout, setManualLayout] = useState<TeamBalanceLayoutEntry[]>(initialLayout);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [keyboardSlot, setKeyboardSlot] = useState<number | null>(null);
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

  function swapManual(sourceSlot: number, targetSlot: number) {
    if (sourceSlot === targetSlot) return;
    setManualLayout((current) => {
      const source = current[sourceSlot];
      const target = current[targetSlot];
      if (!source || !target) return current;
      return current.map((entry, index) => index === sourceSlot
        ? { ...entry, playerId: target.playerId }
        : index === targetSlot
          ? { ...entry, playerId: source.playerId }
          : entry);
    });
    setMessage("");
  }

  function updateManual(slot: number, playerId: string) {
    const sourceSlot = manualLayout.findIndex((entry) => entry.playerId === playerId);
    if (sourceSlot >= 0) swapManual(sourceSlot, slot);
  }

  function selectKeyboardSlot(slot: number) {
    if (keyboardSlot === null) {
      setKeyboardSlot(slot);
      setMessage("교체할 두 번째 슬롯을 선택해 주세요.");
      return;
    }
    if (keyboardSlot === slot) {
      setKeyboardSlot(null);
      setMessage("교체 선택을 취소했어요.");
      return;
    }
    swapManual(keyboardSlot, slot);
    setKeyboardSlot(null);
    setMessage("두 슬롯의 플레이어를 교체했어요. 서버 평가로 확인해 주세요.");
  }

  return (
    <>
      <section className={styles.draftHeader}>
        <div><span>{mode === "ADMIN" ? "ADMIN REVIEW · " : ""}ROUND {draft.evaluationRound}</span><h1>{draft.title}</h1><p>{mode === "ADMIN" ? `소유 계정 ${draft.ownerUserAccountId} · 통계 generation ${draft.ratingGeneration ?? "없음 · 중립값 적용"} · revision ${draft.revision}` : draft.ratingGeneration ? `최신 통계 ${draft.ratingGeneration}차 반영` : "기본 점수 적용"}</p></div>
        <strong data-status={draft.status}>{draft.status === "SAVED" ? "저장됨" : "평가 완료"}</strong>
      </section>

      <section className={styles.candidateSection} aria-labelledby="candidate-title">
        <div className={styles.heading}><div><span>AUTO OPTIONS · TOP 3</span><h2 id="candidate-title">자동 추천 후보 비교</h2><p className={styles.stageHint}>세 후보의 팀 차이와 라인 차이를 비교한 뒤 사용할 배치를 선택하세요.</p></div></div>
        {selectedCandidate ? <div className={styles.evaluationOverview} role="status"><div><span>현재 선택</span><strong>{selectedCandidate.source === "AUTO" ? `${selectedCandidate.rank}안` : "수동 배치"}</strong></div><div><span>총 페널티</span><strong>{selectedCandidate.score.totalPenalty.toLocaleString()}</strong></div><div><span>팀 차이</span><strong>{selectedCandidate.score.teamStrength.difference}</strong></div><div><span>라인 차이</span><strong>{selectedCandidate.score.positionDifferenceTotal}</strong></div></div> : null}
        <div className={styles.candidateGrid}>
          {autoCandidates.map((candidate) => (
            <article key={candidate.id} data-selected={draft.selectedCandidateSignature === candidate.signature}>
              <header><strong>{candidate.rank}안</strong><span>{draft.selectedCandidateSignature === candidate.signature ? "선택 중" : "비교 후보"}</span></header>
              <div className={styles.candidateMetrics}><span>총 페널티 <b>{candidate.score.totalPenalty.toLocaleString()}</b></span><span>팀 차이 <b>{candidate.score.teamStrength.difference}</b></span><span>라인 차이 <b>{candidate.score.positionDifferenceTotal}</b></span><span>주/부/자동 <b>{candidate.score.preference.mainCount}/{candidate.score.preference.subCount}/{candidate.score.preference.autoCount}</b></span></div>
              <div className={styles.lineComparison} aria-label={`${candidate.rank}안 라인별 비교`}>{candidate.score.positions.map((line) => { const blue = candidate.assignments.find((entry) => entry.team === "BLUE" && entry.position === line.position); const red = candidate.assignments.find((entry) => entry.team === "RED" && entry.position === line.position); return <span key={line.position}><b>{positionLabel[line.position]}</b><em>{blue ? participantName.get(blue.playerId) : "-"}</em><small>↔</small><em>{red ? participantName.get(red.playerId) : "-"}</em><strong>{line.difference}</strong></span>; })}</div>
              <button type="button" aria-pressed={draft.selectedCandidateSignature === candidate.signature} disabled={Boolean(pending) || draft.selectedCandidateSignature === candidate.signature} onClick={() => mutate("select", { candidateRank: candidate.rank })}><Check size={16} aria-hidden="true" /> {draft.selectedCandidateSignature === candidate.signature ? "선택한 후보" : "이 후보 선택"}</button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.manualSection} aria-labelledby="manual-title">
        <div className={styles.heading}><div><span>MANUAL BOARD</span><h2 id="manual-title">수동 배치와 서버 재평가</h2><p className={styles.stageHint}>플레이어 카드를 클릭한 채 원하는 자리로 끌어 놓으세요. 키보드에서는 교체 버튼을 두 번 선택하면 돼요.</p></div></div>
        <div className={styles.manualTeams}>
          {TEAM_BALANCE_TEAMS.map((team) => <section key={team} data-team={team} aria-labelledby={`manual-${team.toLowerCase()}-title`}><header><h3 id={`manual-${team.toLowerCase()}-title`}>{teamLabel[team]} 팀</h3><span>5명</span></header><div>{manualLayout.map((entry, index) => entry.team !== team ? null : <article
            key={`${entry.team}-${entry.position}`}
            draggable
            data-manual-slot={index}
            data-dragging={draggingSlot === index ? "true" : undefined}
            data-drop-target={dragOverSlot === index && draggingSlot !== index ? "true" : undefined}
            data-keyboard-selected={keyboardSlot === index ? "true" : undefined}
            aria-label={`${teamLabel[team]} 팀 ${positionLabel[entry.position]} ${participantName.get(entry.playerId) ?? entry.playerId}. 클릭한 채 다른 카드로 끌어 교체`}
            title="클릭한 채 다른 플레이어 카드로 끌어 교체"
            onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); setDraggingSlot(index); setDragOverSlot(index); setMessage("교체할 자리 위에 카드를 놓아 주세요."); }}
            onDragEnd={() => { setDraggingSlot(null); setDragOverSlot(null); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSlot(index); }}
            onDrop={(event) => { event.preventDefault(); const sourceSlot = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(sourceSlot) && sourceSlot !== index) { swapManual(sourceSlot, index); setMessage("두 플레이어의 자리를 바꿨어요. 서버 평가로 확인해 주세요."); } setDraggingSlot(null); setDragOverSlot(null); }}
          ><div><GripVertical aria-hidden="true"/><b>{positionLabel[entry.position]}</b><strong>{participantName.get(entry.playerId) ?? entry.playerId}</strong><small>끌어서 이동</small></div><label><span className="sr-only">{teamLabel[team]} {positionLabel[entry.position]} 플레이어</span><select value={entry.playerId} onChange={(event) => updateManual(index, event.target.value)}>{draft.participants.map((participant) => <option value={participant.playerId} key={participant.playerId}>{participant.displayName}</option>)}</select></label><button type="button" aria-pressed={keyboardSlot === index} onClick={() => selectKeyboardSlot(index)}>{keyboardSlot === null ? "교체 시작" : keyboardSlot === index ? "선택 취소" : "여기와 교체"}</button></article>)}</div></section>)}
        </div>
        <div className={styles.manualEvaluation}><div><span>SERVER EVALUATION</span><strong>현재 수동 배치를 V2 계산 기준으로 다시 평가합니다.</strong><small>브라우저 임시 점수를 저장하지 않고 서버가 참가자·포지션·점수를 검증한 결과만 선택합니다.</small></div><button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || manualLayout.length !== 10} onClick={() => mutate("select", { layout: manualLayout })}><SlidersHorizontal size={17} aria-hidden="true" /> 수동 배치 평가·선택</button></div>
      </section>

      <section className={styles.draftActions} aria-label="초안 작업">
        <button className={styles.primaryButton} type="button" disabled={Boolean(pending) || !draft.selectedCandidateSignature || draft.status === "SAVED"} onClick={() => mutate("save", {})}><Save size={17} aria-hidden="true" /> 선택 팀 저장</button>
        <button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || draft.status === "ARCHIVED"} onClick={() => mutate("reevaluate", {})}><RefreshCw size={17} aria-hidden="true" /> 최신 통계로 재평가</button>
        {mode === "OWNER" && draft.selectedCandidateSignature && draft.status !== "ARCHIVED" ? <Link className={styles.primaryLink} href={`/matches/submit?teamBalanceDraftId=${encodeURIComponent(draft.id)}`}>이 팀으로 경기 결과 접수 <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        <p role="status" aria-live="polite">{pending ? "처리 중…" : message}</p>
      </section>
    </>
  );
}
