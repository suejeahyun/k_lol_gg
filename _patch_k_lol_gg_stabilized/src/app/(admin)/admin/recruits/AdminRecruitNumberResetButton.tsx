"use client";

import { useState } from "react";

export default function AdminRecruitNumberResetButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;

    const confirmed = window.confirm(
      [
        "모집번호만 초기화합니다.",
        "",
        "처리 방식:",
        "- 진행 중 구인글은 유지",
        "- 기존 기록도 유지",
        "- 다음 구인 생성부터 #1부터 확인",
        "- 진행 중 번호와 겹치면 다음 빈 번호 사용",
        "",
        "계속 진행할까요?",
      ].join("\n"),
    );

    if (!confirmed) return;

    setPending(true);

    try {
      const res = await fetch("/api/admin/recruits/reset-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "admin-recruits-page" }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "모집번호 초기화에 실패했습니다.");
      }

      window.alert(data.message || "모집번호 초기화가 완료되었습니다.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "모집번호 초기화 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="chip-button"
      type="button"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "모집번호 초기화 중..." : "모집번호 초기화"}
    </button>
  );
}
