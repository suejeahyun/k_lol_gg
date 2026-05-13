"use client";

import { useState } from "react";

export default function MatchAiReanalyzeButton({ matchId }: { matchId: number }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    const ok = window.confirm("이 내전의 AI 리뷰와 MMR 결과를 다시 생성할까요?");
    if (!ok) return;

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/balance-ai/matches/${matchId}/reanalyze`, { method: "POST" });
      const data = (await res.json()) as { message?: string };
      setMessage(data.message ?? (res.ok ? "재분석이 완료되었습니다." : "재분석에 실패했습니다."));
      if (res.ok) window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error(error);
      setMessage("재분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-actions">
      <button type="button" className="button-primary" onClick={run} disabled={loading}>
        {loading ? "재분석 중..." : "이 내전 AI 재분석"}
      </button>
      {message && <span className="ai-muted">{message}</span>}
    </div>
  );
}
