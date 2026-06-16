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

type CaptainCandidate = PlayerOption & {
  mainPosition: string;
  subPositions: string[];
  captainPreference: "PREFERRED" | "NOT_PREFERRED";
  applyStatus: string;
};

type TeamRow = {
  name: string;
  captainId: number | null;
  captainLabel: string;
  captainPosition: Position | "";
  currentTier: string;
  peakTier: string;
  initialAuctionPoints: string;
};

type Props = {
  tournamentId: number;
  hasMatches: boolean;
  captainCandidates?: CaptainCandidate[];
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
    initialAuctionPoints: "100",
  }));
}

export default function DestructionTeamForm({
  tournamentId,
  hasMatches,
  captainCandidates = [],
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<TeamRow[]>(createRows(4));
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
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
        initialAuctionPoints: "100",
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

  const applyCaptainCandidate = (candidate: CaptainCandidate) => {
    setRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === selectedRowIndex
          ? {
              ...row,
              name:
                row.name.trim().length > 0
                  ? row.name
                  : `${candidate.name}팀`,
              captainId: candidate.id,
              captainLabel: `${candidate.name} / ${candidate.nickname}#${candidate.tag}`,
              currentTier: candidate.currentTier ?? "-",
              peakTier: candidate.peakTier ?? "-",
              captainPosition: POSITIONS.includes(candidate.mainPosition as Position)
                ? (candidate.mainPosition as Position)
                : row.captainPosition,
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
      initialAuctionPoints: Number(row.initialAuctionPoints),
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

    const hasInvalidPoints = teams.some(
      (team) => !Number.isInteger(team.initialAuctionPoints) || team.initialAuctionPoints < 0,
    );

    if (hasInvalidPoints) {
      setError("팀장 지급 포인트는 0 이상의 정수로 입력해주세요.");
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

      {captainCandidates.length > 0 ? (
        <div className="admin-form" style={{ marginBottom: 16 }}>
          <div className="admin-page__header">
            <div>
              <h3 className="admin-event-section-title">참가 신청자에서 팀장 지정</h3>
              <p className="admin-page__description">
                먼저 아래 팀 입력 행을 클릭한 뒤, 참가 신청자 목록에서 팀장으로 지정할 사람을 선택하세요. 팀장 선호/비선호와 관계없이 관리자가 최종 지정할 수 있습니다.
              </p>
            </div>
            <span className="chip-button">선택 행 {selectedRowIndex + 1}</span>
          </div>

          <div className="admin-event-participant-list">
            {captainCandidates.map((candidate) => (
              <div key={candidate.id} className="admin-event-participant-row">
                <span>
                  {candidate.name} · {candidate.nickname}#{candidate.tag}
                </span>
                <span>{candidate.mainPosition}</span>
                <span>{candidate.currentTier ?? "현재티어 없음"}</span>
                <span>{candidate.peakTier ?? "최고티어 없음"}</span>
                <strong>
                  {candidate.captainPreference === "PREFERRED"
                    ? "팀장 선호"
                    : "팀장 비선호"}
                </strong>
                <button
                  type="button"
                  className="chip-button"
                  onClick={() => applyCaptainCandidate(candidate)}
                  disabled={hasMatches}
                >
                  팀장 지정
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="destruction-team-form__list">
        {rows.map((row, index) => (
          <div
            key={index}
            className="destruction-team-form__row"
            onClick={() => setSelectedRowIndex(index)}
          >
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

            <input
              className="admin-form__input"
              type="number"
              min="0"
              value={row.initialAuctionPoints}
              onChange={(event) =>
                updateRow(index, "initialAuctionPoints", event.target.value)
              }
              placeholder="지급 포인트"
              disabled={hasMatches}
            />

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