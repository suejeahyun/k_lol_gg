"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EventMode = "POSITION" | "ARAM";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type ParticipantRow = {
  playerId: number;
  playerLabel: string;
  position: Position | "";
};

type Props = {
  eventId: number;
  mode: EventMode;
  initialRows?: ParticipantRow[];
};

export default function EventParticipantForm({
  eventId,
  mode,
  initialRows = [],
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<ParticipantRow[]>(() => initialRows);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const removeRow = (playerId: number) => {
    setRows((prev) => prev.filter((row) => row.playerId !== playerId));
    setError("");
  };

  const handleSubmit = async () => {
    setError("");

    if (rows.length === 0) {
      setError("참가자가 없습니다.");
      return;
    }

    const participants = rows.map((row) => ({
      playerId: row.playerId,
      position: mode === "ARAM" ? null : row.position,
    }));

    const hasDuplicatedPlayer = participants.some(
      (participant, index) =>
        participants.findIndex(
          (target) => target.playerId === participant.playerId
        ) !== index
    );

    if (hasDuplicatedPlayer) {
      setError("중복된 참가자가 있습니다.");
      return;
    }

    if (mode === "POSITION") {
      const hasEmptyPosition = participants.some(
        (participant) => !participant.position
      );

      if (hasEmptyPosition) {
        setError("포지션이 없는 참가자가 있습니다.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/event-matches/${eventId}/participants`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ participants }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "참가자 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("참가자 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="event-participant-form">
      <div className="event-participant-form__list">
        {rows.length === 0 ? (
          <div className="event-participant-form__empty">
            참가자가 없습니다.
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.playerId}-${index}`}
              className={
                mode === "POSITION"
                  ? "event-participant-form__readonly-row"
                  : "event-participant-form__readonly-row event-participant-form__readonly-row--aram"
              }
            >
              <div className="event-participant-form__count">{index + 1}</div>

              <div className="event-participant-form__player">
                {row.playerLabel || `Player ID: ${row.playerId}`}
              </div>

              {mode === "POSITION" && (
                <div className="event-participant-form__position">
                  {row.position || "-"}
                </div>
              )}

              <button
                type="button"
                className="event-participant-form__delete-button"
                onClick={() => removeRow(row.playerId)}
              >
                삭제
              </button>
            </div>
          ))
        )}
      </div>

      {rows.length > 0 && (
        <div className="event-participant-form__summary">
          현재 참가자 {rows.length}명 / 생성 가능 팀{" "}
          {Math.floor(rows.length / 5)}팀
        </div>
      )}

      {error && <p className="notice-form__error">{error}</p>}

      {rows.length > 0 && (
        <div className="admin-form__actions event-participant-form__actions">
          <button
            type="button"
            className="admin-page__create-button"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "저장 중..." : "참가자 저장"}
          </button>
        </div>
      )}
    </div>
  );
}