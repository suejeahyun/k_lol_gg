"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import SelectedImageGrid from "@/components/submissions/SelectedImageGrid";
import styles from "./page.module.css";

type Task = {
  publicCode: string;
  category: string;
  targetName: string;
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

function statusLabel(status: string) {
  return status === "PENDING_REVIEW" ? "관리자 검토 대기" : status === "REJECTED" ? "반려 · 안내된 보완 내용을 확인해주세요" : "사진 제출 중";
}

export default function DisciplineEvidenceSubmitClient({ tasks: initialTasks, initialCode = "" }: { tasks: Task[]; initialCode?: string }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedCode, setSelectedCode] = useState(initialTasks.find((task) => task.publicCode === initialCode)?.publicCode || initialTasks.find((task) => task.status !== "PENDING_REVIEW")?.publicCode || initialTasks[0]?.publicCode || "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(() => tasks.find((task) => task.publicCode === selectedCode) || null, [selectedCode, tasks]);
  const remaining = selected ? Math.max(0, selected.requiredGameCount - selected.receivedImageCount) : 0;

  useEffect(() => {
    if (!selectedCode || initialCode) return;
    window.history.replaceState(window.history.state, "", `/discipline/evidence?code=${encodeURIComponent(selectedCode)}`);
  }, [initialCode, selectedCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (selected.status === "PENDING_REVIEW" || remaining <= 0) {
      setError("이미 사진 제출이 완료되어 관리자 검토 대기 중입니다.");
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
        const response = await fetch(`/api/discipline/tasks/${encodeURIComponent(selected.publicCode)}/evidence`, { method: "POST", body: data });
        const result = await response.json().catch(() => ({})) as UploadResult;
        if (!response.ok) {
          setFiles(files.slice(index));
          throw new Error(result.message || `${imageNumber}번째 사진 업로드에 실패했습니다. 실패한 사진부터 다시 시도할 수 있습니다.`);
        }
        received = result.receivedImageCount ?? received + 1;
        setFiles(files.slice(index + 1));
        setTasks((current) => current.map((task) => task.publicCode === selected.publicCode ? { ...task, receivedImageCount: received, status: result.status || task.status } : task));
      }
      setFiles([]);
      setProgress("");
      const nextRemaining = Math.max(0, selected.requiredGameCount - received);
      setMessage(nextRemaining === 0
        ? `${selected.publicCode} 사진 ${received}/${selected.requiredGameCount}장이 모두 제출되었습니다. 관리자 검토를 기다려주세요.`
        : `${selected.publicCode} 사진 ${received}/${selected.requiredGameCount}장이 저장되었습니다. 남은 사진 ${nextRemaining}장은 나중에 이어서 제출할 수 있습니다.`);
    } catch (submitError) {
      setProgress("");
      setError(submitError instanceof Error ? submitError.message : "사진 제출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      {tasks.length === 0 ? <div className={styles.empty}><h2>{initialCode ? `${initialCode} 과제를 찾을 수 없습니다.` : "제출할 경고 차감 과제가 없습니다."}</h2><p>{initialCode ? "접수번호와 로그인 계정의 접근 권한을 확인해주세요." : "활성 과제가 생기면 이 화면에 자동으로 표시됩니다."}</p></div> : <form onSubmit={(event) => void submit(event)}>
        <label className={styles.label}>인증 과제<select value={selectedCode} onChange={(event) => { const nextCode = event.target.value; setSelectedCode(nextCode); setFiles([]); setError(""); setMessage(""); window.history.replaceState(window.history.state, "", `/discipline/evidence?code=${encodeURIComponent(nextCode)}`); }}>{tasks.map((task) => <option key={task.publicCode} value={task.publicCode}>{task.publicCode} · {task.category === "INHOUSE" ? "내전" : "일반"} · {task.receivedImageCount}/{task.requiredGameCount}장</option>)}</select></label>
        {selected ? <div className={styles.status}><strong>{selected.targetName}</strong><span>{statusLabel(selected.status)}</span><span>사진 {selected.receivedImageCount}/{selected.requiredGameCount}장</span><span>기한 {selected.dueDate}</span>{selected.status === "REJECTED" && selected.reviewNote ? <span role="alert">반려 사유: {selected.reviewNote}</span> : null}</div> : null}
        {selected && remaining > 0 && selected.status !== "PENDING_REVIEW" ? <label className={styles.fileField}><span>이번에 제출할 사진 (1~{remaining}장)</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { setFiles(Array.from(event.target.files || [])); setError(""); }} /><small>PNG·JPG·WebP, 장당 3MB 이하 · 같은 사진은 중복 제출할 수 없습니다. 한 번에 모두 모이지 않아도 일부 저장 후 이어서 제출할 수 있습니다.</small><strong>{files.length ? `${files.length}장 선택됨` : "사진 선택"}</strong></label> : null}
        <SelectedImageGrid
          files={files}
          startNumber={(selected?.receivedImageCount ?? 0) + 1}
          label="번째"
          disabled={busy}
          onChange={setFiles}
        />
        {progress ? <p className={styles.progress} role="status">{progress}</p> : null}
        {message ? <p className={styles.success} role="status">{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.actions}>{selected && remaining > 0 && selected.status !== "PENDING_REVIEW" ? <button className="app-button" disabled={busy || files.length === 0} type="submit">{busy ? "업로드 중…" : files.length ? `선택한 사진 ${files.length}장 제출` : `사진 1~${remaining}장 선택`}</button> : null}<Link className="app-button app-button--secondary" href="/discipline">징계 현황</Link></div>
      </form>}
    </section>
  );
}
