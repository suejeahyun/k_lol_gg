"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  tournamentId: number;
  hasTeams: boolean;
  hasMatches: boolean;
  players: PlayerOption[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createRows(count: number): ParticipantRow[] {
  return Array.from({ length: count }, () => ({
    playerId: "",
    position: "",
    balanceScore: "0",
  }));
}

export default function DestructionParticipantForm({
  tournamentId,
  hasTeams,
  hasMatches,
  players,
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<ParticipantRow[]>(createRows(10));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addFiveRows = () => {
    setRows((prev) => [...prev, ...createRows(5)]);
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

    if (!hasTeams) {
      setError("팀장/팀을 먼저 등록해주세요.");
      return;
    }

    const participants = rows.map((row) => ({
      playerId: Number(row.playerId),
      position: row.position,
      balanceScore: Number(row.balanceScore || 0),
    }));

    const hasInvalidPlayer = participants.some(
      (participant) =>
        Number.isNaN(participant.playerId) || participant.playerId <= 0
    );

    if (hasInvalidPlayer) {
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

    const hasEmptyPosition = participants.some(
      (participant) => !participant.position
    );

    if (hasEmptyPosition) {
      setError("모든 참가자의 지정 포지션을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/participants`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ participants }),
        }
      );

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
    <div className="destruction-participant-form">
      <div className="destruction-participant-form__head">
        <div>
          <h3>참가자 입력</h3>
          <p>등록된 플레이어 목록에서 참가자를 선택합니다.</p>
        </div>

        <div className="destruction-participant-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={addFiveRows}
            disabled={hasMatches}
          >
            5명 추가
          </button>

          <button
            type="button"
            className="chip-button"
            onClick={removeFiveRows}
            disabled={hasMatches}
          >
            5명 제거
          </button>
        </div>
      </div>

      <div className="destruction-participant-form__list">
        {rows.map((row, index) => (
          <div key={index} className="destruction-participant-form__row">
            <div className="destruction-participant-form__index">
              {index + 1}
            </div>

            <select
              className="admin-form__input"
              value={row.playerId}
              onChange={(event) =>
                updateRow(index, "playerId", event.target.value)
              }
              disabled={hasMatches}
            >
              <option value="">플레이어 선택</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} / {player.nickname}#{player.tag}
                </option>
              ))}
            </select>

            <select
              className="admin-form__input"
              value={row.position}
              onChange={(event) =>
                updateRow(index, "position", event.target.value)
              }
              disabled={hasMatches}
            >
              <option value="">포지션 선택</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>

            <input
              className="admin-form__input"
              value={row.balanceScore}
              onChange={(event) =>
                updateRow(index, "balanceScore", event.target.value)
              }
              placeholder="밸런스 점수"
              inputMode="decimal"
              disabled={hasMatches}
            />
          </div>
        ))}
      </div>

      {hasMatches ? (
        <div className="empty-box">
          경기가 생성된 멸망전은 참가자를 수정할 수 없습니다.
        </div>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}

      <div className="admin-form__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSubmit}
          disabled={isSubmitting || hasMatches}
        >
          {isSubmitting ? "저장 중..." : "참가자 저장"}
        </button>
      </div>
    </div>
  );
}