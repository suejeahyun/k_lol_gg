/* eslint-disable @next/next/no-img-element -- authenticated private assets and local object URLs must bypass image optimization */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import type { AdminMatchEditorCatalog } from "@/modules/matches/application/ports/match-repository";
import { clearAdminImportRecovery } from "@/modules/matches/infrastructure/admin-import-recovery";
import {
  MATCH_POSITIONS,
  MATCH_TEAMS,
  type AdminSubmissionView,
  type MatchGameInput,
  type MatchParticipantInput,
} from "@/modules/matches";

import { BoundedPicker, type BoundedPickerOption } from "../../bounded-picker";
import styles from "../../matches-admin.module.css";

type EditableParticipant = MatchParticipantInput & { kills: number; deaths: number; assists: number };
type EditableGame = Omit<MatchGameInput, "participants"> & { participants: EditableParticipant[] };
type OcrParticipant = Readonly<{
  slot: number;
  nickname: string | null;
  championKey: string | null;
  team: "BLUE" | "RED" | null;
  position: "TOP" | "JGL" | "MID" | "ADC" | "SUP" | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  confidence: number;
}>;

const TEAM_LABEL = { BLUE: "블루", RED: "레드" } as const;
const POSITION_LABEL = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;

function key(action: string) { return `${action}-${crypto.randomUUID()}-${Date.now().toString(36)}`; }
async function messageFor(response: Response) {
  try {
    const body = await response.json() as { title?: unknown; detail?: unknown };
    if (typeof body.title === "string" && typeof body.detail === "string") return `${body.title} ${body.detail}`;
  } catch { /* problem response fallback */ }
  return "요청을 처리하지 못했습니다.";
}

