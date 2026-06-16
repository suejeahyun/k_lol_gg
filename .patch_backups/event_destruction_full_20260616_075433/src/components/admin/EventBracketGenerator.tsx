"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SeedMode = "SCORE" | "RANDOM";

type Props = {
  eventId: number;
  teamCount: number;
  matchCount: number;
  defaultSeedMode: SeedMode;
};

export default function EventBracketGenerator({
  eventId,
  teamCount,
  matchCount,
  defaultSeedMode,
}: Props) {
  const router = useRouter();

  const [seedMode, setSeedMode] = useState<SeedMode>(defaultSeedMode);
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ seedMode }),
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
      <div className="admin-event-form-grid">
        <label className="admin-form__field">
          <span className="admin-form__label">시드 방식</span>
          <select
            className="admin-form__input"
            value={seedMode}
            onChange={(event) => setSeedMode(event.target.value as SeedMode)}
            disabled={isGenerating || matchCount > 0}
          >
            <option value="SCORE">점수 시드 · 라인/밸런스 점수 기준</option>
            <option value="RANDOM">랜덤 시드 · 팀 순서 무작위</option>
          </select>
        </label>
      </div>

      <div className="empty-box">
        시드는 토너먼트 대진표의 팀 배치 순서입니다. 포지션 내전은 기본 점수 시드,
        포지션 없는 내전은 기본 랜덤 시드로 생성됩니다. 팀 수가 2/4/8/16에 맞지 않으면
        부전승(BYE)이 자동 반영됩니다.
      </div>

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
