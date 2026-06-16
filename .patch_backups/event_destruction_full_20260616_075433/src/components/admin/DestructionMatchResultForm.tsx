"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  tournamentId: number;
  matchId: number;
  teamA: Team;
  teamB: Team;
  participants: Participant[];
  initialWinnerTeamId: number | null;
  initialMvpPlayerId: number | null;
  initialTeamAScore?: number | null;
  initialTeamBScore?: number | null;
};

export default function DestructionMatchResultForm({
  tournamentId,
  matchId,
  teamA,
  teamB,
  participants,
  initialWinnerTeamId,
  initialMvpPlayerId,
  initialTeamAScore,
  initialTeamBScore,
}: Props) {
  const router = useRouter();

  const [winnerTeamId, setWinnerTeamId] = useState(
    initialWinnerTeamId ? String(initialWinnerTeamId) : "",
  );
  const [mvpPlayerId, setMvpPlayerId] = useState(
    initialMvpPlayerId ? String(initialMvpPlayerId) : "",
  );
  const [teamAScore, setTeamAScore] = useState(String(initialTeamAScore ?? 0));
  const [teamBScore, setTeamBScore] = useState(String(initialTeamBScore ?? 0));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const winnerParticipants = participants.filter(
    (participant) => String(participant.teamId) === winnerTeamId,
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
        `/api/destruction-tournaments/${tournamentId}/matches/${matchId}/result`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            winnerTeamId: Number(winnerTeamId),
            mvpPlayerId: mvpPlayerId ? Number(mvpPlayerId) : null,
            teamAScore: Number(teamAScore),
            teamBScore: Number(teamBScore),
          }),
        },
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
    <div className="destruction-match-result-form">
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

      <input
        className="admin-form__input"
        type="number"
        min="0"
        value={teamAScore}
        onChange={(event) => setTeamAScore(event.target.value)}
        placeholder={`${teamA.name} 세트승`}
      />

      <input
        className="admin-form__input"
        type="number"
        min="0"
        value={teamBScore}
        onChange={(event) => setTeamBScore(event.target.value)}
        placeholder={`${teamB.name} 세트승`}
      />

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
