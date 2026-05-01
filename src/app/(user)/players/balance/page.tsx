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
  currentTier?: string | null;
  peakTier?: string | null;
};

type PlayerRow = {
  playerId: number | null;
  name: string;
  nickname: string;
  tag: string;
  mainPosition: Position | null;
  mainPositions: Position[];
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
  adjustedScore?: number;
  rankScore?: number;
  bonus?: number;
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
type ApplyPosition = Position | "ALL";

type SeasonApplyPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  mainPosition: ApplyPosition | null;
  subPositions: ApplyPosition[];
};

type SeasonApplyGroup = {
  key: string;
  label: string;
  applyDate: string;
  order: number;
  count: number;
  players: SeasonApplyPlayer[];
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
    mainPositions: [],
    subPositions: [],
    error: "",
    suggestions: [],
    searching: false,
    selectedLabel: "",
  }));
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
  const [importLoading, setImportLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [seasonApplyGroups, setSeasonApplyGroups] = useState<
    SeasonApplyGroup[]
  >([]);
  const [selectedSeasonApplyGroupKey, setSelectedSeasonApplyGroupKey] =
    useState("");
  const searchTimeoutRefs = useRef<
    Record<number, ReturnType<typeof setTimeout> | null>
  >({});

  useEffect(() => {
  const timeoutRefs = searchTimeoutRefs.current;

  return () => {
    Object.values(timeoutRefs).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  };
}, []);
  useEffect(() => {
    loadSeasonApplyGroups().catch((error: unknown) => {
      console.error("[LOAD_SEASON_APPLY_GROUPS_ERROR]", error);
    });
  }, []);

  const canSubmit = useMemo(() => {
    return rows.every(
      (row) => row.name.trim().length > 0 && row.mainPositions.length > 0,
    );
  }, [rows]);

  function updateRow(index: number, updater: (row: PlayerRow) => PlayerRow) {
    setRows((prev) => prev.map((row, i) => (i === index ? updater(row) : row)));
  }

  function togglePosition(index: number, position: Position) {
    updateRow(index, (row) => {
      if (row.mainPositions.length === POSITIONS.length) {
        return {
          ...row,
          mainPosition: position,
          mainPositions: [position],
          subPositions: [],
        };
      }

      const selected = row.mainPosition
        ? [row.mainPosition, ...row.subPositions]
        : [...row.subPositions];

      const exists = selected.includes(position);

      if (exists) {
        const filtered = selected.filter((item) => item !== position);

        return {
          ...row,
          mainPosition: filtered[0] ?? null,
          mainPositions: filtered[0] ? [filtered[0]] : [],
          subPositions: filtered.slice(1),
        };
      }

      const next = [...selected, position];

      return {
        ...row,
        mainPosition: next[0] ?? null,
        mainPositions: next[0] ? [next[0]] : [],
        subPositions: next.slice(1),
      };
    });
  }
  function toggleAllMainPositions(index: number) {
    updateRow(index, (row) => {
      const isAllSelected = row.mainPositions.length === POSITIONS.length;

      if (isAllSelected) {
        return {
          ...row,
          mainPosition: null,
          mainPositions: [],
          subPositions: [],
        };
      }

      return {
        ...row,
        mainPosition: POSITIONS[0],
        mainPositions: [...POSITIONS],
        subPositions: [],
      };
    });
  }
  function resetForm() {
    setRows(createInitialRows());
    setResult(null);
    setErrorMessage("");
  }
  function normalizeApplyPositions(
    mainPosition: ApplyPosition | null,
    subPositions: ApplyPosition[],
  ): {
    mainPosition: Position | null;
    mainPositions: Position[];
    subPositions: Position[];
  } {
    if (mainPosition === "ALL") {
      return {
        mainPosition: POSITIONS[0],
        mainPositions: [...POSITIONS],
        subPositions: [],
      };
    }

    if (!mainPosition) {
      return {
        mainPosition: null,
        mainPositions: [],
        subPositions: [],
      };
    }

    const normalizedSubs = subPositions.includes("ALL")
      ? POSITIONS.filter((position) => position !== mainPosition)
      : subPositions.filter(
          (position): position is Position =>
            position !== "ALL" && position !== mainPosition,
        );

    return {
      mainPosition,
      mainPositions: [mainPosition],
      subPositions: normalizedSubs,
    };
  }

  async function loadSeasonApplyGroups(): Promise<SeasonApplyGroup[]> {
    const response = await fetch("/api/team-balance/season-applies", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      message?: string;
      groups?: SeasonApplyGroup[];
    };

    if (!response.ok) {
      throw new Error(data.message || "참가 신청자 그룹 조회 실패");
    }

    const groups = Array.isArray(data.groups) ? data.groups : [];

    setSeasonApplyGroups(groups);
    setSelectedSeasonApplyGroupKey((prev) => {
      if (prev && groups.some((group) => group.key === prev)) {
        return prev;
      }

      return groups[0]?.key ?? "";
    });

    return groups;
  }

  async function handleImportSeasonApplies() {
    try {
      setImportLoading(true);
      setErrorMessage("");
      setResult(null);

      if (seasonApplyGroups.length === 0) {
        await loadSeasonApplyGroups();
      }

      const targetGroup =
        seasonApplyGroups.find(
          (group) => group.key === selectedSeasonApplyGroupKey,
        ) ?? seasonApplyGroups[0];

      if (!targetGroup) {
        alert("최근 3일 이내 참가 신청자가 없습니다.");
        return;
      }

      const players = targetGroup.players ?? [];

      if (players.length === 0) {
        alert("선택한 그룹에 참가 신청자가 없습니다.");
        return;
      }

      if (players.length !== 10) {
        alert(
          `선택한 그룹은 ${players.length}명입니다. 10명 미만이면 빈 칸이 남습니다.`,
        );
      }

      const nextRows = createInitialRows();

      players.slice(0, 10).forEach((player, index) => {
        const positions = normalizeApplyPositions(
          player.mainPosition,
          player.subPositions,
        );

        nextRows[index] = {
          ...nextRows[index],
          playerId: player.playerId,
          name: player.name,
          nickname: player.nickname,
          tag: player.tag,
          selectedLabel: `${player.name} (${player.nickname}#${player.tag})`,
          mainPosition: positions.mainPosition,
          mainPositions: positions.mainPositions,
          subPositions: positions.subPositions,
        };
      });

      setRows(nextRows);
      alert(
        `${targetGroup.label} 그룹에서 ${Math.min(players.length, 10)}명을 불러왔습니다.`,
      );
    } catch (error: unknown) {
      console.error("[IMPORT_SEASON_APPLIES_ERROR]", error);
      alert("참가 신청자 가져오기 중 오류가 발생했습니다.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleSaveBalanceDraft() {
    if (!result) {
      alert("저장할 팀 밸런스 결과가 없습니다. 먼저 팀 밸런스를 계산해주세요.");
      return;
    }

    try {
      setSaveLoading(true);

      const players = [
        ...result.blue.map((player) => ({
          playerId: player.playerId,
          team: "BLUE",
          position: player.position,
        })),
        ...result.red.map((player) => ({
          playerId: player.playerId,
          team: "RED",
          position: player.position,
        })),
      ];

      const response = await fetch("/api/team-balance/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          players,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "팀 밸런스 저장 실패");
        return;
      }

      alert("팀 밸런스 결과가 저장되었습니다.");
    } catch (error: unknown) {
      console.error("[SAVE_BALANCE_DRAFT_ERROR]", error);
      alert("팀 밸런스 저장 중 오류가 발생했습니다.");
    } finally {
      setSaveLoading(false);
    }
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
      const excludeIds = rows
        .map((row, rowIndex) => (rowIndex === index ? null : row.playerId))
        .filter((playerId): playerId is number => typeof playerId === "number");

      const searchParams = new URLSearchParams({ q: trimmed });

      if (excludeIds.length > 0) {
        searchParams.set("exclude", excludeIds.join(","));
      }

      const response = await fetch(
        `/api/players/search?${searchParams.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        },
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

  function sortByPosition(players: AssignedPlayer[]) {
    const orderMap: Record<Position, number> = {
      TOP: 0,
      JGL: 1,
      MID: 2,
      ADC: 3,
      SUP: 4,
    };

    return [...players].sort(
      (a, b) => orderMap[a.position] - orderMap[b.position],
    );
  }

  function buildCopyText(target: BalanceResponse) {
    const formatNames = (players: AssignedPlayer[]) => {
      return sortByPosition(players)
        .map((player) => player.name)
        .join(" ");
    };

    return `RED ${formatNames(target.red)}\nBLUE ${formatNames(target.blue)}`;
  }

  function normalizeResult(nextRed: AssignedPlayer[], nextBlue: AssignedPlayer[]) {
    const redTotal = nextRed.reduce((sum, player) => sum + player.score, 0);
    const blueTotal = nextBlue.reduce((sum, player) => sum + player.score, 0);
    const allPlayers = [...nextRed, ...nextBlue];

    return {
      redTotal: Number(redTotal.toFixed(2)),
      blueTotal: Number(blueTotal.toFixed(2)),
      diff: Number(Math.abs(redTotal - blueTotal).toFixed(2)),
      mainAssignedCount: allPlayers.filter((player) => player.roleType === "MAIN").length,
      subAssignedCount: allPlayers.filter((player) => player.roleType === "SUB").length,
      autoAssignedCount: allPlayers.filter((player) => player.roleType === "AUTO").length,
      red: sortByPosition(nextRed).map((player) => ({ ...player, team: "RED" as Team })),
      blue: sortByPosition(nextBlue).map((player) => ({ ...player, team: "BLUE" as Team })),
    };
  }


  function swapResultPlayers(sourcePlayerId: number, targetPlayerId: number) {
    if (sourcePlayerId === targetPlayerId) return;

    setResult((prev) => {
      if (!prev) return prev;

      const allPlayers = [...prev.red, ...prev.blue];
      const source = allPlayers.find((player) => player.playerId === sourcePlayerId);
      const target = allPlayers.find((player) => player.playerId === targetPlayerId);

      if (!source || !target) return prev;

      const nextPlayers = allPlayers.map((player) => {
        if (player.playerId === source.playerId) {
          return {
            ...player,
            team: target.team,
            position: target.position,
          };
        }

        if (player.playerId === target.playerId) {
          return {
            ...player,
            team: source.team,
            position: source.position,
          };
        }

        return player;
      });

      const nextRed = nextPlayers.filter((player) => player.team === "RED");
      const nextBlue = nextPlayers.filter((player) => player.team === "BLUE");

      return normalizeResult(nextRed, nextBlue);
    });
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
      })),
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
            mainPositions: row.mainPositions,
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
            invalidNames.map((name) => name.trim().toLowerCase()),
          );

          setRows((prev) =>
            prev.map((row) => ({
              ...row,
              error: invalidNameSet.has(row.name.trim().toLowerCase())
                ? "등록되어있지 않습니다."
                : "",
            })),
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

  function renderTeamRows(team: Team, players: AssignedPlayer[]) {
    return sortByPosition(players).map((player) => {
      const isDragging = draggingPlayerId === player.playerId;
      const bonusText = player.bonus ? `+${player.bonus}` : "없음";

      return (
        <div
          key={`${team}-${player.playerId}`}
          className={[
            "balance-player-card",
            isDragging ? "balance-player-card--dragging" : "",
            player.roleType === "SUB" ? "balance-player-card--sub" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(player.playerId));
            setDraggingPlayerId(player.playerId);
          }}
          onDragEnd={() => setDraggingPlayerId(null)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const sourceId = Number(event.dataTransfer.getData("text/plain"));
            if (!Number.isInteger(sourceId)) return;
            swapResultPlayers(sourceId, player.playerId);
            setDraggingPlayerId(null);
          }}
          title="선수 카드를 다른 선수 카드 위로 드래그하면 두 선수의 팀/라인이 교체됩니다."
        >
          <div className="balance-position-badge">{player.position}</div>

          <div className="balance-player-main">
            <p className="balance-player-name">
              {player.name}
              <span className="balance-player-nickname">
                {" "}({player.nickname}#{player.tag})
              </span>
            </p>

            <div className="balance-player-info">
              <div className="balance-player-info-row">
                현재티어 : <strong>{player.currentTier || "미등록"}</strong>
              </div>
              <div className="balance-player-info-row">
                최대티어 : <strong>{player.peakTier || "미등록"}</strong>
              </div>
              <div className="balance-player-info-row">
                최종점수 : <span className="balance-player-score">{player.score.toFixed(1)}</span>
              </div>
              <div className="balance-player-info-row">
                S급 보정 : <span className={player.bonus ? "balance-player-bonus" : "balance-player-bonus balance-player-bonus--none"}>{bonusText}</span>
              </div>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <main className="page-container">
      <div className="balance-page">
        <div className="page-header">
          <div>
            <p className="page-eyebrow">TEAM BALANCE</p>
            <h1 className="page-title">팀 밸런스</h1>
          </div>
        </div>

        <section className="card balance-form-card">
          <div className="balance-form-head">
            <div className="balance-form-head__title">플레이어 입력</div>
          </div>
          <div className="balance-action-row">
            <select
              className="balance-text-input"
              value={selectedSeasonApplyGroupKey}
              onChange={(event) =>
                setSelectedSeasonApplyGroupKey(event.target.value)
              }
              disabled={importLoading || seasonApplyGroups.length === 0}
            >
              {seasonApplyGroups.length === 0 ? (
                <option value="">최근 3일 이내 참가 신청 없음</option>
              ) : (
                seasonApplyGroups.map((group) => (
                  <option key={group.key} value={group.key}>
                    {group.label} · {group.count}명
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              className="balance-action-button"
              onClick={handleImportSeasonApplies}
              disabled={importLoading || seasonApplyGroups.length === 0}
            >
              {importLoading ? "불러오는 중..." : "참가 신청자 가져오기"}
            </button>

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
                  <button
                    type="button"
                    className={
                      row.mainPositions.length === POSITIONS.length
                        ? "balance-position-button balance-position-button--main"
                        : "balance-position-button"
                    }
                    onClick={() => toggleAllMainPositions(index)}
                  >
                    ALL
                  </button>

                  {POSITIONS.map((position) => (
                    <button
                      key={position}
                      type="button"
                      className={
                        row.mainPositions.includes(position)
                          ? "balance-position-button balance-position-button--main"
                          : getPositionButtonClass(row, position)
                      }
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
            <section className="balance-result-teams">
              <div className="balance-team-panel balance-team-panel--red">
                <div className="balance-team-header">
                  <h2 className="balance-team-title balance-team-title--red">RED</h2>
                  <span className="balance-team-total">총점 {result.redTotal.toFixed(1)}</span>
                </div>

                <div className="balance-team-list">
                  {renderTeamRows("RED", result.red)}
                </div>
              </div>

              <div className="balance-team-panel balance-team-panel--blue">
                <div className="balance-team-header">
                  <h2 className="balance-team-title balance-team-title--blue">BLUE</h2>
                  <span className="balance-team-total">총점 {result.blueTotal.toFixed(1)}</span>
                </div>

                <div className="balance-team-list">
                  {renderTeamRows("BLUE", result.blue)}
                </div>
              </div>

              <div className="balance-result-bottom">
                <section className="card balance-summary-card balance-summary-card--compact">
                  <div className="balance-summary-card__title">
                    계산 결과 요약
                  </div>
                  <div className="balance-form-head__desc">
                    선수 카드를 다른 선수 카드 위로 드래그하면 두 선수의 팀과 라인이 서로 교체됩니다.
                  </div>

                  <div className="balance-summary-list balance-summary-list--compact">
                    <div>RED 총점: {result.redTotal.toFixed(1)}</div>
                    <div>주 포지션 배정 수: {result.mainAssignedCount}명</div>
                    <div>BLUE 총점: {result.blueTotal.toFixed(1)}</div>
                    <div>부 포지션 배정 수: {result.subAssignedCount}명</div>
                    <div>점수 차이: {result.diff.toFixed(1)}</div>
                    <div>자동 배정 수: {result.autoAssignedCount}명</div>
                  </div>
                </section>

                <section className="card balance-result-utility">
                  <div className="balance-result-utility__header">
                    <div>
                      <div className="balance-result-utility__title">결과 활용</div>
                      <div className="balance-result-utility__desc">
                        저장하거나 디스코드에 복사할 수 있습니다.
                      </div>
                    </div>

                    <div className="balance-result-utility__buttons">
                      <button
                        type="button"
                        className="app-button balance-compact-button"
                        onClick={handleSaveBalanceDraft}
                        disabled={saveLoading || !result}
                      >
                        {saveLoading ? "저장 중..." : "결과 저장"}
                      </button>

                      <button
                        type="button"
                        className="app-button balance-compact-button balance-compact-button--copy"
                        onClick={handleCopy}
                        disabled={!result}
                      >
                        복사
                      </button>
                    </div>
                  </div>

                  <div className="balance-copy-box">
                    <div className="balance-copy-box__title">복사용 결과</div>
                    <pre className="balance-copy-box__content">
                      {buildCopyText(result)}
                    </pre>
                  </div>
                </section>
              </div>
            </section>

          </>
        ) : null}

      <style jsx global>{`
        .balance-result-teams {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          margin-top: 28px;
        }

        .balance-team-panel {
          padding: 22px;
          border-radius: 24px;
          background:
            radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.16), transparent 34%),
            linear-gradient(145deg, rgba(8, 22, 43, 0.96), rgba(10, 30, 55, 0.96));
          border: 1px solid rgba(96, 165, 250, 0.32);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
        }

        .balance-team-panel--red {
          border-color: rgba(248, 113, 113, 0.48);
          box-shadow:
            0 18px 45px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px rgba(248, 113, 113, 0.08);
        }

        .balance-team-panel--blue {
          border-color: rgba(96, 165, 250, 0.55);
          box-shadow:
            0 18px 45px rgba(0, 0, 0, 0.35),
            inset 0 0 0 1px rgba(96, 165, 250, 0.1);
        }

        .balance-team-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 18px;
        }

        .balance-team-title {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #f8fafc;
        }

        .balance-team-title--red { color: #fecaca; }
        .balance-team-title--blue { color: #bfdbfe; }

        .balance-team-total {
          padding: 6px 12px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(148, 163, 184, 0.28);
          color: #dbeafe;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }

        .balance-player-card {
          position: relative;
          display: grid;
          grid-template-columns: 66px minmax(0, 1fr);
          gap: 16px;
          align-items: center;
          padding: 18px;
          border-radius: 18px;
          background:
            linear-gradient(145deg, rgba(15, 35, 65, 0.98), rgba(9, 24, 48, 0.98));
          border: 1px solid rgba(96, 165, 250, 0.28);
          color: #f8fafc;
        }
        .balance-player-card--sub::after {
          content: "SUB";
          position: absolute;
          top: 6px;
          right: 8px;
          padding: 2px 6px;
          border-radius: 999px;
          background: rgba(56, 189, 248, 0.9);
          color: #ffffff;
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
          pointer-events: none;
        }
        .balance-player-card + .balance-player-card { margin-top: 12px; }

        .balance-player-card:hover {
          transform: translateY(-2px);
          border-color: rgba(147, 197, 253, 0.65);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
        }

        .balance-player-card--dragging {
          opacity: 0.55;
          outline: 1px dashed rgba(255, 255, 255, 0.55);
        }

        .balance-position-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          border-radius: 12px;
          background: rgba(2, 6, 23, 0.82);
          border: 1px solid rgba(96, 165, 250, 0.35);
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .balance-player-main { min-width: 0; }

        .balance-player-name {
          margin: 0 0 8px;
          color: #ffffff;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.35;
          word-break: keep-all;
        }

        .balance-player-nickname {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 600;
        }

        .balance-player-info {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 18px;
          margin-top: 8px;
        }

        .balance-player-info-row {
          color: #cbd5e1;
          font-size: 13px;
          line-height: 1.45;
        }

        .balance-player-info-row strong {
          color: #f8fafc;
          font-weight: 800;
        }

        .balance-player-score {
          color: #dbeafe;
          font-weight: 800;
        }

        .balance-player-bonus {
          color: #93c5fd;
          font-weight: 800;
        }

        .balance-player-bonus--none { color: #94a3b8; }


        /* 결과 하단 정리형 레이아웃 */
        .balance-result-bottom {
          grid-column: 1 / -1 !important;
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          gap: 20px !important;
          align-items: stretch !important;
          width: 100% !important;
          margin-top: 2px !important;
        }

        .balance-result-bottom .card {
          min-width: 0 !important;
          margin: 0 !important;
        }

        .balance-result-bottom .balance-summary-card,
        .balance-summary-card--compact {
          grid-column: auto !important;
          width: 100% !important;
        }

        .balance-summary-card--compact,
        .balance-result-utility {
          padding: 22px !important;
          border-radius: 20px !important;
          background:
            radial-gradient(circle at 16% 0%, rgba(59, 130, 246, 0.14), transparent 34%),
            linear-gradient(145deg, rgba(8, 22, 43, 0.96), rgba(10, 30, 55, 0.96)) !important;
          border: 1px solid rgba(96, 165, 250, 0.32) !important;
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28) !important;
        }

        .balance-summary-list--compact {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px 18px !important;
          margin-top: 14px !important;
        }

        .balance-result-utility {
          display: grid !important;
          grid-template-rows: auto 1fr !important;
          gap: 14px !important;
          align-content: start !important;
        }

        .balance-result-utility__header {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 16px !important;
        }

        .balance-result-utility__title {
          color: #f8fafc !important;
          font-size: 16px !important;
          font-weight: 900 !important;
          line-height: 1.2 !important;
        }

        .balance-result-utility__desc {
          margin-top: 5px !important;
          color: #94a3b8 !important;
          font-size: 12px !important;
          font-weight: 700 !important;
          line-height: 1.5 !important;
        }

        .balance-result-utility__buttons {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 8px !important;
          flex-shrink: 0 !important;
        }

        .balance-compact-button {
          min-height: 32px !important;
          height: 32px !important;
          padding: 0 11px !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          white-space: nowrap !important;
          box-shadow: none !important;
        }

        .balance-compact-button--copy {
          background: rgba(15, 23, 42, 0.7) !important;
          border-color: rgba(148, 163, 184, 0.35) !important;
        }

        .balance-copy-box {
          display: grid !important;
          gap: 8px !important;
          min-width: 0 !important;
          width: 100% !important;
          min-height: 96px !important;
          padding: 14px 16px !important;
          border-radius: 16px !important;
          background: rgba(2, 6, 23, 0.38) !important;
          border: 1px solid rgba(148, 163, 184, 0.2) !important;
        }

        .balance-copy-box__title {
          color: #e2e8f0 !important;
          font-size: 12px !important;
          font-weight: 900 !important;
        }

        .balance-copy-box__content {
          margin: 0 !important;
          white-space: pre-wrap !important;
          font-family: inherit !important;
          font-size: 14px !important;
          line-height: 1.7 !important;
          color: #dbeafe !important;
          overflow-wrap: anywhere !important;
        }

        @media (max-width: 900px) {
          .balance-result-teams { grid-template-columns: 1fr; }
          .balance-result-bottom { grid-template-columns: 1fr !important; }
          .balance-result-utility__header { flex-direction: column !important; }
          .balance-result-utility__buttons { width: 100% !important; justify-content: stretch !important; }
          .balance-compact-button { flex: 1; }
          .balance-summary-list--compact { grid-template-columns: 1fr !important; }
          .balance-player-info { grid-template-columns: 1fr; }
        }
      `}</style>
      </div>
    </main>
  );
}
