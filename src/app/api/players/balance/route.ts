import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type RoleType = "MAIN" | "SUB" | "AUTO";

type PlayerInput = {
  playerId?: number | null;
  name: string;
  nickname?: string;
  tag?: string;
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
};

type RequestBody = {
  players: PlayerInput[];
};

type ResolvedPlayer = {
  id: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string;
  currentTier: string;
  winRate: number;
  adjustedScore: number;
  rankScore: number;
  bonus: number;
  finalBaseScore: number;
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
};

type Assignment = {
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
  adjustedScore: number;
  rankScore: number;
  bonus: number;
};

type TeamBestResult = {
  total: number;
  assignments: Assignment[];
  mainAssignedCount: number;
  subAssignedCount: number;
  autoAssignedCount: number;
};

type CandidateSnapshot = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  totalScore: number;
  mainAssignedCount: number;
  subAssignedCount: number;
  autoAssignedCount: number;
  assignments: Assignment[];
};

type TierBucket =
  | "CHALLENGER"
  | "GRANDMASTER"
  | "MASTER_500_PLUS"
  | "MASTER_200_499"
  | "MASTER_TO_D1_71P"
  | "D1_70_TO_D3_71"
  | "D3_70_TO_P1_71"
  | "P1_70_TO_P3_71"
  | "P3_70_TO_G1_71"
  | "G1_70_TO_G3_71"
  | "G3_70_TO_S1_71"
  | "S1_70_TO_S3_71"
  | "S3_70_TO_B1_71"
  | "B1_70_OR_BELOW";

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const RANK_SCORE_START = 100;
const RANK_SCORE_STEP = 6;
const MAIN_POSITION_MULTIPLIER = 1;
const SUB_POSITION_MULTIPLIER = 0.8;
const AUTO_POSITION_MULTIPLIER = 0.6;

function isValidPosition(value: unknown): value is Position {
  return typeof value === "string" && POSITIONS.includes(value as Position);
}

