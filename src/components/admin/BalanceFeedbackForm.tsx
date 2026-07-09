"use client";

import { useState } from "react";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type Props = {
  matchSeriesId: number;
  draftId?: number | null;
  selectedOptionType?: string | null;
  initialRating?: string | null;
  initialProblemTeam?: Team | null;
  initialProblemLine?: Position | null;
  initialMemo?: string | null;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const RATING_LABELS: Record<string, string> = {
  GOOD: "좋음",
  NORMAL: "보통",
  BAD: "나쁨",
};

export default function BalanceFeedbackForm({
  matchSeriesId,
  draftId,
  selectedOptionType,
  initialRating,
  initialProblemTeam,
  initialProblemLine,
  initialMemo,
}: Props) {
  const [feedbackRating, setFeedbackRating] = useState(initialRating ?? "");
  const [feedbackProblemTeam, setFeedbackProblemTeam] = useState<Team | "">(initialProblemTeam ?? "");
  const [feedbackProblemLine, setFeedbackProblemLine] = useState<Position | "">(initialProblemLine ?? "");
  const [feedbackMemo, setFeedbackMemo] = useState(initialMemo ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submitFeedback() {
    try {
      setSaving(true);
      setMessage("");

      const response = await fetch("/api/team-balance/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchSeriesId,
          draftId: draftId ?? null,
          selectedOptionType: selectedOptionType ?? null,
          feedbackRating: feedbackRating || null,
          feedbackProblemTeam: feedbackProblemTeam || null,
          feedbackProblemLine: feedbackProblemLine || null,
          feedbackMemo: feedbackMemo.trim() || null,
        }),
      });

      const data = (await response.json().catch(() => null)) as { message?: string; learning?: { adjustedPlayers?: number } } | null;

      if (!response.ok) {
        setMessage(data?.message ?? "피드백 저장에 실패했습니다.");
        return;
      }

      const adjusted = data?.learning?.adjustedPlayers ?? 0;
      setMessage(`피드백 저장 완료 · MMR 보정 ${adjusted}명`);
    } catch (error) {
      console.error("[BALANCE_FEEDBACK_FORM_ERROR]", error);
      setMessage("피드백 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ai-panel ai-feedback-panel">
      <div className="ai-panel__head ai-feedback-panel__head">
        <div>
          <h2 className="ai-panel__title">운영자 밸런스 피드백</h2>
          <p className="ai-panel__desc">
            내전 후 체감 밸런스를 남깁니다. 나쁨/BAD로 저장하고 문제 팀·라인을 지정하면 다음 팀 밸런스 계산에 쓰이는 내부 MMR이 약하게 보정됩니다.
          </p>
        </div>
        <div className="ai-feedback-summary" aria-label="현재 피드백 선택값">
          <span>{feedbackRating ? RATING_LABELS[feedbackRating] ?? feedbackRating : "평가 미선택"}</span>
          <strong>
            {[feedbackProblemTeam, feedbackProblemLine].filter(Boolean).join(" · ") || "보정 대상 없음"}
          </strong>
        </div>
      </div>

      <div className="ai-feedback-grid">
        <label className="ai-feedback-field">
          <span>평가</span>
          <select className="input" value={feedbackRating} onChange={(event) => setFeedbackRating(event.target.value)}>
            <option value="">선택 없음</option>
            <option value="GOOD">좋음</option>
            <option value="NORMAL">보통</option>
            <option value="BAD">나쁨 / 보정 반영</option>
          </select>
        </label>
        <label className="ai-feedback-field">
          <span>문제/과대평가 팀</span>
          <select className="input" value={feedbackProblemTeam} onChange={(event) => setFeedbackProblemTeam(event.target.value as Team | "")}>
            <option value="">없음</option>
            <option value="RED">RED</option>
            <option value="BLUE">BLUE</option>
          </select>
        </label>
        <label className="ai-feedback-field">
          <span>문제 라인</span>
          <select className="input" value={feedbackProblemLine} onChange={(event) => setFeedbackProblemLine(event.target.value as Position | "")}>
            <option value="">없음</option>
            {POSITIONS.map((position) => (
              <option key={position} value={position}>{position}</option>
            ))}
          </select>
        </label>
        <label className="ai-feedback-field ai-feedback-field--memo">
          <span>메모</span>
          <textarea
            className="input"
            rows={3}
            value={feedbackMemo}
            onChange={(event) => setFeedbackMemo(event.target.value)}
            placeholder="예: RED MID가 계산보다 강했고, JGL-MID 차이 때문에 초반이 크게 벌어짐"
          />
        </label>
      </div>

      <div className="ai-feedback-actions">
        <button type="button" className="button-primary" onClick={submitFeedback} disabled={saving}>
          {saving ? "저장 중..." : "피드백 저장"}
        </button>
        {message ? <span className="ai-feedback-message">{message}</span> : null}
      </div>
    </section>
  );
}
