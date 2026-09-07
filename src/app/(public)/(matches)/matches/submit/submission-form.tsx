"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { MatchSubmissionView } from "@/modules/matches";
import { MATCH_IMAGE_MAX_BYTES } from "@/modules/matches/domain/match";
import {
  ClientMatchMutationKeyStore,
  type MatchMutationKeyTicket,
} from "@/modules/matches/infrastructure/client-match-mutation-key-store";

import styles from "./submit.module.css";

type SeasonOption = Readonly<{ id: string; name: string }>;
const STATUS_LABEL: Record<MatchSubmissionView["status"], string> = {
  AWAITING_UPLOAD: "이미지 등록 중",
  PENDING_REVIEW: "검토 대기",
  APPROVED: "승인 완료",
  REJECTED: "거절",
  CANCELLED: "사용자 취소",
};

async function problemMessage(response: Response) {
  try {
    const body = await response.json() as { title?: unknown; detail?: unknown };
    if (typeof body.title === "string" && typeof body.detail === "string") return `${body.title} ${body.detail}`;
  } catch { /* safe fallback */ }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function SubmissionForm({
  viewer,
  seasons,
  initial,
  requestedCode,
}: {
  viewer: "ANONYMOUS" | "APPROVED" | "UNAVAILABLE";
  seasons: readonly SeasonOption[];
  initial: MatchSubmissionView | null;
  requestedCode: string | null;
}) {
  const router = useRouter();
  const [submission, setSubmission] = useState(initial);
  const [resumeCode, setResumeCode] = useState(requestedCode ?? "");
  const [message, setMessage] = useState(
    requestedCode && !initial ? "이 계정에서 이어갈 수 있는 접수를 찾지 못했어요." : "",
  );
  const [error, setError] = useState(Boolean(requestedCode && !initial));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const mutationKeys = useRef(new ClientMatchMutationKeyStore("match-submission")).current;
  const createRequestIds = useRef(new ClientMatchMutationKeyStore("match-submission-request")).current;

  if (viewer === "ANONYMOUS") {
    return <section className={styles.panel}><h2>승인된 계정으로 로그인해 주세요</h2><p>공개 결과는 누구나 볼 수 있지만 비공개 스코어보드 접수는 로그인한 소유자만 이어갈 수 있어요.</p><Link className={styles.login} href="/login?next=%2Fmatches%2Fsubmit">로그인</Link></section>;
  }
  if (viewer === "UNAVAILABLE") {
    return <section className={styles.panel} role="status"><h2>결과 접수를 이용할 수 없어요.</h2><p>잠시 후 다시 시도해 주세요.</p></section>;
  }

  function continueByCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^MR2[0-9A-F]{16}$/.test(resumeCode)) {
      setError(true); setMessage("MR2로 시작하는 대문자 접수 코드 19자를 확인해 주세요."); return;
    }
    router.push(`/matches/submit?code=${encodeURIComponent(resumeCode)}`);
  }

  async function createSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(false); setMessage("접수를 만들고 있어요…");
    const form = new FormData(event.currentTarget);
    const startedLocal = String(form.get("startedAt") ?? "");
    const createFields = {
      seasonId: String(form.get("seasonId") ?? "") || null,
      title: String(form.get("title") ?? ""),
      organizer: String(form.get("organizer") ?? ""),
      seriesNumber: Number(form.get("seriesNumber")),
      note: String(form.get("note") ?? "") || null,
      playedOn: String(form.get("playedOn") ?? ""),
      startedAt: startedLocal ? `${startedLocal}:00+09:00` : null,
      expectedGameCount: Number(form.get("expectedGameCount")),
      teamBalanceDraftId: null,
    };
    const requestTicket = createRequestIds.issue("create-request-id", 0, createFields);
    const body = { requestId: requestTicket.key, ...createFields };
    const commandTicket = mutationKeys.issue("POST:/api/me/match-submissions", 0, body);
    try {
      const response = await fetch("/api/me/match-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": '"0"', "Idempotency-Key": commandTicket.key },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await problemMessage(response));
      const created = await response.json() as { submissionId: string; publicCode: string; status: MatchSubmissionView["status"]; revision: number };
      mutationKeys.complete(commandTicket);
      createRequestIds.complete(requestTicket);
      const next: MatchSubmissionView = {
        id: created.submissionId, publicCode: created.publicCode, seasonId: body.seasonId,
        seasonName: seasons.find((season) => season.id === body.seasonId)?.name ?? null,
        title: body.title, organizer: body.organizer, seriesNumber: body.seriesNumber, note: body.note,
        playedOn: body.playedOn, startedAt: body.startedAt, expectedGameCount: body.expectedGameCount,
        teamBalanceDraftId: null, source: "WEB", receivedGameNumbers: [], status: created.status,
        publicReviewReason: null, approvedMatchSeriesId: null, revision: created.revision,
        updatedAt: new Date().toISOString(),
      };
      setSubmission(next); setResumeCode(created.publicCode); setMessage("접수가 생성됐어요. 코드를 보관하고 게임별 이미지를 올려 주세요.");
      window.history.replaceState(null, "", `/matches/submit?code=${created.publicCode}`);
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "접수 생성에 실패했어요.");
    } finally { setBusy(false); }
  }

  async function upload(gameNumber: number, file: File | undefined) {
    if (!submission || !file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 12 || file.size > MATCH_IMAGE_MAX_BYTES) {
      setError(true); setMessage("PNG, JPEG, WebP 이미지만 4MiB 이하로 선택해 주세요."); return;
    }
    setBusy(true); setError(false); setMessage(`${gameNumber}게임 이미지를 안전하게 확인하고 있어요…`);
    let uploadTicket: MatchMutationKeyTicket | null = null;
    try {
      const bytes = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      uploadTicket = mutationKeys.issue(
        `POST:/api/me/match-submissions/${submission.id}/images/${gameNumber}`,
        submission.revision,
        {
          contentType: file.type,
          byteSize: file.size,
          digest,
          fileName: file.name,
          gameNumber,
        },
      );
      const response = await fetch(`/api/me/match-submissions/${submission.publicCode}/images`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "If-Match": `"${submission.revision}"`,
          "Idempotency-Key": uploadTicket.key,
          "X-Content-SHA256": digest,
          "X-Match-Game-Number": String(gameNumber),
          "X-Upload-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok) throw new Error(await problemMessage(response));
      const updated = await response.json() as { status: MatchSubmissionView["status"]; revision: number };
      mutationKeys.complete(uploadTicket);
      setSubmission((current) => current ? { ...current, status: updated.status, revision: updated.revision, receivedGameNumbers: [...current.receivedGameNumbers, gameNumber].sort() } : current);
      setMessage(`${gameNumber}게임 이미지가 등록됐어요. OCR 후보는 관리자가 확인한 뒤에만 경기로 반영됩니다.`);
    } catch (caught) {
      try {
        const reconcile = await fetch(`/api/me/match-submissions/${submission.publicCode}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (reconcile.ok) {
          const latest = await reconcile.json() as { submission: MatchSubmissionView };
          setSubmission(latest.submission);
          if (latest.submission.receivedGameNumbers.includes(gameNumber)) {
            if (uploadTicket) mutationKeys.complete(uploadTicket);
            setError(false);
            setMessage(`${gameNumber}게임 이미지 등록 여부를 서버에서 다시 확인했습니다.`);
            return;
          }
        }
      } catch { /* retain the original failure */ }
      setError(true);
      setMessage(`${caught instanceof Error ? caught.message : "이미지 업로드에 실패했어요."} 같은 파일은 같은 요청으로 확인하고, 다른 파일은 새 요청으로 안전하게 재개합니다.`);
    } finally { setBusy(false); }
  }

  async function updateSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission) return;
    const data = new FormData(event.currentTarget);
    const startedLocal = String(data.get("startedAt") ?? "");
    const body = {
      seasonId: String(data.get("seasonId") ?? "") || null,
      title: String(data.get("title") ?? ""),
      organizer: String(data.get("organizer") ?? ""),
      seriesNumber: Number(data.get("seriesNumber")),
      note: String(data.get("note") ?? "") || null,
      playedOn: String(data.get("playedOn") ?? ""),
      startedAt: startedLocal ? `${startedLocal}:00+09:00` : null,
      expectedGameCount: Number(data.get("expectedGameCount")),
      teamBalanceDraftId: submission.teamBalanceDraftId,
    };
    setBusy(true); setError(false); setMessage("접수 정보를 수정하고 있어요…");
    const commandTicket = mutationKeys.issue(
      `PATCH:/api/me/match-submissions/${submission.id}`,
      submission.revision,
      body,
    );
    try {
      const response = await fetch(`/api/me/match-submissions/${submission.publicCode}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${submission.revision}"`,
          "Idempotency-Key": commandTicket.key,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await problemMessage(response));
      const updated = await response.json() as { status: MatchSubmissionView["status"]; revision: number };
      mutationKeys.complete(commandTicket);
      setSubmission((current) => current ? {
        ...current,
        ...body,
        seasonName: seasons.find((season) => season.id === body.seasonId)?.name ?? null,
        status: updated.status,
        revision: updated.revision,
      } : current);
      setEditing(false);
      setMessage("접수 정보를 수정했습니다.");
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "접수 수정에 실패했어요.");
    } finally { setBusy(false); }
  }

  async function cancelSubmission() {
    if (!submission || !window.confirm("이 접수를 취소할까요? 등록된 비공개 이미지는 정리 대기 상태로 전환됩니다.")) return;
    setBusy(true); setError(false); setMessage("접수를 취소하고 있어요…");
    const commandTicket = mutationKeys.issue(
      `POST:/api/me/match-submissions/${submission.id}/cancel`,
      submission.revision,
      {},
    );
    try {
      const response = await fetch(`/api/me/match-submissions/${submission.publicCode}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${submission.revision}"`,
          "Idempotency-Key": commandTicket.key,
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(await problemMessage(response));
      const updated = await response.json() as { status: MatchSubmissionView["status"]; revision: number };
      mutationKeys.complete(commandTicket);
      setSubmission((current) => current ? { ...current, status: updated.status, revision: updated.revision } : current);
      setEditing(false);
      setMessage("접수를 취소했습니다. 이미지는 공개되지 않으며 정리 대기 상태입니다.");
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "접수 취소에 실패했어요.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <section className={styles.panel} aria-labelledby="resume-title">
        <h2 id="resume-title">접수 코드로 이어하기</h2>
        <form className={styles.resume} onSubmit={continueByCode}><input value={resumeCode} onChange={(event) => setResumeCode(event.target.value)} maxLength={19} placeholder="MR2…" aria-label="접수 코드" /><button type="submit">불러오기</button></form><Link href="/matches/submissions">내 접수 기록 전체 보기</Link>
      </section>
      {message ? <p className={styles.status} data-error={error} role={error ? "alert" : "status"}>{message}</p> : null}
      {!submission ? (
        <section className={styles.panel} aria-labelledby="new-submission-title">
          <h2 id="new-submission-title">새 결과 접수</h2>
          <form className={styles.form} onSubmit={createSubmission}>
            <label className={styles.wide}>경기 제목<input name="title" required maxLength={160} /></label>
            <label>주최자<input name="organizer" required maxLength={100} /></label>
            <label>회차<input name="seriesNumber" type="number" min={1} max={9999} defaultValue={1} required /></label>
            <label>플레이 날짜<input name="playedOn" type="date" required /></label>
            <label>시작 시각(KST, 선택)<input name="startedAt" type="datetime-local" /></label>
            <label>예상 게임 수<select name="expectedGameCount" defaultValue="2"><option value="2">2게임</option><option value="3">3게임</option></select></label>
            <label>시즌(선택)<select name="seasonId" defaultValue=""><option value="">미지정 — 관리자 검토 시 매핑</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label className={styles.wide}>비공개 전달 메모<textarea name="note" maxLength={1000} /></label>
            <button type="submit" disabled={busy}>접수 만들기</button>
          </form>
        </section>
      ) : (
        <section className={styles.panel} aria-labelledby="upload-title">
          <div className={styles.code}><span>이어하기 코드</span><strong>{submission.publicCode}</strong><button type="button" onClick={() => { void navigator.clipboard.writeText(submission.publicCode).then(() => { setError(false); setMessage("이어하기 코드를 복사했습니다."); }, () => { setError(true); setMessage("클립보드에 접근할 수 없어 코드를 직접 복사해 주세요."); }); }}>복사</button></div>
          <h2 id="upload-title">게임별 스코어보드</h2>
          <p>{submission.title} · {submission.organizer} · 현재 상태 {STATUS_LABEL[submission.status]}</p>
          {submission.status === "AWAITING_UPLOAD" ? <div className={styles.actions}><button type="button" disabled={busy} onClick={() => setEditing((current) => !current)}>{editing ? "수정 닫기" : "접수 정보 수정"}</button><button type="button" disabled={busy} data-danger="true" onClick={cancelSubmission}>접수 취소</button></div> : submission.status === "PENDING_REVIEW" ? <div className={styles.actions}><button type="button" disabled={busy} data-danger="true" onClick={cancelSubmission}>검토 요청 취소</button></div> : null}
          {editing ? <form className={styles.form} onSubmit={updateSubmission}>
            <label className={styles.wide}>경기 제목<input name="title" required maxLength={160} defaultValue={submission.title} /></label>
            <label>주최자<input name="organizer" required maxLength={100} defaultValue={submission.organizer} /></label>
            <label>회차<input name="seriesNumber" type="number" min={1} defaultValue={submission.seriesNumber} required /></label>
            <label>플레이 날짜<input name="playedOn" type="date" defaultValue={submission.playedOn} required /></label>
            <label>시작 시각(KST, 선택)<input name="startedAt" type="datetime-local" defaultValue={submission.startedAt ? new Date(new Date(submission.startedAt).getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) : ""} /></label>
            <label>예상 게임 수<select name="expectedGameCount" defaultValue={submission.expectedGameCount} disabled={submission.receivedGameNumbers.length > 0}><option value="2">2게임</option><option value="3">3게임</option></select>{submission.receivedGameNumbers.length > 0 ? <input type="hidden" name="expectedGameCount" value={submission.expectedGameCount} /> : null}</label>
            <label>시즌(선택)<select name="seasonId" defaultValue={submission.seasonId ?? ""}><option value="">미지정 — 관리자 검토 시 매핑</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label className={styles.wide}>비공개 전달 메모<textarea name="note" maxLength={1000} defaultValue={submission.note ?? ""} /></label>
            <button type="submit" disabled={busy}>수정 저장</button>
          </form> : null}
          <div className={styles.uploadGrid}>
            {Array.from({ length: submission.expectedGameCount }, (_, index) => index + 1).map((gameNumber) => {
              const done = submission.receivedGameNumbers.includes(gameNumber);
              return <label className={styles.upload} data-done={done} key={gameNumber}><strong>{gameNumber}게임 {done ? "등록 완료" : "이미지"}</strong><span>PNG · JPEG · WebP, 최대 4MiB</span>{done ? null : <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => upload(gameNumber, event.target.files?.[0])} />}</label>;
            })}
          </div>
          <p className={styles.help}>업로드한 이미지는 본인과 관리자만 볼 수 있어요. 모든 이미지를 제출하면 관리자가 시즌과 10명 로스터를 확인한 뒤 결과를 승인합니다.</p>
        </section>
      )}
    </>
  );
}
