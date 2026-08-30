"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import SelectedImageGrid from "@/components/submissions/SelectedImageGrid";
import styles from "./page.module.css";

type SubmissionStatus = {
  publicCode: string;
  status: string;
  matchDate?: string;
  organizer?: string;
  seriesNumber?: number;
  expectedImageCount: number;
  receivedImageCount: number;
  canUpload?: boolean;
};

type ApiResult = {
  ok?: boolean;
  message?: string;
  submission?: SubmissionStatus;
  receivedImageCount?: number;
  expectedImageCount?: number;
  status?: string;
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    AWAITING_UPLOAD: "사진 업로드 대기",
    PENDING_REVIEW: "관리자 검토 대기",
    IN_REVIEW: "관리자 검토 중",
    REGISTERED: "내전 등록 완료",
    REJECTED: "반려",
  };
  return labels[status] || status;
}

async function readResult(response: Response) {
  return response.json().catch(() => ({})) as Promise<ApiResult>;
}

export default function InhouseResultSubmitClient({
  defaultDate,
  defaultOrganizer,
  initialCode,
}: {
  defaultDate: string;
  defaultOrganizer: string;
  initialCode: string;
}) {
  const [mode, setMode] = useState<"NEW" | "RESUME">(initialCode ? "RESUME" : "NEW");
  const [matchDate, setMatchDate] = useState(defaultDate);
  const [organizer, setOrganizer] = useState(defaultOrganizer);
  const [gameCount, setGameCount] = useState(3);
  const [seriesNumber, setSeriesNumber] = useState(1);
  const [teamBalanceDraftId, setTeamBalanceDraftId] = useState("");
  const [note, setNote] = useState("");
  const [publicCode, setPublicCode] = useState(initialCode);
  const [files, setFiles] = useState<File[]>([]);
  const [submission, setSubmission] = useState<SubmissionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);

  function rememberSubmissionCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!/^MR[A-F0-9]{10}$/.test(normalized)) return;
    window.history.replaceState(window.history.state, "", `/matches/submit?code=${encodeURIComponent(normalized)}`);
  }

  async function lookup(code = publicCode) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("접수번호를 입력해주세요.");
      return null;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/inhouse-results/submissions/${encodeURIComponent(normalized)}`, {
        cache: "no-store",
      });
      const result = await readResult(response);
      if (!response.ok || !result.submission) throw new Error(result.message || "접수 조회에 실패했습니다.");
      setPublicCode(result.submission.publicCode);
      setSubmission(result.submission);
      setFiles([]);
      rememberSubmissionCode(result.submission.publicCode);
      return result.submission;
    } catch (lookupError) {
      setSubmission(null);
      setError(lookupError instanceof Error ? lookupError.message : "접수 조회에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initialCode) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/inhouse-results/submissions/${encodeURIComponent(initialCode)}`, {
          cache: "no-store",
        });
        const result = await readResult(response);
        if (cancelled) return;
        if (!response.ok || !result.submission) throw new Error(result.message || "접수 조회에 실패했습니다.");
        setSubmission(result.submission);
        setPublicCode(result.submission.publicCode);
        rememberSubmissionCode(result.submission.publicCode);
      } catch (lookupError) {
        if (!cancelled) setError(lookupError instanceof Error ? lookupError.message : "접수 조회에 실패했습니다.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialCode]);

  async function uploadImages(code: string, selectedFiles: File[], initialReceived: number, expected: number) {
    let received = initialReceived;
    for (const [index, file] of selectedFiles.entries()) {
      const imageNumber = initialReceived + index + 1;
      setProgress(`${imageNumber}세트 사진 업로드 중 · 전체 ${imageNumber}/${expected}장`);
      const data = new FormData();
      data.set("image", file);
      const response = await fetch(`/api/inhouse-results/submissions/${encodeURIComponent(code)}/images`, {
        method: "POST",
        body: data,
      });
      const result = await readResult(response);
      if (!response.ok) {
        setFiles(selectedFiles.slice(index));
        throw new Error(result.message || `${imageNumber}세트 사진 업로드에 실패했습니다. 실패한 사진부터 다시 시도할 수 있습니다.`);
      }
      received = result.receivedImageCount ?? received + 1;
      setFiles(selectedFiles.slice(index + 1));
      setSubmission((current) => ({
        publicCode: code,
        status: result.status || (received >= expected ? "PENDING_REVIEW" : "AWAITING_UPLOAD"),
        expectedImageCount: expected,
        receivedImageCount: received,
        matchDate: current?.matchDate,
        organizer: current?.organizer,
        seriesNumber: current?.seriesNumber,
        canUpload: received < expected,
      }));
    }
    return received;
  }

  async function submitNew() {
    if (!matchDate || !organizer.trim()) throw new Error("진행일과 진행자를 입력해주세요.");
    if (![2, 3].includes(gameCount)) throw new Error("세트 수는 2 또는 3이어야 합니다.");
    if (files.length !== gameCount) throw new Error(`${gameCount}세트 결과 사진을 ${gameCount}장 선택해주세요.`);
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();

    const response = await fetch("/api/inhouse-results/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: requestIdRef.current,
        matchDate,
        organizer,
        gameCount,
        seriesNumber,
        teamBalanceDraftId,
        note,
      }),
    });
    const result = await readResult(response);
    if (!response.ok || !result.submission) throw new Error(result.message || "내전 결과 접수를 만들지 못했습니다.");

    const created = result.submission;
    setPublicCode(created.publicCode);
    setSubmission(created);
    setMode("RESUME");
    rememberSubmissionCode(created.publicCode);
    const received = await uploadImages(
      created.publicCode,
      files,
      created.receivedImageCount,
      created.expectedImageCount,
    );
    requestIdRef.current = null;
    return { ...created, receivedImageCount: received, status: received >= created.expectedImageCount ? "PENDING_REVIEW" : created.status };
  }

  async function submitResume() {
    const current = submission;
    if (!current) throw new Error("접수번호를 먼저 조회해주세요.");
    const remaining = current.expectedImageCount - current.receivedImageCount;
    if (remaining <= 0 || current.status !== "AWAITING_UPLOAD") throw new Error("이 접수는 사진 등록이 완료되었습니다.");
    if (files.length !== remaining) throw new Error(`남은 사진 ${remaining}장을 모두 선택해주세요.`);
    const received = await uploadImages(current.publicCode, files, current.receivedImageCount, current.expectedImageCount);
    return { ...current, receivedImageCount: received, status: received >= current.expectedImageCount ? "PENDING_REVIEW" : current.status };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setProgress("");
    try {
      const completed = mode === "NEW" ? await submitNew() : await submitResume();
      setFiles([]);
      setSubmission(completed);
      setMessage(`접수번호 ${completed.publicCode}의 사진 ${completed.receivedImageCount}/${completed.expectedImageCount}장이 등록되었습니다. 관리자 검토를 기다려주세요.`);
      setProgress("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "제출에 실패했습니다.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const remaining = submission
    ? Math.max(0, submission.expectedImageCount - submission.receivedImageCount)
    : null;

  return (
    <section className={styles.card}>
      <div className={styles.modeRow}>
        <button type="button" className={mode === "NEW" ? styles.modeActive : styles.modeButton} onClick={() => { setMode("NEW"); setSubmission(null); setPublicCode(""); setFiles([]); setError(""); setMessage(""); requestIdRef.current = null; window.history.replaceState(window.history.state, "", "/matches/submit"); }}>새 결과 제출</button>
        <button type="button" className={mode === "RESUME" ? styles.modeActive : styles.modeButton} onClick={() => { setMode("RESUME"); setFiles([]); setError(""); setMessage(""); }}>접수번호로 사진 등록</button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        {mode === "NEW" ? (
          <div className={styles.grid}>
            <label>진행일<input type="date" value={matchDate} onChange={(event) => setMatchDate(event.target.value)} required /></label>
            <label>진행자<input value={organizer} onChange={(event) => setOrganizer(event.target.value)} maxLength={100} required /></label>
            <label>세트 수<select value={gameCount} onChange={(event) => { setGameCount(Number(event.target.value)); setFiles([]); }}><option value={2}>2세트</option><option value={3}>3세트</option></select></label>
            <label>내전 회차<input type="number" min={1} step={1} value={seriesNumber} onChange={(event) => setSeriesNumber(Number(event.target.value))} required /></label>
            <label>팀 밸런스 번호<input inputMode="numeric" value={teamBalanceDraftId} onChange={(event) => setTeamBalanceDraftId(event.target.value)} placeholder="없으면 비워두기" /></label>
            <label>특이사항<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="없으면 비워두기" /></label>
          </div>
        ) : (
          <div className={styles.lookupRow}>
            <label>접수번호<input value={publicCode} onChange={(event) => { setPublicCode(event.target.value.toUpperCase()); setSubmission(null); }} placeholder="예: MRA7225B15AE" /></label>
            <button type="button" className="app-button app-button--secondary" disabled={busy} onClick={() => void lookup()}>접수 조회</button>
          </div>
        )}

        {submission ? (
          <div className={styles.statusBox} role="status">
            <strong>{submission.publicCode}</strong>
            <span>{statusLabel(submission.status)}</span>
            <span>사진 {submission.receivedImageCount}/{submission.expectedImageCount}장</span>
            {submission.matchDate ? <span>{submission.matchDate} · {submission.seriesNumber}회차 · {submission.organizer}</span> : null}
          </div>
        ) : null}

        {(mode === "NEW" || (submission && remaining && submission.status === "AWAITING_UPLOAD")) ? (
          <label className={styles.fileField}>
            <span>결과 사진 {mode === "NEW" ? `${gameCount}장` : `남은 ${remaining}장`}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
            />
            <small>1세트부터 순서대로 선택하세요. PNG·JPG·WebP, 장당 3MB 이하</small>
            <strong>{files.length ? `${files.length}장 선택됨` : "사진 선택"}</strong>
          </label>
        ) : null}

        <SelectedImageGrid
          files={files}
          startNumber={mode === "RESUME" && submission ? submission.receivedImageCount + 1 : 1}
          disabled={busy}
          onChange={setFiles}
        />

        {progress ? <p className={styles.progress} role="status">{progress}</p> : null}
        {message ? <p className={styles.success} role="status">{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}{publicCode ? <><br />접수번호: {publicCode}</> : null}</p> : null}

        <div className={styles.actions}>
          {(mode === "NEW" || (submission?.status === "AWAITING_UPLOAD" && remaining && remaining > 0)) ? <button className="app-button" disabled={busy} type="submit">{busy ? "처리 중…" : mode === "NEW" ? "정보와 사진 한 번에 제출" : `남은 사진 ${remaining}장 등록`}</button> : null}
          <Link className="app-button app-button--secondary" href="/matches">내전 목록</Link>
        </div>
      </form>
    </section>
  );
}
