"use client";

import Link from "next/link";
import { Archive, ArrowRight, Check, Copy, GripVertical, RefreshCw, RotateCcw, Save, SlidersHorizontal } from "@/components/theme/theme-icons";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";

import {
  TEAM_BALANCE_TEAMS,
  TEAM_BALANCE_V1_FORMULA_VERSION,
  evaluateTeamBalanceLayout,
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
  V1_AI_GLOBAL: { label: "내전 규칙 추천", description: null },
  OVERALL_BALANCE: { label: "종합 균형", description: "팀 전력·라인 차이·포지션 선호를 모두 반영한 추천" },
  POSITION_BALANCE: { label: "라인 균형", description: "필수 조건과 심한 불균형을 먼저 검사하고 라인 격차를 줄인 추천" },
  PREFERENCE_PRIORITY: { label: "주 포지션 우선", description: "필수 조건과 심한 불균형을 먼저 검사하고 주 포지션 만족도를 높인 추천" },
  LEGACY: { label: "이전 계산 결과", description: "최신 평가 기준을 적용하려면 아래 재평가 버튼을 눌러 주세요." },
  MANUAL: { label: "수동 배치", description: "사용자가 직접 교체하고 서버에서 다시 평가한 배치" },
} as const;

function candidateCriterion(candidate: Pick<TeamBalanceDraftCandidate, "criterion">) {
  return candidateCriteria[candidate.criterion ?? "LEGACY"];
}

function differenceTone(value: number) {
  if (value === 0) return "even";
  if (value <= 5) return "close";
  return "open";
}

function fairnessLabel(candidate: TeamBalanceDraftCandidate) {
  if (candidate.score.fairness?.status === "INVALID") return "필수 조건 위반";
  if (!hasCurrentRules(candidate)) return "최신 기준 재평가 필요";
  switch (candidate.score.fairness?.status) {
    case "BALANCED": return "균형 추천";
    case "CONDITIONAL": return "조건부 편성";
    case "REVIEW_REQUIRED": return "정보 확인 필요";
    default: return "규칙 재평가 필요";
  }
}

