"use client";

import Link from "next/link";
import { Archive, ArrowRight, Check, Copy, GripVertical, RefreshCw, RotateCcw, Save, SlidersHorizontal } from "@/components/theme/theme-icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ClientMutationKeyStore } from "@/modules/seasons/application/client-mutation-key-store";
import { parseInhouseMajorTier } from "@/modules/team-tools/domain/inhouse-fairness";

import {
  TEAM_BALANCE_TEAMS,
  TEAM_BALANCE_V1_FORMULA_VERSION,
  evaluateTeamBalanceLayout,
  formatTeamBalanceRelaxationReasons,
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
  if (candidate.score.fairness?.constraintRelaxation?.applied) return "조건 조정 편성";
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

function allowsConstraintRelaxation(draft: TeamBalanceDraft) {
  return draft.candidates.some((candidate) => candidate.source === "AUTO" && candidate.rank === 1 &&
    candidate.evaluationRound === draft.evaluationRound && candidate.score.fairness?.constraintRelaxation?.applied === true);
}

export function TeamBalanceDraftWorkspace({
  draft: serverDraft,
  endpointBase = `/api/team-tools/drafts/${serverDraft.id}`,
  mode = "OWNER",
}: {
  draft: TeamBalanceDraft;
  endpointBase?: string;
  mode?: "OWNER" | "ADMIN";
}) {
  const router = useRouter();
  const [acceptedDraft, setAcceptedDraft] = useState<TeamBalanceDraft | null>(null);
  const draft = acceptedDraft?.id === serverDraft.id && acceptedDraft.revision > serverDraft.revision ? acceptedDraft : serverDraft;
  const autoCandidates = draft.candidates.filter((candidate) => candidate.source === "AUTO");
  const selectedCandidate = draft.candidates.find((candidate) => candidate.signature === draft.selectedCandidateSignature) ?? null;
  const selectedInvalid = selectedCandidate?.score.fairness?.status === "INVALID";
  const allowConstraintRelaxation = allowsConstraintRelaxation(draft);
  const hasLegacyCandidates = autoCandidates.some((candidate) => !hasCurrentRules(candidate) || !candidate.criterion || candidate.criterion === "LEGACY");
  const initialLayout = (selectedCandidate ?? autoCandidates[0])?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? [];
  const [manualLayout, setManualLayout] = useState<TeamBalanceLayoutEntry[]>(initialLayout);
  const [checkedManualLayout, setCheckedManualLayout] = useState<{
    layout: TeamBalanceLayoutEntry[];
    participants: TeamBalanceDraft["participants"];
    allowConstraintRelaxation: boolean;
    evaluation: ReturnType<typeof evaluateTeamBalanceLayout>;
  } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const nativeDragSlot = useRef<number | null>(null);
  const [keyboardSlot, setKeyboardSlot] = useState<number | null>(null);
  const touchDrag = useRef<{ pointerId: number; card: HTMLElement; sourceSlot: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const touchScrollFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (touchScrollFrame.current !== null) cancelAnimationFrame(touchScrollFrame.current);
    const drag = touchDrag.current;
    touchDrag.current = null;
    if (drag?.card.hasPointerCapture(drag.pointerId)) drag.card.releasePointerCapture(drag.pointerId);
  }, []);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latestDraft, setLatestDraft] = useState<TeamBalanceDraft | null>(null);
  const mutationKeys = useRef(new ClientMutationKeyStore("team-balance-draft")).current;
  const sending = useRef(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = Boolean(pending) || refreshing;
  const mutationLocked = busy || conflict;
  const manualChanged = manualLayout.length !== initialLayout.length || manualLayout.some((entry) =>
    !initialLayout.some((selected) => selected.playerId === entry.playerId && selected.team === entry.team && selected.position === entry.position));
  const manualLocked = mutationLocked || draft.status === "ARCHIVED";
  const resultHref = mode === "OWNER" ? `/matches/submit?teamBalanceDraftId=${encodeURIComponent(draft.id)}` : `/admin/matches/new?teamBalanceDraftId=${encodeURIComponent(draft.id)}`;
  const resultLabel = mode === "OWNER" ? "이 팀으로 경기 결과 접수" : "선택 팀으로 경기 등록";
  const participantById = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant])), [draft.participants]);
  const participantName = useMemo(() => new Map(draft.participants.map((participant) => [participant.playerId, participant.displayName])), [draft.participants]);
  function displayDetail(detail: string) {
    for (const [playerId, name] of participantName) detail = detail.replaceAll(playerId, name);
    return detail;
  }
  const manualPreview = useMemo(() => {
    if (!manualChanged) return null;
    // Reuse the swap's hard-rule check so one changed layout is scored once.
    if (checkedManualLayout?.layout === manualLayout && checkedManualLayout.participants === draft.participants && checkedManualLayout.allowConstraintRelaxation === allowConstraintRelaxation) return checkedManualLayout.evaluation;
    try {
      return evaluateTeamBalanceLayout(draft.participants, manualLayout, { allowConstraintRelaxation });
    } catch {
      return null;
    }
  }, [manualChanged, manualLayout, draft.participants, checkedManualLayout, allowConstraintRelaxation]);
  const displayedCandidate = manualChanged && manualPreview && selectedCandidate
    ? { ...selectedCandidate, ...manualPreview, source: "MANUAL" as const, criterion: "MANUAL" as const }
    : selectedCandidate;
  const selectedRelaxation = displayedCandidate?.score.fairness?.constraintRelaxation;
  const selectedWarnings = displayedCandidate?.score.fairness?.warnings.filter((warning) => !selectedRelaxation?.reasons.some((reason) => reason.detail === warning || warning.endsWith(`: ${reason.detail}`))) ?? [];
  const beforeScore = (selectedCandidate ?? autoCandidates[0])?.score.teamStrength;
  const cardAssignments = manualChanged ? manualPreview?.assignments : (selectedCandidate ?? autoCandidates[0])?.assignments;
  const canKeepManual = useMemo(() => {
    if (!manualChanged || !latestDraft || latestDraft.status === "ARCHIVED" || latestDraft.participants.length !== manualLayout.length ||
      latestDraft.participants.some((participant) => !manualLayout.some((entry) => entry.playerId === participant.playerId))) return false;
    try {
      evaluateTeamBalanceLayout(latestDraft.participants, manualLayout, { allowConstraintRelaxation: allowsConstraintRelaxation(latestDraft) });
      return true;
    } catch { return false; }
  }, [manualChanged, latestDraft, manualLayout]);

  async function recoverConflict() {
    setConflict(true);
    setLatestDraft(null);
    setPending("latest");
    setMessage("다른 작업으로 팀 초안이 변경됐어요. 수동 배치는 유지했습니다. 최신값과 비교해 주세요.");
    try {
      const response = await fetch(endpointBase, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("latest draft unavailable");
      const result = await response.json() as { draft?: TeamBalanceDraft };
      if (!result.draft || result.draft.id !== draft.id || !Number.isSafeInteger(result.draft.revision) || result.draft.revision < draft.revision ||
        !Array.isArray(result.draft.participants) || !Array.isArray(result.draft.candidates)) throw new Error("latest draft mismatch");
      setLatestDraft(result.draft);
    } catch {
      setMessage("최신 초안을 불러오지 못했어요. 수동 배치는 유지했습니다. 다시 불러온 뒤 비교해 주세요.");
    } finally { setPending(""); }
  }

  function acceptLatest(keepManual: boolean) {
    if (busy || !latestDraft || (keepManual && !canKeepManual)) return;
    if (latestDraft.revision < draft.revision) { void recoverConflict(); return; }
    if (!keepManual) {
      const selection = latestDraft.candidates.find((candidate) => candidate.signature === latestDraft.selectedCandidateSignature)
        ?? latestDraft.candidates.find((candidate) => candidate.source === "AUTO");
      setManualLayout(selection?.assignments.map(({ playerId, team, position }) => ({ playerId, team, position })) ?? []);
    }
    setAcceptedDraft(latestDraft);
    setCheckedManualLayout(null);
    cancelCardDrag();
    setLatestDraft(null); setConflict(false);
    setMessage(keepManual ? "수동 배치를 유지했어요. 최신 정보로 다시 평가한 뒤 적용해 주세요." : "수동 변경을 버리고 최신 초안을 불러왔어요.");
  }

  async function mutate(action: "select" | "save" | "reevaluate" | "archive" | "restore", body: unknown) {
    if (mutationLocked || sending.current) return;
    if (manualChanged && (action === "save" || action === "reevaluate")) return;
    if (action === "save" && selectedInvalid) return;
    if (action === "select" && typeof body === "object" && body !== null && "candidateRank" in body &&
      draft.candidates.some((candidate) => candidate.rank === body.candidateRank && candidate.score.fairness?.status === "INVALID")) return;
    cancelCardDrag();
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
      if (response.status === 412) { mutationKeys.complete(ticket); await recoverConflict(); return; }
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
    if (!selectedCandidate || selectedInvalid || manualChanged || mutationLocked || sending.current) return;
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
    if (!allowConstraintRelaxation && (!participantById.get(source.playerId)?.eligiblePositions.some((entry) => entry.position === target.position) ||
      !participantById.get(target.playerId)?.eligiblePositions.some((entry) => entry.position === source.position))) {
      setMessage("허용하지 않은 포지션으로는 교체할 수 없어요. 참가자의 가능 포지션을 확인해 주세요.");
      return false;
    }
    const nextLayout = manualLayout.map((entry, index) => index === sourceSlot
        ? { ...entry, playerId: target.playerId }
        : index === targetSlot
          ? { ...entry, playerId: source.playerId }
          : entry);
    try {
      const evaluation = evaluateTeamBalanceLayout(draft.participants, nextLayout, { allowConstraintRelaxation });
      setCheckedManualLayout({ layout: nextLayout, participants: draft.participants, allowConstraintRelaxation, evaluation });
    } catch {
      setMessage(allowConstraintRelaxation ? "현재 배치를 평가하지 못했어요. 참가자 10명과 팀별 포지션 구성을 확인해 주세요." : "현재 참가자 정보로는 이 교체가 필수 조건을 충족하지 못해요. 허용 포지션과 바텀의 큰 티어 3단계 제한을 확인해 주세요.");
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
      setMessage("카드를 집었어요. 교체할 카드로 이동해 Space 또는 Enter를 누르세요. Esc로 취소할 수 있어요.");
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

  function touchTargetSlot(card: HTMLElement, x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-manual-slot]");
    if (!target || !card.closest("[data-manual-team-board]")?.contains(target)) return null;
    const slot = Number(target.dataset.manualSlot);
    return Number.isInteger(slot) && manualLayout[slot] ? slot : null;
  }

  function cancelCardDrag() {
    const drag = touchDrag.current;
    touchDrag.current = null;
    nativeDragSlot.current = null;
    if (touchScrollFrame.current !== null) cancelAnimationFrame(touchScrollFrame.current);
    touchScrollFrame.current = null;
    setKeyboardSlot(null); setDraggingSlot(null); setDragOverSlot(null);
    if (drag?.card.hasPointerCapture(drag.pointerId)) drag.card.releasePointerCapture(drag.pointerId);
  }

  function scrollTouchDrag() {
    const drag = touchDrag.current;
    if (!drag?.moved) { touchScrollFrame.current = null; return; }
    const edge = 112;
    const delta = drag.y < edge ? -Math.min(18, (edge - drag.y) / 3)
      : drag.y > window.innerHeight - edge ? Math.min(18, (drag.y - window.innerHeight + edge) / 3) : 0;
    if (delta) {
      window.scrollBy({ top: delta, behavior: "instant" });
      setDragOverSlot(touchTargetSlot(drag.card, drag.x, drag.y));
    }
    touchScrollFrame.current = requestAnimationFrame(scrollTouchDrag);
  }

  return (
    <>
      <section className={styles.draftHeader} data-status={draft.status}>
        <div><span>{mode === "ADMIN" ? "관리자 검토 · " : ""}평가 {draft.evaluationRound}회</span><h1>{draft.title}</h1><p>{mode === "ADMIN" ? `소유 계정 ${draft.ownerUserAccountId} · 통계 generation ${draft.ratingGeneration ?? "없음 · 등록 자료로 평가"} · revision ${draft.revision}` : draft.ratingGeneration ? `평가 시점의 등록 정보와 통계 ${draft.ratingGeneration}차 반영` : "평가 시점의 등록 정보로 계산"}</p></div>
        <strong data-status={draft.status}>{draft.status === "ARCHIVED" ? "보관됨" : draft.status === "SAVED" ? "저장됨" : "평가 완료"}</strong>
      </section>

      {conflict ? <section className={styles.notice} role="alert" aria-busy={busy}>
        <h2>최신 팀 초안과 비교</h2>
        <p>{message}</p>
        {latestDraft ? <>
          <p>{latestDraft.title} · {latestDraft.status === "ARCHIVED" ? "보관됨" : latestDraft.status === "SAVED" ? "저장됨" : "평가 완료"}</p>
          <ul>{latestDraft.candidates.find((candidate) => candidate.signature === latestDraft.selectedCandidateSignature)?.assignments.map((entry) =>
            <li key={`${entry.team}-${entry.position}`}>{teamLabel[entry.team]} · {positionLabel[entry.position]} · {latestDraft.participants.find((participant) => participant.playerId === entry.playerId)?.displayName ?? "참가자 확인 필요"}</li>)}</ul>
          {manualChanged && !canKeepManual ? <p>참가자·허용 포지션이나 초안 상태가 바뀌어 수동 배치를 그대로 적용할 수 없어요.</p> : null}
          <div className={styles.draftActions}>
            {canKeepManual ? <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => acceptLatest(true)}>내 수동 배치 유지</button> : null}
            <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => acceptLatest(false)}>수동 변경 버리고 최신값 사용</button>
          </div>
        </> : <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => recoverConflict()}>최신 초안 다시 불러오기</button>}
      </section> : null}

      <section className={styles.candidateSection} aria-labelledby="candidate-title">
        <div className={styles.heading}><div><h2 id="candidate-title">내전 규칙 팀 추천</h2></div></div>
        {manualChanged ? <p className={styles.notice} role="status"><strong>수동 배치 미리보기</strong> · {manualPreview ? "교환한 카드와 아래 점수·판정을 즉시 계산했습니다. 서버 평가 후 적용해 주세요." : "변경 배치의 점수를 확인할 수 없어 이전 적용 결과를 표시합니다. 서버 평가로 확인해 주세요."}</p> : null}
        {displayedCandidate ? <>
          <div className={styles.evaluationOverview} aria-label="현재 팀 평가" data-balance={hasCurrentRules(displayedCandidate) && displayedCandidate.score.fairness?.status === "BALANCED" ? differenceTone(displayedCandidate.score.teamStrength.difference) : "open"} role="status"><div><span>내전 규칙 판정</span><strong>{fairnessLabel(displayedCandidate)}</strong></div><div><span>RED 팀 점수</span><strong>{displayedCandidate.score.teamStrength.redTotal.toFixed(1)}</strong></div><div><span>BLUE 팀 점수</span><strong>{displayedCandidate.score.teamStrength.blueTotal.toFixed(1)}</strong></div><div><span>팀 점수 차이</span><strong>{displayedCandidate.score.teamStrength.difference.toFixed(1)}</strong></div></div>
          <p className={styles.fieldHint}>{manualChanged ? "미리보기 기준" : "추천 기준"}: {candidateCriterion(displayedCandidate).label} · 밸런스 점수 {displayedCandidate.score.v1?.recommendationScore ?? displayedCandidate.score.totalPenalty?.toLocaleString() ?? "확인 필요"} · 점수 차이는 실제 승률을 뜻하지 않습니다.</p>
          {selectedRelaxation?.applied ? <section className={styles.notice} role="status" aria-label={displayedCandidate.source === "MANUAL" ? "수동 배치에 적용된 조정 조건" : "자동 조정한 편성 조건"}>
            <h3>{displayedCandidate.source === "MANUAL" ? "수동 배치에 적용된 조정 조건" : "조건을 조정해 가능한 최선의 팀을 만들었어요"}</h3>
            <p>{displayedCandidate.source === "MANUAL" ? "현재 수동 배치에서" : "기존 조건을 모두 만족하는 조합이 없어"} 포지션 {selectedRelaxation.roleDeviationCount}명 · 바텀 티어 조건 {selectedRelaxation.bottomTierViolationCount}곳을 조정했습니다. {manualChanged ? "서버 평가 후 저장·복사할 수 있어요." : "이 팀으로 저장·복사하거나 수동 조정할 수 있어요."}</p>
            <ul>{formatTeamBalanceRelaxationReasons(displayedCandidate, draft.participants).map((reason, index) => <li key={index}>{reason}</li>)}</ul>
          </section> : null}
          {!hasCurrentRules(displayedCandidate) ? <p className={styles.notice} role="status">이전 계산 결과입니다. 최신 자동 조정 기준으로 재평가한 뒤 확인해 주세요.</p> : null}
          {displayedCandidate.score.fairness ? <div className={styles.notice}>
            {displayedCandidate.score.fairness.hardViolations.length ? <p role="alert">{displayDetail(displayedCandidate.score.fairness.hardViolations.join(" / "))}</p> : null}
            {selectedWarnings.length ? <ul>{selectedWarnings.map((warning, index) => <li key={index}>{displayDetail(warning)}</li>)}</ul> : null}
            <details><summary>{hasCurrentRules(displayedCandidate) ? "내전 규칙" : "이전 기준"} 세부 검사 {displayedCandidate.score.fairness.checks.length}개</summary><ul>{displayedCandidate.score.fairness.checks.map((check) => <li key={check.code}><strong>{check.status === "PASS" ? "통과" : check.status === "WARN" ? "주의" : "위반"} · {check.label}</strong> — {displayDetail(check.detail)}</li>)}</ul></details>
          </div> : null}
        </> : null}
        <div className={styles.candidateGrid}>
          {autoCandidates.slice(0, 1).map((candidate) => {
            const criterion = candidateCriterion(candidate);
            const selected = !manualChanged && draft.selectedCandidateSignature === candidate.signature;
            return <article key={candidate.id} data-selected={selected} data-balance={hasCurrentRules(candidate) && candidate.score.fairness?.status === "BALANCED" ? differenceTone(candidate.score.teamStrength.difference) : "open"}>
              <header><strong>{criterion.label}</strong><span>{selected ? "적용 중" : "추천 결과"}</span></header>
              <p><strong>{fairnessLabel(candidate)}</strong></p>
              {criterion.description ? <p>{criterion.description}</p> : null}
              {candidate.score.v1?.missingSources.length ? <p role="note">최근 솔로 상세가 없거나 갱신 후 24시간이 지난 경우, 또는 팀 편성 보정이 미설정인 경우 해당 보조값은 0으로 계산합니다.</p> : null}
              <div className={styles.candidateMetrics}><span>품질 점수 <b>{candidate.score.v1?.qualityScore ?? "-"}</b></span><span>팀 차이 <b>{candidate.score.teamStrength.difference}</b></span><span>라인 차이 <b>{candidate.score.positionDifferenceTotal}</b></span><span>주/부/자동 <b>{candidate.score.preference.mainCount}/{candidate.score.preference.subCount}/{candidate.score.preference.autoCount}</b></span></div>
              <div className={styles.lineComparison} aria-label="AI 추천 라인별 비교">{candidate.score.positions.map((line) => { const blue = candidate.assignments.find((entry) => entry.team === "BLUE" && entry.position === line.position); const red = candidate.assignments.find((entry) => entry.team === "RED" && entry.position === line.position); return <span data-difference={differenceTone(line.difference)} key={line.position}><b>{positionLabel[line.position]}</b><em>{blue ? <><span>{participantName.get(blue.playerId)}</span><small>{participantById.get(blue.playerId)?.registeredName?.trim() || "등록 이름 없음"}</small></> : "-"}</em><small>↔</small><em>{red ? <><span>{participantName.get(red.playerId)}</span><small>{participantById.get(red.playerId)?.registeredName?.trim() || "등록 이름 없음"}</small></> : "-"}</em><strong>{line.difference}</strong></span>; })}</div>
              <button type="button" aria-pressed={selected} disabled={mutationLocked || manualChanged || selected || candidate.score.fairness?.status === "INVALID" || draft.status === "ARCHIVED"} onClick={() => mutate("select", { candidateRank: candidate.rank })}><Check size={16} aria-hidden="true" /> {selected ? `${criterion.label} 적용 중` : `${criterion.label} 선택`}</button>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.manualSection} aria-labelledby="manual-title">
        <div className={styles.heading}><div><h2 id="manual-title">수동 팀 배치</h2></div>{manualChanged ? <strong role="status">수동 변경 · 평가 필요</strong> : null}</div>
        <p id="manual-drag-help" className={styles.fieldHint}>카드를 다른 카드 위로 드래그하면 서로 교환합니다. 모바일은 카드의 이름 부분을 끌어 주세요. 키보드: Space·Enter로 집기와 놓기, Esc로 취소. 배정 포지션을 반영한 점수는 즉시 갱신됩니다.</p>
        {allowConstraintRelaxation ? <p className={styles.fieldHint}>자동 조정으로 만든 초안입니다. 다른 포지션으로 교체할 수 있으며, 바뀐 조건은 서버 평가 후 결과에 표시됩니다.</p> : null}
        {manualChanged && beforeScore && manualPreview ? <div className={styles.evaluationOverview} aria-label="수동 변경 점수 미리보기" role="status">
          <div><span>적용 상태</span><strong>미리보기 · 서버 평가 후 적용</strong></div>
          <div><span>RED 교환 전 → 후</span><strong>{beforeScore.redTotal.toFixed(1)} → {manualPreview.score.teamStrength.redTotal.toFixed(1)}</strong></div>
          <div><span>BLUE 교환 전 → 후</span><strong>{beforeScore.blueTotal.toFixed(1)} → {manualPreview.score.teamStrength.blueTotal.toFixed(1)}</strong></div>
          <div><span>팀 차이 교환 전 → 후</span><strong>{beforeScore.difference.toFixed(1)} → {manualPreview.score.teamStrength.difference.toFixed(1)}</strong></div>
        </div> : manualChanged ? <p className={styles.notice} role="status">변경 배치의 점수 미리보기를 확인할 수 없습니다. 서버 평가로 확인해 주세요.</p> : null}
        {manualChanged && manualPreview?.score.fairness?.constraintRelaxation?.applied ? <details className={styles.notice}><summary>교체 후 조정되는 조건 · 포지션 {manualPreview.score.fairness.constraintRelaxation.roleDeviationCount}명 · 바텀 {manualPreview.score.fairness.constraintRelaxation.bottomTierViolationCount}곳</summary><ul>{formatTeamBalanceRelaxationReasons(manualPreview, draft.participants).map((reason, index) => <li key={index}>{reason}</li>)}</ul></details> : null}
        <div className={styles.manualTeams} data-manual-team-board>
          {TEAM_BALANCE_TEAMS.map((team) => <section key={team} data-team={team} aria-labelledby={`manual-${team.toLowerCase()}-title`}>
            <header><h3 id={`manual-${team.toLowerCase()}-title`}>{teamLabel[team]} 팀</h3><span>5명</span></header>
            <div>{manualLayout.map((entry, index) => {
              if (entry.team !== team) return null;
              const participant = participantById.get(entry.playerId);
              const eligibility = participant?.eligiblePositions
                .map((eligible) => `${positionLabel[eligible.position]} ${preferenceLabel[eligible.preference]}`)
                .join(" · ") ?? "포지션 정보 없음";
              // Show the stored result, or the checked preview for these exact slots, never the raw MMR fallback.
              const assignment = cardAssignments?.find((assigned) => assigned.playerId === entry.playerId && assigned.team === entry.team && assigned.position === entry.position);
              const effectiveScore = assignment?.rating?.effectiveScore;
              const ratingSummary = typeof effectiveScore === "number" && Number.isFinite(effectiveScore)
                ? `${manualChanged ? "미리보기" : "적용"} 점수 ${effectiveScore.toFixed(1)}`
                : "배정 점수 확인 필요";
              const rating = participant?.rating;
              const v1 = rating?.v1;
              const currentTierKnown = parseInhouseMajorTier(v1?.currentTier ?? "") !== null;
              const peakTierKnown = parseInhouseMajorTier(v1?.peakTier ?? "") !== null;
              const tierSummary = v1
                ? `현재 ${currentTierKnown ? v1.currentTier : "티어 확인 필요"} · 최고 ${peakTierKnown ? v1.peakTier : "티어 확인 필요"}`
                : "티어 입력 정보가 없는 이전 초안 · 재평가 필요";
              const internalGames = v1?.internalGames ?? rating?.sampleSize;
              const experienceSummary = internalGames === null || internalGames === undefined
                ? "내전 표본 확인 필요"
                : internalGames === 0
                  ? "내전 0판 · 전적 표본 없음"
                  : `내전 ${internalGames}판${internalGames < 20 ? " · 표본 부족" : ""}`;
              const assignedPreference = participant?.eligiblePositions.find((eligible) => eligible.position === entry.position)?.preference;
              const fitSummary = assignedPreference === "MAIN" ? "주 포지션 배정" : assignedPreference === "SUB" ? "부 포지션 배정" : assignedPreference === "AUTO" ? "기타 가능 포지션" : "미등록 포지션 배정";
              const roleGames = v1?.internalPositionGames[entry.position] ?? rating?.positions?.[entry.position]?.sampleSize;
              const roleSummary = roleGames === null || roleGames === undefined ? "역할 표본 확인 필요" : `이 역할 내전 ${roleGames}판`;
              return <article
                key={`${entry.team}-${entry.position}`}
                draggable={!manualLocked}
                role="button"
                aria-roledescription="드래그 카드"
                aria-pressed={keyboardSlot === index}
                tabIndex={manualLocked ? -1 : 0}
                aria-disabled={manualLocked}
                aria-describedby={`manual-drag-help manual-info-${index} manual-fit-${index}`}
                data-manual-slot={index}
                data-dragging={draggingSlot === index ? "true" : undefined}
                data-drop-target={dragOverSlot === index && draggingSlot !== index ? "true" : undefined}
                data-keyboard-selected={keyboardSlot === index ? "true" : undefined}
                aria-label={`${teamLabel[team]} 팀 ${positionLabel[entry.position]} ${participantName.get(entry.playerId) ?? "참가자 확인 필요"} · ${participant?.registeredName?.trim() || "등록 이름 없음"}. 다른 카드와 자리 교체 가능`}
                onPointerDown={(event) => {
                  if (event.pointerType !== "touch" || touchDrag.current || manualLocked || sending.current || !(event.target instanceof Element) || !event.target.closest("[data-card-drag-handle]")) return;
                  event.preventDefault();
                  touchDrag.current = { pointerId: event.pointerId, card: event.currentTarget, sourceSlot: index, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setKeyboardSlot(null);
                }}
                onPointerMove={(event) => {
                  const drag = touchDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId || manualLocked || sending.current) return;
                  drag.x = event.clientX; drag.y = event.clientY;
                  if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 8) return;
                  drag.moved = true;
                  setDraggingSlot(drag.sourceSlot);
                  setDragOverSlot(touchTargetSlot(event.currentTarget, event.clientX, event.clientY));
                  if (touchScrollFrame.current === null) touchScrollFrame.current = requestAnimationFrame(scrollTouchDrag);
                }}
                onPointerUp={(event) => {
                  const drag = touchDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  const target = touchTargetSlot(event.currentTarget, event.clientX, event.clientY);
                  cancelCardDrag();
                  if (drag.moved && target !== null) swapManual(drag.sourceSlot, target);
                }}
                onPointerCancel={(event) => { if (touchDrag.current?.pointerId === event.pointerId) cancelCardDrag(); }}
                onLostPointerCapture={(event) => { if (touchDrag.current?.pointerId === event.pointerId) cancelCardDrag(); }}
                onKeyDown={(event) => { if (event.key === "Escape") { cancelCardDrag(); setMessage("카드 이동을 취소했어요."); } else if (event.key === " " || event.key === "Enter") { event.preventDefault(); selectKeyboardSlot(index); } }}
                onDragStart={(event) => { if (manualLocked || sending.current) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); nativeDragSlot.current = index; setKeyboardSlot(null); setDraggingSlot(index); setDragOverSlot(index); setMessage("교체할 자리 위에 카드를 놓아 주세요."); }}
                onDragEnd={() => { nativeDragSlot.current = null; setDraggingSlot(null); setDragOverSlot(null); }}
                onDragOver={(event) => { if (manualLocked || sending.current || nativeDragSlot.current === null) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverSlot(index); }}
                onDrop={(event) => { if (manualLocked || sending.current || nativeDragSlot.current === null) return; event.preventDefault(); const sourceSlot = Number(event.dataTransfer.getData("text/plain")); if (sourceSlot === nativeDragSlot.current && sourceSlot !== index) swapManual(sourceSlot, index); nativeDragSlot.current = null; setDraggingSlot(null); setDragOverSlot(null); }}
              >
                <div className={styles.manualPlayerName} data-card-drag-handle><GripVertical aria-hidden="true"/><b>{positionLabel[entry.position]}</b><span><strong>{participantName.get(entry.playerId) ?? "참가자 확인 필요"}</strong><small>{participant?.registeredName?.trim() || "등록 이름 없음"}</small></span></div>
                <div id={`manual-info-${index}`} className={styles.manualPlayerInfo}><strong>{eligibility}</strong><small>{ratingSummary}</small><small>{tierSummary}</small><small>{experienceSummary}</small></div>
                <div id={`manual-fit-${index}`} className={styles.manualAssignmentInfo}><strong>{fitSummary}</strong><small>{roleSummary}</small></div>
              </article>;
            })}</div>
          </section>)}
        </div>
        <div className={styles.manualEvaluation}><button className={styles.secondaryButton} type="button" disabled={manualLocked || manualLayout.length !== 10} onClick={() => mutate("select", { layout: manualLayout })}><SlidersHorizontal size={17} aria-hidden="true" /> 수동 배치 평가·선택</button>{manualChanged ? <button className={styles.secondaryButton} type="button" disabled={manualLocked} onClick={() => { if (manualLocked || sending.current) return; setManualLayout(initialLayout); cancelCardDrag(); setMessage("선택한 배치로 되돌렸어요."); }}><RotateCcw size={17} aria-hidden="true" /> 선택한 배치로 되돌리기</button> : null}</div>
      </section>

      <section className={styles.draftActions} data-pending={pending || (refreshing ? "refresh" : undefined)} aria-busy={busy} aria-label="초안 작업">
        <button className={styles.primaryButton} type="button" disabled={mutationLocked || manualChanged || selectedInvalid || !draft.selectedCandidateSignature || draft.status === "SAVED" || draft.status === "ARCHIVED"} onClick={() => mutate("save", {})}><Save size={17} aria-hidden="true" /> 선택 팀 저장</button>
        <button className={styles.secondaryButton} type="button" disabled={mutationLocked || manualChanged || selectedInvalid || !selectedCandidate} onClick={() => void copySelectedResult()}><Copy size={17} aria-hidden="true" /> 팀 결과 복사</button>
        <button className={styles.secondaryButton} type="button" disabled={mutationLocked || manualChanged || draft.status === "ARCHIVED"} onClick={() => mutate("reevaluate", {})}><RefreshCw size={17} aria-hidden="true" /> {hasLegacyCandidates ? "실력과 포지션으로 재평가" : "최신 통계로 재평가"}</button>
        {draft.selectedCandidateSignature && draft.status !== "ARCHIVED" ? mutationLocked || manualChanged || selectedInvalid
          ? <button className={styles.primaryButton} type="button" disabled>{resultLabel} <ArrowRight size={16} aria-hidden="true" /></button>
          : <Link className={styles.primaryLink} href={resultHref}>{resultLabel} <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        {mode === "ADMIN" && draft.status !== "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={mutationLocked} onClick={() => mutate("archive", {})}><Archive size={17} aria-hidden="true" /> 초안 보관</button> : null}
        {mode === "ADMIN" && draft.status === "ARCHIVED" ? <button className={styles.secondaryButton} type="button" disabled={mutationLocked} onClick={() => mutate("restore", {})}><RotateCcw size={17} aria-hidden="true" /> 초안 복구</button> : null}
        <p role="status" aria-live="polite">{pending ? "처리 중…" : refreshing ? "최신 팀 상태를 불러오는 중…" : message}</p>
      </section>
    </>
  );
}
