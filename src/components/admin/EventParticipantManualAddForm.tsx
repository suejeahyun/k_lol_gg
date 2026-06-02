"use client";

import { useMemo, useState } from "react";
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

type TeamOption = {
  id: number;
  name: string;
  seed?: number | null;
  score?: number | null;
};

type Props = {
  eventId: number;
  mode: EventMode;
  teams: TeamOption[];
  existingPlayerIds: number[];
  disabled?: boolean;
  disabledReason?: string;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];
const MANUAL_TEAM_VALUES = ["BLUE", "RED"] as const;

type ManualTeamValue = (typeof MANUAL_TEAM_VALUES)[number];

function isManualTeamValue(value: string): value is ManualTeamValue {
  return MANUAL_TEAM_VALUES.includes(value as ManualTeamValue);
}

export default function EventParticipantManualAddForm({
  eventId,
  mode,
  teams,
  existingPlayerIds,
  disabled = false,
  disabledReason,
}: Props) {
  const router = useRouter();

  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null);
  const [playerLabel, setPlayerLabel] = useState("");
  const [position, setPosition] = useState<Position | "">("");
  const [teamValue, setTeamValue] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const existingTeamNames = useMemo(
    () => new Set(teams.map((team) => team.name.toUpperCase())),
    [teams],
  );

  const missingManualTeams = MANUAL_TEAM_VALUES.filter(
    (teamName) => !existingTeamNames.has(teamName),
  );

  const handleSubmit = async () => {
    setError("");

    if (disabled) {
      setError(disabledReason ?? "대진표가 생성된 이벤트는 참가자를 추가할 수 없습니다.");
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

    const selectedExistingTeamId = Number(teamValue);
    const selectedManualTeamName = isManualTeamValue(teamValue) ? teamValue : null;

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
            teamId:
              Number.isInteger(selectedExistingTeamId) && selectedExistingTeamId > 0
                ? selectedExistingTeamId
                : null,
            teamName: selectedManualTeamName,
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
      setTeamValue("");
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
            <span className="admin-form__label">라인</span>
            <select
              className="admin-form__input"
              value={position}
              disabled={disabled || isSubmitting}
              onChange={(event) => setPosition(event.target.value as Position | "")}
            >
              <option value="">라인 선택</option>
              {POSITIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="admin-form__field">
          <span className="admin-form__label">팀 배정</span>
          <select
            className="admin-form__input"
            value={teamValue}
            disabled={disabled || isSubmitting}
            onChange={(event) => setTeamValue(event.target.value)}
          >
            <option value="">미배정 · 자동 팀배정 대상</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} 직접 배정
              </option>
            ))}
            {missingManualTeams.map((teamName) => (
              <option key={teamName} value={teamName}>
                {teamName} 팀 생성 후 직접 배정
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="event-participant-form__summary">
        팀을 선택하지 않으면 기존처럼 자동 팀배정 대상입니다. BLUE/RED를 선택하면
        팀을 자동 생성하고 해당 참가자를 바로 배정합니다.
      </div>

      {disabled ? (
        <p className="notice-form__error">
          {disabledReason ?? "대진표가 생성된 이벤트는 참가자를 추가할 수 없습니다."}
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
