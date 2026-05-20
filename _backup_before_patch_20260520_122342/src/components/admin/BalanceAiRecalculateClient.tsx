"use client";

import { useState } from "react";

type Props = {
  totalMatches: number;
  unanalyzedMatches: number;
};

export default function BalanceAiRecalculateClient({ totalMatches, unanalyzedMatches }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runRecalculate() {
    const ok = window.confirm(
      `등록된 내전 ${totalMatches}개를 기준으로 AI MMR을 다시 계산합니다. 기존 AI MMR 결과가 재생성됩니다. 계속할까요?`,
    );
    if (!ok) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/balance-ai/recalculate", { method: "POST" });
      const data = (await res.json()) as { message?: string; analyzedMatchCount?: number };
      if (!res.ok) {
        setMessage(data.message ?? "AI MMR 재계산에 실패했습니다.");
        return;
      }
      setMessage(`${data.message ?? "AI MMR 재계산이 완료되었습니다."} 분석 내전: ${data.analyzedMatchCount ?? 0}개`);
    } catch (error) {
      console.error(error);
      setMessage("AI MMR 재계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ai-panel ai-panel--strong">
      <div className="ai-panel__head">
        <div>
          <h2 className="ai-panel__title">등록된 내전 기반 전체 재계산</h2>
          <p className="ai-panel__desc">
            현재 등록된 내전 {totalMatches}개를 기준으로 내부 MMR, 경기별 AI 리뷰, 플레이어별 MMR 변화를 다시 생성합니다.
            {unanalyzedMatches > 0 ? ` 아직 AI 리뷰가 없는 내전 ${unanalyzedMatches}개가 있습니다.` : " 모든 내전에 AI 리뷰가 연결되어 있습니다."}
          </p>
        </div>
        <span className={unanalyzedMatches > 0 ? "ai-badge ai-badge--medium" : "ai-badge ai-badge--low"}>
          미분석 {unanalyzedMatches}개
        </span>
      </div>

      <div className="ai-actions">
        <button type="button" className="button-primary" onClick={runRecalculate} disabled={loading || totalMatches === 0}>
          {loading ? "재계산 중..." : "전체 AI MMR 재계산"}
        </button>
      </div>

      {message && <div className="ai-empty" style={{ marginTop: 16 }}>{message}</div>}
    </section>
  );
}
