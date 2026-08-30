"use client";

import { useState } from "react";

type DisciplineTaskHandoffProps = {
  /** 기존 API 응답 호환용 내부 식별자입니다. 화면이나 복사 안내에는 노출하지 않습니다. */
  publicCode?: string;
  targetName?: string;
  requiredGameCount?: number;
  targetLinked?: boolean;
};

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("클립보드 복사에 실패했습니다.");
}

export default function DisciplineTaskHandoff({ targetName, requiredGameCount, targetLinked = true }: DisciplineTaskHandoffProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const sitePath = "/discipline/evidence";

  function siteUrl() {
    return new URL(sitePath, window.location.origin).toString();
  }

  async function copy(label: string, value: string) {
    try {
      await writeClipboard(value);
      setCopyStatus(`${label} 복사 완료`);
    } catch (error) {
      setCopyStatus(error instanceof Error ? error.message : "클립보드 복사에 실패했습니다.");
    }
  }

  async function copyGuide() {
    const lines = [
      "[K-LOL.GG 경고 차감 사진 제출 안내]",
      targetName ? `대상: ${targetName}` : "",
      requiredGameCount ? `필요 사진: ${requiredGameCount}장` : "",
      targetLinked
        ? "사이트에 본인 계정으로 로그인하면 제출할 경고가 자동으로 표시됩니다."
        : "사이트 가입과 계정 연결이 끝난 뒤 관리자에게 경고 연결을 요청해주세요.",
      `사이트 제출: ${siteUrl()}`,
    ].filter(Boolean);
    await copy("전체 안내", lines.join("\n"));
  }

  return (
    <section className="admin-card" aria-labelledby="discipline-task-handoff-title" style={{ marginBottom: 16 }}>
      <h2 id="discipline-task-handoff-title">경고 등록 완료 · 대상자 안내</h2>
      <p className="admin-muted">
        {targetLinked
          ? "대상자에게 아래 고정 제출 경로를 안내하세요. 번호 입력 없이 본인 계정의 경고만 자동으로 표시됩니다."
          : "미가입자 직접 등록 건은 사진 제출 화면에 자동 표시되지 않습니다. 사이트 가입과 계정 연결 후 관리자 확인이 먼저 필요합니다."}
        {" "}사진 제출이 끝나도 관리자 차감 승인은 그대로 필요합니다.
      </p>
      {targetName ? <p><strong>대상</strong> {targetName}</p> : null}
      {requiredGameCount ? <p><strong>필요 사진</strong> {requiredGameCount}장</p> : null}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>사이트 제출</strong>
          <a href={sitePath} target="_blank" rel="noreferrer">{sitePath}</a>
          <button type="button" className="admin-button admin-button--ghost" onClick={() => void copy("사이트 링크", siteUrl())}>복사</button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button type="button" className="admin-button" onClick={() => void copyGuide()}>대상자 안내 복사</button>
        {copyStatus ? <span className="admin-muted" role="status" aria-live="polite">{copyStatus}</span> : null}
      </div>
    </section>
  );
}
