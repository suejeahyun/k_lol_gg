"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PlayerSearchInput from "@/components/admin/PlayerSearchInput";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type ParticipantRow = {
  playerId: number | null;
  playerLabel: string;
  position: Position | "";
  currentTier: string;
  peakTier: string;
};

type Props = {
  tournamentId: number;
  hasTeams: boolean;
  hasMatches: boolean;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createRows(count: number): ParticipantRow[] {
  return Array.from({ length: count }, () => ({
    playerId: null,
    playerLabel: "",
    position: "",
    currentTier: "-",
    peakTier: "-",
  }));
}

export default function DestructionParticipantForm({
  tournamentId,
  hasTeams,
  hasMatches,
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<ParticipantRow[]>(createRows(4));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addFourRows = () => {
    setRows((prev) => [...prev, ...createRows(4)]);
  };

  const removeFourRows = () => {
    setRows((prev) => {
      if (prev.length <= 4) return prev;
      return prev.slice(0, prev.length - 4);
    });
  };

  const updateRow = (
    index: number,
    key: keyof ParticipantRow,
    value: ParticipantRow[keyof ParticipantRow]
  ) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  };

  const handlePlayerChange = (
    index: number,
    player: PlayerOption | null,
    label: string
  ) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              playerId: player ? player.id : null,
              playerLabel: label,
              currentTier: player?.currentTier ?? "-",
              peakTier: player?.peakTier ?? "-",
            }
          : row
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
      playerId: row.playerId,
      position: row.position,
    }));

    const hasInvalidPlayer = participants.some(
      (participant) => !participant.playerId || participant.playerId <= 0
    );

    if (hasInvalidPlayer) {
      setError("모든 참가자를 등록된 플레이어 목록에서 선택해주세요.");
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
          <p>
            팀장을 제외한 일반 참가자를 4명 단위로 입력합니다. 팀장은 팀장/팀
            등록 단계에서 자동으로 참가자에 포함됩니다.
          </p>
        </div>

        <div className="destruction-participant-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={addFourRows}
            disabled={hasMatches}
          >
            4명 추가
          </button>

          <button
            type="button"
            className="chip-button"
            onClick={removeFourRows}
            disabled={hasMatches}
          >
            4명 제거
          </button>
        </div>
      </div>

      <div className="destruction-participant-form__list">
        {rows.map((row, index) => (
          <div key={index} className="destruction-participant-form__row">
            <div className="destruction-participant-form__index">
              {index + 1}
            </div>

            <PlayerSearchInput
              value={row.playerLabel}
              onChange={(player, label) =>
                handlePlayerChange(index, player, label)
              }
              disabled={hasMatches}
              placeholder="이름 / 닉네임 / 태그 검색"
            />

            <select
              className="admin-form__input"
              value={row.position}
              onChange={(event) =>
                updateRow(index, "position", event.target.value as Position)
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

            <div className="destruction-tier-box">
              <span>현재 {row.currentTier}</span>
              <span>최고 {row.peakTier}</span>
            </div>
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