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
  balanceScore: number;
  player: {
    nickname: string;
    tag: string;
    currentTier?: string | null;
    peakTier?: string | null;
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

  const [auctionPoints, setAuctionPoints] = useState<Record<number, string>>(
    () => {
      const initial: Record<number, string> = {};

      participants.forEach((participant) => {
        initial[participant.id] = String(participant.balanceScore ?? 0);
      });

      return initial;
    }
  );

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTeamChange = (participantId: number, teamId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [participantId]: teamId,
    }));
  };

  const handlePointChange = (participantId: number, point: string) => {
    setAuctionPoints((prev) => ({
      ...prev,
      [participantId]: point,
    }));
  };

  const handleSubmit = async () => {
    setError("");

    const payload = participants
      .map((participant) => ({
        participantId: participant.id,
        teamId: Number(assignments[participant.id]),
        auctionPoint: Number(auctionPoints[participant.id] || 0),
      }))
      .filter((assignment) => assignment.teamId > 0);

    if (payload.length !== participants.length) {
      setError("모든 참가자의 팀을 선택해주세요.");
      return;
    }

    const hasInvalidPoint = payload.some((assignment) =>
      Number.isNaN(assignment.auctionPoint)
    );

    if (hasInvalidPoint) {
      setError("경매 포인트는 숫자로 입력해주세요.");
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
          <p>참가자를 팀에 배정하고 경매 포인트를 수기로 입력합니다.</p>
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
                <span>
                  {participant.position} · 현재{" "}
                  {participant.player.currentTier ?? "-"} · 최고{" "}
                  {participant.player.peakTier ?? "-"}
                </span>
              </div>

              <select
                className="admin-form__input"
                value={assignments[participant.id] ?? ""}
                onChange={(event) =>
                  handleTeamChange(participant.id, event.target.value)
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

              <input
                className="admin-form__input"
                value={auctionPoints[participant.id] ?? "0"}
                onChange={(event) =>
                  handlePointChange(participant.id, event.target.value)
                }
                placeholder="경매 포인트"
                inputMode="decimal"
                disabled={hasMatches}
              />
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