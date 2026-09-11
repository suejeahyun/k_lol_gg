"use client";

import Link from "next/link";
import { Archive, ArrowRight, Check, Copy, GripVertical, RefreshCw, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  TEAM_BALANCE_TEAMS,
  formatTeamBalanceShareText,
  type TeamBalanceDraftCandidate,
  type TeamBalanceDraft,
  type TeamBalanceLayoutEntry,
} from "@/modules/team-tools";

import styles from "../../../team-tools.module.css";

const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
const teamLabel = { BLUE: "블루", RED: "레드" } as const;
const preferenceLabel = { MAIN: "주", SUB: "부", AUTO: "자동" } as const;
const candidateCriteria = {
  V1_AI_GLOBAL: { label: "V1 전체탐색 추천", description: "V1의 전체 후보 AI 평가 순서로 선택한 단일 추천 결과" },
  OVERALL_BALANCE: { label: "종합 균형", description: "팀 전력·라인 차이·포지션 선호를 모두 반영한 추천" },
  POSITION_BALANCE: { label: "라인 균형", description: "각 라인의 맞대결 점수 차이를 가장 먼저 줄인 추천" },
  PREFERENCE_PRIORITY: { label: "주 포지션 우선", description: "참가자가 신청한 주 포지션 배치를 가장 먼저 지킨 추천" },
  LEGACY: { label: "이전 계산 후보", description: "새 3가지 기준을 적용하려면 아래 재평가 버튼을 눌러 주세요." },
  MANUAL: { label: "수동 배치", description: "사용자가 직접 교체하고 서버에서 다시 평가한 배치" },
} as const;

