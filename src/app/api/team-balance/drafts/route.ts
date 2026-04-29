import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type TeamValue = "BLUE" | "RED";
type PositionValue = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

type DraftPlayerInput = {
  playerId: number;
  team: TeamValue;
  position: PositionValue;
};

type DraftPostBody = {
  title?: string;
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

function getKstDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getKstDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

function getKstStartOfDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
}

function getOrdinal(value: number) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfTodayKst() {
  return getKstStartOfDate(getKstDateKey(new Date()));
}

export async function GET() {
  try {
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
        count: draft._count.players,
      })),
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFTS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 결과 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const kstDateKey = getKstDateKey(new Date());
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

    const draft = await prisma.teamBalanceDraft.create({
      data: {
        title,
        applyDate,
        players: {
          create: players.map((player) => ({
            playerId: player.playerId,
            team: player.team,
            position: player.position,
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

    return NextResponse.json({
      id: draft.id,
      title: draft.title,
      label: draft.title,
      applyDate: draft.applyDate.toISOString(),
      count: draft._count.players,
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_DRAFTS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "팀 밸런스 결과 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
