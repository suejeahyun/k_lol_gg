export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { addDays, getKstDateKey, getKstDisplayDate, getKstStartOfDate } from "@/lib/date/kst";
import { requireApprovedUser } from "@/lib/auth/session";
import { requireApprovedUserOrAdmin, getAccessErrorResponseMessage } from "@/lib/auth/access";
import { rejectIfRateLimited } from "@/lib/rate-limit";

type TeamValue = "BLUE" | "RED";
type PositionValue = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type DraftPlayerInput = {
  playerId: number;
  team: TeamValue;
  position: PositionValue;
  roleType?: string | null;
  score?: number | null;
  baseScore?: number | null;
  soloBonus?: number | null;
  positionBonus?: number | null;
  rolePenalty?: number | null;
};

type DraftPostBody = {
  title?: string;
  optionType?: string | null;
  redTotal?: number | null;
  blueTotal?: number | null;
  diff?: number | null;
  balanceCost?: number | null;
  formulaVersion?: string | null;
  isOfficial?: boolean | null;
  seasonId?: number | null;
  players?: DraftPlayerInput[];
};

const LOOKBACK_DAYS = 3;

function isTeam(value: unknown): value is TeamValue {
  return value === "BLUE" || value === "RED";
}

function isPosition(value: unknown): value is PositionValue {
  return (
    value === "TOP" ||
    value === "JGL" ||
    value === "MID" ||
    value === "ADC" ||
    value === "SUP"
  );
}


function getOrdinal(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}


function startOfTodayKst() {
  return getKstStartOfDate(getKstDateKey());
}

export async function GET() {
  try {
    await requireApprovedUserOrAdmin();
    const from = addDays(startOfTodayKst(), -(LOOKBACK_DAYS - 1));

    const drafts = await prisma.teamBalanceDraft.findMany({
      where: {
        createdAt: {
          gte: from,
        },
      },
      include: {
        _count: {
          select: {
            players: true,
          },
        },
      },
      orderBy: [{ applyDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json({
      drafts: drafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        label: draft.title,
        applyDate: draft.applyDate.toISOString(),
        optionType: draft.optionType,
        redTotal: draft.redTotal,
        blueTotal: draft.blueTotal,
        diff: draft.diff,
        balanceCost: draft.balanceCost,
        formulaVersion: draft.formulaVersion,
        isOfficial: draft.isOfficial,
        count: draft._count.players,
      })),
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFTS_GET_ERROR]", error);
    const response = getAccessErrorResponseMessage(
      error,
      "팀 밸런스 결과 목록 조회 중 오류가 발생했습니다.",
    );

    return NextResponse.json(
      { message: response.message },
      { status: response.status },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "TEAM_BALANCE_DRAFT_CREATE",
      limit: 12,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    await requireApprovedUser();

    const body = (await req.json()) as DraftPostBody;
    const players = body.players ?? [];

    if (!Array.isArray(players) || players.length === 0) {
      return NextResponse.json(
        { message: "저장할 팀 밸런스 참가자가 없습니다." },
        { status: 400 }
      );
    }

    if (
      players.some(
        (player) =>
          !Number.isInteger(player.playerId) ||
          player.playerId <= 0 ||
          !isTeam(player.team) ||
          !isPosition(player.position)
      )
    ) {
      return NextResponse.json(
        { message: "팀 밸런스 저장 데이터가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (players.length !== 10) {
      return NextResponse.json(
        { message: "팀 밸런스 결과는 정확히 10명이어야 저장할 수 있습니다." },
        { status: 400 }
      );
    }

    const uniquePlayerIds = new Set(players.map((player) => player.playerId));
    if (uniquePlayerIds.size !== players.length) {
      return NextResponse.json(
        { message: "중복된 플레이어가 포함되어 있습니다." },
        { status: 400 }
      );
    }

    for (const team of ["BLUE", "RED"] as const) {
      const teamPlayers = players.filter((player) => player.team === team);

      if (teamPlayers.length !== 5) {
        return NextResponse.json(
          { message: `${team} 팀은 정확히 5명이어야 합니다.` },
          { status: 400 }
        );
      }

      const positions = new Set(teamPlayers.map((player) => player.position));
      if (positions.size !== 5) {
        return NextResponse.json(
          { message: `${team} 팀 포지션이 중복되었습니다.` },
          { status: 400 }
        );
      }
    }

    const kstDateKey = getKstDateKey();
    const applyDate = getKstStartOfDate(kstDateKey);
    const nextDate = addDays(applyDate, 1);

    const existingCount = await prisma.teamBalanceDraft.count({
      where: {
        applyDate: {
          gte: applyDate,
          lt: nextDate,
        },
      },
    });

    const title =
      body.title?.trim() ||
      `${getKstDisplayDate(kstDateKey)} ${getOrdinal(existingCount + 1)}`;

    const requestedSeasonId = Number.isInteger(body.seasonId) && Number(body.seasonId) > 0 ? Number(body.seasonId) : null;
    const activeSeason = requestedSeasonId
      ? null
      : await prisma.season.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

    const draft = await prisma.teamBalanceDraft.create({
      data: {
        title,
        seasonId: requestedSeasonId ?? activeSeason?.id ?? null,
        applyDate,
        optionType: body.optionType?.trim() || null,
        redTotal: typeof body.redTotal === "number" ? body.redTotal : null,
        blueTotal: typeof body.blueTotal === "number" ? body.blueTotal : null,
        diff: typeof body.diff === "number" ? body.diff : null,
        balanceCost: typeof body.balanceCost === "number" ? body.balanceCost : null,
        formulaVersion: body.formulaVersion?.trim() || "v3.0.0",
        isOfficial: Boolean(body.isOfficial),
        players: {
          create: players.map((player) => ({
            playerId: player.playerId,
            team: player.team,
            position: player.position,
            roleType: player.roleType ?? null,
            score: typeof player.score === "number" ? player.score : null,
            baseScore: typeof player.baseScore === "number" ? player.baseScore : null,
            soloBonus: typeof player.soloBonus === "number" ? player.soloBonus : null,
            positionBonus: typeof player.positionBonus === "number" ? player.positionBonus : null,
            rolePenalty: typeof player.rolePenalty === "number" ? player.rolePenalty : null,
          })),
        },
      },
      include: {
        _count: {
          select: {
            players: true,
          },
        },
      },
    });

    await writeAdminLog({
      action: "TEAM_BALANCE_DRAFT_CREATE",
      message: `팀 밸런스 결과 저장: #${draft.id} ${draft.title}, ${draft._count.players}명`,
    });

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      label: draft.title,
      applyDate: draft.applyDate.toISOString(),
      formulaVersion: draft.formulaVersion,
      isOfficial: draft.isOfficial,
      count: draft._count.players,
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFTS_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json(
          { message: "로그인이 필요합니다." },
          { status: 401 }
        );
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json(
          { message: "승인된 유저만 팀 밸런스 결과를 저장할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { message: "팀 밸런스 결과 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
