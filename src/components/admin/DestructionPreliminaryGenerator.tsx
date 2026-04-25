"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  tournamentId: number;
  teamCount: number;
  preliminaryMatchCount: number;
  hasInvalidTeamSize: boolean;
};

export default function DestructionPreliminaryGenerator({
  tournamentId,
  teamCount,
  preliminaryMatchCount,
  hasInvalidTeamSize,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setError("");

    if (teamCount < 2) {
      setError("예선 생성을 위해 최소 2팀이 필요합니다.");
      return;
    }

    if (hasInvalidTeamSize) {
      setError("각 팀은 5명으로 구성되어야 합니다.");
      return;
    }

    if (preliminaryMatchCount > 0) {
      setError("이미 생성된 예선 경기가 있습니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/preliminary`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "예선 생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("예선 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="destruction-preliminary-generator">
      <button
        type="button"
        className="admin-page__create-button"
        onClick={handleGenerate}
        disabled={
          isGenerating ||
          teamCount < 2 ||
          hasInvalidTeamSize ||
          preliminaryMatchCount > 0
        }
      >
        {isGenerating ? "예선 생성 중..." : "예선 풀리그 생성"}
      </button>

      {preliminaryMatchCount > 0 ? (
        <div className="empty-box">이미 생성된 예선 경기가 있습니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}