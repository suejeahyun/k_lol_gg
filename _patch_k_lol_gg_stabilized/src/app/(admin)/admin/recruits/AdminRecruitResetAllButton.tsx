"use client";

import { useState } from "react";

export default function AdminRecruitResetAllButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;

    const confirmed = window.confirm(
      [
        "카카오 구인구직 현황을 전체 초기화합니다.",
        "",
        "처리 방식:",
        "- 진행 중 구인글을 RESET 상태로 보관 처리",
        "- 참가자와 처리 기록은 DB에 유지",
        "- 유저 페이지, 관리자 현황, 카카오톡 구인현황에서는 숨김",
        "",
        "내전 참가 신청, 경기 기록, 플레이어 데이터는 건드리지 않습니다.",
        "계속 진행할까요?",
      ].join("\n"),
    );

    if (!confirmed) return;

    setPending(true);

    try {
      const res = await fetch("/api/admin/recruits/reset-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "admin-recruits-page" }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "전체 초기화에 실패했습니다.");
      }

      window.alert(data.message || "전체 초기화가 완료되었습니다.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "전체 초기화 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className="chip-button chip-button--danger"
      type="button"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "전체 초기화 중..." : "전체 구인 초기화"}
    </button>
  );
}