function isValidSubPositions(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every((item) => isValidPosition(item));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function uniquePositions(
  mainPosition: Position | null,
  mainPositions: Position[],
  subPositions: Position[]
): {
  mainPosition: Position | null;
  mainPositions: Position[];
  subPositions: Position[];
} {
  const uniqueMainPositions = [...new Set(mainPositions)];

  const fallbackMainPositions =
    uniqueMainPositions.length > 0
      ? uniqueMainPositions
      : mainPosition
      ? [mainPosition]
      : [];

  const filteredSubs = [...new Set(subPositions)].filter(
    (position) => !fallbackMainPositions.includes(position)
  );

  return {
    mainPosition: fallbackMainPositions[0] ?? null,
    mainPositions: fallbackMainPositions,
    subPositions: filteredSubs,
  };
}

function extractLp(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const pMatch = compact.match(/(\d+)\s*(p|P|lp|LP)/);
  if (pMatch) return Number(pMatch[1]);

  const onlyNumberMatch = compact.match(/(\d+)/g);
  if (!onlyNumberMatch || onlyNumberMatch.length === 0) return null;

  return Number(onlyNumberMatch[onlyNumberMatch.length - 1]);
}

function extractDivision(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const tierMatch = compact.match(
    /(다이아|다이아몬드|에메랄드|플래티넘|플레|골드|실버|브론즈)([1-4])/
  );

  if (!tierMatch) return null;
  return Number(tierMatch[2]);
}

function extractFloor(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const floorMatch = compact.match(/([1-9]|10)층/);

  if (!floorMatch) return null;
  return Number(floorMatch[1]);
}

function normalizeTierBucket(raw: string): TierBucket {
  const value = raw.trim();
  const compact = value.replace(/\s/g, "");
  const lp = extractLp(value);
  const division = extractDivision(value);
  const floor = extractFloor(value);

  if (compact.includes("챌린저")) return "CHALLENGER";
  if (compact.includes("그랜드마스터")) return "GRANDMASTER";

  if (compact.includes("마스터")) {
    if (floor !== null) {
      if (floor <= 1) return "MASTER_500_PLUS";
      if (floor <= 2) return "MASTER_200_499";
      return "MASTER_TO_D1_71P";
    }

    if (lp !== null) {
      if (lp >= 500) return "MASTER_500_PLUS";
      if (lp >= 200) return "MASTER_200_499";
      return "MASTER_TO_D1_71P";
    }

    return "MASTER_TO_D1_71P";
  }

  if (compact.includes("다이아")) {
    if (division === 1) {
      if (lp !== null && lp >= 71) return "MASTER_TO_D1_71P";
      return "D1_70_TO_D3_71";
    }
    if (division === 2) return "D1_70_TO_D3_71";
    if (division === 3) {
      if (lp !== null && lp <= 70) return "D3_70_TO_P1_71";
      return "D1_70_TO_D3_71";
    }
    return "D3_70_TO_P1_71";
  }

  if (compact.includes("에메랄드")) {
    if (division === 1 || division === 2) return "P1_70_TO_P3_71";
    return "P3_70_TO_G1_71";
  }

  if (compact.includes("플래티넘") || compact.includes("플레")) {
    if (division === 1) {
      if (lp !== null && lp >= 71) return "D3_70_TO_P1_71";
      return "P1_70_TO_P3_71";
    }
    if (division === 2) return "P1_70_TO_P3_71";
    if (division === 3) {
      if (lp !== null && lp <= 70) return "P3_70_TO_G1_71";
      return "P1_70_TO_P3_71";
    }
    return "P3_70_TO_G1_71";
  }

  if (compact.includes("골드")) {
    if (division === 1) {
      if (lp !== null && lp >= 71) return "P3_70_TO_G1_71";
      return "G1_70_TO_G3_71";
    }
    if (division === 2) return "G1_70_TO_G3_71";
    if (division === 3) {
      if (lp !== null && lp <= 70) return "G3_70_TO_S1_71";
      return "G1_70_TO_G3_71";
    }
    return "G3_70_TO_S1_71";
  }

  if (compact.includes("실버")) {
    if (division === 1) {
      if (lp !== null && lp >= 71) return "G3_70_TO_S1_71";
      return "S1_70_TO_S3_71";
    }
    if (division === 2) return "S1_70_TO_S3_71";
    if (division === 3) {
      if (lp !== null && lp <= 70) return "S3_70_TO_B1_71";
      return "S1_70_TO_S3_71";
    }
    return "S3_70_TO_B1_71";
  }

  if (compact.includes("브론즈")) {
    if (division === 1 && lp !== null && lp >= 71) {
      return "S3_70_TO_B1_71";
    }
    return "B1_70_OR_BELOW";
  }

  return "B1_70_OR_BELOW";
}

const TIER_TABLE: Record<TierBucket, Record<Position, number>> = {
  CHALLENGER: { TOP: 58, JGL: 72, MID: 68, ADC: 62, SUP: 56 },
  GRANDMASTER: { TOP: 54, JGL: 68, MID: 64, ADC: 58, SUP: 52 },
  MASTER_500_PLUS: { TOP: 50, JGL: 64, MID: 60, ADC: 54, SUP: 48 },
  MASTER_200_499: { TOP: 46, JGL: 58, MID: 55, ADC: 49, SUP: 45 },
  MASTER_TO_D1_71P: { TOP: 43, JGL: 51, MID: 48, ADC: 43, SUP: 43 },

  D1_70_TO_D3_71: { TOP: 35, JGL: 40, MID: 40, ADC: 35, SUP: 35 },
  D3_70_TO_P1_71: { TOP: 30, JGL: 32, MID: 34, ADC: 30, SUP: 30 },

  P1_70_TO_P3_71: { TOP: 27, JGL: 29, MID: 29, ADC: 26, SUP: 26 },
  P3_70_TO_G1_71: { TOP: 24, JGL: 25, MID: 25, ADC: 22, SUP: 24 },

  G1_70_TO_G3_71: { TOP: 18, JGL: 16, MID: 17, ADC: 17, SUP: 20 },
  G3_70_TO_S1_71: { TOP: 15, JGL: 10, MID: 12, ADC: 12, SUP: 17 },

  S1_70_TO_S3_71: { TOP: 11, JGL: 5, MID: 7, ADC: 7, SUP: 13 },
  S3_70_TO_B1_71: { TOP: 5, JGL: 3, MID: 6, ADC: 5, SUP: 8 },

  B1_70_OR_BELOW: { TOP: 0, JGL: 0, MID: 0, ADC: 0, SUP: 2 },
};

function getTierLabel(currentTier: string, peakTier: string) {
  const current = currentTier?.trim();
  const peak = peakTier?.trim();

  if (current) return current;
  if (peak) return peak;
  return "티어 미등록";
}

function getSTierBonus(peakTier: string) {
  const compact = peakTier.replace(/\s/g, "");

  if (compact.includes("챌린저")) return 10;
  if (compact.includes("그랜드마스터")) return 8;
  if (compact.includes("마스터")) return 5;

  return 0;
}

function getPositionBaseScore(player: Pick<ResolvedPlayer, "currentTier" | "peakTier">, position: Position) {
  const currentBucket = normalizeTierBucket(player.currentTier || "");
  const peakBucket = normalizeTierBucket(player.peakTier || "");

  const currentScore = TIER_TABLE[currentBucket][position];
  const peakScore = TIER_TABLE[peakBucket][position];

  const baseScore = peakScore * 0.7 + currentScore * 0.3;
  const floorScore = peakScore * 0.65;

  return Number(Math.max(baseScore, floorScore).toFixed(2));
}

function getPlayerAdjustedScore(player: Pick<ResolvedPlayer, "currentTier" | "peakTier" | "mainPositions" | "subPositions">) {
  const preferredPositions =
    player.mainPositions.length > 0
      ? player.mainPositions
      : player.subPositions.length > 0
      ? player.subPositions
      : POSITIONS;

  const scores = preferredPositions.map((position) =>
    getPositionBaseScore(player, position)
  );

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Number(average.toFixed(2));
}

function applyInternalRankScores(players: Omit<ResolvedPlayer, "adjustedScore" | "rankScore" | "bonus" | "finalBaseScore">[]): ResolvedPlayer[] {
  const sortedPlayers = players
    .map((player) => {
      const adjustedScore = getPlayerAdjustedScore(player);
      const bonus = getSTierBonus(player.peakTier);

      return {
        ...player,
        adjustedScore,
        bonus,
      };
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      return b.bonus - a.bonus;
    });

  const rankScoreMap = new Map<number, number>();

  sortedPlayers.forEach((player, index) => {
    rankScoreMap.set(player.id, RANK_SCORE_START - index * RANK_SCORE_STEP);
  });

  return sortedPlayers
    .map((player) => {
      const rankScore = rankScoreMap.get(player.id) ?? 0;

      return {
        ...player,
        rankScore,
        finalBaseScore: rankScore + player.bonus,
      };
    })
    .sort((a, b) => a.id - b.id);
}

function getRoleType(player: ResolvedPlayer, position: Position): RoleType {
  if (player.mainPositions.includes(position)) return "MAIN";
  if (player.subPositions.includes(position)) return "SUB";
  return "AUTO";
}

function getAssignedScore(player: ResolvedPlayer, position: Position) {
  const roleType = getRoleType(player, position);

  let multiplier = AUTO_POSITION_MULTIPLIER;
  if (roleType === "MAIN") multiplier = MAIN_POSITION_MULTIPLIER;
  if (roleType === "SUB") multiplier = SUB_POSITION_MULTIPLIER;

  return {
    roleType,
    score: Number((player.finalBaseScore * multiplier).toFixed(2)),
  };
}

function permute<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const result: T[][] = [];

  items.forEach((item, index) => {
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
    const permutations = permute(remaining);
    permutations.forEach((permutation) => {
      result.push([item, ...permutation]);
    });
  });

  return result;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  function backtrack(start: number, current: T[]) {
    if (current.length === size) {
      result.push([...current]);
      return;
    }

    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

function evaluateTeam(team: Team, players: ResolvedPlayer[]): TeamBestResult {
  const permutations = permute(players);
  let best: TeamBestResult | null = null;

  permutations.forEach((orderedPlayers) => {
    let total = 0;
    let mainAssignedCount = 0;
    let subAssignedCount = 0;
    let autoAssignedCount = 0;

    const assignments: Assignment[] = orderedPlayers.map((player, index) => {
      const position = POSITIONS[index];
      const { roleType, score } = getAssignedScore(player, position);

      if (roleType === "MAIN") mainAssignedCount += 1;
      else if (roleType === "SUB") subAssignedCount += 1;
      else autoAssignedCount += 1;

      total += score;

      return {
        playerId: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        team,
        position,
        roleType,
        score,
        peakTier: player.peakTier,
        currentTier: player.currentTier,
        tierLabel: getTierLabel(player.currentTier, player.peakTier),
        winRate: player.winRate,
        adjustedScore: player.adjustedScore,
        rankScore: player.rankScore,
        bonus: player.bonus,
      };
    });

    const candidate: TeamBestResult = {
      total: Number(total.toFixed(2)),
      assignments,
      mainAssignedCount,
      subAssignedCount,
      autoAssignedCount,
    };

    if (!best) {
      best = candidate;
      return;
    }

    const candidateKey =
      candidate.mainAssignedCount * 100000 +
      candidate.subAssignedCount * 10000 -
      candidate.autoAssignedCount * 100 -
      candidate.total;

    const bestKey =
      best.mainAssignedCount * 100000 +
      best.subAssignedCount * 10000 -
      best.autoAssignedCount * 100 -
      best.total;

    if (candidateKey > bestKey) {
      best = candidate;
    }
  });

  return (
    best ?? {
      total: 0,
      assignments: [],
      mainAssignedCount: 0,
      subAssignedCount: 0,
      autoAssignedCount: 0,
    }
  );
}

function isBetterCandidate(candidate: CandidateSnapshot, current: CandidateSnapshot | null) {
  if (!current) return true;

  if (candidate.diff !== current.diff) return candidate.diff < current.diff;
  if (candidate.mainAssignedCount !== current.mainAssignedCount) {
    return candidate.mainAssignedCount > current.mainAssignedCount;
  }
  if (candidate.subAssignedCount !== current.subAssignedCount) {
    return candidate.subAssignedCount > current.subAssignedCount;
  }
  if (candidate.autoAssignedCount !== current.autoAssignedCount) {
    return candidate.autoAssignedCount < current.autoAssignedCount;
  }

  return candidate.totalScore > current.totalScore;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    if (!body || !Array.isArray(body.players) || body.players.length !== 10) {
      return NextResponse.json(
        { message: "플레이어는 정확히 10명이어야 합니다." },
        { status: 400 }
      );
    }

    const normalizedInputs: PlayerInput[] = [];
    const invalidInputNames: string[] = [];

    for (const player of body.players) {
      const rawName =
        typeof player?.name === "string" ? player.name.trim() : "";
      const mainPosition = player?.mainPosition ?? null;
      const mainPositions = Array.isArray(player?.mainPositions)
        ? player.mainPositions
        : mainPosition
        ? [mainPosition]
        : [];
      const subPositions = player?.subPositions ?? [];

      if (!rawName) {
        invalidInputNames.push(rawName);
        continue;
      }

      if (mainPosition !== null && !isValidPosition(mainPosition)) {
        return NextResponse.json(
          { message: "주 포지션 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }

      if (!isValidSubPositions(mainPositions)) {
        return NextResponse.json(
          { message: "주 포지션 목록 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }

      if (!isValidSubPositions(subPositions)) {
        return NextResponse.json(
          { message: "부 포지션 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }

      const normalized = uniquePositions(
        mainPosition,
        mainPositions,
        subPositions
      );

      if (normalized.mainPositions.length === 0) {
        return NextResponse.json(
          { message: "모든 플레이어는 최소 1개의 포지션을 선택해야 합니다." },
          { status: 400 }
        );
      }

      normalizedInputs.push({
        playerId:
          typeof player?.playerId === "number" && Number.isInteger(player.playerId)
            ? player.playerId
            : null,
        name: rawName,
        nickname: typeof player?.nickname === "string" ? player.nickname.trim() : "",
        tag: typeof player?.tag === "string" ? player.tag.trim() : "",
        mainPosition: normalized.mainPosition,
        mainPositions: normalized.mainPositions,
        subPositions: normalized.subPositions,
      });
    }

    if (invalidInputNames.length > 0) {
      return NextResponse.json(
        { message: "이름이 비어있는 플레이어가 있습니다.", invalidNames: invalidInputNames },
        { status: 400 }
      );
    }

    const selectedIds = normalizedInputs
      .map((player) => player.playerId)
      .filter((playerId): playerId is number => typeof playerId === "number");

    const selectedIdCounts = new Map<number, number>();
    selectedIds.forEach((playerId) => {
      selectedIdCounts.set(playerId, (selectedIdCounts.get(playerId) ?? 0) + 1);
    });

    const duplicatedSelectedIds = [...selectedIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([playerId]) => playerId);

    if (duplicatedSelectedIds.length > 0) {
      return NextResponse.json(
        { message: "중복 선택된 플레이어가 있습니다." },
        { status: 400 }
      );
    }

    const nameKeys = normalizedInputs
      .filter((player) => typeof player.playerId !== "number")
      .map((player) => normalizeText(player.name));

    const nameCounts = new Map<string, number>();
    nameKeys.forEach((key) => {
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    });

    const duplicatedNames = [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);

    if (duplicatedNames.length > 0) {
      return NextResponse.json(
        { message: "중복된 이름이 있습니다. 이름이 같은 경우 검색 목록에서 정확한 플레이어를 선택해주세요.", invalidNames: duplicatedNames },
        { status: 400 }
      );
    }

    const dbPlayers = await prisma.player.findMany({
      where: {
        OR: [
          ...(selectedIds.length > 0
            ? [
                {
                  id: {
                    in: selectedIds,
                  },
                },
              ]
            : []),
          ...normalizedInputs
            .filter((player) => typeof player.playerId !== "number")
            .map((player) => ({
              name: {
                equals: player.name,
                mode: "insensitive" as const,
              },
            })),
        ],
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        peakTier: true,
        currentTier: true,
      },
    });

    const dbPlayerByIdMap = new Map(dbPlayers.map((player) => [player.id, player]));
    const dbPlayerByNameMap = new Map(
      dbPlayers.map((player) => [normalizeText(player.name), player])
    );

    const invalidNames = normalizedInputs
      .filter((input) => {
        if (typeof input.playerId === "number") {
          return !dbPlayerByIdMap.has(input.playerId);
        }

        return !dbPlayerByNameMap.has(normalizeText(input.name));
      })
      .map((player) => player.name);

    if (invalidNames.length > 0) {
      return NextResponse.json(
        {
          message: "등록되어있지 않은 플레이어가 있습니다.",
          invalidNames,
        },
        { status: 400 }
      );
    }

    const baseResolvedPlayers = normalizedInputs.map((input) => {
      const player =
        typeof input.playerId === "number"
          ? dbPlayerByIdMap.get(input.playerId)!
          : dbPlayerByNameMap.get(normalizeText(input.name))!;

      return {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        peakTier: player.peakTier ?? "",
        currentTier: player.currentTier ?? "",
        winRate: 0,
        mainPosition: input.mainPosition,
        mainPositions: input.mainPositions,
        subPositions: input.subPositions,
      };
    });

    const resolvedPlayers = applyInternalRankScores(baseResolvedPlayers);

    const teamCombinations = combinations(resolvedPlayers, 5);
    let bestCandidate: CandidateSnapshot | null = null;

    for (const redPlayers of teamCombinations) {
      const redIds = new Set(redPlayers.map((player) => player.id));
      const bluePlayers = resolvedPlayers.filter((player) => !redIds.has(player.id));

      const redResult = evaluateTeam("RED", redPlayers);
      const blueResult = evaluateTeam("BLUE", bluePlayers);

      const candidate: CandidateSnapshot = {
        redTotal: redResult.total,
        blueTotal: blueResult.total,
        diff: Number(Math.abs(redResult.total - blueResult.total).toFixed(2)),
        totalScore: Number((redResult.total + blueResult.total).toFixed(2)),
        mainAssignedCount:
          redResult.mainAssignedCount + blueResult.mainAssignedCount,
        subAssignedCount:
          redResult.subAssignedCount + blueResult.subAssignedCount,
        autoAssignedCount:
          redResult.autoAssignedCount + blueResult.autoAssignedCount,
        assignments: [...redResult.assignments, ...blueResult.assignments],
      };

      if (isBetterCandidate(candidate, bestCandidate)) {
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      return NextResponse.json(
        { message: "팀 밸런스 계산 결과를 만들 수 없습니다." },
        { status: 500 }
      );
    }

    const red = bestCandidate.assignments
      .filter((assignment) => assignment.team === "RED")
      .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));

    const blue = bestCandidate.assignments
      .filter((assignment) => assignment.team === "BLUE")
      .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));

    return NextResponse.json({
      redTotal: bestCandidate.redTotal,
      blueTotal: bestCandidate.blueTotal,
      diff: bestCandidate.diff,
      mainAssignedCount: bestCandidate.mainAssignedCount,
      subAssignedCount: bestCandidate.subAssignedCount,
      autoAssignedCount: bestCandidate.autoAssignedCount,
      red,
      blue,
    });
  } catch (error) {
    console.error("[PLAYERS_BALANCE_POST_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 계산 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
