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

type TeamRow = {
  name: string;
  captainId: number | null;
  captainLabel: string;
  captainPosition: Position | "";
  currentTier: string;
  peakTier: string;
};

type Props = {
  tournamentId: number;
  hasMatches: boolean;
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createRows(count: number): TeamRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `${String.fromCharCode(65 + index)}팀`,
    captainId: null,
    captainLabel: "",
    captainPosition: "",
    currentTier: "-",
    peakTier: "-",
  }));
}

export default function DestructionTeamForm({
  tournamentId,
  hasMatches,
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<TeamRow[]>(createRows(4));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addTeam = () => {
    setRows((prev) => [
      ...prev,
      {
        name: `${String.fromCharCode(65 + prev.length)}팀`,
        captainId: null,
        captainLabel: "",
        captainPosition: "",
        currentTier: "-",
        peakTier: "-",
      },
    ]);
  };

  const removeTeam = () => {
    setRows((prev) => {
      if (prev.length <= 2) return prev;
      return prev.slice(0, prev.length - 1);
    });
  };

  const updateRow = (
    index: number,
    key: keyof TeamRow,
    value: TeamRow[keyof TeamRow]
  ) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  };

  const handleCaptainChange = (
    index: number,
    player: PlayerOption | null,
    label: string
  ) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              captainId: player ? player.id : null,
              captainLabel: label,
              currentTier: player?.currentTier ?? "-",
              peakTier: player?.peakTier ?? "-",
            }
          : row
      )
    );
  };

  const handleSubmit = async () => {
    setError("");

    const teams = rows.map((row) => ({
      name: row.name.trim(),
      captainId: row.captainId,
      captainPosition: row.captainPosition,
    }));

    const hasInvalidCaptain = teams.some(
      (team) => !team.captainId || team.captainId <= 0
    );

    if (hasInvalidCaptain) {
      setError("모든 팀장을 등록된 플레이어 목록에서 선택해주세요.");
      return;
    }

    const hasEmptyPosition = teams.some((team) => !team.captainPosition);

    if (hasEmptyPosition) {
      setError("모든 팀장의 포지션을 선택해주세요.");
      return;
    }

    const captainIds = teams.map((team) => team.captainId);
    const hasDuplicatedCaptain = captainIds.some(
      (captainId, index) => captainIds.indexOf(captainId) !== index
    );

    if (hasDuplicatedCaptain) {
      setError("중복된 팀장이 있습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(
        `/api/destruction-tournaments/${tournamentId}/teams`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ teams }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "팀장/팀 저장 실패");
        return;
      }

      router.refresh();
    } catch {
      setError("팀장/팀 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="destruction-team-form">
      <div className="destruction-team-form__head">
        <div>
          <h3>팀장 / 팀 입력</h3>
          <p>
            이름 또는 닉네임을 입력해 팀장을 선택하고, 팀장 포지션을 지정합니다.
          </p>
        </div>

        <div className="destruction-team-form__actions">
          <button
            type="button"
            className="chip-button"
            onClick={addTeam}
            disabled={hasMatches}
          >
            팀 추가
          </button>

          <button
            type="button"
            className="chip-button"
            onClick={removeTeam}
            disabled={hasMatches}
          >
            팀 제거
          </button>
        </div>
      </div>

      <div className="destruction-team-form__list">
        {rows.map((row, index) => (
          <div key={index} className="destruction-team-form__row">
            <input
              className="admin-form__input"
              value={row.name}
              onChange={(event) => updateRow(index, "name", event.target.value)}
              placeholder="팀명"
              disabled={hasMatches}
            />

            <PlayerSearchInput
              value={row.captainLabel}
              onChange={(player, label) =>
                handleCaptainChange(index, player, label)
              }
              disabled={hasMatches}
              placeholder="팀장 이름 / 닉네임 / 태그 검색"
            />

            <select
              className="admin-form__input"
              value={row.captainPosition}
              onChange={(event) =>
                updateRow(
                  index,
                  "captainPosition",
                  event.target.value as Position
                )
              }
              disabled={hasMatches}
            >
              <option value="">팀장 포지션</option>
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
          경기가 생성된 멸망전은 팀을 수정할 수 없습니다.
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
          {isSubmitting ? "저장 중..." : "팀장/팀 저장"}
        </button>
      </div>
    </div>
  );
}