import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type Team = "RED" | "BLUE";
type Position = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type PlayerInput = {
  name: string;
  preferredPositions: Position[];
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
  preferredPositions: Position[];
};

type Assignment = {
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

type CandidateSnapshot = {
  redTotal: number;
  blueTotal: number;
  diff: number;
  preferredAssignedCount: number;
  autoAssignedCount: number;
  totalScore: number;
  assignments: Assignment[];
};

const POSITIONS: Position[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

const SLOT_ORDER: Array<{ team: Team; position: Position }> = [
  { team: "RED", position: "TOP" },
  { team: "RED", position: "JGL" },
  { team: "RED", position: "MID" },
  { team: "RED", position: "ADC" },
  { team: "RED", position: "SUP" },
  { team: "BLUE", position: "TOP" },
  { team: "BLUE", position: "JGL" },
  { team: "BLUE", position: "MID" },
  { team: "BLUE", position: "ADC" },
  { team: "BLUE", position: "SUP" },
];

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

function isValidPositionArray(value: unknown): value is Position[] {
  return (
    Array.isArray(value) &&
    value.every((item) => POSITIONS.includes(item as Position))
  );
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

function normalizeTierBucket(raw: string): keyof typeof TIER_TABLE {
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

function getAssignedScore(
  player: ResolvedPlayer,
  position: Position,
  preferred: boolean
): number {
  const currentBucket = normalizeTierBucket(player.currentTier);
  const peakBucket = normalizeTierBucket(player.peakTier);

  const currentScore = TIER_TABLE[currentBucket][position];
  const peakScore = TIER_TABLE[peakBucket][position];
  const winRateScore = player.winRate;

  let total = currentScore * 0.5 + peakScore * 0.3 + winRateScore * 0.2;

  if (!preferred) {
    total *= 0.9;
  }

  return Number(total.toFixed(2));
}

function isBetterCandidate(
  candidate: Pick<
    CandidateSnapshot,
    "preferredAssignedCount" | "autoAssignedCount" | "diff" | "totalScore"
  >,
  current: Pick<
    CandidateSnapshot,
    "preferredAssignedCount" | "autoAssignedCount" | "diff" | "totalScore"
  > | null
): boolean {
  if (!current) return true;

  if (candidate.preferredAssignedCount !== current.preferredAssignedCount) {
    return candidate.preferredAssignedCount > current.preferredAssignedCount;
  }

  if (candidate.autoAssignedCount !== current.autoAssignedCount) {
    return candidate.autoAssignedCount < current.autoAssignedCount;
  }

  if (candidate.diff !== current.diff) {
    return candidate.diff < current.diff;
  }

  return candidate.totalScore > current.totalScore;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;

    if (!Array.isArray(body.players) || body.players.length !== 10) {
      return NextResponse.json(
        { message: "플레이어는 정확히 10명을 입력해야 합니다." },
        { status: 400 }
      );
    }

    for (const player of body.players) {
      if (!player.name?.trim()) {
        return NextResponse.json(
          { message: "플레이어 이름을 모두 입력해주세요." },
          { status: 400 }
        );
      }

      if (
        !isValidPositionArray(player.preferredPositions) ||
        player.preferredPositions.length < 1
      ) {
        return NextResponse.json(
          { message: "각 플레이어는 최소 1개 이상의 라인을 선택해야 합니다." },
          { status: 400 }
        );
      }
    }

    const normalizedNames = body.players.map((player) =>
      player.name.trim().toLowerCase()
    );

    const duplicateCheck = new Set<string>();

    for (const name of normalizedNames) {
      if (duplicateCheck.has(name)) {
        return NextResponse.json(
          { message: "중복된 플레이어 이름이 입력되었습니다." },
          { status: 400 }
        );
      }

      duplicateCheck.add(name);
    }

    const dbPlayers = await prisma.player.findMany({
      where: {
        OR: body.players.map((player) => ({
          name: {
            equals: player.name.trim(),
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
      dbPlayers.map((player) => [player.name.trim().toLowerCase(), player])
    );

    const invalidNames: string[] = [];
    for (const input of body.players) {
      const found = dbPlayerMap.get(input.name.trim().toLowerCase());

      if (!found) {
        invalidNames.push(input.name.trim());
      }
    }

    if (invalidNames.length > 0) {
      return NextResponse.json(
        {
          message: "등록되어있지 않은 플레이어가 있습니다.",
          invalidNames,
        },
        { status: 400 }
      );
    }

    const resolvedPlayers: ResolvedPlayer[] = body.players.map((input) => {
      const found = dbPlayerMap.get(input.name.trim().toLowerCase());

      if (!found) {
        throw new Error("선택한 플레이어 정보를 찾을 수 없습니다.");
      }

      if (!found.currentTier || !found.peakTier) {
        throw new Error(
          `${found.name} (${found.nickname}#${found.tag}) 플레이어의 티어 정보가 없습니다. 플레이어 정보를 먼저 수정해주세요.`
        );
      }

      const totalGames = found.participants.length;
      const wins = found.participants.filter(
        (participant) => participant.team === participant.game.winnerTeam
      ).length;

      const winRate =
        totalGames > 0 ? Number(((wins / totalGames) * 100).toFixed(1)) : 50;

      return {
        id: found.id,
        name: found.name,
        nickname: found.nickname,
        tag: found.tag,
        peakTier: found.peakTier,
        currentTier: found.currentTier,
        winRate,
        preferredPositions: input.preferredPositions,
      };
    });

    const scoreMatrix = resolvedPlayers.map((player) =>
      SLOT_ORDER.map((slot) => {
        const preferred = player.preferredPositions.includes(slot.position);
        const score = getAssignedScore(player, slot.position, preferred);

        return {
          preferred,
          score,
          team: slot.team,
          position: slot.position,
        };
      })
    );

    const maxPossibleScoreByPlayer = scoreMatrix.map((playerScores) =>
      Math.max(...playerScores.map((item) => item.score))
    );

    let bestResult: CandidateSnapshot | null = null;
    const used: boolean[] = Array(resolvedPlayers.length).fill(false);
    const assignments: Assignment[] = [];

    function dfs(
      slotIndex: number,
      redTotal: number,
      blueTotal: number,
      preferredAssignedCount: number,
      autoAssignedCount: number
    ) {
      if (slotIndex === SLOT_ORDER.length) {
        const diff = Math.abs(redTotal - blueTotal);
        const totalScore = redTotal + blueTotal;

        const candidate: CandidateSnapshot = {
          redTotal: Number(redTotal.toFixed(2)),
          blueTotal: Number(blueTotal.toFixed(2)),
          diff: Number(diff.toFixed(2)),
          preferredAssignedCount,
          autoAssignedCount,
          totalScore: Number(totalScore.toFixed(2)),
          assignments: [...assignments],
        };

        if (
          isBetterCandidate(
            {
              preferredAssignedCount: candidate.preferredAssignedCount,
              autoAssignedCount: candidate.autoAssignedCount,
              diff: candidate.diff,
              totalScore: candidate.totalScore,
            },
            bestResult
              ? {
                  preferredAssignedCount: bestResult.preferredAssignedCount,
                  autoAssignedCount: bestResult.autoAssignedCount,
                  diff: bestResult.diff,
                  totalScore: bestResult.totalScore,
                }
              : null
          )
        ) {
          bestResult = candidate;
        }

        return;
      }

      const remainingSlots = SLOT_ORDER.length - slotIndex;

      if (
        bestResult &&
        preferredAssignedCount + remainingSlots < bestResult.preferredAssignedCount
      ) {
        return;
      }

      if (
        bestResult &&
        preferredAssignedCount + remainingSlots ===
          bestResult.preferredAssignedCount &&
        autoAssignedCount > bestResult.autoAssignedCount
      ) {
        return;
      }

      let remainingMaxShift = 0;

      for (let i = 0; i < resolvedPlayers.length; i += 1) {
        if (!used[i]) {
          remainingMaxShift += maxPossibleScoreByPlayer[i];
        }
      }

      const currentDiff = Math.abs(redTotal - blueTotal);
      const minPossibleFinalDiff = Math.max(0, currentDiff - remainingMaxShift);

      if (
        bestResult &&
        preferredAssignedCount + remainingSlots ===
          bestResult.preferredAssignedCount &&
        autoAssignedCount >= bestResult.autoAssignedCount &&
        minPossibleFinalDiff > bestResult.diff
      ) {
        return;
      }

      const candidates: Array<{
        playerIndex: number;
        preferred: boolean;
        score: number;
      }> = [];

      for (let i = 0; i < resolvedPlayers.length; i += 1) {
        if (used[i]) continue;

        const cell = scoreMatrix[i][slotIndex];

        candidates.push({
          playerIndex: i,
          preferred: cell.preferred,
          score: cell.score,
        });
      }

      candidates.sort((a, b) => {
        if (a.preferred !== b.preferred) {
          return a.preferred ? -1 : 1;
        }

        return b.score - a.score;
      });

      for (const candidate of candidates) {
        const i = candidate.playerIndex;
        const player = resolvedPlayers[i];
        const slot = SLOT_ORDER[slotIndex];
        const cell = scoreMatrix[i][slotIndex];

        used[i] = true;

        assignments.push({
          playerId: player.id,
          name: player.name,
          nickname: player.nickname,
          tag: player.tag,
          team: slot.team,
          position: slot.position,
          preferred: cell.preferred,
          score: cell.score,
          peakTier: player.peakTier,
          currentTier: player.currentTier,
          winRate: player.winRate,
        });

        dfs(
          slotIndex + 1,
          slot.team === "RED" ? redTotal + cell.score : redTotal,
          slot.team === "BLUE" ? blueTotal + cell.score : blueTotal,
          cell.preferred ? preferredAssignedCount + 1 : preferredAssignedCount,
          cell.preferred ? autoAssignedCount : autoAssignedCount + 1
        );

        assignments.pop();
        used[i] = false;
      }
    }

    dfs(0, 0, 0, 0, 0);

    if (bestResult === null) {
      return NextResponse.json(
        { message: "유효한 팀 조합을 만들 수 없습니다." },
        { status: 400 }
      );
    }

    const finalResult: CandidateSnapshot = bestResult;

    const red: Assignment[] = finalResult.assignments
      .filter((item) => item.team === "RED")
      .sort(
        (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)
      );

    const blue: Assignment[] = finalResult.assignments
      .filter((item) => item.team === "BLUE")
      .sort(
        (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)
      );

    return NextResponse.json({
      redTotal: finalResult.redTotal,
      blueTotal: finalResult.blueTotal,
      diff: finalResult.diff,
      preferredAssignedCount: finalResult.preferredAssignedCount,
      autoAssignedCount: finalResult.autoAssignedCount,
      red,
      blue,
    });
  } catch (error) {
    console.error("[PLAYERS_BALANCE_POST_ERROR]", error);

    const message =
      error instanceof Error
        ? error.message
        : "팀 밸런스 계산에 실패했습니다.";

    return NextResponse.json({ message }, { status: 500 });
  }
}