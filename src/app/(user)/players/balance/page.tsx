"use client";

import { useMemo, useState } from "react";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type Team = "RED" | "BLUE";

type PlayerRow = {
  name: string;
  preferredPositions: Position[];
  error: string;
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

type ErrorResponse = {
  message: string;
  invalidNames?: string[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function createInitialRows(): PlayerRow[] {
  return Array.from({ length: 10 }, () => ({
    name: "",
    preferredPositions: [],
    error: "",
  }));
}

export default function PlayersBalancePage() {
  const [rows, setRows] = useState<PlayerRow[]>(createInitialRows());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<BalanceResponse | null>(null);

  const canSubmit = useMemo(() => {
    return rows.every(
      (row) => row.name.trim().length > 0 && row.preferredPositions.length >= 1
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

  function resetForm() {
    setRows(createInitialRows());
    setResult(null);
    setErrorMessage("");
  }

  async function handleSubmit() {
    setLoading(true);
    setErrorMessage("");
    setResult(null);

    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        error: "",
      }))
    );

    try {
      const response = await fetch("/api/players/balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          players: rows.map((row) => ({
            name: row.name.trim(),
            preferredPositions: row.preferredPositions,
          })),
        }),
      });

      const data = (await response.json()) as BalanceResponse | ErrorResponse;

      if (!response.ok) {
        const message =
          "message" in data ? data.message : "팀 밸런스 계산에 실패했습니다.";

        const invalidNames =
          "invalidNames" in data && Array.isArray(data.invalidNames)
            ? data.invalidNames
            : [];

        if (invalidNames.length > 0) {
          const invalidNameSet = new Set(
            invalidNames.map((name) => name.trim().toLowerCase())
          );

          setRows((prev) =>
            prev.map((row) => ({
              ...row,
              error: invalidNameSet.has(row.name.trim().toLowerCase())
                ? "등록되어있지 않습니다."
                : "",
            }))
          );
        }

        setErrorMessage(message);
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
            플레이어 10명의 이름과 선호 라인을 입력하면, 현재티어·최대티어·승률과
            라인 점수표를 기준으로 가장 균형 잡힌 RED / BLUE 조합을 추천합니다.
            비선호 라인 배정 시 해당 플레이어 점수의 10%가 차감됩니다.
          </p>
        </div>

        <section className="card balance-form-card">
          <div className="balance-form-head">
            <div className="balance-form-head__title">플레이어 입력</div>
            <div className="balance-form-head__desc">
              총 10명 / 이름 직접 입력 / 각 플레이어 최소 1개 라인 선택
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
                    value={row.name}
                    onChange={(e) =>
                      updateRow(index, (current) => ({
                        ...current,
                        name: e.target.value,
                        error: "",
                      }))
                    }
                  />

                  {row.error ? (
                    <div className="balance-error-text">{row.error}</div>
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