"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type Team = "RED" | "BLUE";
type RoleType = "MAIN" | "SUB" | "AUTO";

type SearchPlayer = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
};

type PlayerRow = {
  playerId: number | null;
  name: string;
  nickname: string;
  tag: string;
  mainPosition: Position | null;
  subPositions: Position[];
  error: string;
  suggestions: SearchPlayer[];
  searching: boolean;
  selectedLabel: string;
};

type AssignedPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  team: Team;
  position: Position;
  roleType: RoleType;
  score: number;
  peakTier: string;
  currentTier: string;
  tierLabel: string;
  winRate: number;
};

type BalanceResponse = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  mainAssignedCount: number;
  subAssignedCount: number;
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
    playerId: null,
    name: "",
    nickname: "",
    tag: "",
    mainPosition: null,
    subPositions: [],
    error: "",
    suggestions: [],
    searching: false,
    selectedLabel: "",
  }));
}

function getDisplayName(row: PlayerRow) {
  if (!row.name.trim()) return "";
  if (!row.nickname.trim() || !row.tag.trim()) return row.name.trim();
  return `${row.name.trim()} (${row.nickname.trim()}#${row.tag.trim()})`;
}

function getPositionButtonClass(row: PlayerRow, position: Position) {
  if (row.mainPosition === position) {
    return "balance-position-button balance-position-button--main";
  }

  if (row.subPositions.includes(position)) {
    return "balance-position-button balance-position-button--sub";
  }

  return "balance-position-button";
}

