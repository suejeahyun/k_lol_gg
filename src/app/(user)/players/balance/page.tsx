"use client";

import { useMemo, useState } from "react";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type Team = "RED" | "BLUE";

type SearchPlayer = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  currentTier: string | null;
  peakTier: string | null;
};

type PlayerRow = {
  playerId: number | null;
  nameInput: string;
  selectedPlayer: SearchPlayer | null;
  preferredPositions: Position[];
  suggestions: SearchPlayer[];
  isSuggestOpen: boolean;
};

type AssignedPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  team: Team;
  position: Position;
  preferred: boolean;
  score: number;
  peakTier: string;
  currentTier: string;
  winRate: number;
};

type BalanceResponse = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  preferredAssignedCount: number;
  autoAssignedCount: number;
  red: AssignedPlayer[];
  blue: AssignedPlayer[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createInitialRows(): PlayerRow[] {
  return Array.from({ length: 10 }, () => ({
    playerId: null,
    nameInput: "",
    selectedPlayer: null,
    preferredPositions: [],
    suggestions: [],
    isSuggestOpen: false,
  }));
}

export default function PlayersBalancePage() {
  const [rows, setRows] = useState<PlayerRow[]>(createInitialRows());
  const [loading, setLoading] = useState(false);
  const [searchLoadingIndex, setSearchLoadingIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<BalanceResponse | null>(null);

  const selectedIds = useMemo(
    () => rows.map((row) => row.playerId).filter(Boolean) as number[],
    [rows]
  );

  const canSubmit = useMemo(() => {
    return rows.every(
      (row) => row.playerId !== null && row.preferredPositions.length >= 1
    );
  }, [rows]);

  function updateRow(index: number, updater: (row: PlayerRow) => PlayerRow) {
    setRows((prev) => prev.map((row, i) => (i === index ? updater(row) : row)));
  }

  function togglePosition(index: number, position: Position) {
    updateRow(index, (row) => {
      const exists = row.preferredPositions.includes(position);

      return {
        ...row,
        preferredPositions: exists
          ? row.preferredPositions.filter((item) => item !== position)
          : [...row.preferredPositions, position],
      };
    });
  }

  async function searchPlayers(index: number, value: string) {
    updateRow(index, (row) => ({
      ...row,
      nameInput: value,
      playerId: null,
      selectedPlayer: null,
      isSuggestOpen: true,
    }));

    if (!value.trim()) {
      updateRow(index, (row) => ({
        ...row,
        suggestions: [],
        isSuggestOpen: false,
      }));
      return;
    }

    try {
      setSearchLoadingIndex(index);

      const excludeIds = selectedIds
        .filter((id) => id !== rows[index]?.playerId)
        .join(",");

      const response = await fetch(
        `/api/players/balance-search?q=${encodeURIComponent(
          value
        )}&exclude=${encodeURIComponent(excludeIds)}`
      );

      const data = (await response.json()) as SearchPlayer[];

      updateRow(index, (row) => ({
        ...row,
        suggestions: Array.isArray(data) ? data : [],
        isSuggestOpen: true,
      }));
    } catch (error) {
      console.error(error);
      updateRow(index, (row) => ({
        ...row,
        suggestions: [],
        isSuggestOpen: false,
      }));
    } finally {
      setSearchLoadingIndex(null);
    }
  }

  function selectPlayer(index: number, player: SearchPlayer) {
    updateRow(index, (row) => ({
      ...row,
      playerId: player.id,
      nameInput: player.name,
      selectedPlayer: player,
      suggestions: [],
      isSuggestOpen: false,
    }));
  }

  function resetForm() {
    setRows(createInitialRows());
    setResult(null);
    setErrorMessage("");
  }

  async function handleSubmit() {
    setLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      const response = await fetch("/api/players/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          players: rows.map((row) => ({
            playerId: row.playerId,
            preferredPositions: row.preferredPositions,
          })),
        }),
      });

      const data = (await response.json()) as BalanceResponse | { message: string };

      if (!response.ok) {
        setErrorMessage(
          "message" in data ? data.message : "팀 밸런스 계산에 실패했습니다."
        );
        return;
      }

      setResult(data as BalanceResponse);
    } catch (error) {
      console.error(error);
      setErrorMessage("팀 밸런스 계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-container">
      <div className="balance-page">
        <div className="balance-page__header">
          <h1 className="page-title">팀 밸런스</h1>
          <p className="balance-page__description">
            플레이어 10명을 이름으로 검색해 선택하고 선호 라인을 입력하면,
            현재티어·최대티어·승률과 라인 점수표를 기준으로 가장 균형 잡힌
            RED / BLUE 조합을 추천합니다. 비선호 라인 배정 시 해당 플레이어 점수의
            10%가 차감됩니다.
          </p>
        </div>

        <section className="card balance-form-card">
          <div className="balance-form-head">
            <div className="balance-form-head__title">플레이어 입력</div>
            <div className="balance-form-head__desc">
              총 10명 / 이름 자동완성 선택 / 각 플레이어 최소 1개 라인 선택
            </div>
          </div>

          <div className="balance-input-list">
            {rows.map((row, index) => (
              <div key={index} className="balance-input-row balance-input-row--stack">
                <div className="balance-input-row__index">{index + 1}</div>

                <div className="balance-search-block">
                  <input
                    className="balance-text-input"
                    placeholder="이름 입력"
                    value={row.nameInput}
                    onChange={(e) => searchPlayers(index, e.target.value)}
                    onFocus={() => {
                      if (row.suggestions.length > 0) {
                        updateRow(index, (current) => ({
                          ...current,
                          isSuggestOpen: true,
                        }));
                      }
                    }}
                  />

                  {searchLoadingIndex === index ? (
                    <div className="balance-search-status">검색 중...</div>
                  ) : null}

                  {row.selectedPlayer ? (
                    <div className="balance-selected-player">
                      선택됨: {row.selectedPlayer.name} ({row.selectedPlayer.nickname}#
                      {row.selectedPlayer.tag}) / 현재티어:{" "}
                      {row.selectedPlayer.currentTier ?? "-"} / 최대티어:{" "}
                      {row.selectedPlayer.peakTier ?? "-"}
                    </div>
                  ) : null}

                  {row.isSuggestOpen && row.suggestions.length > 0 ? (
                    <div className="balance-suggestion-list">
                      {row.suggestions.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className="balance-suggestion-item"
                          onClick={() => selectPlayer(index, player)}
                        >
                          <div className="balance-suggestion-item__name">
                            {player.name}
                          </div>
                          <div className="balance-suggestion-item__meta">
                            {player.nickname}#{player.tag} / 현재티어:{" "}
                            {player.currentTier ?? "-"} / 최대티어:{" "}
                            {player.peakTier ?? "-"}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="balance-position-group">
                  {POSITIONS.map((position) => {
                    const active = row.preferredPositions.includes(position);

                    return (
                      <button
                        key={position}
                        type="button"
                        className={
                          active
                            ? "balance-position-button active"
                            : "balance-position-button"
                        }
                        onClick={() => togglePosition(index, position)}
                      >
                        {position}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="balance-actions">
            <button
              type="button"
              className="app-button"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
            >
              {loading ? "계산 중..." : "계산하기"}
            </button>

            <button
              type="button"
              className="app-button--danger-outline"
              onClick={resetForm}
            >
              초기화
            </button>
          </div>

          {errorMessage ? (
            <div className="balance-error-box">{errorMessage}</div>
          ) : null}
        </section>

        {result ? (
          <section className="balance-result-grid">
            <div className="card balance-team-card balance-team-card--red">
              <div className="balance-team-card__title">RED 팀</div>
              <div className="balance-team-card__score">
                총점 {result.redTotal.toFixed(1)}
              </div>

              <div className="balance-team-list">
                {result.red.map((player) => (
                  <div
                    key={`${player.team}-${player.position}`}
                    className="balance-team-row"
                  >
                    <div className="balance-team-row__position">
                      {player.position}
                    </div>
                    <div className="balance-team-row__name">
                      {player.name} ({player.nickname}#{player.tag})
                    </div>
                    <div className="balance-team-row__meta">
                      {player.preferred ? "선택 라인 배정" : "자동 배정 (-10%)"}
                    </div>
                    <div className="balance-team-row__score">
                      {player.score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card balance-team-card balance-team-card--blue">
              <div className="balance-team-card__title">BLUE 팀</div>
              <div className="balance-team-card__score">
                총점 {result.blueTotal.toFixed(1)}
              </div>

              <div className="balance-team-list">
                {result.blue.map((player) => (
                  <div
                    key={`${player.team}-${player.position}`}
                    className="balance-team-row"
                  >
                    <div className="balance-team-row__position">
                      {player.position}
                    </div>
                    <div className="balance-team-row__name">
                      {player.name} ({player.nickname}#{player.tag})
                    </div>
                    <div className="balance-team-row__meta">
                      {player.preferred ? "선택 라인 배정" : "자동 배정 (-10%)"}
                    </div>
                    <div className="balance-team-row__score">
                      {player.score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card balance-summary-card">
              <div className="balance-summary-card__title">계산 결과 요약</div>
              <div className="balance-summary-list">
                <div>RED 총점: {result.redTotal.toFixed(1)}</div>
                <div>BLUE 총점: {result.blueTotal.toFixed(1)}</div>
                <div>점수 차이: {result.diff.toFixed(1)}</div>
                <div>선택 라인 배정 수: {result.preferredAssignedCount}명</div>
                <div>자동 배정 수: {result.autoAssignedCount}명</div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}