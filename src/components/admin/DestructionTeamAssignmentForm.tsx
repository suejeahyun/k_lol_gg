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
  position: string;
  player: {
    nickname: string;
    tag: string;
  };
};

type Props = {
  tournamentId: number;
  teams: Team[];
  participants: Participant[];
  hasMatches: boolean;
};

export default function DestructionTeamAssignmentForm({
  tournamentId,
  teams,
  participants,
  hasMatches,
}: Props) {
  const router = useRouter();

  const [assignments, setAssignments] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};

    participants.forEach((participant) => {
      initial[participant.id] = participant.teamId
        ? String(participant.teamId)
        : "";
    });

    return initial;
  });

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (participantId: number, teamId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [participantId]: teamId,
    }));
  };

  const handleSubmit = async () => {
    setError("");

    const payload = participants
      .map((participant) => ({
        participantId: participant.id,
        teamId: Number(assignments[participant.id]),
      }))
      .filter((assignment) => assignment.teamId > 0);

    if (payload.length !== participants.length) {
      setError("모든 참가자의 팀을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/assign-teams`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignments: payload,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀 배정 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("팀 배정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="destruction-team-assignment-form">
      <div className="destruction-team-assignment-form__head">
        <div>
          <h3>참가자 팀 배정</h3>
          <p>경기 생성 전까지 참가자를 각 팀에 배정할 수 있습니다.</p>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="empty-box">먼저 팀장/팀을 등록해주세요.</div>
      ) : participants.length === 0 ? (
        <div className="empty-box">먼저 참가자를 등록해주세요.</div>
      ) : (
        <div className="destruction-team-assignment-form__list">
          {participants.map((participant) => (
            <div
              key={participant.id}
              className="destruction-team-assignment-form__row"
            >
              <div>
                <strong>
                  {participant.player.nickname}#{participant.player.tag}
                </strong>
                <span>{participant.position}</span>
              </div>

              <select
                className="admin-form__input"
                value={assignments[participant.id] ?? ""}
                onChange={(event) =>
                  handleChange(participant.id, event.target.value)
                }
                disabled={hasMatches}
              >
                <option value="">팀 선택</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {hasMatches ? (
        <div className="empty-box">
          경기가 생성된 멸망전은 팀 배정을 수정할 수 없습니다.
        </div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}

      <div className="admin-form__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            hasMatches ||
            teams.length === 0 ||
            participants.length === 0
          }
        >
          {isSubmitting ? "저장 중..." : "팀 배정 저장"}
        </button>
      </div>
    </div>
  );
}