"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  tournamentId: number;
  semiFinalMatchCount: number;
  unfinishedSemiFinalCount: number;
  finalMatchCount: number;
};

export default function DestructionFinalGenerator({
  tournamentId,
  semiFinalMatchCount,
  unfinishedSemiFinalCount,
  finalMatchCount,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setError("");

    if (semiFinalMatchCount !== 2) {
      setError("4강 경기가 2개 있어야 결승을 생성할 수 있습니다.");
      return;
    }

    if (unfinishedSemiFinalCount > 0) {
      setError("4강 경기 결과를 먼저 모두 등록해주세요.");
      return;
    }

    if (finalMatchCount > 0) {
      setError("이미 생성된 결승 경기가 있습니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/final`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "결승 생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("결승 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="destruction-final-generator">
      <button
        type="button"
        className="admin-page__create-button"
        onClick={handleGenerate}
        disabled={
          isGenerating ||
          semiFinalMatchCount !== 2 ||
          unfinishedSemiFinalCount > 0 ||
          finalMatchCount > 0
        }
      >
        {isGenerating ? "결승 생성 중..." : "결승 생성"}
      </button>

      {finalMatchCount > 0 ? (
        <div className="empty-box">이미 생성된 결승 경기가 있습니다.</div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}