function hasCurrentRules(candidate: TeamBalanceDraftCandidate) {
  return Boolean(candidate.score.fairness) && candidate.score.v1?.formulaVersion === TEAM_BALANCE_V1_FORMULA_VERSION;
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
  const selectedInvalid = selectedCandidate?.score.fairness?.status === "INVALID";
  const hasLegacyCandidates = autoCandidates.some((candidate) => !hasCurrentRules(candidate) || !candidate.criterion || candidate.criterion === "LEGACY");
  const initialLayout = (selectedCandidate ?? autoCandidates[0])?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? [];
  const [manualLayout, setManualLayout] = useState<TeamBalanceLayoutEntry[]>(initialLayout);
  const [checkedManualLayout, setCheckedManualLayout] = useState<{
    layout: TeamBalanceLayoutEntry[];
    participants: TeamBalanceDraft["participants"];
    evaluation: ReturnType<typeof evaluateTeamBalanceLayout>;
  } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [keyboardSlot, setKeyboardSlot] = useState<number | null>(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const mutationKeys = useRef(new ClientMutationKeyStore("team-balance-draft")).current;
  const sending = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = Boolean(pending) || refreshing;
  const manualChanged = manualLayout.length !== initialLayout.length || manualLayout.some((entry) =>
    !initialLayout.some((selected) => selected.playerId === entry.playerId && selected.team === entry.team && selected.position === entry.position));
  const manualLocked = busy || draft.status === "ARCHIVED";
  const resultHref = mode === "OWNER" ? `/matches/submit?teamBalanceDraftId=${encodeURIComponent(draft.id)}` : `/admin/matches/new?teamBalanceDraftId=${encodeURIComponent(draft.id)}`;
  const resultLabel = mode === "OWNER" ? "이 팀으로 경기 결과 접수" : "선택 팀으로 경기 등록";
  const participantById = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant])), [draft.participants]);
  const participantName = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant.displayName])), [draft.participants]);
  const manualPreview = useMemo(() => {
    if (!manualChanged) return null;
    // Reuse the swap's hard-rule check so one changed layout is scored once.
    if (checkedManualLayout?.layout === manualLayout && checkedManualLayout.participants === draft.participants) return checkedManualLayout.evaluation;
    try {
      return evaluateTeamBalanceLayout(draft.participants, manualLayout);
    } catch {
      return null;
    }
  }, [manualChanged, manualLayout, draft.participants, checkedManualLayout]);
  const beforeScore = (selectedCandidate ?? autoCandidates[0])?.score.teamStrength;

  async function mutate(action: "select" | "save" | "reevaluate" | "archive" | "restore", body: unknown) {
    if (busy || sending.current) return;
    if (manualChanged && (action === "save" || action === "reevaluate")) return;
    if (action === "save" && selectedInvalid) return;
    if (action === "select" && typeof body === "object" && body !== null && "candidateRank" in body &&
      draft.candidates.some((candidate) => candidate.rank === body.candidateRank && candidate.score.fairness?.status === "INVALID")) return;
    sending.current = true;
    setPending(action);
    setMessage("");
    const ticket = mutationKeys.issue(`POST:${endpointBase}/${action}`, draft.revision, body);
    try {
      const response = await fetch(`${endpointBase}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${draft.revision}"`,
          "Idempotency-Key": ticket.key,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(result.detail ?? "팀 초안을 변경하지 못했어요.");
      mutationKeys.complete(ticket);
      setMessage(action === "save"
        ? "선택한 팀을 저장했어요."
        : action === "reevaluate"
          ? "최신 통계로 다시 계산했어요."
          : action === "archive"
            ? "초안을 보관했어요. 일반 사용자 목록에서는 더 이상 보이지 않아요."
            : action === "restore"
              ? "보관한 초안을 복구했어요."
              : "팀 배치를 적용했어요.");
      startRefresh(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 초안을 변경하지 못했어요.");
    } finally {
      sending.current = false;
      setPending("");
    }
  }

  async function copySelectedResult() {
    if (!selectedCandidate || selectedInvalid || manualChanged || busy || sending.current) return;
    setMessage("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("이 브라우저에서는 클립보드 복사를 사용할 수 없어요.");
      await navigator.clipboard.writeText(formatTeamBalanceShareText(selectedCandidate, draft.participants));
      setMessage("팀 결과를 복사했어요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "팀 결과를 복사하지 못했어요.");
    }
  }

  function swapManual(sourceSlot: number, targetSlot: number) {
    if (manualLocked || sending.current || sourceSlot === targetSlot) return false;
    const source = manualLayout[sourceSlot];
    const target = manualLayout[targetSlot];
    if (!source || !target) return false;
    if (!participantById.get(source.playerId)?.eligiblePositions.some((entry) => entry.position === target.position) ||
      !participantById.get(target.playerId)?.eligiblePositions.some((entry) => entry.position === source.position)) {
      setMessage("허용하지 않은 포지션으로는 교체할 수 없어요. 참가자의 가능 포지션을 확인해 주세요.");
      return false;
    }
    const nextLayout = manualLayout.map((entry, index) => index === sourceSlot
        ? { ...entry, playerId: target.playerId }
        : index === targetSlot
          ? { ...entry, playerId: source.playerId }
          : entry);
    try {
      const evaluation = evaluateTeamBalanceLayout(draft.participants, nextLayout);
      setCheckedManualLayout({ layout: nextLayout, participants: draft.participants, evaluation });
    } catch {
      setMessage("현재 참가자 정보로는 이 교체가 필수 조건을 충족하지 못해요. 허용 포지션과 바텀의 큰 티어 3단계 제한을 확인해 주세요.");
      return false;
    }
    setManualLayout(nextLayout);
    setMessage("두 플레이어의 자리를 바꿨어요. 서버 평가로 확인해 주세요.");
    return true;
  }

  function selectKeyboardSlot(slot: number) {
    if (manualLocked || sending.current) return;
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
  }

  return (
    <>
      <section className={styles.draftHeader} data-status={draft.status}>
        <div><span>{mode === "ADMIN" ? "관리자 검토 · " : ""}평가 {draft.evaluationRound}회</span><h1>{draft.title}</h1><p>{mode === "ADMIN" ? `소유 계정 ${draft.ownerUserAccountId} · 통계 generation ${draft.ratingGeneration ?? "없음 · 중립값 적용"} · revision ${draft.revision}` : draft.ratingGeneration ? `최신 통계 ${draft.ratingGeneration}차 반영` : "기본 점수 적용"}</p></div>
        <strong data-status={draft.status}>{draft.status === "ARCHIVED" ? "보관됨" : draft.status === "SAVED" ? "저장됨" : "평가 완료"}</strong>
      </section>

      <section className={styles.candidateSection} aria-labelledby="candidate-title">
        <div className={styles.heading}><div><h2 id="candidate-title">내전 규칙 팀 추천</h2></div></div>
        {manualChanged ? <p className={styles.notice} role="status"><strong>적용 전 배치 기준</strong> · 아래 추천과 판정은 현재 적용된 팀의 결과입니다. 교체한 카드의 점수는 수동 배치 미리보기에서 확인하고 서버 평가 후 적용해 주세요.</p> : null}
        {selectedCandidate ? <>
          <div className={styles.evaluationOverview} data-balance={hasCurrentRules(selectedCandidate) && selectedCandidate.score.fairness?.status === "BALANCED" ? differenceTone(selectedCandidate.score.teamStrength.difference) : "open"} role="status"><div><span>내전 규칙 판정</span><strong>{fairnessLabel(selectedCandidate)}</strong></div><div><span>RED 팀 점수</span><strong>{selectedCandidate.score.teamStrength.redTotal.toFixed(1)}</strong></div><div><span>BLUE 팀 점수</span><strong>{selectedCandidate.score.teamStrength.blueTotal.toFixed(1)}</strong></div><div><span>팀 점수 차이</span><strong>{selectedCandidate.score.teamStrength.difference.toFixed(1)}</strong></div></div>
          <p className={styles.fieldHint}>추천 기준: {candidateCriterion(selectedCandidate).label} · 참고 점수 {selectedCandidate.score.v1?.recommendationScore ?? selectedCandidate.score.totalPenalty.toLocaleString()} · 점수 차이는 실제 승률을 뜻하지 않습니다.</p>
          {!hasCurrentRules(selectedCandidate) ? <p className={styles.notice} role="status">이전 계산 결과에는 최신 1→6 우선순위가 적용되지 않았습니다. 최신 통계로 재평가한 뒤 확인해 주세요.</p> : null}
          {selectedCandidate.score.fairness ? <div className={styles.notice}>
            {selectedCandidate.score.fairness.hardViolations.length ? <p role="alert">{selectedCandidate.score.fairness.hardViolations.join(" / ")}</p> : null}
            {selectedCandidate.score.fairness.warnings.length ? <ul>{selectedCandidate.score.fairness.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
            <details><summary>{hasCurrentRules(selectedCandidate) ? "내전 규칙" : "이전 기준"} 세부 검사 {selectedCandidate.score.fairness.checks.length}개</summary><ul>{selectedCandidate.score.fairness.checks.map((check) => <li key={check.code}><strong>{check.status === "PASS" ? "통과" : check.status === "WARN" ? "주의" : "위반"} · {check.label}</strong> — {check.detail}</li>)}</ul></details>
          </div> : null}
        </> : null}
        <div className={styles.candidateGrid}>
          {autoCandidates.slice(0, 1).map((candidate) => {
            const criterion = candidateCriterion(candidate);
            const selected = draft.selectedCandidateSignature === candidate.signature;
            return <article key={candidate.id} data-selected={selected} data-balance={hasCurrentRules(candidate) && candidate.score.fairness?.status === "BALANCED" ? differenceTone(candidate.score.teamStrength.difference) : "open"}>
              <header><strong>{criterion.label}</strong><span>{selected ? "적용 중" : "추천 결과"}</span></header>
              <p><strong>{fairnessLabel(candidate)}</strong></p>
              {criterion.description ? <p>{criterion.description}</p> : null}
              {candidate.score.v1?.missingSources.length ? <p role="note">최근 솔로 상세가 없거나 갱신 후 24시간이 지난 경우, 또는 팀 편성 보정이 미설정인 경우 해당 보조값은 0으로 계산합니다.</p> : null}
              <div className={styles.candidateMetrics}><span>품질 점수 <b>{candidate.score.v1?.qualityScore ?? "-"}</b></span><span>팀 차이 <b>{candidate.score.teamStrength.difference}</b></span><span>라인 차이 <b>{candidate.score.positionDifferenceTotal}</b></span><span>주/부/자동 <b>{candidate.score.preference.mainCount}/{candidate.score.preference.subCount}/{candidate.score.preference.autoCount}</b></span></div>
              <div className={styles.lineComparison} aria-label="AI 추천 라인별 비교">{candidate.score.positions.map((line) => { const blue = candidate.assignments.find((entry) => entry.team === "BLUE" && entry.position === line.position); const red = candidate.assignments.find((entry) => entry.team === "RED" && entry.position === line.position); return <span data-difference={differenceTone(line.difference)} key={line.position}><b>{positionLabel[line.position]}</b><em>{blue ? participantName.get(blue.playerId) : "-"}</em><small>↔</small><em>{red ? participantName.get(red.playerId) : "-"}</em><strong>{line.difference}</strong></span>; })}</div>
              <button type="button" aria-pressed={selected} disabled={busy || selected || candidate.score.fairness?.status === "INVALID" || draft.status === "ARCHIVED"} onClick={() => mutate("select", { candidateRank: candidate.rank })}><Check size={16} aria-hidden="true" /> {selected ? `${criterion.label} 적용 중` : `${criterion.label} 선택`}</button>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.manualSection} aria-labelledby="manual-title">
        <div className={styles.heading}><div><h2 id="manual-title">수동 팀 배치</h2></div>{manualChanged ? <strong role="status">수동 변경 · 평가 필요</strong> : null}</div>
        <p className={styles.fieldHint}>같은 팀 안에서 역할만 바꿔도 주·부 포지션 감점과 역할별 숙련도 보정이 달라져 팀 점수가 변할 수 있습니다.</p>
        {manualChanged && beforeScore && manualPreview ? <div className={styles.evaluationOverview} aria-label="수동 변경 점수 미리보기" role="status">
          <div><span>적용 상태</span><strong>미리보기 · 서버 평가 후 적용</strong></div>
          <div><span>RED 교환 전 → 후</span><strong>{beforeScore.redTotal.toFixed(1)} → {manualPreview.score.teamStrength.redTotal.toFixed(1)}</strong></div>
          <div><span>BLUE 교환 전 → 후</span><strong>{beforeScore.blueTotal.toFixed(1)} → {manualPreview.score.teamStrength.blueTotal.toFixed(1)}</strong></div>
          <div><span>팀 차이 교환 전 → 후</span><strong>{beforeScore.difference.toFixed(1)} → {manualPreview.score.teamStrength.difference.toFixed(1)}</strong></div>
        </div> : manualChanged ? <p className={styles.notice} role="status">변경 배치의 점수 미리보기를 확인할 수 없습니다. 서버 평가로 확인해 주세요.</p> : null}
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
                draggable={!manualLocked}
                data-manual-slot={index}
                data-dragging={draggingSlot === index ? "true" : undefined}
                data-drop-target={dragOverSlot === index && draggingSlot !== index ? "true" : undefined}
                data-keyboard-selected={keyboardSlot === index ? "true" : undefined}
                aria-label={`${teamLabel[team]} 팀 ${positionLabel[entry.position]} ${participantName.get(entry.playerId) ?? entry.playerId}. 다른 카드와 자리 교체 가능`}
                onDragStart={(event) => { if (manualLocked || sending.current) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); setDraggingSlot(index); setDragOverSlot(index); setMessage("교체할 자리 위에 카드를 놓아 주세요."); }}
                onDragEnd={() => { setDraggingSlot(null); setDragOverSlot(null); }}
                onDragOver={(event) => { if (manualLocked || sending.current) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSlot(index); }}
                onDrop={(event) => { if (manualLocked || sending.current) return; event.preventDefault(); const sourceSlot = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(sourceSlot) && sourceSlot !== index) swapManual(sourceSlot, index); setDraggingSlot(null); setDragOverSlot(null); }}
              >
                <div className={styles.manualPlayerName}><GripVertical aria-hidden="true"/><b>{positionLabel[entry.position]}</b><strong>{participantName.get(entry.playerId) ?? entry.playerId}</strong></div>
                <div className={styles.manualPlayerInfo}><strong>{eligibility}</strong><small>{ratingSummary}</small></div>
                <button type="button" disabled={manualLocked} aria-pressed={keyboardSlot === index} onClick={() => selectKeyboardSlot(index)}>{keyboardSlot === null ? "교체할 카드 선택" : keyboardSlot === index ? "선택 취소" : "이 카드와 교체"}</button>
              </article>;
            })}</div>
          </section>)}
        </div>
        <div className={styles.manualEvaluation}><button className={styles.secondaryButton} type="button" disabled={manualLocked || manualLayout.length !== 10} onClick={() => mutate("select", { layout: manualLayout })}><SlidersHorizontal size={17} aria-hidden="true" /> 수동 배치 평가·선택</button>{manualChanged ? <button className={styles.secondaryButton} type="button" disabled={manualLocked} onClick={() => { if (manualLocked || sending.current) return; setManualLayout(initialLayout); setKeyboardSlot(null); setDraggingSlot(null); setDragOverSlot(null); setMessage("선택한 배치로 되돌렸어요."); }}><RotateCcw size={17} aria-hidden="true" /> 선택한 배치로 되돌리기</button> : null}</div>
      </section>

      <section className={styles.draftActions} data-pending={pending || (refreshing ? "refresh" : undefined)} aria-busy={busy} aria-label="초안 작업">
        <button className={styles.primaryButton} type="button" disabled={busy || manualChanged || selectedInvalid || !draft.selectedCandidateSignature || draft.status === "SAVED" || draft.status === "ARCHIVED"} onClick={() => mutate("save", {})}><Save size={17} aria-hidden="true" /> 선택 팀 저장</button>
        <button className={styles.secondaryButton} type="button" disabled={busy || manualChanged || selectedInvalid || !selectedCandidate} onClick={() => void copySelectedResult()}><Copy size={17} aria-hidden="true" /> 팀 결과 복사</button>
        <button className={styles.secondaryButton} type="button" disabled={busy || manualChanged || draft.status === "ARCHIVED"} onClick={() => mutate("reevaluate", {})}><RefreshCw size={17} aria-hidden="true" /> {hasLegacyCandidates ? "실력과 포지션으로 재평가" : "최신 통계로 재평가"}</button>
        {draft.selectedCandidateSignature && draft.status !== "ARCHIVED" ? busy || manualChanged || selectedInvalid
          ? <button className={styles.primaryButton} type="button" disabled>{resultLabel} <ArrowRight size={16} aria-hidden="true" /></button>
          : <Link className={styles.primaryLink} href={resultHref}>{resultLabel} <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        {mode === "ADMIN" && draft.status !== "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => mutate("archive", {})}><Archive size={17} aria-hidden="true" /> 초안 보관</button> : null}
        {mode === "ADMIN" && draft.status === "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => mutate("restore", {})}><RotateCcw size={17} aria-hidden="true" /> 초안 복구</button> : null}
        <p role="status" aria-live="polite">{pending ? "처리 중…" : refreshing ? "최신 팀 상태를 불러오는 중…" : message}</p>
      </section>
    </>
  );
}
