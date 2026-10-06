"use client";
import { recordUsageAction } from "@/components/usage/usage-actions";

import { useRef, useState, useTransition } from "react";
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
type TeamBalanceDraftOption = Readonly<{
  id: string;
  title: string;
  status: "EVALUATED" | "SAVED";
}>;
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
  requestedTeamBalanceDraftId,
  teamBalanceDraft,
}: {
  viewer: "ANONYMOUS" | "APPROVED" | "RESTRICTED" | "PASSWORD_CHANGE_REQUIRED" | "UNAVAILABLE" | "LOAD_ERROR";
  seasons: readonly SeasonOption[];
  initial: MatchSubmissionView | null;
  requestedCode: string | null;
  requestedTeamBalanceDraftId: string | null;
  teamBalanceDraft: TeamBalanceDraftOption | null;
}) {
  const router = useRouter();
  const [submission, setSubmission] = useState(initial);
  const [resumeCode, setResumeCode] = useState(requestedCode ?? "");
  const [message, setMessage] = useState(
    requestedCode && !initial ? "이 계정에서 이어갈 수 있는 접수를 찾지 못했어요." : "",
  );
  const [error, setError] = useState(Boolean(requestedCode && !initial));
  const [mutationPending, setBusy] = useState(false);
  const [navigationPending, startNavigation] = useTransition();
  const busy = mutationPending || navigationPending;
  const [editing, setEditing] = useState(false);
  const mutationKeys = useRef(new ClientMatchMutationKeyStore("match-submission")).current;
  const createRequestIds = useRef(new ClientMatchMutationKeyStore("match-submission-request")).current;

  const next = requestedCode
    ? `/matches/submit?code=${encodeURIComponent(requestedCode)}`
    : requestedTeamBalanceDraftId
      ? `/matches/submit?teamBalanceDraftId=${encodeURIComponent(requestedTeamBalanceDraftId)}`
      : "/matches/submit";
  if (viewer === "ANONYMOUS") {
    return <section className={styles.panel}><h2>로그인하고 경기 결과를 제출하세요</h2><p>결과 이미지는 본인과 운영자만 볼 수 있습니다.</p><Link className={styles.login} href={`/login?next=${encodeURIComponent(next)}`}>로그인하고 제출하기</Link></section>;
  }
  if (viewer === "RESTRICTED") {
    return <section className={styles.panel} role="status"><h2>현재 계정은 결과 제출이 제한되어 있어요.</h2><p>내 계정에서 승인·이용 상태를 확인해 주세요. </p><Link className={styles.login} href="/account">내 계정 상태 확인</Link></section>;
  }
  if (viewer === "PASSWORD_CHANGE_REQUIRED") {
    return <section className={styles.panel} role="status"><h2>먼저 비밀번호를 변경해 주세요.</h2><p>비밀번호를 변경하면 이 접수 화면으로 돌아와 계속할 수 있어요.</p><Link className={styles.login} href={`/account/password?required=1&next=${encodeURIComponent(next)}`}>비밀번호 변경 후 계속하기</Link></section>;
  }
  if (viewer === "UNAVAILABLE" || viewer === "LOAD_ERROR") {
    return <section className={styles.panel} role={viewer === "LOAD_ERROR" ? "alert" : "status"}><h2>{viewer === "LOAD_ERROR" ? "접수 정보를 불러오지 못했어요." : "결과 접수를 이용할 수 없어요."}</h2><p>접수 코드와 팀 초안 선택은 유지됩니다. 잠시 후 다시 불러와 주세요.</p><form action="/matches/submit" method="get" className={styles.actions}>{requestedCode ? <input type="hidden" name="code" value={requestedCode} /> : null}{requestedTeamBalanceDraftId ? <input type="hidden" name="teamBalanceDraftId" value={requestedTeamBalanceDraftId} /> : null}<button type="submit">다시 불러오기</button></form><Link href="/matches/submissions">내 제출 기록 보기</Link></section>;
  }
  if (requestedTeamBalanceDraftId && !teamBalanceDraft) {
    return <section className={styles.panel} role="alert"><h2>팀 초안을 연결할 수 없어요</h2><p>현재 적용된 최신 팀 배치인지 확인한 뒤 다시 접수해 주세요.</p><Link href="/tools/team-balance/drafts">팀 밸런스 초안 목록으로 이동</Link></section>;
  }

  function continueByCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^MR2[0-9A-F]{16}$/.test(resumeCode)) {
      setError(true); setMessage("MR2로 시작하는 대문자 접수 코드 19자를 확인해 주세요."); return;
    }
    startNavigation(() => router.push(`/matches/submit?code=${encodeURIComponent(resumeCode)}`));
  }

  async function createSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
      teamBalanceDraftId: teamBalanceDraft?.id ?? null,
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
      recordUsageAction("match.submitted");
      const next: MatchSubmissionView = {
        id: created.submissionId, publicCode: created.publicCode, seasonId: body.seasonId,
        seasonName: seasons.find((season) => season.id === body.seasonId)?.name ?? null,
        title: body.title, organizer: body.organizer, seriesNumber: body.seriesNumber, note: body.note,
        playedOn: body.playedOn, startedAt: body.startedAt, expectedGameCount: body.expectedGameCount,
        teamBalanceDraftId: body.teamBalanceDraftId, source: "WEB", receivedGameNumbers: [], status: created.status,
        publicReviewReason: null, approvedMatchSeriesId: null, revision: created.revision,
        updatedAt: new Date().toISOString(),
      };
      setSubmission(next); setResumeCode(created.publicCode); setMessage("경기 정보를 저장했어요. 이제 게임별 결과 이미지를 올려 주세요.");
      startNavigation(() => router.replace(`/matches/submit?code=${created.publicCode}`, { scroll: false }));
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "접수 생성에 실패했어요.");
    } finally { setBusy(false); }
  }

  async function upload(gameNumber: number, file: File | undefined) {
    if (busy || !submission || !file) return;
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
      setMessage(`${gameNumber}게임 이미지가 등록됐어요. 모든 이미지를 올리면 운영자에게 검토를 요청합니다.`);
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
            setMessage(`${gameNumber}게임 이미지가 등록된 것을 확인했어요. 다시 올리지 않아도 됩니다.`);
            return;
          }
        }
      } catch { /* retain the original failure */ }
      setError(true);
      setMessage(`${caught instanceof Error ? caught.message : "이미지를 올리지 못했어요."} 아래에서 파일을 다시 선택해 주세요. 이미 등록된 이미지는 중복 저장하지 않아요.`);
    } finally { setBusy(false); }
  }

  async function updateSubmission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !submission) return;
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
    if (busy || !submission || !window.confirm("이 결과 접수를 취소할까요? 취소한 접수는 다시 수정할 수 없어요.")) return;
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
      setMessage("접수를 취소했습니다. 제출한 이미지는 공개되지 않아요.");
    } catch (caught) {
      setError(true); setMessage(caught instanceof Error ? caught.message : "접수 취소에 실패했어요.");
    } finally { setBusy(false); }
  }

  const currentStep = !submission ? 0 : submission.status === "AWAITING_UPLOAD" ? 1 : 2;
  const recoveringCode = Boolean(requestedCode && !submission);
  return (
    <>
      {!recoveringCode ? <ol className={styles.steps} aria-label="결과 제출 진행 단계">
        {["경기 정보", "결과 이미지", "접수 상태"].map((label, index) => {
          const complete = index < currentStep && (index !== 1 || submission?.receivedGameNumbers.length === submission?.expectedGameCount);
          return <li key={label} aria-current={index === currentStep ? "step" : undefined} data-complete={complete}><span aria-hidden="true">{complete ? "✓" : index + 1}</span>{label}</li>;
        })}
      </ol> : null}
      {message ? <p className={styles.status} data-error={error} data-busy={busy ? "true" : undefined} role={error ? "alert" : "status"}>{message}</p> : null}
      {recoveringCode ? null : !submission ? (
        <section className={styles.panel} aria-labelledby="new-submission-title">
          <h2 id="new-submission-title">새 결과 접수</h2>
          {teamBalanceDraft ? <div className={styles.linkedDraft} role="status"><span>연결된 팀</span><strong>{teamBalanceDraft.title}</strong><small>{teamBalanceDraft.status === "SAVED" ? "저장된 팀 배치" : "현재 팀 배치"} · 참가자·팀 구성 연결</small></div> : null}
          <form className={styles.form} onSubmit={createSubmission}>
            <label className={styles.wide}>경기 제목<input name="title" required maxLength={160} placeholder="예: 화요일 저녁 내전" defaultValue={teamBalanceDraft?.title ?? ""} /></label>
            <label>주최자<input name="organizer" required maxLength={100} placeholder="경기를 진행한 사람의 닉네임" /></label>
            <label>경기한 날짜<input name="playedOn" type="date" required /></label>
            <label>같은 날 경기 회차<input name="seriesNumber" type="number" min={1} max={9999} defaultValue={1} required /></label>
            <label>진행한 게임 수<select name="expectedGameCount" defaultValue="2"><option value="2">2게임 · 이미지 2장</option><option value="3">3게임 · 이미지 3장</option></select></label>
            <details className={styles.optionalFields}>
              <summary>추가 정보 <span>선택 · 시즌, 시작 시각, 메모</span></summary>
              <div className={styles.optionalGrid}>
                <label>시즌<select name="seasonId" defaultValue=""><option value="">운영자가 확인 후 선택</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
                <label>시작 시각 · 한국 시간<input name="startedAt" type="datetime-local" /></label>
                <label className={styles.wide}>운영자에게 전달할 메모<textarea name="note" maxLength={1000} placeholder="경기 결과와 함께 확인할 내용이 있으면 적어 주세요." /></label>
              </div>
            </details>
            <button type="submit" disabled={busy}>{busy ? "저장 중…" : "다음: 결과 이미지 올리기"}</button>
          </form>
        </section>
      ) : (
        <section className={styles.panel} data-submission-status={submission.status} aria-busy={busy} aria-labelledby="upload-title">
          <div className={styles.panelHeading}><h2 id="upload-title">{submission.status === "AWAITING_UPLOAD" ? "게임별 결과 이미지" : "제출한 경기 결과"}</h2><span className={styles.stateBadge}>{STATUS_LABEL[submission.status]}</span></div>
          <p className={styles.submissionMeta}>{submission.title} · {submission.organizer}</p>
          {submission.publicReviewReason ? <p>검토 결과: {submission.publicReviewReason}</p> : null}
          {submission.approvedMatchSeriesId ? <Link className={styles.login} href={`/matches/${submission.approvedMatchSeriesId}`}>승인된 공개 경기 보기</Link> : null}
          {submission.status === "REJECTED" ? <p className={styles.help}>거절된 접수는 이미지를 추가하거나 직접 수정할 수 없어요. 보완이 필요하면 접수 코드와 함께 <Link href="/help/contact">운영팀에 문의</Link>해 주세요.</p> : null}
          {submission.status === "CANCELLED" ? <p className={styles.help}>취소된 접수에는 이미지를 추가할 수 없어요. 다시 제출하려면 새 접수를 만들어 주세요.</p> : null}
          <div className={styles.uploadProgress} role="progressbar" aria-label={`스코어보드 이미지 ${submission.expectedGameCount}장 중 ${submission.receivedGameNumbers.length}장 등록`} aria-valuemin={0} aria-valuemax={submission.expectedGameCount} aria-valuenow={submission.receivedGameNumbers.length}>
            <span><strong>{submission.receivedGameNumbers.length}</strong> / {submission.expectedGameCount}장 등록</span>
            <i aria-hidden="true"><b style={{ width: `${submission.receivedGameNumbers.length / submission.expectedGameCount * 100}%` }} /></i>
          </div>
          {submission.status === "AWAITING_UPLOAD" ? <div className={styles.actions}><button type="button" disabled={busy} onClick={() => setEditing((current) => !current)}>{editing ? "수정 닫기" : "접수 정보 수정"}</button><button type="button" disabled={busy} data-danger="true" onClick={cancelSubmission}>접수 취소</button></div> : submission.status === "PENDING_REVIEW" ? <div className={styles.actions}><button type="button" disabled={busy} data-danger="true" onClick={cancelSubmission}>검토 요청 취소</button></div> : null}
          {editing ? <form className={styles.form} onSubmit={updateSubmission}>
            <label className={styles.wide}>경기 제목<input name="title" required maxLength={160} defaultValue={submission.title} /></label>
            <label>주최자<input name="organizer" required maxLength={100} defaultValue={submission.organizer} /></label>
            <label>회차<input name="seriesNumber" type="number" min={1} defaultValue={submission.seriesNumber} required /></label>
            <label>경기한 날짜<input name="playedOn" type="date" defaultValue={submission.playedOn} required /></label>
            <label>시작 시각 · 한국 시간 (선택)<input name="startedAt" type="datetime-local" defaultValue={submission.startedAt ? new Date(new Date(submission.startedAt).getTime() + 9 * 60 * 60_000).toISOString().slice(0, 16) : ""} /></label>
            <label>진행한 게임 수<select name="expectedGameCount" defaultValue={submission.expectedGameCount} disabled={submission.receivedGameNumbers.length > 0}><option value="2">2게임</option><option value="3">3게임</option></select>{submission.receivedGameNumbers.length > 0 ? <input type="hidden" name="expectedGameCount" value={submission.expectedGameCount} /> : null}</label>
            <label>시즌(선택)<select name="seasonId" defaultValue={submission.seasonId ?? ""}><option value="">운영자가 확인 후 선택</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <label className={styles.wide}>비공개 전달 메모<textarea name="note" maxLength={1000} defaultValue={submission.note ?? ""} /></label>
            <button type="submit" disabled={busy}>수정 저장</button>
          </form> : null}
          <div className={styles.uploadGrid}>
            {Array.from({ length: submission.expectedGameCount }, (_, index) => index + 1).map((gameNumber) => {
              const done = submission.receivedGameNumbers.includes(gameNumber);
              return <label className={styles.upload} data-done={done} key={gameNumber}><strong>{gameNumber}게임 {done ? "등록 완료" : "이미지"}</strong><span>PNG · JPEG · WebP, 최대 4MiB</span>{!done && submission.status === "AWAITING_UPLOAD" ? <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void upload(gameNumber, file);
              }} /> : null}</label>;
            })}
          </div>
          {submission.status === "AWAITING_UPLOAD" || submission.status === "PENDING_REVIEW" ? <p className={styles.help}>{submission.status === "AWAITING_UPLOAD" ? "승패·참가자 10명이 보이는 종료 화면 · 본인·운영자만 열람" : "이미지 제출 완료 · 운영자 검토 후 전적 반영"}</p> : null}
          <div className={styles.actions}><Link href="/matches/submissions">내 제출 기록</Link><Link href="/matches/submit">새 결과 접수</Link></div>
          <div className={styles.code}><span>접수 코드</span><strong>{submission.publicCode}</strong><button type="button" onClick={() => { void navigator.clipboard.writeText(submission.publicCode).then(() => { setError(false); setMessage("이어하기 코드를 복사했습니다."); }, () => { setError(true); setMessage("클립보드에 접근할 수 없어 코드를 직접 복사해 주세요."); }); }}>코드 복사</button></div>
        </section>
      )}
      <details className={`${styles.panel} ${styles.resumePanel}`} open={recoveringCode}>
        <summary>접수 코드로 이어하기</summary>
        <form className={styles.resume} onSubmit={continueByCode}><input value={resumeCode} onChange={(event) => setResumeCode(event.target.value)} disabled={busy} maxLength={19} placeholder="MR2로 시작하는 접수 코드" aria-label="접수 코드" /><button type="submit" disabled={busy}>불러오기</button></form><Link href="/matches/submissions">코드 없이 내 제출 기록에서 찾기</Link>
        {recoveringCode ? <div className={styles.actions}><Link href="/matches/submit">새 경기 결과 제출</Link></div> : null}
      </details>
    </>
  );
}
