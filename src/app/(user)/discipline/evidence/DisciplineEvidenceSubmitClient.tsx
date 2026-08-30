"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import SelectedImageGrid from "@/components/submissions/SelectedImageGrid";
import styles from "./page.module.css";

type Task = {
  /** 기존 카카오 링크와 업로드 API 호환을 위한 내부 식별자이며 화면에는 표시하지 않습니다. */
  publicCode: string;
  category: string;
  reason: string;
  issuedDate: string;
  status: string;
  requiredGameCount: number;
  receivedImageCount: number;
  dueDate: string;
  reviewNote: string | null;
};

type UploadResult = {
  message?: string;
  receivedImageCount?: number;
  requiredGameCount?: number;
  status?: string;
};

const UPLOADABLE_STATUSES = new Set(["REQUIRED", "AWAITING_UPLOAD", "REJECTED"]);

function statusLabel(status: string) {
  if (status === "PENDING_REVIEW") return "관리자 검토 대기";
  if (status === "REJECTED") return "보완 제출 필요";
  if (status === "REQUIRED") return "사진 제출 필요";
  return "사진 제출 중";
}

function categoryLabel(category: string) {
  return category === "INHOUSE" ? "내전 경고" : "일반 경고";
}

export default function DisciplineEvidenceSubmitClient({
  tasks: initialTasks,
  initialCode = "",
}: {
  tasks: Task[];
  initialCode?: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedCode, setSelectedCode] = useState(
    initialTasks.find((task) => task.publicCode === initialCode)?.publicCode
      || (initialTasks.length === 1 ? initialTasks[0]?.publicCode : "")
      || "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(
    () => tasks.find((task) => task.publicCode === selectedCode) || null,
    [selectedCode, tasks],
  );
  const remaining = selected
    ? Math.max(0, selected.requiredGameCount - selected.receivedImageCount)
    : 0;
  const canUpload = Boolean(
    selected
      && UPLOADABLE_STATUSES.has(selected.status)
      && remaining > 0,
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("code")) return;
    url.searchParams.delete("code");
    const search = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
    );
  }, []);

  function selectTask(publicCode: string) {
    if (busy) return;
    setSelectedCode(publicCode);
    setFiles([]);
    setError("");
    setMessage("");
    setProgress("");
  }

  function selectFiles(nextFiles: File[]) {
    setMessage("");
    if (!selected || remaining <= 0) {
      setFiles([]);
      return;
    }
    if (nextFiles.length > remaining) {
      setFiles(nextFiles.slice(0, remaining));
      setError(`남은 사진 수에 맞춰 최대 ${remaining}장만 선택했습니다.`);
      return;
    }
    setFiles(nextFiles);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!canUpload) {
      setError("이미 사진 제출이 완료되어 관리자 검토를 기다리고 있습니다.");
      return;
    }
    if (files.length === 0) {
      setError("이번에 제출할 사진을 1장 이상 선택해주세요.");
      return;
    }
    if (files.length > remaining) {
      setError(`이번에는 최대 ${remaining}장까지 제출할 수 있습니다.`);
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    let received = selected.receivedImageCount;
    try {
      for (const [index, file] of files.entries()) {
        const imageNumber = selected.receivedImageCount + index + 1;
        setProgress(`${imageNumber}번째 인증 사진 업로드 중 · 전체 ${imageNumber}/${selected.requiredGameCount}장`);
        const data = new FormData();
        data.set("image", file);
        const response = await fetch(
          `/api/discipline/tasks/${encodeURIComponent(selected.publicCode)}/evidence`,
          { method: "POST", body: data },
        );
        const result = await response.json().catch(() => ({})) as UploadResult;
        if (!response.ok) {
          setFiles(files.slice(index));
          throw new Error(result.message || `${imageNumber}번째 사진 업로드에 실패했습니다. 실패한 사진부터 다시 시도할 수 있습니다.`);
        }
        received = result.receivedImageCount ?? received + 1;
        setFiles(files.slice(index + 1));
        setTasks((current) => current.map((task) => (
          task.publicCode === selected.publicCode
            ? { ...task, receivedImageCount: received, status: result.status || task.status }
            : task
        )));
      }
      setFiles([]);
      setProgress("");
      const nextRemaining = Math.max(0, selected.requiredGameCount - received);
      setMessage(nextRemaining === 0
        ? `사진 ${received}/${selected.requiredGameCount}장이 모두 제출되었습니다. 관리자 검토를 기다려주세요.`
        : `사진 ${received}/${selected.requiredGameCount}장이 저장되었습니다. 남은 사진 ${nextRemaining}장은 나중에 이어서 제출할 수 있습니다.`);
    } catch (submitError) {
      setProgress("");
      setError(submitError instanceof Error ? submitError.message : "사진 제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <h2>제출할 경고 차감 과제가 없습니다.</h2>
          <p>활성 과제가 생기면 로그인한 내 계정 기준으로 이 화면에 자동 표시됩니다.</p>
          <Link className="app-button app-button--secondary" href="/account">내정보로 돌아가기</Link>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset className={styles.taskFieldset}>
            <legend>사진을 제출할 경고를 선택해주세요</legend>
            <div className={styles.taskPicker}>
              {tasks.map((task) => {
                const active = task.publicCode === selectedCode;
                const taskRemaining = Math.max(0, task.requiredGameCount - task.receivedImageCount);
                return (
                  <button
                    aria-pressed={active}
                    className={`${styles.taskCard} ${active ? styles.taskCardActive : ""}`}
                    disabled={busy}
                    key={task.publicCode}
                    onClick={() => selectTask(task.publicCode)}
                    type="button"
                  >
                    <span className={styles.taskCardHead}>
                      <strong>{categoryLabel(task.category)}</strong>
                      <span>{statusLabel(task.status)}</span>
                    </span>
                    <span className={styles.taskReason}>{task.reason}</span>
                    <span className={styles.taskMeta}>
                      <span>발급일 {task.issuedDate}</span>
                      <span>기한 {task.dueDate}</span>
                    </span>
                    <span className={styles.taskCount}>
                      사진 {task.receivedImageCount}/{task.requiredGameCount}장
                      {taskRemaining > 0 && task.status !== "PENDING_REVIEW" ? ` · ${taskRemaining}장 남음` : " · 제출 완료"}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {!selected ? (
            <p className={styles.selectionNotice} role="status">
              경고가 여러 건이면 사진을 제출할 항목을 먼저 선택해주세요. 선택 전에는 사진이 등록되지 않습니다.
            </p>
          ) : null}

          {selected ? (
            <section className={styles.status} aria-live="polite">
              <div className={styles.statusHead}>
                <div>
                  <span>선택한 과제</span>
                  <strong>{categoryLabel(selected.category)}</strong>
                </div>
                <strong>{statusLabel(selected.status)}</strong>
              </div>
              <p>{selected.reason}</p>
              <progress
                aria-label={`사진 제출 진행률 ${selected.receivedImageCount}/${selected.requiredGameCount}장`}
                max={selected.requiredGameCount}
                value={selected.receivedImageCount}
              />
              <div className={styles.statusMeta}>
                <span>제출 {selected.receivedImageCount}/{selected.requiredGameCount}장</span>
                <span>{remaining > 0 ? `남은 사진 ${remaining}장` : "사진 제출 완료"}</span>
                <span>기한 {selected.dueDate}</span>
              </div>
              {selected.status === "REJECTED" && selected.reviewNote ? (
                <p className={styles.reviewNote} role="alert">반려 사유: {selected.reviewNote}</p>
              ) : null}
            </section>
          ) : null}

          {selected && canUpload ? (
            <label className={styles.fileField}>
              <span>이번에 제출할 사진</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                multiple
                onChange={(event) => selectFiles(Array.from(event.target.files || []))}
                type="file"
              />
              <small>PNG·JPG·WebP, 장당 3MB 이하 · 한 번에 1~{remaining}장 · 일부만 먼저 제출하고 나중에 이어서 제출할 수 있습니다.</small>
              <strong>{files.length ? `${files.length}장 선택됨 · 다시 누르면 변경` : "사진 선택"}</strong>
            </label>
          ) : null}

          <SelectedImageGrid
            files={files}
            startNumber={(selected?.receivedImageCount ?? 0) + 1}
            label="번째"
            disabled={busy}
            onChange={selectFiles}
          />
          {progress ? <p className={styles.uploadProgress} role="status">{progress}</p> : null}
          {message ? <p className={styles.success} role="status">{message}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            {selected && canUpload ? (
              <button className="app-button" disabled={busy || files.length === 0} type="submit">
                {busy ? "업로드 중…" : files.length ? `선택한 사진 ${files.length}장 제출` : `사진 1~${remaining}장 선택`}
              </button>
            ) : null}
            <Link className="app-button app-button--secondary" href="/account">내정보로 돌아가기</Link>
          </div>
        </form>
      )}
    </section>
  );
}
