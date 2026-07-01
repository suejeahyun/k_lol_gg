"use client";

import { useState } from "react";

type TrainingResult = {
  message?: string;
  analyzedMatchCount?: number;
  matchCount?: number;
  gameCount?: number;
  participantCount?: number;
  championPositionSampleCount?: number;
  rolePairSampleCount?: number;
};

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "0";
}

export default function AdminMatchAiTrainingButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runTraining() {
    const ok = window.confirm(
      "현재까지 등록된 모든 내전 기록을 기준으로 AI 밸런스/MMR 학습을 다시 실행합니다. 밴픽 추천은 이 내전 기록을 즉시 읽어 반영합니다. 계속 진행할까요?",
    );
    if (!ok) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/balance/recommendations/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json().catch(() => ({}))) as TrainingResult;

      if (!response.ok) {
        setMessage(data.message ?? "AI 학습 실행에 실패했습니다.");
        return;
      }

      setMessage(
        [
          data.message ?? "등록 내전 기반 AI 학습이 완료되었습니다.",
          `내전 ${formatCount(data.analyzedMatchCount ?? data.matchCount)}개`,
          `세트 ${formatCount(data.gameCount)}개`,
          `참가 기록 ${formatCount(data.participantCount)}개`,
          `챔피언·포지션 표본 ${formatCount(data.championPositionSampleCount)}개`,
          `핵심 포지션 페어 표본 ${formatCount(data.rolePairSampleCount)}개`,
        ].join(" · "),
      );
    } catch (error) {
      console.error(error);
      setMessage("AI 학습 실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <button
        type="button"
        className="app-button"
        onClick={runTraining}
        disabled={loading}
        title="등록된 내전 기록을 기준으로 AI MMR과 밸런스 리뷰를 재계산합니다."
      >
        {loading ? "AI 학습 중..." : "등록 내전 AI 학습"}
      </button>
      {message ? (
        <p style={{ maxWidth: 520, margin: 0, color: "rgba(226,232,240,0.82)", fontSize: 13, textAlign: "right" }}>
          {message}
        </p>
      ) : (
        <p style={{ maxWidth: 480, margin: 0, color: "rgba(148,163,184,0.82)", fontSize: 12, textAlign: "right" }}>
        </p>
      )}
    </div>
  );
}