function blankGame(gameNumber: number): EditableGame {
  return {
    gameNumber,
    durationSeconds: 1_800,
    winnerTeam: "BLUE",
    participants: MATCH_TEAMS.flatMap((team) => MATCH_POSITIONS.map((position) => ({
      playerId: "",
      championKey: "",
      team,
      position,
      kills: 0,
      deaths: 0,
      assists: 0,
    }))),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ocrParticipants(submission: AdminSubmissionView, gameNumber: number): OcrParticipant[] {
  const candidate = submission.images.find((image) => image.gameNumber === gameNumber)?.ocrCandidate;
  if (!isRecord(candidate) || !Array.isArray(candidate.participants)) return [];
  return candidate.participants.filter((entry): entry is OcrParticipant => {
    if (!isRecord(entry)) return false;
    return Number.isInteger(entry.slot) &&
      (entry.nickname === null || typeof entry.nickname === "string") &&
      (entry.championKey === null || typeof entry.championKey === "string") &&
      (entry.team === null || entry.team === "BLUE" || entry.team === "RED") &&
      (entry.position === null || MATCH_POSITIONS.some((position) => position === entry.position)) &&
      [entry.kills, entry.deaths, entry.assists].every((value) => value === null || Number.isInteger(value)) &&
      typeof entry.confidence === "number";
  });
}

function initialGames(submission: AdminSubmissionView): EditableGame[] {
  const reviewed = submission.reviewedResult;
  if (reviewed && Array.isArray(reviewed.games) && reviewed.games.length === submission.expectedGameCount) {
    return (reviewed.games as readonly MatchGameInput[]).map((game, index) => ({
      gameNumber: index + 1,
      durationSeconds: game.durationSeconds,
      winnerTeam: game.winnerTeam,
      participants: game.participants.map((participant) => ({ ...participant })),
    }));
  }
  return Array.from({ length: submission.expectedGameCount }, (_, index) => {
    const game = blankGame(index + 1);
    const candidates = ocrParticipants(submission, index + 1);
    return {
      ...game,
      participants: game.participants.map((participant) => {
        const exact = candidates.filter((candidate) =>
          candidate.team === participant.team && candidate.position === participant.position);
        const candidate = exact.length === 1 ? exact[0] : null;
        return candidate ? {
          ...participant,
          championKey: candidate.championKey ?? "",
          kills: candidate.kills ?? 0,
          deaths: candidate.deaths ?? 0,
          assists: candidate.assists ?? 0,
        } : participant;
      }),
    };
  });
}

function rowKey(gameNumber: number, participant: Pick<EditableParticipant, "team" | "position">) {
  return `${gameNumber}:${participant.team}:${participant.position}`;
}

function reviewErrors(
  games: readonly EditableGame[],
  catalog: AdminMatchEditorCatalog,
  confirmedRows: ReadonlySet<string>,
) {
  const errors: string[] = [];
  for (const game of games) {
    const prefix = `${game.gameNumber}게임`;
    const playerIds = game.participants.map((participant) => participant.playerId).filter(Boolean);
    const championKeys = game.participants.map((participant) => participant.championKey).filter(Boolean);
    if (playerIds.length !== 10) errors.push(`${prefix}: 등록 플레이어 10명을 직접 선택해 주세요.`);
    else if (new Set(playerIds).size !== 10) errors.push(`${prefix}: 같은 플레이어가 중복되었습니다.`);
    if (championKeys.length !== 10) errors.push(`${prefix}: 챔피언 10명을 모두 확인해 주세요.`);
    else if (new Set(championKeys).size !== 10) errors.push(`${prefix}: 같은 챔피언이 중복되었습니다.`);
    if (game.participants.some((participant) =>
      ![participant.kills, participant.deaths, participant.assists].every((value) =>
        Number.isInteger(value) && value >= 0 && value <= 999))) errors.push(`${prefix}: K/D/A는 0~999 정수여야 합니다.`);
    if (game.participants.some((participant) =>
      participant.playerId && catalog.players.find((player) => player.id === participant.playerId)?.status !== "ACTIVE")) {
      errors.push(`${prefix}: 알 수 없거나 비활성인 플레이어가 있습니다.`);
    }
    if (game.participants.some((participant) =>
      participant.championKey && catalog.champions.find((champion) => champion.key === participant.championKey)?.status !== "ACTIVE")) {
      errors.push(`${prefix}: 알 수 없거나 비활성인 챔피언이 있습니다.`);
    }
    const unconfirmed = game.participants.filter((participant) =>
      !confirmedRows.has(rowKey(game.gameNumber, participant))).length;
    if (unconfirmed > 0) errors.push(`${prefix}: 원본과 대조하지 않은 행이 ${unconfirmed}개 있습니다.`);
  }
  return [...new Set(errors)];
}

function ambiguityWarnings(submission: AdminSubmissionView, catalog: AdminMatchEditorCatalog) {
  const warnings: string[] = ["OCR 닉네임은 플레이어 계정에 자동 연결하지 않습니다. 각 행에서 직접 검색·선택해야 합니다."];
  for (let gameNumber = 1; gameNumber <= submission.expectedGameCount; gameNumber += 1) {
    const candidates = ocrParticipants(submission, gameNumber);
    for (const candidate of candidates) {
      if (!candidate.team || !candidate.position) warnings.push(`${gameNumber}게임 OCR ${candidate.slot}번: 팀 또는 포지션을 판별하지 못했습니다.`);
      if (candidate.championKey && !catalog.champions.some((champion) => champion.key === candidate.championKey && champion.status === "ACTIVE")) {
        warnings.push(`${gameNumber}게임 OCR ${candidate.slot}번: '${candidate.championKey}' 챔피언을 활성 카탈로그에서 찾지 못했습니다.`);
      }
    }
    for (const team of MATCH_TEAMS) for (const position of MATCH_POSITIONS) {
      if (candidates.filter((candidate) => candidate.team === team && candidate.position === position).length > 1) {
        warnings.push(`${gameNumber}게임 ${TEAM_LABEL[team]} ${POSITION_LABEL[position]}: OCR 후보가 중복되어 자동 채우지 않았습니다.`);
      }
    }
    const nicknames = candidates.map((candidate) => candidate.nickname).filter((value): value is string => Boolean(value));
    for (const nickname of new Set(nicknames)) if (nicknames.filter((value) => value === nickname).length > 1) {
      warnings.push(`${gameNumber}게임: OCR 닉네임 '${nickname}' 후보가 중복되었습니다.`);
    }
    const champions = candidates.map((candidate) => candidate.championKey).filter((value): value is string => Boolean(value));
    for (const champion of new Set(champions)) if (champions.filter((value) => value === champion).length > 1) {
      warnings.push(`${gameNumber}게임: 챔피언 '${champion}' 후보가 중복되었습니다.`);
    }
  }
  return [...new Set(warnings)];
}

export function SubmissionReview({
  submission,
  catalog,
}: {
  submission: AdminSubmissionView;
  catalog: AdminMatchEditorCatalog;
}) {
  const router = useRouter();
  const [previousSubmission, setPreviousSubmission] = useState(submission);
  const [currentSubmission, setCurrentSubmission] = useState(submission);
  const [revision, setRevision] = useState(submission.revision);
  const [status, setStatus] = useState(submission.status);
  const [seasonId, setSeasonId] = useState(submission.seasonId ?? "");
  const [games, setGames] = useState(() => initialGames(submission));
  const [confirmedRows, setConfirmedRows] = useState<Set<string>>(() => submission.reviewedResult
    ? new Set(initialGames(submission).flatMap((game) => game.participants.map((participant) => rowKey(game.gameNumber, participant))))
    : new Set());
  const [draftSaved, setDraftSaved] = useState(Boolean(submission.reviewedResult));
  const [knownPlayers, setKnownPlayers] = useState(() => [...catalog.players]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(() => new Set());
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [serverConflict, setServerConflict] = useState<AdminSubmissionView | null>(null);
  const [imageRevisions, setImageRevisions] = useState<Record<string, number>>(() =>
    Object.fromEntries(submission.images.map((image) => [image.id, image.revision])));
  const reviewRootRef = useRef<HTMLDivElement>(null);
  const rejectDialogRef = useRef<HTMLElement>(null);
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const effectiveCatalog = useMemo(() => ({ ...catalog, players: knownPlayers }), [catalog, knownPlayers]);
  const playerOptions = useMemo<BoundedPickerOption[]>(() => knownPlayers.map((player) => ({
    value: player.id,
    label: `${player.nickname}#${player.tagLine}`,
    status: player.status,
  })), [knownPlayers]);
  const championOptions = useMemo<BoundedPickerOption[]>(() => catalog.champions.map((champion) => ({
    value: champion.key,
    label: champion.displayName,
    status: champion.status,
    searchText: champion.key,
  })), [catalog.champions]);
  const warnings = useMemo(() => ambiguityWarnings(currentSubmission, catalog), [catalog, currentSubmission]);
  const errors = useMemo(() => reviewErrors(games, effectiveCatalog, confirmedRows), [confirmedRows, effectiveCatalog, games]);

  if (previousSubmission !== submission) {
    setPreviousSubmission(submission);
    setCurrentSubmission(submission);
    setRevision(submission.revision);
    setStatus(submission.status);
    setImageRevisions(Object.fromEntries(submission.images.map((image) => [image.id, image.revision])));
  }

  useEffect(() => () => { if (pastedPreview) URL.revokeObjectURL(pastedPreview); }, [pastedPreview]);

  useEffect(() => {
    if (!rejectOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => rejectReasonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [rejectOpen]);

  function openRejectDialog() {
    returnFocusRef.current = rejectTriggerRef.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setRejectOpen(true);
  }

  function closeRejectDialog(force = false) {
    if (busy && !force) return;
    const returnTarget = returnFocusRef.current;
    setRejectOpen(false);
    setRejectReason("");
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else reviewRootRef.current?.focus();
    });
  }

  function trapRejectDialogFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRejectDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = rejectDialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyLatestProjection(latest: AdminSubmissionView) {
    setCurrentSubmission(latest);
    setRevision(latest.revision);
    setStatus(latest.status);
    setImageRevisions(Object.fromEntries(latest.images.map((image) => [image.id, image.revision])));
  }

  async function fetchLatestProjection() {
    try {
      const response = await fetch(`/api/admin/matches/submissions/${submission.id}`, { cache: "no-store" });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (!isRecord(body) || !isRecord(body.submission)) return null;
      const latest = body.submission as unknown as AdminSubmissionView;
      return latest.id === submission.id && Number.isSafeInteger(latest.revision) && Array.isArray(latest.images)
        ? latest
        : null;
    } catch {
      return null;
    }
  }

  function loadServerReview(latest: AdminSubmissionView) {
    const latestGames = initialGames(latest);
    setSeasonId(latest.seasonId ?? "");
    setGames(latestGames);
    setConfirmedRows(latest.reviewedResult
      ? new Set(latestGames.flatMap((game) => game.participants.map((participant) => rowKey(game.gameNumber, participant))))
      : new Set());
    setDraftSaved(Boolean(latest.reviewedResult));
    setServerConflict(null);
    setError(false);
    setMessage("최신 서버 검토안을 불러왔습니다. 내용을 비교한 뒤 다음 작업을 진행해 주세요.");
  }

  function keepLocalReview() {
    setConfirmedRows(new Set());
    setDraftSaved(false);
    setServerConflict(null);
    setError(false);
    setMessage("로컬 편집을 유지했습니다. 최신 revision 기준으로 모든 행을 다시 대조 확인한 뒤 저장해 주세요.");
  }

  function changeParticipant(gameIndex: number, participantIndex: number, patch: Partial<EditableParticipant>) {
    const participant = games[gameIndex]?.participants[participantIndex];
    if (!participant) return;
    setConfirmedRows((current) => {
      const next = new Set(current);
      next.delete(rowKey(gameIndex + 1, participant));
      return next;
    });
    setDraftSaved(false);
    setGames((current) => current.map((game, index) => index === gameIndex ? {
      ...game,
      participants: game.participants.map((entry, row) => row === participantIndex ? { ...entry, ...patch } : entry),
    } : game));
  }

  async function command(path: string, body: unknown, expectedRevision = revision) {
    const response = await fetch(`/api/admin/matches/submissions/${submission.id}/${path}`, {
      method: path === "review-draft" ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${expectedRevision}"`,
        "Idempotency-Key": key(`submission-${path}`),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await messageFor(response);
      if (response.status === 412) {
        const latest = await fetchLatestProjection();
        if (!latest) {
          throw new Error(`${detail} 최신 서버 상태 확인에도 실패해 기존 입력과 revision을 유지했습니다.`);
        }
        applyLatestProjection(latest);
        setServerConflict(latest);
        router.refresh();
        throw new Error(`${detail} 최신 서버 상태를 확인했습니다. 로컬 편집 유지 또는 서버 검토안 불러오기를 선택해 비교해 주세요.`);
      }
      throw new Error(detail);
    }
    return response.json() as Promise<{ status?: AdminSubmissionView["status"]; revision: number; matchId?: string }>;
  }

  async function saveDraft() {
    setBusy(true); setError(false); setMessage("검토안을 검증하고 있어요…");
    try {
      if (!seasonId) throw new Error("승인할 시즌을 명시적으로 선택해 주세요.");
      if (errors.length > 0) throw new Error("모든 게임의 오류와 미확인 행을 먼저 해결해 주세요.");
      const result = await command("review-draft", { seasonId, reviewedResult: { formulaVersion: "V1_COMPAT_1", games } });
      setRevision(result.revision); setDraftSaved(true);
      setMessage(`사람이 확인한 검토안을 저장했습니다. revision ${result.revision}`); router.refresh();
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : "검토안 저장에 실패했습니다."); } finally { setBusy(false); }
  }

  async function transition(action: "approve" | "reject" | "reopen" | "cancel-import") {
    if (action === "approve" && (!draftSaved || !window.confirm("저장된 검토안으로 공개 경기를 생성할까요? 플레이어·챔피언·승패를 다시 확인해 주세요."))) return;
    if (action === "cancel-import" && !window.confirm("이 관리자 가져오기를 취소하고 모든 비공개 원본 정리를 예약할까요?")) return;
    const body = action === "reject" ? { publicReason: rejectReason } : {};
    setBusy(true); setError(false); setMessage("상태를 변경하고 있어요…");
    try {
      const result = await command(action, body);
      setRevision(result.revision);
      if (result.status) setStatus(result.status);
      if (action === "reject") closeRejectDialog(true);
      if (action === "cancel-import") clearAdminImportRecovery();
      setMessage(action === "approve" ? `승인되어 경기 ${result.matchId}가 공개됐습니다.` : action === "cancel-import" ? "가져오기를 취소하고 비공개 원본 정리를 예약했습니다." : "상태를 변경했습니다."); router.refresh();
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : "상태 변경에 실패했습니다."); } finally { setBusy(false); }
  }

  async function retryOcr(imageId: string) {
    const gameNumber = currentSubmission.images.find((image) => image.id === imageId)?.gameNumber;
    setBusy(true); setError(false); setMessage("OCR adapter를 다시 호출하고 있어요…");
    try {
      const response = await fetch(`/api/admin/matches/submissions/${submission.id}/images/${imageId}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": `"${imageRevisions[imageId]}"`, "Idempotency-Key": key("ocr-retry") },
        body: "{}",
      });
      if (!response.ok) {
        const detail = await messageFor(response);
        if (response.status === 412) {
          const latest = await fetchLatestProjection();
          if (!latest) {
            throw new Error(`${detail} 최신 분석 상태 확인에도 실패해 기존 요청 키와 revision을 유지했습니다.`);
          }
          if (latest.revision !== revision) setServerConflict(latest);
          applyLatestProjection(latest);
          setDraftSaved(false);
          router.refresh();
          throw new Error(`${detail} 최신 이미지 revision을 확인했습니다. 같은 원본 기준으로 다시 분석할 수 있습니다.`);
        }
        throw new Error(detail);
      }
      const result = await response.json() as { ocrStatus: string; ocrErrorCode: string | null; revision: number };
      setImageRevisions((current) => ({ ...current, [imageId]: result.revision }));
      if (gameNumber !== undefined) {
        setConfirmedRows((current) => new Set([...current].filter((entry) => !entry.startsWith(`${gameNumber}:`))));
      }
      setDraftSaved(false);
      const latest = await fetchLatestProjection();
      if (latest) {
        if (latest.revision !== revision) setServerConflict(latest);
        applyLatestProjection(latest);
      }
      setMessage(result.ocrStatus === "SUCCEEDED" ? "새 OCR 후보를 만들었습니다. 행별로 다시 확인해 주세요." : `OCR을 사용할 수 없어 수동 검토를 유지합니다 (${result.ocrErrorCode}).`); router.refresh();
    } catch (caught) { setError(true); setMessage(caught instanceof Error ? caught.message : "OCR 재시도에 실패했습니다."); } finally { setBusy(false); }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (!file) { setError(true); setMessage("클립보드에서 이미지를 찾지 못했습니다."); return; }
    if (pastedPreview) URL.revokeObjectURL(pastedPreview);
    setPastedPreview(URL.createObjectURL(file)); setError(false);
    setMessage("붙여넣은 이미지는 로컬 비교용입니다. 새 원본을 저장·OCR하려면 새 경기 화면의 비공개 가져오기를 사용하세요.");
  }

  return <>
    <div aria-hidden={rejectOpen ? true : undefined} inert={rejectOpen ? true : undefined} ref={reviewRootRef} tabIndex={-1}>
    {message ? <p className={styles.message} data-error={error} role={error ? "alert" : "status"}>{message}</p> : null}
    <section className={styles.panel}><h2>비공개 증거 이미지</h2>{currentSubmission.images.length === 0 ? <div className={styles.state}>등록된 증거 이미지가 없습니다.</div> : <div className={styles.images}>{currentSubmission.images.map((image) => <article className={styles.image} key={image.id}>{imageErrors.has(image.id) ? <div className={styles.imageError} role="alert"><AlertTriangle aria-hidden="true" /><strong>비공개 이미지를 불러오지 못했습니다.</strong><span>권한·저장 상태를 확인하거나 다시 분석해 주세요.</span></div> : <img src={`/api/admin/matches/submissions/${submission.id}/images/${image.id}`} alt={`${image.gameNumber}게임 비공개 스코어보드`} onError={() => setImageErrors((current) => new Set(current).add(image.id))} />}<div><strong>{image.gameNumber}게임 · {image.ocrStatus}</strong><p>{Math.round(image.byteSize / 1024)}KiB · SHA {image.sha256.slice(0, 10)}…</p><button type="button" disabled={busy} onClick={() => retryOcr(image.id)}>OCR 다시 분석</button><small>{image.ocrCandidate ? `구조화 OCR 후보 ${Array.isArray(image.ocrCandidate.participants) ? image.ocrCandidate.participants.length : 0}개 — 아래 행에서 확인` : image.ocrErrorCode ?? "후보 없음 — 수동 입력"}</small></div></article>)}</div>}</section>
    <section className={styles.panel}><h2>Windows 캡처 붙여넣기·수동 대조</h2><div className={styles.paste} tabIndex={0} onPaste={onPaste}>{pastedPreview ? <img src={pastedPreview} alt="붙여넣은 로컬 비교 이미지" /> : <p>이 영역을 선택하고 Ctrl+V로 캡처 이미지를 붙여넣으세요.<br />서버로 전송하지 않으며 저장된 비공개 증거와 비교할 때만 사용합니다.</p>}</div></section>
    <section className={styles.panel}>
      <div><h2>사람이 확정하는 구조화 검토안</h2><p>OCR은 값 후보만 채웁니다. 닉네임을 계정에 자동 연결하지 않으며 각 행의 ‘원본 대조 확인’을 직접 눌러야 저장할 수 있습니다.</p></div>
      {serverConflict ? <div className={styles.validation} role="alert"><strong>동시 수정 내용을 비교해 주세요</strong><p>서버는 revision {serverConflict.revision}, 현재 편집기는 충돌 전 로컬 입력을 보존하고 있습니다. 자동으로 덮어쓰지 않습니다.</p><div className={styles.actions}><button type="button" onClick={keepLocalReview}>로컬 편집 유지·모든 행 재확인</button><button type="button" onClick={() => loadServerReview(serverConflict)}>서버 검토안 불러오기</button></div></div> : null}
      <div className={styles.form}><label>연결 시즌<select value={seasonId} onChange={(event) => { setSeasonId(event.target.value); setDraftSaved(false); }}><option value="">시즌을 선택하세요</option>{catalog.seasons.filter((season) => season.status !== "RETIRED").map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><label>현재 상태<input readOnly value={`${status} · revision ${revision}`} /></label></div>
      <div className={styles.validation}><strong>OCR 확인 경고</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>
      <div className={styles.gameStack}>{games.map((game, gameIndex) => {
        const candidates = ocrParticipants(currentSubmission, game.gameNumber);
        const usedPlayers = new Set(game.participants.map((participant) => participant.playerId).filter(Boolean));
        const usedChampions = new Set(game.participants.map((participant) => participant.championKey).filter(Boolean));
        return <article className={styles.gameEditor} key={game.gameNumber}>
          <header className={styles.gameEditorHeader}><div><span>HUMAN REVIEW</span><h3>{game.gameNumber}게임</h3></div><div className={styles.compactControls}><label>승리 팀<select value={game.winnerTeam} onChange={(event) => { setDraftSaved(false); setGames((current) => current.map((entry, index) => index === gameIndex ? { ...entry, winnerTeam: event.target.value as EditableGame["winnerTeam"] } : entry)); }}><option value="BLUE">블루</option><option value="RED">레드</option></select></label></div></header>
          <div className={styles.rosterTable} role="group" aria-label={`${game.gameNumber}게임 사람 검토 로스터`}>
            <div className={`${styles.rosterHead} ${styles.reviewRosterGrid}`}><span>팀/포지션·OCR</span><span>플레이어</span><span>챔피언</span><span>K / D / A</span><span>확인</span></div>
            {game.participants.map((participant, participantIndex) => {
              const exactCandidates = candidates.filter((candidate) => candidate.team === participant.team && candidate.position === participant.position);
              const candidate = exactCandidates.length === 1 ? exactCandidates[0] : null;
              const confirmationKey = rowKey(game.gameNumber, participant);
              const confirmed = confirmedRows.has(confirmationKey);
              return <div className={`${styles.rosterRow} ${styles.reviewRosterGrid}`} data-confirmed={confirmed} key={`${participant.team}-${participant.position}`}>
                <div className={styles.ocrHint}><strong data-team={participant.team}>{TEAM_LABEL[participant.team]} · {POSITION_LABEL[participant.position]}</strong>{candidate ? <small>OCR: {candidate.nickname ?? "닉네임 없음"} · {candidate.championKey ?? "챔피언 없음"}<br />신뢰도 {Math.round(candidate.confidence * 100)}%</small> : <small>{exactCandidates.length > 1 ? "중복 후보 — 원본 직접 확인" : "정확한 OCR 후보 없음"}</small>}</div>
                <BoundedPicker ariaLabel={`${TEAM_LABEL[participant.team]} ${POSITION_LABEL[participant.position]} 플레이어`} disabledValues={usedPlayers} options={playerOptions} placeholder="이름 또는 태그 검색" remoteEndpoint="/api/admin/matches/editor-options/players" value={participant.playerId} onChange={(value, option) => { if (option && !knownPlayers.some((player) => player.id === option.value)) { const [nickname, tagLine = ""] = option.label.split("#", 2); setKnownPlayers((current) => [...current, { id: option.value, nickname: nickname ?? option.label, tagLine, status: option.status }]); } changeParticipant(gameIndex, participantIndex, { playerId: value }); }} />
                <BoundedPicker ariaLabel={`${TEAM_LABEL[participant.team]} ${POSITION_LABEL[participant.position]} 챔피언`} disabledValues={usedChampions} options={championOptions} placeholder="챔피언 검색" value={participant.championKey} onChange={(value) => changeParticipant(gameIndex, participantIndex, { championKey: value })} />
                <span className={styles.kdaInputs}><input aria-label="킬" min="0" max="999" type="number" value={participant.kills} onChange={(event) => changeParticipant(gameIndex, participantIndex, { kills: Number(event.target.value) })} /><i>/</i><input aria-label="데스" min="0" max="999" type="number" value={participant.deaths} onChange={(event) => changeParticipant(gameIndex, participantIndex, { deaths: Number(event.target.value) })} /><i>/</i><input aria-label="어시스트" min="0" max="999" type="number" value={participant.assists} onChange={(event) => changeParticipant(gameIndex, participantIndex, { assists: Number(event.target.value) })} /></span>
                <button className={styles.confirmRow} data-confirmed={confirmed} type="button" onClick={() => setConfirmedRows((current) => { const next = new Set(current); if (confirmed) next.delete(confirmationKey); else next.add(confirmationKey); setDraftSaved(false); return next; })}>{confirmed ? <><CheckCircle2 size={15} aria-hidden="true" /> 확인됨</> : "원본 대조 확인"}</button>
              </div>;
            })}
          </div>
        </article>;
      })}</div>
      {errors.length > 0 ? <div className={styles.validation} role="alert"><strong>승인 전 해결할 항목</strong><ul>{errors.map((item) => <li key={item}>{item}</li>)}</ul></div> : <p className={styles.valid}><CheckCircle2 size={17} aria-hidden="true" /> 모든 행을 직접 확인했습니다. 저장 후에만 승인할 수 있습니다.</p>}
      <div className={styles.actions}><button className={styles.action} type="button" disabled={busy || Boolean(serverConflict) || status !== "PENDING_REVIEW" || errors.length > 0} onClick={saveDraft}>검토안 저장</button>{status === "PENDING_REVIEW" ? <><button type="button" disabled={busy || Boolean(serverConflict) || !draftSaved} onClick={() => transition("approve")}>승인·경기 공개</button><button data-danger="true" ref={rejectTriggerRef} type="button" disabled={busy || Boolean(serverConflict)} onClick={openRejectDialog}>거절</button></> : null}{status === "REJECTED" ? <button type="button" disabled={busy || Boolean(serverConflict)} onClick={() => transition("reopen")}>검토 재개</button> : null}{currentSubmission.source === "ADMIN" && (status === "AWAITING_UPLOAD" || status === "PENDING_REVIEW") ? <button data-danger="true" type="button" disabled={busy || Boolean(serverConflict)} onClick={() => transition("cancel-import")}>가져오기 취소·원본 정리</button> : null}</div>
    </section>
    </div>
    {rejectOpen ? <div className={styles.dialogBackdrop} role="presentation" onMouseDown={() => closeRejectDialog()}><section aria-describedby="reject-description" aria-labelledby="reject-title" aria-modal="true" className={styles.dialog} ref={rejectDialogRef} role="dialog" onKeyDown={trapRejectDialogFocus} onMouseDown={(event) => event.stopPropagation()}><h2 id="reject-title">접수를 거절할까요?</h2><p id="reject-description">사용자에게 표시할 구체적인 사유를 3~500자로 입력해 주세요. 내부 OCR 정보는 포함하지 마세요.</p><label>공개 거절 사유<textarea maxLength={500} minLength={3} ref={rejectReasonRef} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></label><div className={styles.actions}><button type="button" disabled={busy} onClick={() => closeRejectDialog()}>취소</button><button data-danger="true" type="button" disabled={busy || rejectReason.normalize("NFKC").trim().length < 3} onClick={() => transition("reject")}>사유를 기록하고 거절</button></div></section></div> : null}
  </>;
}