function candidateCriterion(candidate: Pick<TeamBalanceDraftCandidate, "criterion">) {
  return candidateCriteria[candidate.criterion ?? "LEGACY"];
}

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
  const hasLegacyCandidates = autoCandidates.some((candidate) => !candidate.criterion || candidate.criterion === "LEGACY");
  const initialLayout = (selectedCandidate ?? autoCandidates[0])?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? [];
  const [manualLayout, setManualLayout] = useState<TeamBalanceLayoutEntry[]>(initialLayout);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [keyboardSlot, setKeyboardSlot] = useState<number | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const participantById = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant])), [draft.participants]);
  const participantName = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant.displayName])), [draft.participants]);

  async function mutate(action: "select" | "save" | "reevaluate" | "archive" | "restore", body: unknown) {
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
      setMessage(action === "save"
        ? "선택한 팀을 저장했어요."
        : action === "reevaluate"
          ? "최신 통계로 다시 계산했어요."
          : action === "archive"
            ? "초안을 보관했어요. 일반 사용자 목록에서는 더 이상 보이지 않아요."
            : action === "restore"
              ? "보관한 초안을 복구했어요."
              : "팀 배치를 적용했어요.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 초안을 변경하지 못했어요.");
    } finally {
      setPending("");
    }
  }

  async function copySelectedResult() {
    if (!selectedCandidate) return;
    setMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("이 브라우저에서는 클립보드 복사를 사용할 수 없어요.");
      await navigator.clipboard.writeText(formatTeamBalanceShareText(selectedCandidate, draft.participants));
      setMessage("V1 형식의 팀 결과를 복사했어요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 결과를 복사하지 못했어요.");
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
        <strong data-status={draft.status}>{draft.status === "ARCHIVED" ? "보관됨" : draft.status === "SAVED" ? "저장됨" : "평가 완료"}</strong>
      </section>

      <section className={styles.candidateSection} aria-labelledby="candidate-title">
        <div className={styles.heading}><div><span>V1 AI GLOBAL · ONE RESULT</span><h2 id="candidate-title">V1 기준 추천 결과</h2><p className={styles.stageHint}>전체 조합을 V1 기준으로 평가해 가장 높은 한 가지 결과를 바로 적용합니다.</p></div></div>
        {selectedCandidate ? <div className={styles.evaluationOverview} role="status"><div><span>현재 선택 기준</span><strong>{candidateCriterion(selectedCandidate).label}</strong></div><div><span>추천 점수</span><strong>{selectedCandidate.score.v1?.recommendationScore ?? selectedCandidate.score.totalPenalty.toLocaleString()}</strong></div><div><span>팀 차이</span><strong>{selectedCandidate.score.teamStrength.difference}</strong></div><div><span>예상 승률</span><strong>R {selectedCandidate.score.v1?.predictedRedWinRate.toFixed(1) ?? "-"}% · B {selectedCandidate.score.v1?.predictedBlueWinRate.toFixed(1) ?? "-"}%</strong></div></div> : null}
        <div className={styles.candidateGrid}>
          {autoCandidates.slice(0, 1).map((candidate) => {
            const criterion = candidateCriterion(candidate);
            const selected = draft.selectedCandidateSignature === candidate.signature;
            return <article key={candidate.id} data-selected={selected}>
              <header><strong>{criterion.label}</strong><span>{selected ? "적용 중" : "추천 결과"}</span></header>
              <p>{criterion.description}</p>
              {candidate.score.v1?.missingSources.length ? <p role="note">V2에 원본 이관되지 않은 최근 솔랭 상세·관리자 보정은 V1의 데이터 없음(0) 경로로 계산했습니다.</p> : null}
              <div className={styles.candidateMetrics}><span>품질 점수 <b>{candidate.score.v1?.qualityScore ?? "-"}</b></span><span>팀 차이 <b>{candidate.score.teamStrength.difference}</b></span><span>라인 차이 <b>{candidate.score.positionDifferenceTotal}</b></span><span>주/부/자동 <b>{candidate.score.preference.mainCount}/{candidate.score.preference.subCount}/{candidate.score.preference.autoCount}</b></span></div>
              <div className={styles.lineComparison} aria-label={`${candidate.rank}안 라인별 비교`}>{candidate.score.positions.map((line) => { const blue = candidate.assignments.find((entry) => entry.team === "BLUE" && entry.position === line.position); const red = candidate.assignments.find((entry) => entry.team === "RED" && entry.position === line.position); return <span key={line.position}><b>{positionLabel[line.position]}</b><em>{blue ? participantName.get(blue.playerId) : "-"}</em><small>↔</small><em>{red ? participantName.get(red.playerId) : "-"}</em><strong>{line.difference}</strong></span>; })}</div>
              <button type="button" aria-pressed={selected} disabled={Boolean(pending) || selected || draft.status === "ARCHIVED"} onClick={() => mutate("select", { candidateRank: candidate.rank })}><Check size={16} aria-hidden="true" /> {selected ? `${criterion.label} 적용 중` : `${criterion.label} 선택`}</button>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.manualSection} aria-labelledby="manual-title">
        <div className={styles.heading}><div><span>MANUAL BOARD</span><h2 id="manual-title">수동 배치와 서버 재평가</h2><p className={styles.stageHint}>플레이어 카드를 클릭한 채 원하는 자리로 끌어 놓으세요. 키보드에서는 교체 버튼을 두 번 선택하면 돼요.</p></div></div>
        <div className={styles.manualTeams}>
          {TEAM_BALANCE_TEAMS.map((team) => <section key={team} data-team={team} aria-labelledby={`manual-${team.toLowerCase()}-title`}>
            <header><h3 id={`manual-${team.toLowerCase()}-title`}>{teamLabel[team]} 팀</h3><span>5명</span></header>
            <div>{manualLayout.map((entry, index) => {
              if (entry.team !== team) return null;
              const participant = participantById.get(entry.playerId);
              const eligibility = participant?.eligiblePositions
                .map((eligible) => `${positionLabel[eligible.position]} ${preferenceLabel[eligible.preference]}`)
                .join(" · ") ?? "포지션 정보 없음";
              const rating = participant?.rating;
              const ratingSummary = rating?.overall === null || rating?.overall === undefined
                ? "기본 점수 50 · 전적 표본 없음"
                : `밸런스 ${rating.overall} · 신뢰도 ${Math.round((rating.confidence ?? 0) * 100)}% · 표본 ${rating.sampleSize ?? 0}`;
              return <article
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
              >
                <div className={styles.manualPlayerName}><GripVertical aria-hidden="true"/><b>{positionLabel[entry.position]}</b><strong>{participantName.get(entry.playerId) ?? entry.playerId}</strong><small>드래그해 교체</small></div>
                <div className={styles.manualPlayerInfo}><strong>{eligibility}</strong><small>{ratingSummary}</small></div>
                <button type="button" aria-pressed={keyboardSlot === index} onClick={() => selectKeyboardSlot(index)}>{keyboardSlot === null ? "교체할 카드 선택" : keyboardSlot === index ? "선택 취소" : "이 카드와 교체"}</button>
              </article>;
            })}</div>
          </section>)}
        </div>
        <div className={styles.manualEvaluation}><div><span>SERVER EVALUATION</span><strong>현재 수동 배치를 V1 계산 기준으로 다시 평가합니다.</strong><small>브라우저 임시 점수를 저장하지 않고 서버가 참가자·포지션·점수를 검증한 결과만 선택합니다.</small></div><button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || manualLayout.length !== 10 || draft.status === "ARCHIVED"} onClick={() => mutate("select", { layout: manualLayout })}><SlidersHorizontal size={17} aria-hidden="true" /> 수동 배치 평가·선택</button></div>
      </section>

      <section className={styles.draftActions} aria-label="초안 작업">
        <button className={styles.primaryButton} type="button" disabled={Boolean(pending) || !draft.selectedCandidateSignature || draft.status === "SAVED" || draft.status === "ARCHIVED"} onClick={() => mutate("save", {})}><Save size={17} aria-hidden="true" /> 선택 팀 저장</button>
        <button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || !selectedCandidate} onClick={() => void copySelectedResult()}><Copy size={17} aria-hidden="true" /> 팀 결과 복사</button>
        <button className={styles.secondaryButton} type="button" disabled={Boolean(pending) || draft.status === "ARCHIVED"} onClick={() => mutate("reevaluate", {})}><RefreshCw size={17} aria-hidden="true" /> {hasLegacyCandidates ? "V1 기준으로 재평가" : "최신 통계로 재평가"}</button>
        {mode === "OWNER" && draft.selectedCandidateSignature && draft.status !== "ARCHIVED" ? <Link className={styles.primaryLink} href={`/matches/submit?teamBalanceDraftId=${encodeURIComponent(draft.id)}`}>이 팀으로 경기 결과 접수 <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        {mode === "ADMIN" && draft.selectedCandidateSignature && draft.status !== "ARCHIVED" ? <Link className={styles.primaryLink} href={`/admin/matches/new?teamBalanceDraftId=${encodeURIComponent(draft.id)}`}>선택 팀으로 경기 등록 <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        {mode === "ADMIN" && draft.status !== "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={Boolean(pending)} onClick={() => mutate("archive", {})}><Archive size={17} aria-hidden="true" /> 초안 보관</button> : null}
        {mode === "ADMIN" && draft.status === "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={Boolean(pending)} onClick={() => mutate("restore", {})}><RotateCcw size={17} aria-hidden="true" /> 초안 복구</button> : null}
        <p role="status" aria-live="polite">{pending ? "처리 중…" : message}</p>
      </section>
    </>
  );
}
