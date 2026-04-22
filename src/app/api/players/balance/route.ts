import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";
type RoleType = "MAIN" | "SUB" | "AUTO";

type PlayerInput = {
  name: string;
  mainPosition: Position | null;
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
  mainPosition: Position | null;
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

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

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
  subPositions: Position[]
): { mainPosition: Position | null; subPositions: Position[] } {
  const filteredSubs = [...new Set(subPositions)].filter(
    (position) => position !== mainPosition
  );

  return {
    mainPosition,
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
  const floorMatch = compact.match(/([1-9])층/);

  if (!floorMatch) return null;
  return Number(floorMatch[1]);
}

function normalizeTierBucket(raw: string) {
  const value = raw.trim();
  const compact = value.replace(/\s/g, "");
  const lp = extractLp(value);
  const division = extractDivision(value);
  const floor = extractFloor(value);

  if (
    compact.includes("챌린저") ||
    compact.includes("그랜드마스터") ||
    compact.includes("마스터")
  ) {
    if (floor !== null) {
      if (floor === 1) return "MASTER_500_PLUS";
      if (floor === 2) return "MASTER_200_499";
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

const TIER_TABLE: Record<string, Record<Position, number>> = {
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

function getBaseScore(player: ResolvedPlayer, position: Position): number {
  const currentBucket = normalizeTierBucket(player.currentTier || "");
  const peakBucket = normalizeTierBucket(player.peakTier || "");

  const currentScore = TIER_TABLE[currentBucket][position];
  const peakScore = TIER_TABLE[peakBucket][position];
  const winRateScore = player.winRate || 0;

  const total = currentScore * 0.5 + peakScore * 0.3 + winRateScore * 0.2;
  return Number(total.toFixed(2));
}

function getRoleType(player: ResolvedPlayer, position: Position): RoleType {
  if (player.mainPosition === position) return "MAIN";
  if (player.subPositions.includes(position)) return "SUB";
  return "AUTO";
}

function getAssignedScore(player: ResolvedPlayer, position: Position) {
  const roleType = getRoleType(player, position);
  const baseScore = getBaseScore(player, position);

  let multiplier = 0.6;
  if (roleType === "MAIN") multiplier = 1;
  if (roleType === "SUB") multiplier = 0.8;

  return {
    roleType,
    score: Number((baseScore * multiplier).toFixed(2)),
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
      candidate.autoAssignedCount * 100 +
      candidate.total;

    const bestKey =
      best.mainAssignedCount * 100000 +
      best.subAssignedCount * 10000 -
      best.autoAssignedCount * 100 +
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

      if (!isValidSubPositions(subPositions)) {
        return NextResponse.json(
          { message: "부 포지션 값이 올바르지 않습니다." },
          { status: 400 }
        );
      }

      const normalized = uniquePositions(mainPosition, subPositions);

      if (!normalized.mainPosition) {
        return NextResponse.json(
          { message: "모든 플레이어는 최소 1개의 포지션을 선택해야 합니다." },
          { status: 400 }
        );
      }

      normalizedInputs.push({
        name: rawName,
        mainPosition: normalized.mainPosition,
        subPositions: normalized.subPositions,
      });
    }

    const nameCounts = new Map<string, number>();
    for (const player of normalizedInputs) {
      const key = normalizeText(player.name);
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }

    const duplicatedNames = [...nameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);

    if (duplicatedNames.length > 0) {
      return NextResponse.json(
        { message: "중복된 이름이 있습니다.", invalidNames: duplicatedNames },
        { status: 400 }
      );
    }

    const dbPlayers = await prisma.player.findMany({
      where: {
        OR: normalizedInputs.map((player) => ({
          name: {
            equals: player.name,
            mode: "insensitive",
          },
        })),
      },
      include: {
        participants: {
          select: {
            team: true,
            game: {
              select: {
                winnerTeam: true,
              },
            },
          },
        },
      },
    });

    const dbPlayerMap = new Map(
      dbPlayers.map((player) => [normalizeText(player.name), player])
    );

    const invalidNames = normalizedInputs
      .filter((player) => !dbPlayerMap.has(normalizeText(player.name)))
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

    const resolvedPlayers: ResolvedPlayer[] = normalizedInputs.map((input) => {
      const player = dbPlayerMap.get(normalizeText(input.name))!;

      const totalGames = player.participants.length;
      const wins = player.participants.filter(
        (participant) => participant.team === participant.game.winnerTeam
      ).length;
      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(2)) : 50;

      return {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        tag: player.tag,
        peakTier: player.peakTier ?? "",
        currentTier: player.currentTier ?? "",
        winRate,
        mainPosition: input.mainPosition,
        subPositions: input.subPositions,
      };
    });

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