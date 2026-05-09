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
  inhouseScore?: number;
  adjustedScore?: number;
  rankScore?: number;
  rankBaseScore?: number;
  rankAddedScore?: number;
  rankGapFromLowest?: number;
  tierWeight?: number;
  internalRankWeight?: number;
  mixedBaseScore?: number;
  bonus?: number;
  finalBaseScore?: number;
  mainPositions?: Position[];
  subPositions?: Position[];
  currentTierScore?: number;
  peakTierScore?: number;
  baseTierScore?: number;
  recentStats?: {
    games?: number;
    wins?: number;
    winRate?: number | null;
    kda?: number | null;
    mainPosition?: Position | null;
    avgDamage?: number | null;
    avgVisionScore?: number | null;
  };
  internalStats?: {
    totalGames?: number;
    wins?: number;
    losses?: number;
    winRate?: number | null;
    kda?: number | null;
  };
  internalPositionStats?: {
    position?: Position;
    games?: number;
    wins?: number;
    losses?: number;
    winRate?: number | null;
    kda?: number | null;
  };
  balanceOverrideScore?: number;
  balanceOverrideReason?: string | null;
  soloRecentGames?: number;
  soloRecentWins?: number;
  soloRecentWinRate?: number | null;
  soloRecentKda?: number | null;
  soloRecentMainPosition?: Position | null;
  soloRecentSubPosition?: Position | null;
  soloRecentPositionConfidence?: number;
  soloRecentAvgDamage?: number | null;
  soloRecentAvgVisionScore?: number | null;
  internalPositionBonus?: number;
  soloPositionBonus?: number;
  soloApplyPositionMatchBonus?: number;
  positionSkillBonus?: number;
  mmrBonus?: number;
  balanceMmr?: number;
  assignedPositionMmr?: number;
  mmrConfidence?: number;
  rolePenalty?: number;
  soloRecentFormBonus?: number;
  scoreBreakdown?: {
    currentTierScore?: number;
    peakTierScore?: number;
    inhouseScore?: number;
    tierBaseScore?: number;
    adjustedScore?: number;
    tierScore?: number;
    internalRankBaseScore?: number;
    rankGapFromLowest?: number;
    rankAddedScore?: number;
    rankScore?: number;
    tierWeight?: number;
    internalRankWeight?: number;
    mixedBaseScore?: number;
    sTierBonus?: number;
    finalBaseScore?: number;
    roleMultiplier?: number;
    roleLoss?: number;
    rolePenalty?: number;
    recentBonus?: number;
    internalBonus?: number;
    soloRecentFormBonus?: number;
    soloApplyPositionMatchBonus?: number;
    internalPositionBonus?: number;
    soloPositionBonus?: number;
    positionSkillBonus?: number;
    mmrBonus?: number;
    balanceOverrideScore?: number;
    finalScore?: number;
  };
  explanation?: string[];
};