export default function PlayersBalancePage() {
  const [rows, setRows] = useState<PlayerRow[]>(createInitialRows());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<BalanceResponse | null>(null);

  const searchTimeoutRefs = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({});

  useEffect(() => {
    return () => {
      Object.values(searchTimeoutRefs.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const canSubmit = useMemo(() => {
    return rows.every(
      (row) => row.name.trim().length > 0 && row.mainPosition !== null
    );
  }, [rows]);

  function updateRow(index: number, updater: (row: PlayerRow) => PlayerRow) {
    setRows((prev) => prev.map((row, i) => (i === index ? updater(row) : row)));
  }

  function togglePosition(index: number, position: Position) {
    updateRow(index, (row) => {
      const selected = row.mainPosition
        ? [row.mainPosition, ...row.subPositions]
        : [...row.subPositions];

      const exists = selected.includes(position);

      if (exists) {
        const filtered = selected.filter((item) => item !== position);

        return {
          ...row,
          mainPosition: filtered[0] ?? null,
          subPositions: filtered.slice(1),
        };
      }

      const next = [...selected, position];

      return {
        ...row,
        mainPosition: next[0] ?? null,
        subPositions: next.slice(1),
      };
    });
  }

  function resetForm() {
    setRows(createInitialRows());
    setResult(null);
    setErrorMessage("");
  }

  function applySearchResult(index: number, player: SearchPlayer) {
    updateRow(index, (row) => ({
      ...row,
      playerId: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      selectedLabel: `${player.name} (${player.nickname}#${player.tag})`,
      suggestions: [],
      searching: false,
      error: "",
    }));
  }

  async function searchPlayers(index: number, query: string) {
    const trimmed = query.trim();

    if (!trimmed) {
      updateRow(index, (row) => ({
        ...row,
        suggestions: [],
        searching: false,
      }));
      return;
    }

    updateRow(index, (row) => ({
      ...row,
      searching: true,
    }));

    try {
      const response = await fetch(
        `/api/players/search?q=${encodeURIComponent(trimmed)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = (await response.json()) as SearchPlayer[];

      updateRow(index, (row) => ({
        ...row,
        suggestions: Array.isArray(data) ? data : [],
        searching: false,
      }));
    } catch (error) {
      console.error(error);

      updateRow(index, (row) => ({
        ...row,
        suggestions: [],
        searching: false,
      }));
    }
  }

  function handleNameChange(index: number, value: string) {
    updateRow(index, (row) => ({
      ...row,
      name: value,
      playerId: null,
      nickname: "",
      tag: "",
      selectedLabel: "",
      error: "",
    }));

    const existingTimer = searchTimeoutRefs.current[index];
    if (existingTimer) clearTimeout(existingTimer);

    searchTimeoutRefs.current[index] = setTimeout(() => {
      searchPlayers(index, value);
    }, 250);
  }

  function clearSuggestions(index: number) {
    updateRow(index, (row) => ({
      ...row,
      suggestions: [],
      searching: false,
    }));
  }

  function buildCopyText(target: BalanceResponse) {
    const sortByPosition = (players: AssignedPlayer[]) => {
      const orderMap: Record<Position, number> = {
        TOP: 0,
        JGL: 1,
        MID: 2,
        ADC: 3,
        SUP: 4,
      };

      return [...players].sort(
        (a, b) => orderMap[a.position] - orderMap[b.position]
      );
    };

    const positionLabelMap: Record<Position, string> = {
      TOP: "top",
      JGL: "jg",
      MID: "mid",
      ADC: "ad",
      SUP: "sup",
    };

    const formatTeam = (teamName: string, players: AssignedPlayer[]) => {
      return [
        teamName,
        ...sortByPosition(players).map(
          (player) =>
            `${positionLabelMap[player.position]} ${player.name}(${player.nickname}#${player.tag}) ${player.tierLabel}`
        ),
      ].join("\n");
    };

    return `${formatTeam("RED팀", target.red)}\n\n${formatTeam("BLUE팀", target.blue)}`;
  }

  async function handleCopy() {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(buildCopyText(result));
      alert("복사 완료");
    } catch (error) {
      console.error(error);
      alert("복사에 실패했습니다.");
    }
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
            mainPosition: row.mainPosition,
            subPositions: row.subPositions,
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
            플레이어 10명의 이름과 포지션을 입력하면 현재티어·최대티어·승률을
            기준으로 균형 잡힌 RED / BLUE 조합을 추천합니다. 첫 번째로 누른
            포지션은 주 포지션, 이후 선택은 부 포지션으로 처리됩니다.
          </p>
        </div>

        <section className="card balance-form-card">
          <div className="balance-form-head">
            <div className="balance-form-head__title">플레이어 입력</div>
            <div className="balance-form-head__desc">
              총 10명 / 이름 검색 가능 / 첫 선택 = 주 포지션(100%), 추가 선택 =
              부 포지션(80%)
            </div>
          </div>

          <div className="balance-input-list">
            {rows.map((row, index) => (
              <div
                key={index}
                className="balance-input-row balance-input-row--stack"
              >
                <div className="balance-input-row__index">{index + 1}</div>

                <div className="balance-search-block">
                  <input
                    className="balance-text-input"
                    placeholder="이름 입력"
                    value={row.name}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                    onBlur={() => {
                      setTimeout(() => clearSuggestions(index), 120);
                    }}
                  />

                  {row.searching ? (
                    <div className="balance-search-status">검색 중...</div>
                  ) : null}

                  {row.selectedLabel ? (
                    <div className="balance-selected-player">
                      선택됨: {row.selectedLabel}
                    </div>
                  ) : null}

                  {row.error ? (
                    <div className="balance-error-text">{row.error}</div>
                  ) : null}

                  {row.suggestions.length > 0 ? (
                    <div className="balance-suggestion-list">
                      {row.suggestions.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className="balance-suggestion-item"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applySearchResult(index, player)}
                        >
                          <div className="balance-suggestion-item__name">
                            {player.name}
                          </div>
                          <div className="balance-suggestion-item__meta">
                            {player.nickname}#{player.tag}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="balance-position-group">
                  {POSITIONS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      className={getPositionButtonClass(row, position)}
                      onClick={() => togglePosition(index, position)}
                    >
                      {position}
                    </button>
                  ))}
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
              className="app-button"
              onClick={handleCopy}
              disabled={!result}
            >
              결과 복사
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
          <>
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
                        {player.tierLabel} /{" "}
                        {player.roleType === "MAIN"
                          ? "주 포지션"
                          : player.roleType === "SUB"
                          ? "부 포지션"
                          : "자동 배정"}
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
                        {player.tierLabel} /{" "}
                        {player.roleType === "MAIN"
                          ? "주 포지션"
                          : player.roleType === "SUB"
                          ? "부 포지션"
                          : "자동 배정"}
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
                  <div>주 포지션 배정 수: {result.mainAssignedCount}명</div>
                  <div>부 포지션 배정 수: {result.subAssignedCount}명</div>
                  <div>자동 배정 수: {result.autoAssignedCount}명</div>
                </div>
              </div>
            </section>

            <section className="card balance-form-card">
              <div className="balance-form-head">
                <div className="balance-form-head__title">복사용 결과</div>
                <div className="balance-form-head__desc">
                  아래 내용은 결과 복사 버튼과 동일합니다.
                </div>
              </div>

              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  lineHeight: 1.7,
                }}
              >
                {buildCopyText(result)}
              </pre>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}