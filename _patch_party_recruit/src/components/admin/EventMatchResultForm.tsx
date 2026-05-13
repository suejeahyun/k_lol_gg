"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Team = {
  id: number;
  name: string;
};

type Participant = {
  id: number;
  playerId: number;
  teamId: number | null;
  player: {
    id: number;
    nickname: string;
    tag: string;
  };
};

type Props = {
  eventId: number;
  matchId: number;
  teamA: Team;
  teamB: Team;
  participants: Participant[];
  initialWinnerTeamId: number | null;
  initialMvpPlayerId: number | null;
};

export default function EventMatchResultForm({
  eventId,
  matchId,
  teamA,
  teamB,
  participants,
  initialWinnerTeamId,
  initialMvpPlayerId,
}: Props) {
  const router = useRouter();

  const [winnerTeamId, setWinnerTeamId] = useState(
    initialWinnerTeamId ? String(initialWinnerTeamId) : ""
  );
  const [mvpPlayerId, setMvpPlayerId] = useState(
    initialMvpPlayerId ? String(initialMvpPlayerId) : ""
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const winnerParticipants = participants.filter(
    (participant) => String(participant.teamId) === winnerTeamId
  );

  const handleSubmit = async () => {
    setError("");

    if (!winnerTeamId) {
      setError("승리 팀을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/event-matches/${eventId}/matches/${matchId}/result`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            winnerTeamId: Number(winnerTeamId),
            mvpPlayerId: mvpPlayerId ? Number(mvpPlayerId) : null,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "경기 결과 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("경기 결과 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="event-match-result-form">
      <select
        className="admin-form__input"
        value={winnerTeamId}
        onChange={(event) => {
          setWinnerTeamId(event.target.value);
          setMvpPlayerId("");
        }}
      >
        <option value="">승리 팀 선택</option>
        <option value={teamA.id}>{teamA.name}</option>
        <option value={teamB.id}>{teamB.name}</option>
      </select>

      <select
        className="admin-form__input"
        value={mvpPlayerId}
        onChange={(event) => setMvpPlayerId(event.target.value)}
        disabled={!winnerTeamId}
      >
        <option value="">MVP 선택 없음</option>
        {winnerParticipants.map((participant) => (
          <option key={participant.id} value={participant.playerId}>
            {participant.player.nickname}#{participant.player.tag}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="chip-button"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? "저장 중..." : "결과 저장"}
      </button>

      {error ? <p className="notice-form__error">{error}</p> : null}
    </div>
  );
}