type BalanceResponse = {
  optionNo?: number;
  optionTitle?: string;
  optionDescription?: string;
  planType?: "TEAM_TOTAL" | "LINE_BALANCE" | "POSITION_SATISFACTION";
  planCost?: number;
  redTotal: number;
  blueTotal: number;
  diff: number;
  balanceCost?: number;
  qualityScore?: number;
  recommendationScore?: number;
  warningMessages?: string[];
  lineDiffTotal?: number;
  maxLineDiff?: number;
  topPlayerDiff?: number;
  sTierStackPenalty?: number;
  weightedLineDiff?: number;
  frontSideDiff?: number;
  midJglDiff?: number;
  bottomDiff?: number;
  autoLinePenalty?: number;
  mainImbalancePenalty?: number;
  dataReliabilityPenalty?: number;
  stompPenalty?: number;
  mainAssignedCount: number;
  subAssignedCount: number;
  autoAssignedCount: number;
  red: AssignedPlayer[];
  blue: AssignedPlayer[];
  soloSync?: {
    requested: number;
    synced: number;
    skipped: number;
    failed: number;
  } | null;
  recommendedAlternative?: {
    optionNo?: number;
    optionTitle?: string;
    qualityScore?: number;
    recommendationScore?: number;
    reason?: string;
  } | null;
  aiJudgement?: {
    selectedOptionNo: number | null;
    selectedOptionTitle: string | null;
    confidence: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    verdict: string;
    inferredWinner: "RED" | "BLUE" | "EVEN";
    predictedRedWinRate: number;
    predictedBlueWinRate: number;
    reasoning: string[];
    riskFactors: string[];
    operatingAdvice: string;
  } | null;
  alternatives?: BalanceResponse[];
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
          baseScore: player.finalBaseScore ?? player.scoreBreakdown?.finalBaseScore ?? player.score,
          soloBonus: player.soloRecentFormBonus ?? player.scoreBreakdown?.soloRecentFormBonus ?? 0,
          positionBonus: player.positionSkillBonus ?? player.scoreBreakdown?.positionSkillBonus ?? 0,
          rolePenalty: player.rolePenalty ?? player.scoreBreakdown?.rolePenalty ?? 0,
        })),
        ...result.red.map((player) => ({
          playerId: player.playerId,
          team: "RED",
          position: player.position,
          roleType: player.roleType,
          score: player.score,
          baseScore: player.finalBaseScore ?? player.scoreBreakdown?.finalBaseScore ?? player.score,
          soloBonus: player.soloRecentFormBonus ?? player.scoreBreakdown?.soloRecentFormBonus ?? 0,
          positionBonus: player.positionSkillBonus ?? player.scoreBreakdown?.positionSkillBonus ?? 0,
          rolePenalty: player.rolePenalty ?? player.scoreBreakdown?.rolePenalty ?? 0,
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

    return `RED ${formatNames(target.red)}\nBLUE ${formatNames(target.blue)}${aiLine}`;
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
    const { player, position, roleType, baseScore, rolePenalty, score } = params;
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
          ? player.scoreBreakdown?.rolePenalty ?? player.rolePenalty ?? 5
          : player.scoreBreakdown?.rolePenalty ?? player.rolePenalty ?? 10;
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
              (player.adjustedScore ??
                player.scoreBreakdown?.adjustedScore ??
                player.baseTierScore ??
                0)
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

    return {
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
      breakdown.roleLoss ?? breakdown.rolePenalty ?? player.rolePenalty ?? Number((finalBaseScore - player.score).toFixed(2));
    const soloRecentFormBonus = breakdown.soloRecentFormBonus ?? player.soloRecentFormBonus ?? 0;
    const soloApplyPositionMatchBonus = breakdown.soloApplyPositionMatchBonus ?? player.soloApplyPositionMatchBonus ?? 0;
    const positionSkillBonus = breakdown.positionSkillBonus ?? player.positionSkillBonus ?? 0;
    const mmrBonus = breakdown.mmrBonus ?? player.mmrBonus ?? 0;
    const balanceOverrideScore = breakdown.balanceOverrideScore ?? player.balanceOverrideScore ?? 0;
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

      return {
        ...alternatives[index],
        soloSync: prev.soloSync ?? alternatives[index].soloSync ?? null,
        aiJudgement: prev.aiJudgement ?? alternatives[index].aiJudgement ?? null,
        recommendedAlternative: prev.recommendedAlternative ?? alternatives[index].recommendedAlternative ?? null,
        alternatives,
      };
    });

    setSelectedResultIndex(index);
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
              공식 개선 제안이 아니라, 현재 후보 3개를 실제 운영 리스크 기준으로 추론한 결과입니다.
            </span>
          </div>
          <b>
            {judgement.selectedOptionNo ?? "-"}안 · 신뢰도 {judgement.confidence.toFixed(1)}점
          </b>
        </div>

        <div className="balance-ai-judgement-grid">
          <div>
            <span>판단</span>
            <strong>{judgement.verdict}</strong>
          </div>
          <div>
            <span>예상 승률</span>
            <strong>RED {judgement.predictedRedWinRate.toFixed(1)}% / BLUE {judgement.predictedBlueWinRate.toFixed(1)}%</strong>
          </div>
          <div>
            <span>위험도</span>
            <strong>{riskLabel}</strong>
          </div>
          <div>
            <span>추론 우세</span>
            <strong>{judgement.inferredWinner === "EVEN" ? "반반" : judgement.inferredWinner}</strong>
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

        <p className="balance-ai-judgement-advice">{judgement.operatingAdvice}</p>
      </section>
    );
  }

  function renderBalanceAlternatives(target: BalanceResponse) {
    const alternatives = target.alternatives ?? [];

    if (alternatives.length <= 1) return null;

    return (
      <section className="balance-alternative-card">
        <div className="balance-alternative-head">
          <div>
            <strong>자동 계산 추천안</strong>
            <span>모든 안은 고티어 주포지션을 우선한 뒤, 1안은 총합, 2안은 라인 균형, 3안은 포지션 만족도를 우선합니다.</span>
          </div>
          <b>{selectedResultIndex >= 0 ? `${selectedResultIndex + 1}안 선택 중` : "수동 조정 중"}</b>
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
                <span className="balance-alternative-button__no">{option.optionNo ?? index + 1}안</span>
                <strong>{option.optionTitle ?? `${grade.grade} · ${grade.label}`}</strong>
                <small>{option.optionDescription ?? grade.label}</small>
                <em>RED {option.redTotal.toFixed(1)} / BLUE {option.blueTotal.toFixed(1)} / 품질 {Number(option.qualityScore ?? 0).toFixed(1)}</em>
                <b>차이 {option.diff.toFixed(1)} · 가중라인 {Number(option.weightedLineDiff ?? option.lineDiffTotal ?? 0).toFixed(1)} · 상체 {Number(option.frontSideDiff ?? 0).toFixed(1)} · 미드정글 {Number(option.midJglDiff ?? 0).toFixed(1)} · 바텀 {Number(option.bottomDiff ?? 0).toFixed(1)}</b>
                {option.warningMessages?.length ? <small>{option.warningMessages.join(" / ")}</small> : null}
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
              팀 카드는 짧게 유지하고, 최고티어 60%·현재티어 30%·내전지표 10%와 포지션 반영
              과정을 이 영역에서 확인합니다.
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
                <strong>{formatDecimal(target.weightedLineDiff ?? target.lineDiffTotal)}</strong>
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
                          솔로랭 보정 {formatDecimal(calc.soloRecentFormBonus)}, 포지션 보정 {formatDecimal(calc.positionSkillBonus)}(솔랭/신청 일치 {formatDecimal(calc.soloApplyPositionMatchBonus)}), 내부 MMR 보정 {formatDecimal(calc.mmrBonus)}, 수동 보정 {formatDecimal(calc.balanceOverrideScore)}, 배정 감점 {formatDecimal(calc.roleLoss)}을 반영해 {formatDecimal(calculatedByPosition)}점입니다.
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
                        <strong>{formatDecimal(calc.soloRecentFormBonus)}</strong>
                      </div>
                      <div>
                        <span>포지션 숙련도</span>
                        <strong>{formatDecimal(calc.positionSkillBonus)}</strong>
                      </div>
                      <div>
                        <span>관리자 수동 보정</span>
                        <strong>{formatDecimal(calc.balanceOverrideScore)}</strong>
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

      setSelectedResultIndex(0);
      setResult(data as BalanceResponse);
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
              {loading && loadingMode === "sync" ? "갱신 후 계산 중..." : "솔로랭 갱신 후 계산"}
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
                      {result.recommendedAlternative ? ` · 추천: ${result.recommendedAlternative.optionNo}안 ${result.recommendedAlternative.optionTitle ?? ""}` : ""}
                      {result.warningMessages?.length ? ` · 주의: ${result.warningMessages.join(" / ")}` : ""}
                    </div>
                    {result.soloSync ? (
                      <div className="balance-form-head__desc">
                        솔로랭 갱신: 성공 {result.soloSync.synced}명 / 스킵 {result.soloSync.skipped}명 / 실패 {result.soloSync.failed}명
                      </div>
                    ) : null}
                  </div>
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
              radial-gradient(circle at 10% 0%, rgba(34, 211, 238, 0.14), transparent 34%),
              linear-gradient(145deg, rgba(8, 22, 43, 0.96), rgba(10, 30, 55, 0.96));
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
