"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EventMode = "POSITION" | "ARAM";

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  position: string | null;
  balanceScore: number;
};

type Props = {
  eventId: number;
  mode: EventMode;
  participants: Participant[];
  hasTeams: boolean;
};

export default function EventTeamGenerator({
  eventId,
  participants,
  hasTeams,
}: Props) {
  const router = useRouter();

  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const canGenerate =
    participants.length > 0 &&
    participants.length % 5 === 0 &&
    !hasTeams;

  const handleGenerateTeams = async () => {
    setError("");

    if (participants.length === 0) {
      setError("참가자가 없습니다.");
      return;
    }

    if (participants.length % 5 !== 0) {
      setError("참가자 수가 5명의 배수일 때만 팀 자동생성이 가능합니다.");
      return;
    }

    if (hasTeams) {
      setError("이미 생성된 팀이 있습니다.");
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch(`/api/event-matches/${eventId}/teams`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀 자동생성 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("팀 자동생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="event-team-generator">
      <div className="event-team-generator__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleGenerateTeams}
          disabled={isGenerating || !canGenerate}
        >
          {isGenerating ? "계산 및 생성 중..." : "팀 자동 생성"}
        </button>

        {hasTeams ? (
          <button type="button" className="chip-button" disabled>
            팀 생성 완료
          </button>
        ) : null}
      </div>

      <div className="event-participant-form__summary">
        현재 참가자 {participants.length}명 / 생성 가능 팀{" "}
        {Math.floor(participants.length / 5)}팀
      </div>

      {participants.length > 0 && participants.length % 5 !== 0 ? (
        <p className="notice-form__error">
          참가자 수가 5명의 배수가 아니므로 팀 자동생성이 불가능합니다.
        </p>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}