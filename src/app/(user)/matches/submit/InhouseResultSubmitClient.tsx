"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
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
  submissions?: SubmissionStatus[];
  receivedImageCount?: number;
  expectedImageCount?: number;
  status?: string;
};

type WizardStep = 1 | 2 | 3;

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
  const [step, setStep] = useState<WizardStep>(1);
  const [matchDate, setMatchDate] = useState(defaultDate);
  const [organizer, setOrganizer] = useState(defaultOrganizer);
  const [gameCount, setGameCount] = useState(3);
  const [seriesNumber, setSeriesNumber] = useState(1);
  const [teamBalanceDraftId, setTeamBalanceDraftId] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submission, setSubmission] = useState<SubmissionStatus | null>(null);
  const [activeSubmissions, setActiveSubmissions] = useState<SubmissionStatus[]>([]);
  const [loadingActive, setLoadingActive] = useState(!initialCode);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);

  function clearFeedback() {
    setError("");
    setMessage("");
    setProgress("");
  }

  function moveToSubmissionStep(item: SubmissionStatus) {
    const itemRemaining = Math.max(0, item.expectedImageCount - item.receivedImageCount);
    setStep(item.status === "AWAITING_UPLOAD" && itemRemaining > 0 ? 2 : 3);
  }

  function resetToNew() {
    setMode("NEW");
    setStep(1);
    setSubmission(null);
    setFiles([]);
    clearFeedback();
    requestIdRef.current = null;
    window.history.replaceState(window.history.state, "", "/matches/submit");
  }

  async function loadActiveSubmissions() {
    setLoadingActive(true);
    clearFeedback();
    try {
      const response = await fetch("/api/inhouse-results/submissions", { cache: "no-store" });
      const result = await readResult(response);
      if (!response.ok || !result.submissions) throw new Error(result.message || "작성 중인 결과를 불러오지 못했습니다.");
      setActiveSubmissions(result.submissions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "작성 중인 결과를 불러오지 못했습니다.");
    } finally {
      setLoadingActive(false);
    }
  }

  function resumeSubmission(item: SubmissionStatus) {
    setMode("RESUME");
    setSubmission(item);
    setFiles([]);
    clearFeedback();
    moveToSubmissionStep(item);
  }

  useEffect(() => {
    if (!initialCode) {
      void loadActiveSubmissions();
      return;
    }
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
        setMode("RESUME");
        setSubmission(result.submission);
        moveToSubmissionStep(result.submission);
        window.history.replaceState(window.history.state, "", "/matches/submit");
      } catch (lookupError) {
        if (!cancelled) {
          setMode("NEW");
          setError(lookupError instanceof Error ? lookupError.message : "기존 접수를 불러오지 못했습니다.");
          window.history.replaceState(window.history.state, "", "/matches/submit");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // initialCode is fixed by the server render. The legacy link is resolved once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setSubmission(created);
    setMode("RESUME");
    const pendingFiles = files.slice(created.receivedImageCount);
    if (created.receivedImageCount >= created.expectedImageCount) return created;
    const received = await uploadImages(
      created.publicCode,
      pendingFiles,
      created.receivedImageCount,
      created.expectedImageCount,
    );
    return {
      ...created,
      receivedImageCount: received,
      status: received >= created.expectedImageCount ? "PENDING_REVIEW" : created.status,
    };
  }

  async function submitResume() {
    const current = submission;
    if (!current) throw new Error("작성 중인 내전 결과를 먼저 선택해주세요.");
    const currentRemaining = current.expectedImageCount - current.receivedImageCount;
    if (currentRemaining <= 0 || current.status !== "AWAITING_UPLOAD") throw new Error("이 접수는 사진 등록이 완료되었습니다.");
    if (files.length !== currentRemaining) throw new Error(`남은 사진 ${currentRemaining}장을 모두 선택해주세요.`);
    const received = await uploadImages(current.publicCode, files, current.receivedImageCount, current.expectedImageCount);
    return {
      ...current,
      receivedImageCount: received,
      status: received >= current.expectedImageCount ? "PENDING_REVIEW" : current.status,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      continueFromInfo();
      return;
    }
    if (step === 2) {
      continueFromPhotos();
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setProgress("");
    try {
      const completedSubmission = submission
        ? await submitResume()
        : mode === "NEW"
          ? await submitNew()
          : await submitResume();
      setFiles([]);
      setSubmission(completedSubmission);
      setActiveSubmissions((current) => current.filter((item) => item.publicCode !== completedSubmission.publicCode));
      setStep(3);
      setMessage(`사진 ${completedSubmission.receivedImageCount}/${completedSubmission.expectedImageCount}장이 안전하게 접수되었습니다. 관리자 검토를 기다려주세요.`);
      setProgress("");
      requestIdRef.current = null;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "제출에 실패했습니다.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  function continueFromInfo() {
    clearFeedback();
    if (!matchDate) {
      setError("진행일을 확인해주세요.");
      return;
    }
    if (!organizer.trim()) {
      setError("진행자 이름을 확인해주세요.");
      return;
    }
    if (!Number.isInteger(seriesNumber) || seriesNumber < 1) {
      setError("내전 회차는 1 이상의 숫자로 입력해주세요.");
      return;
    }
    setStep(2);
  }

  function continueFromPhotos() {
    clearFeedback();
    const currentRemaining = submission
      ? Math.max(0, submission.expectedImageCount - submission.receivedImageCount)
      : gameCount;
    if (files.length !== currentRemaining) {
      setError(`${currentRemaining}장의 사진을 모두 선택해주세요. 현재 ${files.length}장이 선택되었습니다.`);
      return;
    }
    setStep(3);
  }

  const remaining = submission
    ? Math.max(0, submission.expectedImageCount - submission.receivedImageCount)
    : null;
  const neededPhotoCount = submission ? remaining ?? 0 : gameCount;
  const canUpload = !submission || (submission.status === "AWAITING_UPLOAD" && neededPhotoCount > 0);
  const completed = Boolean(message && submission && submission.receivedImageCount >= submission.expectedImageCount);
  const photoStartNumber = submission ? submission.receivedImageCount + 1 : 1;
  const stepLabels = mode === "NEW"
    ? ["기본 정보", "결과 사진", "확인 · 완료"]
    : ["자동 저장 찾음", "남은 사진", "확인 · 완료"];

  return (
    <section className={styles.card}>
      <div className={styles.modeIntro}>
        <strong>로그인 계정에 자동 저장됩니다</strong>
        <span>번호를 기억할 필요가 없습니다. 중간에 나가도 이 화면에서 남은 사진부터 이어갈 수 있습니다.</span>
      </div>

      {mode === "NEW" && step === 1 ? (
        <section className={styles.resumeShelf} aria-labelledby="unfinished-inhouse-title">
          <div>
            <h2 id="unfinished-inhouse-title">작성 중인 결과</h2>
            <p>{loadingActive ? "로그인 계정의 저장 내용을 확인하고 있습니다…" : activeSubmissions.length ? "완료하지 않은 결과가 있습니다. 날짜와 회차를 보고 선택하세요." : "작성 중인 결과가 없습니다. 아래에서 새로 등록하세요."}</p>
          </div>
          {activeSubmissions.length ? (
            <div className={styles.resumeList}>
              {activeSubmissions.map((item) => (
                <button key={item.publicCode} type="button" disabled={busy} onClick={() => resumeSubmission(item)}>
                  <span><strong>{item.matchDate} · {item.seriesNumber ?? 1}회차</strong><small>{item.organizer || "진행자 미입력"}</small></span>
                  <span><b>{item.receivedImageCount}/{item.expectedImageCount}장</b><em>이어서 등록</em></span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "RESUME" ? (
        <div className={styles.resumeBanner}>
          <span><strong>작성 중인 결과를 이어서 등록합니다</strong><small>{submission?.matchDate} · {submission?.seriesNumber ?? 1}회차 · {submission?.organizer}</small></span>
          <button type="button" disabled={busy} onClick={resetToNew}>새 결과 따로 등록</button>
        </div>
      ) : null}

      <ol className={styles.steps} aria-label="내전 결과 등록 진행 단계">
        {stepLabels.map((label, index) => {
          const number = index + 1;
          const state = number < step ? "done" : number === step ? "current" : "upcoming";
          return (
            <li key={label} className={styles[`step_${state}`]} aria-current={state === "current" ? "step" : undefined}>
              <span>{state === "done" ? "✓" : number}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>

      <form onSubmit={(event) => void handleSubmit(event)}>
        {step === 1 && mode === "NEW" ? (
          <section className={styles.stepPanel} aria-labelledby="inhouse-basic-title">
            <div className={styles.panelHeading}>
              <span className={styles.panelNumber}>1</span>
              <div>
                <h2 id="inhouse-basic-title">진행 정보를 확인해주세요</h2>
                <p>날짜와 진행자는 자동으로 채웠습니다. 다른 경우에만 수정하세요.</p>
              </div>
            </div>
            <div className={styles.autoNotice}>
              <strong>자동 입력됨</strong>
              <span>오늘 날짜와 로그인 계정의 플레이어 이름을 사용했습니다.</span>
            </div>
            <div className={styles.grid}>
              <label>
                <span>진행일 <em>필수</em></span>
                <input type="date" value={matchDate} onChange={(event) => setMatchDate(event.target.value)} required />
                <small>오늘 날짜가 자동으로 입력됩니다.</small>
              </label>
              <label>
                <span>진행자 <em>필수</em></span>
                <input value={organizer} onChange={(event) => setOrganizer(event.target.value)} maxLength={100} required />
                <small>로그인한 계정의 이름이 자동으로 입력됩니다.</small>
              </label>
              <fieldset className={styles.choiceField}>
                <legend>진행한 세트 수 <em>필수</em></legend>
                <div>
                  {[2, 3].map((count) => (
                    <label key={count} className={gameCount === count ? styles.choiceActive : styles.choiceButton}>
                      <input
                        type="radio"
                        name="gameCount"
                        value={count}
                        checked={gameCount === count}
                        onChange={() => { setGameCount(count); setFiles([]); }}
                      />
                      <strong>{count}세트</strong>
                      <small>사진 {count}장</small>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                <span>오늘의 내전 회차 <em>필수</em></span>
                <input type="number" min={1} step={1} value={seriesNumber} onChange={(event) => setSeriesNumber(Number(event.target.value))} required />
                <small>첫 내전이면 1, 두 번째 내전이면 2입니다.</small>
              </label>
              <label>
                <span>팀 밸런스 번호 <i>선택</i></span>
                <input inputMode="numeric" value={teamBalanceDraftId} onChange={(event) => setTeamBalanceDraftId(event.target.value)} placeholder="예: 2" />
                <small>사용하지 않았다면 비워두세요.</small>
              </label>
              <label className={styles.wideField}>
                <span>특이사항 <i>선택</i></span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="예: 2세트 재경기 진행 · 없으면 비워두기" rows={3} />
              </label>
            </div>
            <div className={styles.panelActions}>
              <Link className="app-button app-button--secondary" href="/matches">취소</Link>
              <button className="app-button" type="button" onClick={continueFromInfo}>사진 선택으로 계속</button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className={styles.stepPanel} aria-labelledby="inhouse-photo-title">
            <div className={styles.panelHeading}>
              <span className={styles.panelNumber}>2</span>
              <div>
                <h2 id="inhouse-photo-title">세트 순서대로 사진을 골라주세요</h2>
                <p>{submission ? `이미 ${submission.receivedImageCount}장 등록되었습니다. 남은 ${neededPhotoCount}장만 선택하세요.` : `${gameCount}세트 결과 사진 ${gameCount}장이 필요합니다.`}</p>
              </div>
            </div>

            {submission ? (
              <div className={styles.statusBox} role="status">
                <div><small>현재 상태</small><strong>{statusLabel(submission.status)}</strong></div>
                <div><small>내전 정보</small><strong>{submission.matchDate} · {submission.seriesNumber ?? 1}회차</strong></div>
                <div><small>등록된 사진</small><strong>{submission.receivedImageCount}/{submission.expectedImageCount}장</strong></div>
              </div>
            ) : null}

            <div className={styles.photoGuide}>
              {Array.from({ length: neededPhotoCount }, (_, index) => {
                const setNumber = photoStartNumber + index;
                return (
                  <Fragment key={setNumber}>
                    {index > 0 ? <span aria-hidden="true">→</span> : null}
                    <div><span>{setNumber}</span><strong>{setNumber}세트 결과</strong></div>
                  </Fragment>
                );
              })}
            </div>

            {canUpload ? (
              <label className={styles.fileField}>
                <span>결과 사진 {neededPhotoCount}장 선택</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => { setFiles(Array.from(event.target.files || [])); clearFeedback(); }}
                />
                <small>PNG·JPG·WebP · 장당 3MB 이하 · 선택 후 순서를 바꿀 수 있습니다.</small>
                <strong>{files.length ? `${neededPhotoCount}장 중 ${files.length}장 선택됨` : "기기에서 사진 선택"}</strong>
              </label>
            ) : null}

            <SelectedImageGrid
              files={files}
              startNumber={photoStartNumber}
              disabled={busy}
              onChange={(nextFiles) => { setFiles(nextFiles); clearFeedback(); }}
            />

            <div className={styles.photoTip}>
              <strong>사진 순서가 중요합니다</strong>
              <span>미리보기의 번호가 실제 세트 번호와 다르면 화살표 버튼으로 순서를 바꾸세요.</span>
            </div>
            <div className={styles.panelActions}>
              <button className="app-button app-button--secondary" type="button" onClick={() => {
                if (mode === "RESUME") resetToNew();
                else { clearFeedback(); setStep(1); setFiles([]); }
              }}>{mode === "RESUME" ? "작성 중 목록으로" : "이전"}</button>
              <button className="app-button" type="button" onClick={continueFromPhotos}>선택한 사진 확인</button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className={styles.stepPanel} aria-labelledby="inhouse-confirm-title">
            <div className={styles.panelHeading}>
              <span className={completed ? styles.panelDone : styles.panelNumber}>{completed ? "✓" : "3"}</span>
              <div>
                <h2 id="inhouse-confirm-title">{completed ? "접수가 완료되었습니다" : submission && !canUpload ? "접수 상태를 확인하세요" : "마지막으로 확인해주세요"}</h2>
                <p>{completed ? "사진은 관리자만 확인할 수 있으며, 검토 결과는 내전 등록 현황에서 확인할 수 있습니다." : canUpload ? "제출을 누르면 사진이 세트 순서대로 안전하게 등록됩니다." : "이 접수는 현재 추가 사진 등록이 필요하지 않습니다."}</p>
              </div>
            </div>

            <div className={completed ? styles.completionBox : styles.summaryBox}>
              {submission ? (
                <>
                  <div><small>상태</small><strong>{statusLabel(submission.status)}</strong></div>
                  <div><small>사진</small><strong>{submission.receivedImageCount}/{submission.expectedImageCount}장</strong></div>
                  {submission.matchDate ? <div><small>내전 정보</small><strong>{submission.matchDate} · {submission.seriesNumber}회차 · {submission.organizer}</strong></div> : null}
                </>
              ) : (
                <>
                  <div><small>진행일</small><strong>{matchDate}</strong></div>
                  <div><small>진행자</small><strong>{organizer}</strong></div>
                  <div><small>세트·회차</small><strong>{gameCount}세트 · {seriesNumber}회차</strong></div>
                  <div><small>사진</small><strong>{files.length}장 · 1세트부터 순서대로</strong></div>
                  <div><small>팀 밸런스</small><strong>{teamBalanceDraftId.trim() || "사용 안 함"}</strong></div>
                  <div><small>특이사항</small><strong>{note.trim() || "없음"}</strong></div>
                </>
              )}
            </div>

            {!completed && canUpload ? (
              <SelectedImageGrid
                files={files}
                startNumber={photoStartNumber}
                disabled={busy}
                onChange={setFiles}
              />
            ) : null}

            <div className={styles.panelActions}>
              {!completed && canUpload ? <button className="app-button app-button--secondary" type="button" disabled={busy} onClick={() => { clearFeedback(); setStep(2); }}>사진 다시 확인</button> : null}
              {!completed && canUpload ? <button className="app-button" disabled={busy} type="submit">{busy ? "안전하게 업로드 중…" : submission ? `남은 사진 ${neededPhotoCount}장 제출` : "내전 결과 제출"}</button> : null}
              <Link className="app-button app-button--secondary" href="/matches">내전 목록 보기</Link>
              {completed ? <button className="app-button" type="button" onClick={resetToNew}>새 결과 등록</button> : null}
            </div>
          </section>
        ) : null}

        {progress ? <div className={styles.uploadProgress} role="status" aria-live="polite"><span className={styles.spinner} aria-hidden="true" /><div><strong>사진을 업로드하고 있습니다</strong><p>{progress} · 창을 닫지 마세요.</p></div></div> : null}
        {message ? <p className={styles.success} role="status">{message}</p> : null}
        {error ? <div className={styles.error} role="alert"><strong>확인이 필요합니다</strong><p>{error}</p></div> : null}
      </form>
    </section>
  );
}
