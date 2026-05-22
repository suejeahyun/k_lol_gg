"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Position, Team, RoleType, SearchPlayer, PlayerRow, AssignedPlayer, BalanceResponse, ApplyPosition, SeasonApplyGroup, ErrorResponse } from "./types";

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
  const [loadingMode, setLoadingMode] = useState<"fast" | "sync" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<BalanceResponse | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
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
          roleType: player.roleType,
          score: player.score,
          baseScore:
            player.finalBaseScore ??
            player.scoreBreakdown?.finalBaseScore ??
            player.score,
          soloBonus:
            player.soloRecentFormBonus ??
            player.scoreBreakdown?.soloRecentFormBonus ??
            0,
          positionBonus:
            player.positionSkillBonus ??
            player.scoreBreakdown?.positionSkillBonus ??
            0,
          rolePenalty:
            player.rolePenalty ?? player.scoreBreakdown?.rolePenalty ?? 0,
        })),
        ...result.red.map((player) => ({
          playerId: player.playerId,
          team: "RED",
          position: player.position,
          roleType: player.roleType,
          score: player.score,
          baseScore:
            player.finalBaseScore ??
            player.scoreBreakdown?.finalBaseScore ??
            player.score,
          soloBonus:
            player.soloRecentFormBonus ??
            player.scoreBreakdown?.soloRecentFormBonus ??
            0,
          positionBonus:
            player.positionSkillBonus ??
            player.scoreBreakdown?.positionSkillBonus ??
            0,
          rolePenalty:
            player.rolePenalty ?? player.scoreBreakdown?.rolePenalty ?? 0,
        })),
      ];

      const response = await fetch("/api/team-balance/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionType: result.planType,
          redTotal: result.redTotal,
          blueTotal: result.blueTotal,
          diff: result.diff,
          balanceCost: result.balanceCost ?? result.planCost,
          formulaVersion: result.aiJudgement ? "v3.0.0-ai" : "v3.0.0",
          isOfficial: true,
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

    const aiLine = target.aiJudgement
      ? `\nAI 판단: ${target.aiJudgement.selectedOptionNo ?? "-"}안 ${target.aiJudgement.selectedOptionTitle ?? ""} / RED ${target.aiJudgement.predictedRedWinRate.toFixed(1)}% vs BLUE ${target.aiJudgement.predictedBlueWinRate.toFixed(1)}%`
      : "";

    return `BLUE ${formatNames(target.blue)}\nRED ${formatNames(target.red)}${aiLine}`;
  }

  function getManualRoleType(
    player: AssignedPlayer,
    position: Position,
  ): RoleType {
    if (player.mainPositions?.includes(position)) return "MAIN";
    if (player.subPositions?.includes(position)) return "SUB";
    return "AUTO";
  }

  function buildManualExplanation(params: {
    player: AssignedPlayer;
    position: Position;
    roleType: RoleType;
    baseScore: number;
    rolePenalty: number;
    score: number;
  }) {
    const { player, position, roleType, baseScore, rolePenalty, score } =
      params;
    const roleText = getRoleText(roleType);

    return [
      `수동 변경 후 ${position} ${roleText} 기준으로 다시 계산되었습니다.`,
      `최종 기준점수 ${baseScore.toFixed(1)}점에서 배정 감점 ${rolePenalty.toFixed(1)}점을 반영해 ${score.toFixed(1)}점이 되었습니다.`,
      roleType === "AUTO"
        ? "선택한 주/부 포지션이 아니므로 AUTO 기준 반영률이 적용되었습니다."
        : `${position}은(는) ${roleText}에 해당합니다.`,
      ...(Array.isArray(player.explanation)
        ? player.explanation.slice(0, 2)
        : []),
    ];
  }

  function getManualScore(player: AssignedPlayer, position: Position) {
    const roleType = getManualRoleType(player, position);
    const baseScore =
      typeof player.finalBaseScore === "number"
        ? player.finalBaseScore
        : typeof player.rankScore === "number"
          ? player.rankScore + (player.bonus ?? 0)
          : player.score;

    const rolePenalty =
      roleType === "MAIN"
        ? 0
        : roleType === "SUB"
          ? (player.scoreBreakdown?.rolePenalty ?? player.rolePenalty ?? 5)
          : (player.scoreBreakdown?.rolePenalty ?? player.rolePenalty ?? 10);
    const score = Number(Math.max(0, baseScore - rolePenalty).toFixed(2));
    const roleLoss = Number(rolePenalty.toFixed(2));
    const multiplier = 1;

    return {
      roleType,
      score,
      scoreBreakdown: {
        ...player.scoreBreakdown,
        currentTierScore:
          player.currentTierScore ?? player.scoreBreakdown?.currentTierScore,
        peakTierScore:
          player.peakTierScore ?? player.scoreBreakdown?.peakTierScore,
        inhouseScore:
          player.inhouseScore ?? player.scoreBreakdown?.inhouseScore ?? 50,
        tierBaseScore:
          player.baseTierScore ??
          player.adjustedScore ??
          player.scoreBreakdown?.tierBaseScore,
        adjustedScore:
          player.adjustedScore ??
          player.scoreBreakdown?.adjustedScore ??
          player.scoreBreakdown?.tierScore,
        tierScore:
          player.adjustedScore ??
          player.scoreBreakdown?.tierScore ??
          player.baseTierScore,
        internalRankBaseScore:
          player.scoreBreakdown?.internalRankBaseScore ??
          player.rankBaseScore ??
          0,
        rankGapFromLowest:
          player.scoreBreakdown?.rankGapFromLowest ??
          player.rankGapFromLowest ??
          0,
        rankAddedScore:
          player.scoreBreakdown?.rankAddedScore ?? player.rankAddedScore ?? 0,
        rankScore: player.rankScore ?? player.scoreBreakdown?.rankScore,
        tierWeight: player.scoreBreakdown?.tierWeight ?? player.tierWeight ?? 1,
        internalRankWeight:
          player.scoreBreakdown?.internalRankWeight ??
          player.internalRankWeight ??
          0,
        mixedBaseScore:
          player.scoreBreakdown?.mixedBaseScore ??
          player.mixedBaseScore ??
          Number(
            (
              player.adjustedScore ??
              player.scoreBreakdown?.adjustedScore ??
              player.baseTierScore ??
              0
            ).toFixed(2),
          ),
        sTierBonus: player.bonus ?? player.scoreBreakdown?.sTierBonus ?? 0,
        finalBaseScore: baseScore,
        roleMultiplier: multiplier,
        roleLoss,
        rolePenalty,
        finalScore: score,
      },
      explanation: buildManualExplanation({
        player,
        position,
        roleType,
        baseScore,
        rolePenalty,
        score,
      }),
    };
  }

  function rebuildPlayerForSlot(
    player: AssignedPlayer,
    team: Team,
    position: Position,
  ): AssignedPlayer {
    const { roleType, score, scoreBreakdown, explanation } = getManualScore(
      player,
      position,
    );

    return {
      ...player,
      team,
      position,
      roleType,
      score,
      scoreBreakdown,
      explanation,
    };
  }

  function normalizeResult(
    nextRed: AssignedPlayer[],
    nextBlue: AssignedPlayer[],
    baseResult?: BalanceResponse,
  ): BalanceResponse {
    const red = sortByPosition(
      nextRed.map((player) =>
        rebuildPlayerForSlot(player, "RED", player.position),
      ),
    );
    const blue = sortByPosition(
      nextBlue.map((player) =>
        rebuildPlayerForSlot(player, "BLUE", player.position),
      ),
    );

    const redTotal = red.reduce((sum, player) => sum + player.score, 0);
    const blueTotal = blue.reduce((sum, player) => sum + player.score, 0);
    const allPlayers = [...red, ...blue];

    const manualResult = enrichManualBalanceResult({
      redTotal: Number(redTotal.toFixed(2)),
      blueTotal: Number(blueTotal.toFixed(2)),
      diff: Number(Math.abs(redTotal - blueTotal).toFixed(2)),
      mainAssignedCount: allPlayers.filter(
        (player) => player.roleType === "MAIN",
      ).length,
      subAssignedCount: allPlayers.filter((player) => player.roleType === "SUB")
        .length,
      autoAssignedCount: allPlayers.filter(
        (player) => player.roleType === "AUTO",
      ).length,
      red,
      blue,
    });

    return {
      ...manualResult,
      soloSync: baseResult?.soloSync ?? null,
      recommendedAlternative: baseResult?.recommendedAlternative ?? null,
      aiBestAlternative: baseResult?.aiBestAlternative ?? null,
      aiCandidateCount: baseResult?.aiCandidateCount,
      aiSearchScope: baseResult?.aiSearchScope,
      alternatives: baseResult?.alternatives,
    };
  }

  function getLineComparisons(target: BalanceResponse) {
    return POSITIONS.map((position) => {
      const red =
        target.red.find((player) => player.position === position) ?? null;
      const blue =
        target.blue.find((player) => player.position === position) ?? null;
      const diff = red && blue ? Math.abs(red.score - blue.score) : 0;
      const status =
        diff <= 2
          ? "안정"
          : diff <= 5
            ? "보통"
            : diff <= 8
              ? "주의"
              : "조정권장";

      return {
        position,
        red,
        blue,
        diff: Number(diff.toFixed(1)),
        status,
      };
    });
  }

  function getBalanceGrade(target: BalanceResponse) {
    if (target.diff <= 2) return { grade: "S", label: "매우 균형" };
    if (target.diff <= 5) return { grade: "A", label: "좋은 밸런스" };
    if (target.diff <= 8) return { grade: "B", label: "무난함" };
    if (target.diff <= 12) return { grade: "C", label: "일부 조정 필요" };
    return { grade: "D", label: "수동 조정 권장" };
  }

  function getBalanceMetricCards(target: BalanceResponse) {
    const judgement = target.aiJudgement ?? buildClientAiJudgement(target);
    const maxLineDiff = Number(target.maxLineDiff ?? Math.max(...getLineComparisons(target).map((line) => line.diff), 0));
    const weightedLineDiff = Number(target.weightedLineDiff ?? target.lineDiffTotal ?? 0);
    const midJglDiff = Number(target.midJglDiff ?? 0);
    const bottomDiff = Number(target.bottomDiff ?? 0);
    const aiScore = Number(target.recommendationScore ?? judgement.confidence ?? 0);

    return [
      {
        label: "품질",
        value: `${Number(target.qualityScore ?? 0).toFixed(1)}점`,
        status: Number(target.qualityScore ?? 0) >= 80 ? "good" : Number(target.qualityScore ?? 0) >= 65 ? "warn" : "danger",
      },
      {
        label: "AI 점수",
        value: `${aiScore.toFixed(1)}점`,
        status: aiScore >= 75 ? "good" : aiScore >= 58 ? "warn" : "danger",
      },
      {
        label: "최대 라인차",
        value: `${maxLineDiff.toFixed(1)}점`,
        status: maxLineDiff <= 5 ? "good" : maxLineDiff <= 8 ? "warn" : "danger",
      },
      {
        label: "가중 라인차",
        value: `${weightedLineDiff.toFixed(1)}점`,
        status: weightedLineDiff <= 18 ? "good" : weightedLineDiff <= 28 ? "warn" : "danger",
      },
      {
        label: "미드·정글",
        value: `${midJglDiff.toFixed(1)}점`,
        status: midJglDiff <= 5 ? "good" : midJglDiff <= 8 ? "warn" : "danger",
      },
      {
        label: "바텀",
        value: `${bottomDiff.toFixed(1)}점`,
        status: bottomDiff <= 5 ? "good" : bottomDiff <= 8 ? "warn" : "danger",
      },
      {
        label: "AUTO",
        value: `${target.autoAssignedCount}명`,
        status: target.autoAssignedCount === 0 ? "good" : target.autoAssignedCount <= 1 ? "warn" : "danger",
      },
      {
        label: "예상 승률",
        value: `R ${judgement.predictedRedWinRate.toFixed(1)} / B ${judgement.predictedBlueWinRate.toFixed(1)}`,
        status: Math.abs(judgement.predictedRedWinRate - judgement.predictedBlueWinRate) <= 6 ? "good" : "warn",
      },
    ];
  }

  function renderBalanceMetricGrid(target: BalanceResponse) {
    return (
      <div className="balance-kpi-grid">
        {getBalanceMetricCards(target).map((item) => (
          <div
            key={item.label}
            className={`balance-kpi-card balance-kpi-card--${item.status}`}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    );
  }

  function getPredictedWinRates(redTotal: number, blueTotal: number) {
    const redRate = 1 / (1 + 10 ** ((blueTotal - redTotal) / 40));
    const red = Number((redRate * 100).toFixed(1));
    return {
      red,
      blue: Number((100 - red).toFixed(1)),
    };
  }

  function sumPositions(players: AssignedPlayer[], positions: Position[]) {
    return positions.reduce((sum, position) => {
      const player = players.find((item) => item.position === position);
      return sum + (player?.score ?? 0);
    }, 0);
  }

  function buildClientAiJudgement(target: BalanceResponse) {
    const lines = getLineComparisons(target);
    const maxLineDiff = Math.max(...lines.map((line) => line.diff), 0);
    const lineDiffTotal = Number(
      lines.reduce((sum, line) => sum + line.diff, 0).toFixed(1),
    );
    const weightedLineDiff = Number(
      lines
        .reduce((sum, line) => {
          const weight =
            line.position === "JGL" || line.position === "MID"
              ? 1.25
              : line.position === "ADC" || line.position === "SUP"
                ? 1.1
                : 1;
          return sum + line.diff * weight;
        }, 0)
        .toFixed(1),
    );
    const frontSideDiff = Number(
      Math.abs(
        sumPositions(target.red, ["TOP", "JGL", "MID"]) -
          sumPositions(target.blue, ["TOP", "JGL", "MID"]),
      ).toFixed(1),
    );
    const midJglDiff = Number(
      Math.abs(
        sumPositions(target.red, ["JGL", "MID"]) -
          sumPositions(target.blue, ["JGL", "MID"]),
      ).toFixed(1),
    );
    const bottomDiff = Number(
      Math.abs(
        sumPositions(target.red, ["ADC", "SUP"]) -
          sumPositions(target.blue, ["ADC", "SUP"]),
      ).toFixed(1),
    );
    const winRates = getPredictedWinRates(target.redTotal, target.blueTotal);
    const inferredWinner =
      Math.abs(winRates.red - winRates.blue) < 3
        ? "EVEN"
        : winRates.red > winRates.blue
          ? "RED"
          : "BLUE";
    const qualityScore = Number(
      Math.max(
        0,
        Math.min(
          100,
          100 -
            Math.min(18, target.diff * 1.1) -
            Math.min(28, maxLineDiff * 1.0 + weightedLineDiff * 0.35) -
            Math.min(22, midJglDiff * 0.9 + bottomDiff * 0.65 + frontSideDiff * 0.25) -
            Math.min(18, target.autoAssignedCount * 4),
        ),
      ).toFixed(1),
    );
    const riskValue =
      target.diff * 0.9 +
      maxLineDiff * 1.2 +
      midJglDiff * 1.15 +
      bottomDiff * 0.85 +
      target.autoAssignedCount * 4;
    const riskLevel =
      riskValue >= 38 ? "HIGH" : riskValue >= 22 ? "MEDIUM" : "LOW";
    const riskFactors = [
      maxLineDiff >= 10 ? `라인 최대 격차 ${maxLineDiff.toFixed(1)}점` : null,
      midJglDiff >= 8 ? `미드-정글 격차 ${midJglDiff.toFixed(1)}점` : null,
      bottomDiff >= 8 ? `바텀 격차 ${bottomDiff.toFixed(1)}점` : null,
      target.autoAssignedCount > 0
        ? `AUTO ${target.autoAssignedCount}명`
        : null,
      ...(target.warningMessages ?? []),
    ].filter(Boolean) as string[];
    const strengthFactors = [
      target.diff <= 3
        ? `총점 차이 ${target.diff.toFixed(1)}점으로 전체 체급이 안정적입니다.`
        : null,
      maxLineDiff <= 5
        ? `최대 라인 차이 ${maxLineDiff.toFixed(1)}점으로 라인 붕괴 위험이 낮습니다.`
        : null,
      midJglDiff <= 5
        ? "미드-정글 격차가 작아 초반 주도권 리스크가 낮습니다."
        : null,
      bottomDiff <= 5
        ? "바텀 듀오 격차가 작아 2:2 라인전 변수가 낮습니다."
        : null,
      target.autoAssignedCount === 0
        ? "AUTO 배정 없이 주/부 포지션 중심으로 구성되었습니다."
        : null,
    ].filter(Boolean) as string[];
    const improvementSuggestions = [
      target.diff > 5
        ? "총점 차이가 크므로 고점/저점 플레이어 1명 교환을 우선 검토하세요."
        : null,
      maxLineDiff > 8 ? "가장 벌어진 단일 라인을 먼저 조정하세요." : null,
      midJglDiff > 7
        ? "미드-정글 차이가 있어 초반 교전과 오브젝트 콜을 확인하세요."
        : null,
      bottomDiff > 7
        ? "바텀 차이가 있어 드래곤 운영과 2:2 라인전 변수를 확인하세요."
        : null,
      target.autoAssignedCount > 0
        ? "AUTO 배정자는 실제 가능 포지션인지 확인한 뒤 확정하세요."
        : null,
    ].filter(Boolean) as string[];
    const focusEntries = [
      ["미드-정글", midJglDiff],
      ["바텀", bottomDiff],
      ["상체", frontSideDiff],
      ["단일 라인", maxLineDiff],
    ] as const;
    const [focusLabel, focusValue] = [...focusEntries].sort(
      (a, b) => b[1] - a[1],
    )[0];
    const laneFocus =
      focusValue >= 7
        ? `${focusLabel} 구간을 가장 먼저 확인해야 합니다. 현재 격차 ${focusValue.toFixed(1)}점입니다.`
        : "특정 라인 하나가 과도하게 벌어지지는 않았습니다.";
    const draftNotes = [
      inferredWinner === "EVEN"
        ? "밴픽은 양팀 모두 편한 픽 위주로 가도 무리가 적습니다."
        : `${inferredWinner}가 근소 우세로 추론되므로 반대팀은 초반 안정형 픽이 유리합니다.`,
      midJglDiff >= 7
        ? "미드-정글 2:2 구도가 승패를 크게 흔들 수 있습니다."
        : "미드-정글 구도는 과도한 리스크 구간은 아닙니다.",
      bottomDiff >= 7
        ? "바텀 중심 밴픽 또는 서포터 주도권 픽을 확인하세요."
        : "바텀 격차는 관리 가능한 범위입니다.",
    ];
    const confidence = Number(
      Math.max(0, Math.min(100, qualityScore - riskFactors.length * 2)).toFixed(
        1,
      ),
    );

    return {
      selectedOptionNo: target.optionNo ?? null,
      selectedOptionTitle:
        target.optionTitle ??
        (selectedResultIndex === -1 ? "수동 조정안" : null),
      confidence,
      riskLevel,
      verdict:
        riskLevel === "LOW"
          ? "실사용 추천: 현재 조건에서 터질 가능성이 낮은 조합입니다."
          : riskLevel === "MEDIUM"
            ? "조건부 추천: 사용할 수 있지만 핵심 리스크를 확인해야 합니다."
            : "주의 필요: 운영자가 라인/포지션 리스크를 먼저 조정하는 편이 안전합니다.",
      inferredWinner,
      predictedRedWinRate: winRates.red,
      predictedBlueWinRate: winRates.blue,
      reasoning: [
        `${target.optionNo ?? "수동"}안 기준 품질 점수 ${qualityScore.toFixed(1)}점입니다.`,
        `예상 승률은 RED ${winRates.red.toFixed(1)}% / BLUE ${winRates.blue.toFixed(1)}%입니다.`,
        `총점 차이 ${target.diff.toFixed(1)}점, 전체 라인 차이 ${lineDiffTotal.toFixed(1)}점, 최대 라인 차이 ${maxLineDiff.toFixed(1)}점, 미드-정글 차이 ${midJglDiff.toFixed(1)}점을 함께 판단했습니다.`,
      ],
      riskFactors,
      strengthFactors,
      improvementSuggestions,
      laneFocus,
      draftNotes,
      dataWarnings: [],
      overallSummary: `${target.optionNo ?? "수동"}안은 RED ${winRates.red.toFixed(1)}% / BLUE ${winRates.blue.toFixed(1)}%로 예측되며, 위험도는 ${riskLevel}입니다.`,
      operatingAdvice:
        riskLevel === "LOW"
          ? "그대로 사용해도 무리가 적습니다. 내전 결과 등록 후 MMR 변화를 확인하세요."
          : riskLevel === "MEDIUM"
            ? "추천안을 쓰되, AUTO 배정자와 핵심 라인 차이를 먼저 공유하세요."
            : "가능하면 수동 드래그로 핵심 라인 차이를 줄인 뒤 저장하세요.",
    } satisfies NonNullable<BalanceResponse["aiJudgement"]>;
  }

  function enrichManualBalanceResult(target: BalanceResponse): BalanceResponse {
    const lines = getLineComparisons(target);
    const maxLineDiff = Math.max(...lines.map((line) => line.diff), 0);
    const lineDiffTotal = Number(
      lines.reduce((sum, line) => sum + line.diff, 0).toFixed(1),
    );
    const weightedLineDiff = Number(
      lines
        .reduce((sum, line) => {
          const weight =
            line.position === "JGL" || line.position === "MID"
              ? 1.25
              : line.position === "ADC" || line.position === "SUP"
                ? 1.1
                : 1;
          return sum + line.diff * weight;
        }, 0)
        .toFixed(1),
    );
    const frontSideDiff = Number(
      Math.abs(
        sumPositions(target.red, ["TOP", "JGL", "MID"]) -
          sumPositions(target.blue, ["TOP", "JGL", "MID"]),
      ).toFixed(1),
    );
    const midJglDiff = Number(
      Math.abs(
        sumPositions(target.red, ["JGL", "MID"]) -
          sumPositions(target.blue, ["JGL", "MID"]),
      ).toFixed(1),
    );
    const bottomDiff = Number(
      Math.abs(
        sumPositions(target.red, ["ADC", "SUP"]) -
          sumPositions(target.blue, ["ADC", "SUP"]),
      ).toFixed(1),
    );
    const qualityScore = Number(
      Math.max(
        0,
        Math.min(
          100,
          100 -
            Math.min(18, target.diff * 1.1) -
            Math.min(28, maxLineDiff * 1.0 + weightedLineDiff * 0.35) -
            Math.min(22, midJglDiff * 0.9 + bottomDiff * 0.65 + frontSideDiff * 0.25) -
            Math.min(18, target.autoAssignedCount * 4),
        ),
      ).toFixed(1),
    );

    const enriched = {
      ...target,
      optionNo: undefined,
      optionTitle: "수동 조정안",
      optionDescription: "드래그로 직접 조정한 현재 RED / BLUE 배치입니다.",
      lineDiffTotal,
      maxLineDiff,
      weightedLineDiff,
      frontSideDiff,
      midJglDiff,
      bottomDiff,
      qualityScore,
      recommendationScore: qualityScore,
      warningMessages: target.warningMessages ?? [],
    };

    return {
      ...enriched,
      aiJudgement: buildClientAiJudgement(enriched),
    };
  }

  function getRoleText(roleType: RoleType) {
    if (roleType === "MAIN") return "주 포지션";
    if (roleType === "SUB") return "부 포지션";
    return "자동배정";
  }

  function getRoleMultiplier(roleType: RoleType) {
    if (roleType === "MAIN") return 1;
    if (roleType === "SUB") return 1;
    return 1;
  }

  function getRoleReason(player: AssignedPlayer) {
    if (player.roleType === "MAIN") {
      return `${player.position}이(가) 선택한 주 포지션에 포함되어 배정 감점 없이 계산되었습니다.`;
    }

    if (player.roleType === "SUB") {
      return `${player.position}이(가) 선택한 부 포지션에 포함되어 부 포지션 감점이 적용되었습니다.`;
    }

    return `${player.position}이(가) 선택한 주/부 포지션에 포함되지 않아 자동배정 감점이 적용되었습니다.`;
  }

  function formatPercent(value?: number | null) {
    if (typeof value !== "number" || Number.isNaN(value)) return "-";
    return `${value.toFixed(1)}%`;
  }

  function formatDecimal(value?: number | null, digits = 1) {
    if (typeof value !== "number" || Number.isNaN(value)) return "-";
    return value.toFixed(digits);
  }

  function getScoreCalculationParts(player: AssignedPlayer) {
    const breakdown = player.scoreBreakdown ?? {};
    const tierBaseScore =
      breakdown.tierBaseScore ??
      player.baseTierScore ??
      player.adjustedScore ??
      0;
    const currentTierScore =
      breakdown.currentTierScore ?? player.currentTierScore ?? tierBaseScore;
    const peakTierScore =
      breakdown.peakTierScore ?? player.peakTierScore ?? tierBaseScore;
    const tierScore =
      breakdown.adjustedScore ??
      breakdown.tierScore ??
      player.adjustedScore ??
      tierBaseScore;
    const internalRankBaseScore =
      breakdown.internalRankBaseScore ?? player.rankBaseScore ?? 70;
    const rankAddedScore =
      breakdown.rankAddedScore ?? player.rankAddedScore ?? 0;
    const rankGapFromLowest =
      breakdown.rankGapFromLowest ?? player.rankGapFromLowest ?? 0;
    const rankScore =
      breakdown.rankScore ??
      player.rankScore ??
      internalRankBaseScore + rankAddedScore;
    const tierWeight = breakdown.tierWeight ?? player.tierWeight ?? 1;
    const internalRankWeight =
      breakdown.internalRankWeight ?? player.internalRankWeight ?? 0;
    const mixedBaseScore =
      breakdown.mixedBaseScore ??
      player.mixedBaseScore ??
      Number((tierScore + rankAddedScore).toFixed(2));
    const sTierBonus = breakdown.sTierBonus ?? player.bonus ?? 0;
    const finalBaseScore =
      breakdown.finalBaseScore ??
      Number((mixedBaseScore + sTierBonus).toFixed(2));
    const multiplier =
      breakdown.roleMultiplier ?? getRoleMultiplier(player.roleType);
    const roleLoss =
      breakdown.roleLoss ??
      breakdown.rolePenalty ??
      player.rolePenalty ??
      Number((finalBaseScore - player.score).toFixed(2));
    const soloRecentFormBonus =
      breakdown.soloRecentFormBonus ?? player.soloRecentFormBonus ?? 0;
    const soloApplyPositionMatchBonus =
      breakdown.soloApplyPositionMatchBonus ??
      player.soloApplyPositionMatchBonus ??
      0;
    const positionSkillBonus =
      breakdown.positionSkillBonus ?? player.positionSkillBonus ?? 0;
    const mmrBonus = breakdown.mmrBonus ?? player.mmrBonus ?? 0;
    const balanceOverrideScore =
      breakdown.balanceOverrideScore ?? player.balanceOverrideScore ?? 0;
    const finalScore = breakdown.finalScore ?? player.score;

    return {
      currentTierScore,
      peakTierScore,
      tierBaseScore,
      tierScore,
      internalRankBaseScore,
      rankGapFromLowest,
      rankAddedScore,
      rankScore,
      tierWeight,
      internalRankWeight,
      mixedBaseScore,
      sTierBonus,
      finalBaseScore,
      multiplier,
      roleLoss,
      soloRecentFormBonus,
      soloApplyPositionMatchBonus,
      positionSkillBonus,
      mmrBonus,
      balanceOverrideScore,
      finalScore,
    };
  }

  function selectBalanceAlternative(index: number) {
    setResult((prev) => {
      const alternatives = prev?.alternatives;

      if (!alternatives || !alternatives[index]) return prev;

      const selected = alternatives[index];

      return {
        ...selected,
        soloSync: prev.soloSync ?? selected.soloSync ?? null,
        aiJudgement: selected.aiJudgement ?? buildClientAiJudgement(selected),
        recommendedAlternative:
          selected.recommendedAlternative ??
          prev.recommendedAlternative ??
          null,
        alternatives,
      };
    });

    setSelectedResultIndex(index);
  }

  function getRiskScore(riskLevel?: "LOW" | "MEDIUM" | "HIGH") {
    if (riskLevel === "HIGH") return 18;
    if (riskLevel === "MEDIUM") return 8;
    return 0;
  }

  function getAiAlternativeScore(option: BalanceResponse) {
    const judgement = option.aiJudgement ?? buildClientAiJudgement(option);
    const qualityScore = Number(option.qualityScore ?? 0);
    const recommendationScore = Number(
      option.recommendationScore ?? qualityScore,
    );

    return (
      recommendationScore * 0.45 +
      qualityScore * 0.25 +
      judgement.confidence * 0.3 -
      getRiskScore(judgement.riskLevel) -
      Number(option.stompPenalty ?? 0) * 0.4 -
      Number(option.autoLinePenalty ?? 0) * 0.35
    );
  }

  function getAiBestAlternativeIndex(target: BalanceResponse) {
    const alternatives = target.alternatives ?? [];
    if (alternatives.length === 0) return null;

    const recommendedNo = target.recommendedAlternative?.optionNo;
    if (recommendedNo) {
      const recommendedIndex = alternatives.findIndex(
        (option) => option.optionNo === recommendedNo,
      );
      if (recommendedIndex >= 0) return recommendedIndex;
    }

    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    alternatives.forEach((option, index) => {
      const score = getAiAlternativeScore(option);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function applyAiBestAlternative() {
    if (!result) return;

    if (result.aiBestAlternative) {
      const aiBest = result.aiBestAlternative;

      setResult({
        ...aiBest,
        soloSync: result.soloSync ?? aiBest.soloSync ?? null,
        aiJudgement: aiBest.aiJudgement ?? buildClientAiJudgement(aiBest),
        recommendedAlternative:
          result.recommendedAlternative ??
          aiBest.recommendedAlternative ??
          null,
        aiBestAlternative: aiBest,
        aiCandidateCount: result.aiCandidateCount ?? aiBest.aiCandidateCount,
        aiSearchScope: result.aiSearchScope ?? aiBest.aiSearchScope,
        alternatives: result.alternatives ?? aiBest.alternatives,
      });
      setSelectedResultIndex(-1);
      return;
    }

    if (!result.alternatives?.length) return;

    const bestIndex = getAiBestAlternativeIndex(result);
    if (bestIndex === null) return;

    selectBalanceAlternative(bestIndex);
  }

  function renderAiJudgement(target: BalanceResponse) {
    const judgement = target.aiJudgement;
    if (!judgement) return null;

    const riskLabel =
      judgement.riskLevel === "LOW"
        ? "낮음"
        : judgement.riskLevel === "MEDIUM"
          ? "보통"
          : "높음";

    return (
      <section className="balance-ai-judgement-card">
        <div className="balance-ai-judgement-head">
          <div>
            <strong>AI 판단</strong>
            <span>
              공식 개선 제안이 아니라, 현재 RED / BLUE 배치를 실제 운영 리스크
              기준으로 추론한 결과입니다.
            </span>
          </div>
          <b>
            {judgement.selectedOptionNo === 0
              ? "AI 전체탐색"
              : `${judgement.selectedOptionNo ?? "-"}안`}{" "}
            · 신뢰도 {judgement.confidence.toFixed(1)}점
          </b>
        </div>

        <div className="balance-ai-judgement-grid">
          <div>
            <span>판단</span>
            <strong>{judgement.verdict}</strong>
          </div>
          <div>
            <span>예상 승률</span>
            <strong>
              RED {judgement.predictedRedWinRate.toFixed(1)}% / BLUE{" "}
              {judgement.predictedBlueWinRate.toFixed(1)}%
            </strong>
          </div>
          <div>
            <span>위험도</span>
            <strong>{riskLabel}</strong>
          </div>
          <div>
            <span>추론 우세</span>
            <strong>
              {judgement.inferredWinner === "EVEN"
                ? "반반"
                : judgement.inferredWinner}
            </strong>
          </div>
        </div>

        <div className="balance-ai-judgement-body">
          <div>
            <h3>판단 근거</h3>
            <ul>
              {judgement.reasoning.map((item, index) => (
                <li key={`ai-reason-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>리스크</h3>
            {judgement.riskFactors.length > 0 ? (
              <ul>
                {judgement.riskFactors.map((item, index) => (
                  <li key={`ai-risk-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>특별한 위험 요소가 크지 않습니다.</p>
            )}
          </div>
        </div>

        <div className="balance-ai-judgement-body balance-ai-judgement-body--secondary">
          <div>
            <h3>장점</h3>
            {judgement.strengthFactors?.length ? (
              <ul>
                {judgement.strengthFactors.map((item, index) => (
                  <li key={`ai-strength-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>뚜렷한 강점보다 전체 균형 유지가 핵심입니다.</p>
            )}
          </div>
          <div>
            <h3>개선 제안</h3>
            {judgement.improvementSuggestions?.length ? (
              <ul>
                {judgement.improvementSuggestions.map((item, index) => (
                  <li key={`ai-suggestion-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>현재 기준에서는 추가 조정 필요성이 크지 않습니다.</p>
            )}
          </div>
        </div>

        <div className="balance-ai-note-grid">
          {judgement.laneFocus ? (
            <div>
              <span>핵심 구간</span>
              <strong>{judgement.laneFocus}</strong>
            </div>
          ) : null}
          {judgement.overallSummary ? (
            <div>
              <span>요약</span>
              <strong>{judgement.overallSummary}</strong>
            </div>
          ) : null}
        </div>

        {judgement.draftNotes?.length || judgement.dataWarnings?.length ? (
          <div className="balance-ai-judgement-body balance-ai-judgement-body--secondary">
            <div>
              <h3>밴픽·운영 메모</h3>
              <ul>
                {(judgement.draftNotes ?? []).map((item, index) => (
                  <li key={`ai-draft-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>데이터 주의</h3>
              {judgement.dataWarnings?.length ? (
                <ul>
                  {judgement.dataWarnings.map((item, index) => (
                    <li key={`ai-data-warning-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>현재 판단에 치명적인 데이터 부족 경고는 없습니다.</p>
              )}
            </div>
          </div>
        ) : null}

        <p className="balance-ai-judgement-advice">
          {judgement.operatingAdvice}
        </p>
      </section>
    );
  }

  function renderBalanceAlternatives(target: BalanceResponse) {
    const alternatives = target.alternatives ?? [];

    if (alternatives.length <= 1 && !target.aiBestAlternative) return null;

    const aiBestIndex = getAiBestAlternativeIndex(target);
    const aiBestOption =
      target.aiBestAlternative ??
      (aiBestIndex === null ? null : alternatives[aiBestIndex]);
    const aiBestJudgement =
      aiBestOption?.aiJudgement ??
      (aiBestOption ? buildClientAiJudgement(aiBestOption) : null);
    const isAiBestActive = Boolean(target.aiBestAlternative)
      ? selectedResultIndex === -1 && result?.optionNo === 0
      : aiBestIndex !== null && selectedResultIndex === aiBestIndex;

    return (
      <section className="balance-alternative-card">
        <div className="balance-alternative-head">
          <div>
            <strong>자동 계산 추천안</strong>
            <span>
              1안/2안/3안은 비교용 기준안이며, AI 최고안 버튼은 전체 후보 조합을
              다시 평가해 가장 안정적인 RED / BLUE를 적용합니다.
            </span>
          </div>
          <div className="balance-alternative-actions">
            <b>
              {selectedResultIndex >= 0
                ? `${selectedResultIndex + 1}안 선택 중`
                : result?.optionNo === 0
                  ? "AI 전체탐색 선택 중"
                  : "수동 조정 중"}
            </b>
            <button
              type="button"
              className="balance-ai-best-button"
              onClick={applyAiBestAlternative}
              disabled={!aiBestOption || isAiBestActive}
              title="AI가 품질 점수, 위험도, 예상 승률, 라인 격차를 종합해 가장 안정적으로 판단한 RED/BLUE 조합을 적용합니다."
            >
              {isAiBestActive
                ? "AI 전체탐색 최고안 적용됨"
                : "AI 전체탐색 최고안으로 변경"}
            </button>
            {aiBestOption ? (
              <span className="balance-ai-best-hint">
                {target.aiBestAlternative
                  ? `전체 ${target.aiCandidateCount ?? "-"}개 후보 중 AI 최고안`
                  : `AI 최고안: ${aiBestOption.optionNo ?? (aiBestIndex ?? 0) + 1}안`}
                {aiBestJudgement
                  ? ` · 위험도 ${aiBestJudgement.riskLevel} · RED ${aiBestJudgement.predictedRedWinRate.toFixed(1)}% / BLUE ${aiBestJudgement.predictedBlueWinRate.toFixed(1)}%`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="balance-alternative-list">
          {alternatives.slice(0, 3).map((option, index) => {
            const grade = getBalanceGrade(option);
            const active = selectedResultIndex === index;

            return (
              <button
                key={`balance-option-${index}`}
                type="button"
                className={[
                  "balance-alternative-button",
                  active ? "balance-alternative-button--active" : "",
                ].join(" ")}
                onClick={() => selectBalanceAlternative(index)}
              >
                <span className="balance-alternative-button__no">
                  {option.optionNo ?? index + 1}안
                </span>
                <strong>
                  {option.optionTitle ?? `${grade.grade} · ${grade.label}`}
                </strong>
                <small>{option.optionDescription ?? grade.label}</small>
                <em>
                  RED {option.redTotal.toFixed(1)} / BLUE{" "}
                  {option.blueTotal.toFixed(1)} / 품질{" "}
                  {Number(option.qualityScore ?? 0).toFixed(1)}
                </em>
                <b>
                  차이 {option.diff.toFixed(1)} · 가중라인{" "}
                  {Number(
                    option.weightedLineDiff ?? option.lineDiffTotal ?? 0,
                  ).toFixed(1)}{" "}
                  · 상체 {Number(option.frontSideDiff ?? 0).toFixed(1)} ·
                  미드정글 {Number(option.midJglDiff ?? 0).toFixed(1)} · 바텀{" "}
                  {Number(option.bottomDiff ?? 0).toFixed(1)}
                </b>
                {option.warningMessages?.length ? (
                  <small>{option.warningMessages.join(" / ")}</small>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function renderScoreEvidence(target: BalanceResponse) {
    const lines = getLineComparisons(target);
    const allPlayers = [
      ...sortByPosition(target.red),
      ...sortByPosition(target.blue),
    ];

    return (
      <section className="card balance-score-evidence-card">
        <div className="balance-score-evidence-head">
          <div>
            <div className="balance-score-evidence-title">점수 근거 상세</div>
            <div className="balance-score-evidence-desc">
              팀 카드는 짧게 유지하고, 최고티어 60%·현재티어 30%·내전지표 10%와
              포지션 반영 과정을 이 영역에서 확인합니다.
            </div>
          </div>
        </div>

        <details className="balance-score-evidence" open>
          <summary>점수 근거 보기</summary>

          <div className="balance-evidence-section">
            <h3>1. 팀 밸런스 요약</h3>
            <div className="balance-evidence-grid balance-evidence-grid--summary">
              <div>
                <span>RED 총점</span>
                <strong>{target.redTotal.toFixed(1)}</strong>
              </div>
              <div>
                <span>BLUE 총점</span>
                <strong>{target.blueTotal.toFixed(1)}</strong>
              </div>
              <div>
                <span>점수 차이</span>
                <strong>{target.diff.toFixed(1)}</strong>
              </div>
              <div>
                <span>배정 구조</span>
                <strong>
                  주 {target.mainAssignedCount} / 부 {target.subAssignedCount} /
                  AUTO {target.autoAssignedCount}
                </strong>
              </div>
              <div>
                <span>가중 라인 차이</span>
                <strong>
                  {formatDecimal(
                    target.weightedLineDiff ?? target.lineDiffTotal,
                  )}
                </strong>
              </div>
              <div>
                <span>최대 라인 차이</span>
                <strong>{formatDecimal(target.maxLineDiff)}</strong>
              </div>
              <div>
                <span>상체 차이</span>
                <strong>{formatDecimal(target.frontSideDiff)}</strong>
              </div>
              <div>
                <span>미드정글 차이</span>
                <strong>{formatDecimal(target.midJglDiff)}</strong>
              </div>
              <div>
                <span>바텀 차이</span>
                <strong>{formatDecimal(target.bottomDiff)}</strong>
              </div>
              <div>
                <span>AUTO 라인 패널티</span>
                <strong>{formatDecimal(target.autoLinePenalty)}</strong>
              </div>
              <div>
                <span>주포지션 불균형</span>
                <strong>{formatDecimal(target.mainImbalancePenalty)}</strong>
              </div>
              <div>
                <span>데이터 신뢰도 패널티</span>
                <strong>{formatDecimal(target.dataReliabilityPenalty)}</strong>
              </div>
              <div>
                <span>원사이드 방지 패널티</span>
                <strong>{formatDecimal(target.stompPenalty)}</strong>
              </div>
            </div>
            <p className="balance-evidence-note">
              점수 차이가 낮을수록 전체 팀 전력은 비슷합니다. 단, 실제 체감
              밸런스는 라인별 차이와 자동배정 수까지 함께 봅니다.
            </p>
          </div>

          <div className="balance-evidence-section">
            <h3>2. 라인별 비교</h3>
            <div className="balance-evidence-line-table">
              {lines.map((line) => (
                <div key={line.position} className="balance-evidence-line-row">
                  <strong>{line.position}</strong>
                  <span className="balance-evidence-team-red">
                    RED {line.red?.name ?? "-"} ·{" "}
                    {line.red?.score.toFixed(1) ?? "-"}
                  </span>
                  <span className="balance-evidence-team-blue">
                    BLUE {line.blue?.name ?? "-"} ·{" "}
                    {line.blue?.score.toFixed(1) ?? "-"}
                  </span>
                  <b>
                    {line.diff.toFixed(1)}점 · {line.status}
                  </b>
                </div>
              ))}
            </div>
          </div>

          <div className="balance-evidence-section">
            <h3>3. 선수별 상세 계산</h3>
            <div className="balance-evidence-player-list">
              {allPlayers.map((player) => {
                const calc = getScoreCalculationParts(player);
                const baseScore = calc.finalBaseScore;
                const multiplier = calc.multiplier;
                const roleText = getRoleText(player.roleType);
                const bonus = calc.sTierBonus;
                const calculatedByPosition = calc.finalScore;
                const customExplanations = Array.isArray(player.explanation)
                  ? player.explanation
                  : [];

                return (
                  <article
                    key={`evidence-${player.team}-${player.playerId}`}
                    className="balance-evidence-player-card"
                  >
                    <div className="balance-evidence-player-top">
                      <div>
                        <strong>
                          {player.team} · {player.position} · {player.name}
                        </strong>
                        <span>
                          {player.nickname}#{player.tag}
                        </span>
                      </div>
                      <b>{player.score.toFixed(1)}점</b>
                    </div>

                    <div className="balance-score-flow">
                      <div className="balance-score-flow__item">
                        <span>1. 티어 기준점수</span>
                        <strong>{formatDecimal(calc.tierScore)}</strong>
                        <p>
                          현재 {player.currentTier || "미등록"} ={" "}
                          {formatDecimal(calc.currentTierScore)}점 / 최고{" "}
                          {player.peakTier || "미등록"} ={" "}
                          {formatDecimal(calc.peakTierScore)}점을 기준으로
                          환산했습니다.
                        </p>
                      </div>
                      <div className="balance-score-flow__arrow">→</div>
                      <div className="balance-score-flow__item">
                        <span>2. 내부 티어차 보정</span>
                        <strong>+{formatDecimal(calc.rankAddedScore)}</strong>
                        <p>
                          참가자 최하위 티어 기준점수{" "}
                          {formatDecimal(calc.internalRankBaseScore)}점과 비교해
                          차이 {formatDecimal(calc.rankGapFromLowest)}점입니다.
                          구간 보정표에 따라 +
                          {formatDecimal(calc.rankAddedScore)}점이
                          적용되었습니다.
                        </p>
                      </div>
                      <div className="balance-score-flow__arrow">→</div>
                      <div className="balance-score-flow__item">
                        <span>3. 보정 반영 기준점수</span>
                        <strong>{formatDecimal(calc.mixedBaseScore)}</strong>
                        <p>
                          티어 기준점수 {formatDecimal(calc.tierScore)}점 + 내부
                          보정 +{formatDecimal(calc.rankAddedScore)}점 ={" "}
                          {formatDecimal(calc.mixedBaseScore)}점입니다.
                        </p>
                      </div>
                      <div className="balance-score-flow__arrow">→</div>
                      <div className="balance-score-flow__item">
                        <span>4. 보정 후 최종 기준점수</span>
                        <strong>{formatDecimal(calc.finalBaseScore)}</strong>
                        <p>
                          보정 반영 기준점수{" "}
                          {formatDecimal(calc.mixedBaseScore)} + S급 보정{" "}
                          {bonus > 0 ? `+${formatDecimal(bonus)}` : "0.0"} ={" "}
                          {formatDecimal(calc.finalBaseScore)}점입니다.
                        </p>
                      </div>
                      <div className="balance-score-flow__arrow">→</div>
                      <div className="balance-score-flow__item balance-score-flow__item--final">
                        <span>5. 보정/감점 후 점수</span>
                        <strong>{formatDecimal(calc.finalScore)}</strong>
                        <p>
                          솔로랭 보정 {formatDecimal(calc.soloRecentFormBonus)},
                          포지션 보정 {formatDecimal(calc.positionSkillBonus)}
                          (솔랭/신청 일치{" "}
                          {formatDecimal(calc.soloApplyPositionMatchBonus)}),
                          내부 MMR 보정 {formatDecimal(calc.mmrBonus)}, 수동
                          보정 {formatDecimal(calc.balanceOverrideScore)}, 배정
                          감점 {formatDecimal(calc.roleLoss)}을 반영해{" "}
                          {formatDecimal(calculatedByPosition)}점입니다.
                        </p>
                      </div>
                    </div>

                    <div className="balance-evidence-grid">
                      <div>
                        <span>현재티어 점수</span>
                        <strong>{formatDecimal(calc.currentTierScore)}</strong>
                      </div>
                      <div>
                        <span>최고티어 점수</span>
                        <strong>{formatDecimal(calc.peakTierScore)}</strong>
                      </div>
                      <div>
                        <span>티어 기준점수</span>
                        <strong>{formatDecimal(calc.tierScore)}</strong>
                      </div>
                      <div>
                        <span>최하위 기준점수</span>
                        <strong>
                          {formatDecimal(calc.internalRankBaseScore)}
                        </strong>
                      </div>
                      <div>
                        <span>최하위 대비 티어차</span>
                        <strong>{formatDecimal(calc.rankGapFromLowest)}</strong>
                      </div>
                      <div>
                        <span>내부 보정점수</span>
                        <strong>+{formatDecimal(calc.rankAddedScore)}</strong>
                      </div>
                      <div>
                        <span>내부 보정 후 점수</span>
                        <strong>{formatDecimal(calc.rankScore)}</strong>
                      </div>
                      <div>
                        <span>반영 방식</span>
                        <strong>티어 기준 + 내부 구간 보정</strong>
                      </div>
                      <div>
                        <span>보정 반영 기준점수</span>
                        <strong>{formatDecimal(calc.mixedBaseScore)}</strong>
                      </div>
                      <div>
                        <span>S급 보정</span>
                        <strong>
                          {bonus > 0 ? `+${formatDecimal(bonus)}` : "0.0"}
                        </strong>
                      </div>
                      <div>
                        <span>최종 기준점수</span>
                        <strong>{formatDecimal(baseScore)}</strong>
                      </div>
                      <div>
                        <span>솔로랭 최근폼</span>
                        <strong>
                          {formatDecimal(calc.soloRecentFormBonus)}
                        </strong>
                      </div>
                      <div>
                        <span>포지션 숙련도</span>
                        <strong>
                          {formatDecimal(calc.positionSkillBonus)}
                        </strong>
                      </div>
                      <div>
                        <span>관리자 수동 보정</span>
                        <strong>
                          {formatDecimal(calc.balanceOverrideScore)}
                        </strong>
                      </div>
                      <div>
                        <span>배정 기준</span>
                        <strong>{roleText}</strong>
                      </div>
                      <div>
                        <span>포지션 반영률</span>
                        <strong>{Math.round(multiplier * 100)}%</strong>
                      </div>
                      <div>
                        <span>포지션 손실</span>
                        <strong>
                          {calc.roleLoss > 0
                            ? `-${formatDecimal(calc.roleLoss)}`
                            : "0.0"}
                        </strong>
                      </div>
                      <div>
                        <span>최종 반영점수</span>
                        <strong>{formatDecimal(player.score)}</strong>
                      </div>
                    </div>

                    {player.recentStats ||
                    player.internalStats ||
                    player.internalPositionStats ? (
                      <div className="balance-evidence-grid balance-evidence-grid--substats">
                        <div>
                          <span>최근 20게임 승률</span>
                          <strong>
                            {formatPercent(player.recentStats?.winRate)}
                          </strong>
                        </div>
                        <div>
                          <span>최근 20게임 평점</span>
                          <strong>
                            {formatDecimal(player.recentStats?.kda, 2)}
                          </strong>
                        </div>
                        <div>
                          <span>최근 주 포지션</span>
                          <strong>
                            {player.recentStats?.mainPosition ?? "-"}
                          </strong>
                        </div>
                        <div>
                          <span>평균 딜량</span>
                          <strong>
                            {formatDecimal(player.recentStats?.avgDamage, 0)}
                          </strong>
                        </div>
                        <div>
                          <span>평균 시야</span>
                          <strong>
                            {formatDecimal(
                              player.recentStats?.avgVisionScore,
                              1,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>내전 경기 수</span>
                          <strong>
                            {player.internalStats?.totalGames ?? "-"}
                          </strong>
                        </div>
                        <div>
                          <span>내전 승률</span>
                          <strong>
                            {formatPercent(player.internalStats?.winRate)}
                          </strong>
                        </div>
                        <div>
                          <span>내전 평점</span>
                          <strong>
                            {formatDecimal(player.internalStats?.kda, 2)}
                          </strong>
                        </div>
                        <div>
                          <span>{player.position} 내전 승률</span>
                          <strong>
                            {formatPercent(
                              player.internalPositionStats?.winRate,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>{player.position} 내전 평점</span>
                          <strong>
                            {formatDecimal(
                              player.internalPositionStats?.kda,
                              2,
                            )}
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    <div className="balance-evidence-reason">
                      <p>{getRoleReason(player)}</p>
                      {player.currentTier ? null : (
                        <p>
                          현재티어가 없는 경우 최고티어 또는 등록된 기준값을
                          중심으로 계산됩니다.
                        </p>
                      )}
                      {customExplanations.map((text, index) => (
                        <p key={`${player.playerId}-explanation-${index}`}>
                          {text}
                        </p>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </details>
      </section>
    );
  }

  function swapResultPlayers(sourcePlayerId: number, targetPlayerId: number) {
    if (sourcePlayerId === targetPlayerId) return;

    setSelectedResultIndex(-1);

    setResult((prev) => {
      if (!prev) return prev;

      const allPlayers = [...prev.red, ...prev.blue];
      const source = allPlayers.find(
        (player) => player.playerId === sourcePlayerId,
      );
      const target = allPlayers.find(
        (player) => player.playerId === targetPlayerId,
      );

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

      return normalizeResult(nextRed, nextBlue, prev);
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

  async function handleSubmit(syncSoloRank = false) {
    setLoading(true);
    setLoadingMode(syncSoloRank ? "sync" : "fast");
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
          syncSoloRank,
          players: rows.map((row) => ({
            playerId: row.playerId,
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

      const balanceData = data as BalanceResponse;
      const optionIndex = Math.max(
        0,
        (balanceData.optionNo ??
          balanceData.aiJudgement?.selectedOptionNo ??
          1) - 1,
      );
      setSelectedResultIndex(optionIndex);
      setResult(balanceData);
    } catch (error) {
      console.error(error);
      setErrorMessage("팀 밸런스 계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  }

  function renderTeamRows(team: Team, players: AssignedPlayer[]) {
    return sortByPosition(players).map((player) => {
      const isDragging = draggingPlayerId === player.playerId;
      const roleText = getRoleText(player.roleType);

      return (
        <div
          key={`${team}-${player.playerId}`}
          className={[
            "balance-player-card",
            "balance-player-card--compact",
            isDragging ? "balance-player-card--dragging" : "",
            player.roleType === "SUB" ? "balance-player-card--sub" : "",
            player.roleType === "AUTO" ? "balance-player-card--auto" : "",
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
          title="선수 카드를 다른 선수 카드 위로 드래그하면 팀/라인이 교체되고 점수가 즉시 재계산됩니다."
        >
          <div className="balance-player-compact-head">
            <div className="balance-position-badge">{player.position}</div>
            <div className="balance-player-main">
              <p className="balance-player-name">
                {player.name}
                <span className="balance-player-nickname">
                  {" "}
                  ({player.nickname}#{player.tag})
                </span>
              </p>
              <div className="balance-player-compact-meta">
                <span>{roleText}</span>
                <span>현재 {player.currentTier || "미등록"}</span>
                <span>최고 {player.peakTier || "미등록"}</span>
              </div>
            </div>
            <div className="balance-player-score-box">
              <span>점수</span>
              <strong>{player.score.toFixed(1)}</strong>
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
              onClick={() => handleSubmit(false)}
              disabled={!canSubmit || loading}
            >
              {loading && loadingMode === "fast" ? "계산 중..." : "빠른 계산"}
            </button>

            <button
              type="button"
              className="app-button"
              onClick={() => handleSubmit(true)}
              disabled={!canSubmit || loading}
            >
              {loading && loadingMode === "sync"
                ? "갱신 후 계산 중..."
                : "솔로랭 갱신 후 계산"}
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
            {(() => {
              const grade = getBalanceGrade(result);
              const lines = getLineComparisons(result);

              return (
                <section className="balance-overview-card">
                  <div className="balance-overview-main">
                    <div className="balance-grade-badge">
                      <span>{grade.grade}</span>
                      <strong>{grade.label}</strong>
                    </div>
                    <div className="balance-overview-stats">
                      <div>
                        <span>RED</span>
                        <strong>{result.redTotal.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>BLUE</span>
                        <strong>{result.blueTotal.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>차이</span>
                        <strong>{result.diff.toFixed(1)}</strong>
                      </div>
                      <div>
                        <span>주/부/AUTO</span>
                        <strong>
                          {result.mainAssignedCount}/{result.subAssignedCount}/
                          {result.autoAssignedCount}
                        </strong>
                      </div>
                    </div>
                    <div className="balance-form-head__desc">
                      품질 점수 {Number(result.qualityScore ?? 0).toFixed(1)}점
                      {result.recommendedAlternative
                        ? ` · 추천: ${result.recommendedAlternative.optionNo}안 ${result.recommendedAlternative.optionTitle ?? ""}`
                        : ""}
                      {result.warningMessages?.length
                        ? ` · 주의: ${result.warningMessages.join(" / ")}`
                        : ""}
                    </div>
                    {result.soloSync ? (
                      <div className="balance-form-head__desc">
                        솔로랭 갱신: 성공 {result.soloSync.synced}명 / 스킵{" "}
                        {result.soloSync.skipped}명 / 실패{" "}
                        {result.soloSync.failed}명
                      </div>
                    ) : null}
                  </div>
                  {renderBalanceMetricGrid(result)}
                  <div className="balance-line-strip">
                    {lines.map((line) => (
                      <div key={line.position} className="balance-line-chip">
                        <strong>{line.position}</strong>
                        <span>
                          {line.red?.name ?? "-"}{" "}
                          {line.red?.score.toFixed(1) ?? "-"}
                        </span>
                        <em>vs</em>
                        <span>
                          {line.blue?.name ?? "-"}{" "}
                          {line.blue?.score.toFixed(1) ?? "-"}
                        </span>
                        <b>
                          {line.diff.toFixed(1)} · {line.status}
                        </b>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {renderAiJudgement(result)}

            {renderBalanceAlternatives(result)}

            <section className="balance-result-teams balance-result-teams--compact">
              <div className="balance-team-panel balance-team-panel--blue">
                <div className="balance-team-header">
                  <h2 className="balance-team-title balance-team-title--blue">
                    BLUE
                  </h2>
                  <span className="balance-team-total">
                    총점 {result.blueTotal.toFixed(1)}
                  </span>
                </div>

                <div className="balance-team-list">
                  {renderTeamRows("BLUE", result.blue)}
                </div>
              </div>

              <div className="balance-team-panel balance-team-panel--red">
                <div className="balance-team-header">
                  <h2 className="balance-team-title balance-team-title--red">
                    RED
                  </h2>
                  <span className="balance-team-total">
                    총점 {result.redTotal.toFixed(1)}
                  </span>
                </div>

                <div className="balance-team-list">
                  {renderTeamRows("RED", result.red)}
                </div>
              </div>

              <div className="balance-result-bottom">
                <section className="card balance-summary-card balance-summary-card--compact">
                  <div className="balance-summary-card__title">
                    계산 결과 요약
                  </div>
                  <div className="balance-form-head__desc">
                    선수 카드를 드래그해 교체하면 포지션 기준에 따라 개인 점수와
                    팀 총점이 즉시 재계산됩니다.
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
                      <div className="balance-result-utility__title">
                        결과 활용
                      </div>
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

                {renderScoreEvidence(result)}
              </div>
            </section>
          </>
        ) : null}

        <style jsx global>{`
          .balance-ai-judgement-card {
            margin-top: 22px;
            padding: 22px;
            border-radius: 24px;
            border: 1px solid rgba(125, 211, 252, 0.34);
            background:
              radial-gradient(
                circle at 10% 0%,
                rgba(34, 211, 238, 0.14),
                transparent 34%
              ),
              linear-gradient(
                145deg,
                rgba(8, 22, 43, 0.96),
                rgba(10, 30, 55, 0.96)
              );
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.34);
          }

          .balance-ai-judgement-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 16px;
          }

          .balance-ai-judgement-head strong {
            display: block;
            color: #e0f2fe;
            font-size: 18px;
            font-weight: 900;
          }

          .balance-ai-judgement-head span,
          .balance-ai-judgement-advice,
          .balance-ai-judgement-body p {
            color: #a5b4fc;
            font-size: 13px;
            line-height: 1.65;
          }

          .balance-ai-judgement-head b {
            padding: 7px 12px;
            border-radius: 999px;
            background: rgba(14, 165, 233, 0.14);
            border: 1px solid rgba(125, 211, 252, 0.28);
            color: #bae6fd;
            font-size: 13px;
            white-space: nowrap;
          }

          .balance-ai-judgement-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 18px;
          }

          .balance-ai-judgement-grid div {
            padding: 12px;
            border-radius: 16px;
            background: rgba(15, 23, 42, 0.68);
            border: 1px solid rgba(148, 163, 184, 0.18);
          }

          .balance-ai-judgement-grid span {
            display: block;
            color: #94a3b8;
            font-size: 11px;
            font-weight: 800;
            margin-bottom: 5px;
          }

          .balance-ai-judgement-grid strong {
            color: #f8fafc;
            font-size: 13px;
            line-height: 1.4;
          }

          .balance-ai-judgement-body {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .balance-ai-judgement-body div {
            padding: 14px;
            border-radius: 18px;
            background: rgba(2, 6, 23, 0.34);
            border: 1px solid rgba(148, 163, 184, 0.16);
          }

          .balance-ai-judgement-body h3 {
            margin: 0 0 8px;
            color: #dbeafe;
            font-size: 13px;
          }

          .balance-ai-judgement-body ul {
            margin: 0;
            padding-left: 18px;
            color: #cbd5e1;
            font-size: 12px;
            line-height: 1.7;
          }

          .balance-ai-judgement-advice {
            margin: 14px 0 0;
          }

          .balance-alternative-card {
            margin-top: 18px;
            padding: 18px;
            border-radius: 22px;
            border: 1px solid rgba(96, 165, 250, 0.28);
            background: linear-gradient(
              145deg,
              rgba(8, 22, 43, 0.92),
              rgba(15, 23, 42, 0.92)
            );
          }

          .balance-alternative-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 14px;
          }

          .balance-alternative-head strong {
            display: block;
            color: #f8fafc;
            font-size: 16px;
            font-weight: 900;
          }

          .balance-alternative-head span {
            display: block;
            margin-top: 5px;
            color: #94a3b8;
            font-size: 12px;
            line-height: 1.55;
          }

          .balance-alternative-actions {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 8px;
            min-width: 260px;
          }

          .balance-alternative-actions b {
            color: #dbeafe;
            font-size: 12px;
          }

          .balance-ai-best-button {
            border: 1px solid rgba(250, 204, 21, 0.48);
            border-radius: 999px;
            padding: 9px 14px;
            background: linear-gradient(
              135deg,
              rgba(250, 204, 21, 0.18),
              rgba(59, 130, 246, 0.18)
            );
            color: #fef3c7;
            font-size: 12px;
            font-weight: 900;
            cursor: pointer;
            transition:
              transform 0.16s ease,
              border-color 0.16s ease,
              opacity 0.16s ease;
            white-space: nowrap;
          }

          .balance-ai-best-button:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: rgba(250, 204, 21, 0.78);
          }

          .balance-ai-best-button:disabled {
            cursor: not-allowed;
            opacity: 0.62;
          }

          .balance-ai-best-hint {
            max-width: 360px;
            text-align: right;
            color: #cbd5e1 !important;
            font-size: 11px !important;
          }

          .balance-alternative-list {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
          }

          .balance-alternative-button {
            display: flex;
            min-height: 138px;
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
            padding: 14px;
            border-radius: 16px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(15, 23, 42, 0.72);
            color: #e5e7eb;
            text-align: left;
            cursor: pointer;
          }

          .balance-alternative-button--active {
            border-color: rgba(250, 204, 21, 0.62);
            box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.16);
          }

          .balance-alternative-button__no {
            display: inline-flex;
            padding: 3px 8px;
            border-radius: 999px;
            background: rgba(59, 130, 246, 0.18);
            color: #bfdbfe;
            font-size: 11px;
            font-weight: 900;
          }

          .balance-alternative-button strong {
            color: #ffffff;
            font-size: 14px;
          }

          .balance-alternative-button small,
          .balance-alternative-button em,
          .balance-alternative-button b {
            color: #cbd5e1;
            font-size: 11px;
            font-style: normal;
            line-height: 1.45;
          }

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
              radial-gradient(
                circle at 20% 0%,
                rgba(59, 130, 246, 0.16),
                transparent 34%
              ),
              linear-gradient(
                145deg,
                rgba(8, 22, 43, 0.96),
                rgba(10, 30, 55, 0.96)
              );
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

          .balance-team-title--red {
            color: #fecaca;
          }
          .balance-team-title--blue {
            color: #bfdbfe;
          }

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
            background: linear-gradient(
              145deg,
              rgba(15, 35, 65, 0.98),
              rgba(9, 24, 48, 0.98)
            );
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
          .balance-player-card + .balance-player-card {
            margin-top: 12px;
          }

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

          .balance-player-main {
            min-width: 0;
          }

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

          .balance-player-bonus--none {
            color: #94a3b8;
          }

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
              radial-gradient(
                circle at 16% 0%,
                rgba(59, 130, 246, 0.14),
                transparent 34%
              ),
              linear-gradient(
                145deg,
                rgba(8, 22, 43, 0.96),
                rgba(10, 30, 55, 0.96)
              ) !important;
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

          /* compact balance board: one-screen visible drag area */
          .balance-overview-card {
            display: grid !important;
            gap: 14px !important;
            margin-top: 24px !important;
            padding: 18px !important;
            border-radius: 22px !important;
            background:
              radial-gradient(
                circle at 14% 0%,
                rgba(59, 130, 246, 0.18),
                transparent 36%
              ),
              linear-gradient(
                145deg,
                rgba(8, 22, 43, 0.98),
                rgba(9, 24, 48, 0.98)
              ) !important;
            border: 1px solid rgba(96, 165, 250, 0.32) !important;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28) !important;
          }

          .balance-overview-main {
            display: grid !important;
            grid-template-columns: 220px minmax(0, 1fr) !important;
            gap: 14px !important;
            align-items: stretch !important;
          }

          .balance-grade-badge {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 10px !important;
            min-height: 70px !important;
            border-radius: 18px !important;
            background: rgba(2, 6, 23, 0.62) !important;
            border: 1px solid rgba(147, 197, 253, 0.28) !important;
          }

          .balance-grade-badge span {
            display: grid !important;
            place-items: center !important;
            width: 42px !important;
            height: 42px !important;
            border-radius: 14px !important;
            background: rgba(59, 130, 246, 0.32) !important;
            color: #ffffff !important;
            font-size: 20px !important;
            font-weight: 950 !important;
          }

          .balance-grade-badge strong {
            color: #e0f2fe !important;
            font-size: 15px !important;
            font-weight: 950 !important;
          }

          .balance-overview-stats {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }

          .balance-overview-stats div {
            display: grid !important;
            gap: 4px !important;
            padding: 12px !important;
            border-radius: 16px !important;
            background: rgba(2, 6, 23, 0.42) !important;
            border: 1px solid rgba(148, 163, 184, 0.2) !important;
          }

          .balance-overview-stats span {
            color: #94a3b8 !important;
            font-size: 11px !important;
            font-weight: 900 !important;
          }

          .balance-overview-stats strong {
            color: #f8fafc !important;
            font-size: 18px !important;
            font-weight: 950 !important;
          }

          .balance-line-strip {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .balance-line-chip {
            display: grid !important;
            gap: 4px !important;
            min-width: 0 !important;
            padding: 10px !important;
            border-radius: 14px !important;
            background: rgba(15, 23, 42, 0.58) !important;
            border: 1px solid rgba(148, 163, 184, 0.18) !important;
          }

          .balance-line-chip strong {
            color: #bfdbfe !important;
            font-size: 12px !important;
            font-weight: 950 !important;
          }

          .balance-line-chip span,
          .balance-line-chip em,
          .balance-line-chip b {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 11px !important;
            line-height: 1.25 !important;
          }

          .balance-line-chip span {
            color: #e5e7eb !important;
            font-style: normal !important;
          }
          .balance-line-chip em {
            color: #64748b !important;
            font-style: normal !important;
          }
          .balance-line-chip b {
            color: #93c5fd !important;
            font-weight: 950 !important;
          }

          .balance-result-teams--compact {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 16px !important;
            margin-top: 16px !important;
            align-items: start !important;
          }

          .balance-result-teams--compact .balance-team-panel {
            padding: 16px !important;
            border-radius: 20px !important;
          }

          .balance-result-teams--compact .balance-team-header {
            margin-bottom: 10px !important;
          }

          .balance-result-teams--compact .balance-team-list {
            display: grid !important;
            gap: 8px !important;
          }

          .balance-player-card--compact {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            padding: 10px 12px !important;
            min-height: 74px !important;
            border-radius: 14px !important;
            cursor: grab !important;
          }

          .balance-player-card--compact:active {
            cursor: grabbing !important;
          }

          .balance-player-card--compact + .balance-player-card--compact {
            margin-top: 0 !important;
          }

          .balance-player-compact-head {
            display: grid !important;
            grid-template-columns: 52px minmax(0, 1fr) 66px !important;
            gap: 10px !important;
            align-items: center !important;
            min-width: 0 !important;
          }

          .balance-result-teams--compact .balance-position-badge {
            min-height: 38px !important;
            border-radius: 10px !important;
            font-size: 12px !important;
          }

          .balance-result-teams--compact .balance-player-name {
            margin: 0 0 4px !important;
            font-size: 14px !important;
            line-height: 1.25 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .balance-result-teams--compact .balance-player-nickname {
            font-size: 11px !important;
          }

          .balance-player-compact-meta {
            display: flex !important;
            gap: 6px !important;
            flex-wrap: wrap !important;
            min-width: 0 !important;
          }

          .balance-player-compact-meta span {
            max-width: 120px !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            padding: 2px 7px !important;
            border-radius: 999px !important;
            background: rgba(15, 23, 42, 0.72) !important;
            border: 1px solid rgba(148, 163, 184, 0.18) !important;
            color: #cbd5e1 !important;
            font-size: 10px !important;
            font-weight: 850 !important;
            line-height: 1.2 !important;
          }

          .balance-player-score-box {
            display: grid !important;
            justify-items: end !important;
            gap: 2px !important;
          }

          .balance-player-score-box span {
            color: #94a3b8 !important;
            font-size: 10px !important;
            font-weight: 900 !important;
          }

          .balance-player-score-box strong {
            color: #dbeafe !important;
            font-size: 18px !important;
            font-weight: 950 !important;
            line-height: 1 !important;
          }

          .balance-player-details {
            margin: 0 !important;
            padding: 0 !important;
          }

          .balance-player-details summary {
            display: inline-flex !important;
            align-items: center !important;
            width: fit-content !important;
            padding: 4px 8px !important;
            border-radius: 999px !important;
            background: rgba(59, 130, 246, 0.14) !important;
            border: 1px solid rgba(96, 165, 250, 0.22) !important;
            color: #bfdbfe !important;
            font-size: 11px !important;
            font-weight: 900 !important;
            list-style: none !important;
            cursor: pointer !important;
          }

          .balance-player-details summary::-webkit-details-marker {
            display: none !important;
          }

          .balance-player-info--compact {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 6px 10px !important;
            margin-top: 8px !important;
            padding-top: 8px !important;
            border-top: 1px solid rgba(148, 163, 184, 0.16) !important;
          }

          .balance-player-info--compact .balance-player-info-row {
            font-size: 11px !important;
          }

          .balance-player-reason {
            margin: 8px 0 0 !important;
            color: #cbd5e1 !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            line-height: 1.45 !important;
          }

          .balance-score-evidence-card {
            grid-column: 1 / -1 !important;
            padding: 22px !important;
            border-radius: 20px !important;
            background:
              radial-gradient(
                circle at 14% 0%,
                rgba(59, 130, 246, 0.16),
                transparent 34%
              ),
              linear-gradient(
                145deg,
                rgba(8, 22, 43, 0.98),
                rgba(10, 30, 55, 0.98)
              ) !important;
            border: 1px solid rgba(96, 165, 250, 0.32) !important;
            box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28) !important;
          }

          .balance-score-evidence-head {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            gap: 16px !important;
            margin-bottom: 14px !important;
          }

          .balance-score-evidence-title {
            color: #f8fafc !important;
            font-size: 17px !important;
            font-weight: 950 !important;
            line-height: 1.25 !important;
          }

          .balance-score-evidence-desc {
            margin-top: 5px !important;
            color: #94a3b8 !important;
            font-size: 12px !important;
            font-weight: 750 !important;
            line-height: 1.5 !important;
          }

          .balance-score-evidence summary {
            display: inline-flex !important;
            align-items: center !important;
            width: fit-content !important;
            min-height: 34px !important;
            padding: 0 13px !important;
            border-radius: 999px !important;
            background: rgba(59, 130, 246, 0.18) !important;
            border: 1px solid rgba(96, 165, 250, 0.32) !important;
            color: #dbeafe !important;
            font-size: 12px !important;
            font-weight: 950 !important;
            list-style: none !important;
            cursor: pointer !important;
          }

          .balance-score-evidence summary::-webkit-details-marker {
            display: none !important;
          }

          .balance-evidence-section {
            display: grid !important;
            gap: 12px !important;
            margin-top: 18px !important;
            padding-top: 18px !important;
            border-top: 1px solid rgba(148, 163, 184, 0.16) !important;
          }

          .balance-evidence-section h3 {
            margin: 0 !important;
            color: #e0f2fe !important;
            font-size: 15px !important;
            font-weight: 950 !important;
          }

          .balance-evidence-grid {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .balance-evidence-grid--summary {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .balance-evidence-grid div {
            display: grid !important;
            gap: 4px !important;
            min-width: 0 !important;
            padding: 10px 12px !important;
            border-radius: 13px !important;
            background: rgba(2, 6, 23, 0.44) !important;
            border: 1px solid rgba(148, 163, 184, 0.18) !important;
          }

          .balance-evidence-grid span {
            color: #94a3b8 !important;
            font-size: 10px !important;
            font-weight: 900 !important;
            line-height: 1.3 !important;
          }

          .balance-evidence-grid strong {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            color: #f8fafc !important;
            font-size: 13px !important;
            font-weight: 950 !important;
          }

          .balance-evidence-note {
            margin: 0 !important;
            color: #cbd5e1 !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            line-height: 1.65 !important;
          }

          .balance-evidence-line-table {
            display: grid !important;
            gap: 8px !important;
          }

          .balance-evidence-line-row {
            display: grid !important;
            grid-template-columns: 64px minmax(0, 1fr) minmax(0, 1fr) 120px !important;
            gap: 10px !important;
            align-items: center !important;
            padding: 10px 12px !important;
            border-radius: 13px !important;
            background: rgba(15, 23, 42, 0.54) !important;
            border: 1px solid rgba(148, 163, 184, 0.16) !important;
          }

          .balance-evidence-line-row strong {
            color: #bfdbfe !important;
            font-size: 12px !important;
            font-weight: 950 !important;
          }

          .balance-evidence-line-row span,
          .balance-evidence-line-row b {
            min-width: 0 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
            font-size: 12px !important;
            font-weight: 850 !important;
          }

          .balance-evidence-team-red {
            color: #fecaca !important;
          }
          .balance-evidence-team-blue {
            color: #bfdbfe !important;
          }
          .balance-evidence-line-row b {
            color: #93c5fd !important;
            text-align: right !important;
          }

          .balance-evidence-player-list {
            display: grid !important;
            gap: 12px !important;
          }

          .balance-evidence-player-card {
            display: grid !important;
            gap: 12px !important;
            padding: 14px !important;
            border-radius: 16px !important;
            background: rgba(2, 6, 23, 0.46) !important;
            border: 1px solid rgba(148, 163, 184, 0.18) !important;
          }

          .balance-evidence-player-top {
            display: flex !important;
            align-items: flex-start !important;
            justify-content: space-between !important;
            gap: 12px !important;
          }

          .balance-evidence-player-top div {
            display: grid !important;
            gap: 4px !important;
            min-width: 0 !important;
          }

          .balance-evidence-player-top strong {
            color: #f8fafc !important;
            font-size: 14px !important;
            font-weight: 950 !important;
          }

          .balance-evidence-player-top span {
            color: #94a3b8 !important;
            font-size: 12px !important;
            font-weight: 750 !important;
          }

          .balance-evidence-player-top b {
            flex-shrink: 0 !important;
            color: #dbeafe !important;
            font-size: 20px !important;
            font-weight: 950 !important;
            line-height: 1 !important;
          }

          .balance-evidence-grid--substats {
            padding-top: 10px !important;
            border-top: 1px dashed rgba(148, 163, 184, 0.2) !important;
          }

          .balance-evidence-reason {
            display: grid !important;
            gap: 6px !important;
            padding: 10px 12px !important;
            border-radius: 13px !important;
            background: rgba(59, 130, 246, 0.09) !important;
            border: 1px solid rgba(96, 165, 250, 0.18) !important;
          }

          .balance-evidence-reason p {
            margin: 0 !important;
            color: #dbeafe !important;
            font-size: 12px !important;
            font-weight: 750 !important;
            line-height: 1.55 !important;
          }

          @media (max-width: 900px) {
            .balance-overview-main {
              grid-template-columns: 1fr !important;
            }
            .balance-overview-stats {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
            .balance-line-strip {
              grid-template-columns: 1fr !important;
            }
            .balance-result-teams {
              grid-template-columns: 1fr;
            }
            .balance-result-bottom {
              grid-template-columns: 1fr !important;
            }
            .balance-result-utility__header {
              flex-direction: column !important;
            }
            .balance-result-utility__buttons {
              width: 100% !important;
              justify-content: stretch !important;
            }
            .balance-compact-button {
              flex: 1;
            }
            .balance-summary-list--compact {
              grid-template-columns: 1fr !important;
            }
            .balance-player-info {
              grid-template-columns: 1fr;
            }
            .balance-evidence-grid,
            .balance-evidence-grid--summary {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
            .balance-evidence-line-row {
              grid-template-columns: 1fr !important;
            }
            .balance-evidence-line-row b {
              text-align: left !important;
            }
            .balance-evidence-player-top {
              align-items: stretch !important;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
