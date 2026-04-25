"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type EventMode = "POSITION" | "ARAM";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
};

type ParticipantRow = {
  playerId: string;
  position: Position | "";
  balanceScore: string;
};

type Props = {
  eventId: number;
  mode: EventMode;
  players: PlayerOption[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createEmptyRows(count: number): ParticipantRow[] {
  return Array.from({ length: count }, () => ({
    playerId: "",
    position: "",
    balanceScore: "0",
  }));
}

export default function EventParticipantForm({ eventId, mode, players }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<ParticipantRow[]>(createEmptyRows(10));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addFiveRows = () => {
    setRows((prev) => [...prev, ...createEmptyRows(5)]);
  };

  const removeFiveRows = () => {
    setRows((prev) => {
      if (prev.length <= 10) return prev;
      return prev.slice(0, prev.length - 5);
    });
  };

  const updateRow = (
    index: number,
    key: keyof ParticipantRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  };

  const handleSubmit = async () => {
    setError("");

    const participants = rows.map((row) => ({
      playerId: Number(row.playerId),
      position: mode === "ARAM" ? null : row.position,
      balanceScore: Number(row.balanceScore || 0),
    }));

    const hasEmptyPlayer = participants.some(
      (participant) =>
        Number.isNaN(participant.playerId) || participant.playerId <= 0
    );

    if (hasEmptyPlayer) {
      setError("모든 참가자를 선택해주세요.");
      return;
    }

    const playerIds = participants.map((participant) => participant.playerId);
    const hasDuplicatedPlayer = playerIds.some(
      (playerId, index) => playerIds.indexOf(playerId) !== index
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
        setError("포지션 모드에서는 모든 참가자의 라인을 선택해야 합니다.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/event-matches/${eventId}/participants`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ participants }),
      });

      const data = await res.json();

      if (!res.ok) {
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
      <div className="event-participant-form__head">
        <div>
          <h3>참가자 입력</h3>
          <p>등록된 플레이어 목록에서 참가자를 선택합니다.</p>
        </div>

        <div className="event-participant-form__actions">
          <button type="button" className="chip-button" onClick={addFiveRows}>
            5명 추가
          </button>

          <button type="button" className="chip-button" onClick={removeFiveRows}>
            5명 제거
          </button>
        </div>
      </div>

      <div className="event-participant-form__list">
        {rows.map((row, index) => (
          <div key={index} className="event-participant-form__row">
            <div className="event-participant-form__index">{index + 1}</div>

            <select
              className="admin-form__input"
              value={row.playerId}
              onChange={(event) =>
                updateRow(index, "playerId", event.target.value)
              }
            >
              <option value="">플레이어 선택</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} / {player.nickname}#{player.tag}
                </option>
              ))}
            </select>

            {mode === "POSITION" ? (
              <select
                className="admin-form__input"
                value={row.position}
                onChange={(event) =>
                  updateRow(index, "position", event.target.value)
                }
              >
                <option value="">라인 선택</option>
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            ) : null}

            <input
              className="admin-form__input"
              value={row.balanceScore}
              onChange={(event) =>
                updateRow(index, "balanceScore", event.target.value)
              }
              placeholder="밸런스 점수"
              inputMode="decimal"
            />
          </div>
        ))}
      </div>

      {error ? <p className="notice-form__error">{error}</p> : null}

      <div className="admin-form__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "저장 중..." : "참가자 저장"}
        </button>
      </div>
    </div>
  );
}