"use client";

import { useState } from "react";

type DisciplineTaskHandoffProps = {
  publicCode: string;
  targetName?: string;
  requiredGameCount?: number;
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

export default function DisciplineTaskHandoff({ publicCode, targetName, requiredGameCount }: DisciplineTaskHandoffProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const command = `/인증 ${publicCode}`;
  const sitePath = `/discipline/evidence?code=${encodeURIComponent(publicCode)}`;

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
      "[K-LOL.GG 경고 차감 인증 안내]",
      targetName ? `대상: ${targetName}` : "",
      `인증번호: ${publicCode}`,
      requiredGameCount ? `필요 사진: ${requiredGameCount}장` : "",
      `카카오 명령: ${command}`,
      `사이트 제출: ${siteUrl()}`,
    ].filter(Boolean);
    await copy("전체 안내", lines.join("\n"));
  }

  return (
    <section className="admin-card" aria-labelledby="discipline-task-handoff-title" style={{ marginBottom: 16 }}>
      <h2 id="discipline-task-handoff-title">경고 등록 완료 · 대상자 안내</h2>
      <p className="admin-muted">
        아래 인증번호와 제출 경로를 대상자에게 전달하세요. 사진 제출이 끝나도 관리자 차감 승인은 그대로 필요합니다.
      </p>
      {targetName ? <p><strong>대상</strong> {targetName}</p> : null}
      {requiredGameCount ? <p><strong>필요 사진</strong> {requiredGameCount}장</p> : null}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>WR 코드</strong>
          <code>{publicCode}</code>
          <button type="button" className="admin-button admin-button--ghost" onClick={() => void copy("WR 코드", publicCode)}>복사</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>카카오 명령</strong>
          <code>{command}</code>
          <button type="button" className="admin-button admin-button--ghost" onClick={() => void copy("카카오 명령", command)}>복사</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <strong>사이트 제출</strong>
          <a href={sitePath} target="_blank" rel="noreferrer">{sitePath}</a>
          <button type="button" className="admin-button admin-button--ghost" onClick={() => void copy("사이트 링크", siteUrl())}>복사</button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button type="button" className="admin-button" onClick={() => void copyGuide()}>전체 안내 복사</button>
        {copyStatus ? <span className="admin-muted" role="status" aria-live="polite">{copyStatus}</span> : null}
      </div>
    </section>
  );
}
