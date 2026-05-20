"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  eventId: number;
  teamCount: number;
  matchCount: number;
};

export default function EventBracketGenerator({
  eventId,
  teamCount,
  matchCount,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateBracket = async () => {
    setError("");

    if (teamCount < 2) {
      setError("대진 생성을 위해 최소 2팀이 필요합니다.");
      return;
    }

    if (matchCount > 0) {
      setError("이미 생성된 대진이 있습니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(`/api/event-matches/${eventId}/bracket`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "대진 생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("대진 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="event-bracket-generator">
      <button
        type="button"
        className="admin-page__create-button"
        onClick={handleGenerateBracket}
        disabled={isGenerating || teamCount < 2 || matchCount > 0}
      >
        {isGenerating ? "대진 생성 중..." : "대진 생성"}
      </button>

      {teamCount < 2 ? (
        <p className="notice-form__error">
          대진 생성을 위해 최소 2팀이 필요합니다.
        </p>
      ) : null}

      {matchCount > 0 ? (
        <div className="empty-box">이미 생성된 대진이 있습니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}