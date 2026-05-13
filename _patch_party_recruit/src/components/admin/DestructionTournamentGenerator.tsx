"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  tournamentId: number;
  teamCount: number;
  preliminaryMatchCount: number;
  unfinishedPreliminaryCount: number;
  tournamentMatchCount: number;
};

export default function DestructionTournamentGenerator({
  tournamentId,
  teamCount,
  preliminaryMatchCount,
  unfinishedPreliminaryCount,
  tournamentMatchCount,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setError("");

    if (teamCount < 4) {
      setError("토너먼트 생성을 위해 최소 4팀이 필요합니다.");
      return;
    }

    if (preliminaryMatchCount === 0) {
      setError("예선 경기를 먼저 생성해주세요.");
      return;
    }

    if (unfinishedPreliminaryCount > 0) {
      setError("모든 예선 경기 결과를 먼저 등록해주세요.");
      return;
    }

    if (tournamentMatchCount > 0) {
      setError("이미 생성된 토너먼트 경기가 있습니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/tournament`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "토너먼트 생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("토너먼트 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="destruction-tournament-generator">
      <button
        type="button"
        className="admin-page__create-button"
        onClick={handleGenerate}
        disabled={
          isGenerating ||
          teamCount < 4 ||
          preliminaryMatchCount === 0 ||
          unfinishedPreliminaryCount > 0 ||
          tournamentMatchCount > 0
        }
      >
        {isGenerating ? "토너먼트 생성 중..." : "상위 4팀 토너먼트 생성"}
      </button>

      {tournamentMatchCount > 0 ? (
        <div className="empty-box">이미 생성된 토너먼트 경기가 있습니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}