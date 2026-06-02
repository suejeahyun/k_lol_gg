"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PlayerSearchInput from "@/components/admin/PlayerSearchInput";

type EventMode = "POSITION" | "ARAM";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type PlayerOption = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier?: string | null;
  peakTier?: string | null;
};

type Props = {
  eventId: number;
  mode: EventMode;
  existingPlayerIds: number[];
  disabled?: boolean;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

export default function EventParticipantManualAddForm({
  eventId,
  mode,
  existingPlayerIds,
  disabled = false,
}: Props) {
  const router = useRouter();

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null);
  const [playerLabel, setPlayerLabel] = useState("");
  const [position, setPosition] = useState<Position | "">("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (disabled) {
      setError("이미 팀이 생성된 이벤트는 참가자를 추가할 수 없습니다.");
      return;
    }

    if (!selectedPlayer) {
      setError("추가할 플레이어를 검색 후 선택해주세요.");
      return;
    }

    if (existingPlayerIds.includes(selectedPlayer.id)) {
      setError("이미 등록된 참가자입니다.");
      return;
    }

    if (mode === "POSITION" && !position) {
      setError("포지션을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/admin/event-matches/${eventId}/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            playerId: selectedPlayer.id,
            position: mode === "ARAM" ? null : position,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message ?? "참가자 추가 실패");
        return;
      }

      setSelectedPlayer(null);
      setPlayerLabel("");
      setPosition("");
      router.refresh();
    } catch {
      setError("참가자 추가 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="event-participant-form">
      <div className="admin-form__grid">
        <label className="admin-form__field">
          <span className="admin-form__label">플레이어 검색</span>
          <PlayerSearchInput
            value={playerLabel}
            disabled={disabled || isSubmitting}
            excludePlayerIds={existingPlayerIds}
            placeholder="이름 / 닉네임 / 태그 검색"
            onChange={(player, label) => {
              setSelectedPlayer(player);
              setPlayerLabel(label);
              setError("");
            }}
          />
        </label>

        {mode === "POSITION" ? (
          <label className="admin-form__field">
            <span className="admin-form__label">포지션</span>
            <select
              className="admin-form__input"
              value={position}
              disabled={disabled || isSubmitting}
              onChange={(event) => setPosition(event.target.value as Position | "")}
            >
              <option value="">포지션 선택</option>
              {POSITIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {disabled ? (
        <p className="notice-form__error">
          이미 팀이 생성된 이벤트는 참가자를 추가할 수 없습니다. 팀을 재구성하려면 기존 팀을 먼저 초기화해야 합니다.
        </p>
      ) : null}

      {error ? <p className="notice-form__error">{error}</p> : null}

      <div className="admin-form__actions event-participant-form__actions">
        <button
          type="button"
          className="admin-page__create-button"
          onClick={handleSubmit}
          disabled={disabled || isSubmitting}
        >
          {isSubmitting ? "추가 중..." : "참가자 직접 추가"}
        </button>
      </div>
    </div>
  );
}
