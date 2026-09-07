/* eslint-disable @next/next/no-img-element -- object URLs are local private previews and must bypass image optimization */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPaste, ScanLine } from "lucide-react";

import {
  clearAdminImportRecovery,
  loadAdminImportRecovery,
  saveAdminImportRecovery,
} from "@/modules/matches/infrastructure/admin-import-recovery";
import {
  parseAdminImportLatestProjection,
  planAdminImportUploadFailure,
} from "@/modules/matches/infrastructure/admin-import-retry";

import styles from "../matches-admin.module.css";

type SeasonOption = Readonly<{ id: string; name: string; status: string }>;

async function problemMessage(response: Response) {
  try {
    const body = await response.json() as { title?: unknown; detail?: unknown };
    if (typeof body.title === "string" && typeof body.detail === "string") {
      return `${body.title} ${body.detail}`;
    }
  } catch { /* safe fallback */ }
  return "가져오기 요청을 처리하지 못했습니다.";
}

function commandKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}-${Date.now().toString(36)}`;
}

export function AdminImportPanel({ seasons, playedOn }: { seasons: readonly SeasonOption[]; playedOn: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdSubmissionId, setCreatedSubmissionId] = useState<string | null>(null);
  const [createdRevision, setCreatedRevision] = useState<number | null>(null);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() => commandKey("admin-import-create"));
  const [uploadIdempotencyKey, setUploadIdempotencyKey] = useState(() => commandKey("admin-import-upload"));
  const [sameKeyReplayRequired, setSameKeyReplayRequired] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parsed = loadAdminImportRecovery();
      if (parsed) {
        setCreatedSubmissionId(parsed.submissionId);
        setCreatedRevision(parsed.revision);
        setUploadIdempotencyKey(parsed.uploadKey);
        setSameKeyReplayRequired(true);
        setMessage("이전에 만들던 비공개 가져오기 작업을 복구했습니다. 같은 이미지로 업로드를 이어가거나 검토 작업을 여세요.");
      } else clearAdminImportRecovery();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!createdSubmissionId || createdRevision === null) return;
    saveAdminImportRecovery({
      submissionId: createdSubmissionId,
      revision: createdRevision,
      uploadKey: uploadIdempotencyKey,
    });
  }, [createdRevision, createdSubmissionId, uploadIdempotencyKey]);

  function choose(next: File | null) {
    if (!next) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(next.type)) || next.size < 12 || next.size > 8 * 1_024 * 1_024) {
      setError(true); setMessage("PNG, JPEG, WebP 8MiB 이하 이미지를 선택해 주세요."); return;
    }
    if (preview) URL.revokeObjectURL(preview);
    if (!sameKeyReplayRequired) setUploadIdempotencyKey(commandKey("admin-import-upload"));
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError(false);
    setMessage(sameKeyReplayRequired
      ? "결과가 모호했던 요청을 복구합니다. 반드시 이전 요청과 동일한 이미지를 선택하고 다시 시도해 주세요."
      : "이미지를 선택했습니다. 기본 정보를 확인한 뒤 OCR 후보 만들기를 눌러 주세요.");
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = [...event.clipboardData.items]
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile() ?? null;
    if (!pasted) {
      setError(true); setMessage("클립보드에서 이미지를 찾지 못했습니다."); return;
    }
    choose(pasted);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError(true); setMessage("스코어보드 이미지를 먼저 선택해 주세요."); return; }
    const data = new FormData(event.currentTarget);
    const startedLocal = String(data.get("startedAt") ?? "");
    const createBody = {
      seasonId: String(data.get("seasonId") ?? "") || null,
      title: String(data.get("title") ?? ""),
      playedOn: String(data.get("playedOn") ?? ""),
      startedAt: startedLocal ? `${startedLocal}:00+09:00` : null,
    };
    setBusy(true); setError(false); setMessage("비공개 가져오기 작업을 만들고 있어요…");
    try {
      let created = createdSubmissionId && createdRevision !== null
        ? { submissionId: createdSubmissionId, revision: createdRevision }
        : null;
      if (!created) {
        const createdResponse = await fetch("/api/admin/matches/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "If-Match": '"0"',
            "Idempotency-Key": createIdempotencyKey,
          },
          body: JSON.stringify(createBody),
        });
        if (!createdResponse.ok) {
          if (createdResponse.status < 500 && ![408, 425, 429].includes(createdResponse.status)) {
            setCreateIdempotencyKey(commandKey("admin-import-create"));
          }
          throw new Error(await problemMessage(createdResponse));
        }
        created = await createdResponse.json() as { submissionId: string; revision: number };
        setCreatedSubmissionId(created.submissionId);
        setCreatedRevision(created.revision);
      }
      setMessage("이미지를 안전하게 검증하고 OCR 후보를 만들고 있어요…");
      const bytes = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch("/api/admin/matches/import", {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "If-Match": `"${created.revision}"`,
            "Idempotency-Key": uploadIdempotencyKey,
            "X-Content-SHA256": digest,
            "X-Match-Game-Number": "1",
            "X-Match-Import-Id": created.submissionId,
            "X-Upload-File-Name": encodeURIComponent(file.name || "clipboard-scoreboard.png"),
          },
          body: file,
        });
      } catch {
        setSameKeyReplayRequired(true);
        throw new Error("네트워크 응답을 확인하지 못했습니다. 새 요청을 만들지 않고 같은 이미지와 요청 키로 안전하게 다시 확인합니다.");
      }
      if (!uploadResponse.ok) {
        let latest = null;
        if (uploadResponse.status === 409 || uploadResponse.status === 412) {
          try {
            const latestResponse = await fetch(`/api/admin/matches/submissions/${created.submissionId}`, {
              cache: "no-store",
            });
            if (latestResponse.ok) latest = parseAdminImportLatestProjection(await latestResponse.json());
          } catch { /* unavailable reconciliation must preserve the original key */ }
        }
        const plan = planAdminImportUploadFailure({
          uploadStatus: uploadResponse.status,
          currentRevision: created.revision,
          latest,
        });
        if (plan.kind === "OPEN_REVIEW") {
          setCreatedRevision(plan.revision);
          clearAdminImportRecovery();
          setMessage("서버에서 작업 상태가 이미 변경된 것을 확인했습니다. 최신 구조화 검토 화면을 엽니다.");
          router.push(`/admin/matches/submissions/${created.submissionId}`);
          router.refresh();
          return;
        }
        if (plan.kind === "RETRY_NEW_KEY") {
          setCreatedRevision(plan.revision);
          setUploadIdempotencyKey(commandKey("admin-import-upload"));
          setSameKeyReplayRequired(false);
        } else if (plan.kind === "REPLAY_SAME_KEY") {
          setSameKeyReplayRequired(true);
        } else {
          setSameKeyReplayRequired(false);
        }
        const detail = await problemMessage(uploadResponse);
        throw new Error(plan.kind === "REPLAY_SAME_KEY"
          ? `${detail} 결과가 모호하므로 같은 이미지와 요청 키를 보존해 다시 확인합니다.`
          : plan.kind === "RETRY_NEW_KEY"
            ? `${detail} 최신 revision을 확인했습니다. 새 요청 키로 다시 시도해 주세요.`
            : `${detail} 다른 이미지를 선택하면 새 요청 키로 다시 시작할 수 있습니다.`);
      }
      clearAdminImportRecovery();
      setMessage("OCR 후보가 준비되었습니다. 구조화 검토 화면으로 이동합니다.");
      router.push(`/admin/matches/submissions/${created.submissionId}`);
      router.refresh();
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "관리자 직접 가져오기에 실패했습니다.");
    } finally { setBusy(false); }
  }

  async function cancelPendingImport() {
    if (!createdSubmissionId || createdRevision === null || !window.confirm("이 비공개 가져오기 작업을 취소하고 저장된 원본 정리를 예약할까요?")) return;
    setBusy(true); setError(false); setMessage("비공개 원본 정리를 예약하고 있어요…");
    try {
      const response = await fetch(`/api/admin/matches/submissions/${createdSubmissionId}/cancel-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${createdRevision}"`,
          "Idempotency-Key": commandKey("admin-import-cancel"),
        },
        body: "{}",
      });
      if (!response.ok) throw new Error(await problemMessage(response));
      clearAdminImportRecovery();
      setCreatedSubmissionId(null);
      setCreatedRevision(null);
      setCreateIdempotencyKey(commandKey("admin-import-create"));
      setUploadIdempotencyKey(commandKey("admin-import-upload"));
      setSameKeyReplayRequired(false);
      setMessage("가져오기를 취소했고 비공개 원본 정리를 예약했습니다.");
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : "가져오기 취소에 실패했습니다.");
    } finally { setBusy(false); }
  }

  return <section className={styles.panel}>
    <div><h2>Windows 캡처 · 비공개 OCR 가져오기</h2><p>Ctrl/Cmd+V 또는 파일 선택으로 한 게임 스코어보드를 등록합니다. 원본은 비공개이며 OCR은 후보만 만들고, 구조화 검토 후 명시적으로 승인해야 공개됩니다.</p></div>
    {message ? <p className={styles.message} data-error={error} role={error ? "alert" : "status"}>{message}</p> : null}
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.wide}>경기 이름<input name="title" minLength={2} maxLength={160} required placeholder="예: 관리자 직접 입력 1게임" /></label>
      <label>시즌 (검토 전 미지정 가능)<select name="seasonId" defaultValue=""><option value="">미지정</option>{seasons.map((season) => <option key={season.id} value={season.id} disabled={season.status === "RETIRED"}>{season.name}</option>)}</select></label>
      <label>경기 날짜 (KST)<input name="playedOn" type="date" defaultValue={playedOn} required /></label>
      <label>시작 시각 (KST, 선택)<input name="startedAt" type="datetime-local" /></label>
      <label>이미지 파일<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => choose(event.target.files?.[0] ?? null)} /></label>
      <div className={`${styles.paste} ${styles.wide}`} tabIndex={0} onPaste={onPaste} aria-label="스코어보드 이미지 붙여넣기 영역">
        {preview ? <img src={preview} alt="선택한 비공개 스코어보드 미리보기" /> : <p><ClipboardPaste aria-hidden="true" /><br />이 영역을 선택하고 Ctrl/Cmd+V로 캡처를 붙여넣으세요.</p>}
      </div>
      <div className={`${styles.actions} ${styles.wide}`}><button className={styles.action} type="submit" disabled={busy || !file}><ScanLine size={17} aria-hidden="true" /> {error && createdSubmissionId ? "비공개 업로드 다시 시도" : "비공개 저장·OCR 후보 만들기"}</button>{createdSubmissionId ? <button data-danger="true" type="button" disabled={busy} onClick={cancelPendingImport}>가져오기 취소·원본 정리</button> : null}</div>
    </form>
    {createdSubmissionId && error ? <p>가져오기 작업은 보존되어 있습니다. <Link href={`/admin/matches/submissions/${createdSubmissionId}`}>검토 작업 열기</Link></p> : null}
  </section>;
}
