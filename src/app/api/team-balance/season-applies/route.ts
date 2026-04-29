import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type ApplyPositionValue = "TOP" | "JGL" | "MID" | "ADC" | "SUP" | "ALL";

type ApplyPlayer = {
  playerId: number;
  name: string;
  nickname: string;
  tag: string;
  peakTier: string | null;
  currentTier: string | null;
  mainPosition: ApplyPositionValue | null;
  subPositions: ApplyPositionValue[];
  appliedAt: string;
};

type ApplyGroup = {
  key: string;
  label: string;
  applyDate: string;
  order: number;
  count: number;
  players: ApplyPlayer[];
};

const GROUP_SIZE = 10;
const LOOKBACK_DAYS = 3;

function getKstDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

function getKstDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

function getOrdinal(value: number) {
  const mod100 = value % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function getKstStartDateFromLookback() {
  const now = new Date();
  const kstDateKey = getKstDateKey(now);
  const [year, month, day] = kstDateKey.split("-").map(Number);

  const kstMidnightAsUtc = new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  kstMidnightAsUtc.setUTCDate(kstMidnightAsUtc.getUTCDate() - LOOKBACK_DAYS);

  return kstMidnightAsUtc;
}

export async function GET() {
  try {
    const currentSeason = await prisma.season.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!currentSeason) {
      return NextResponse.json({
        season: null,
        groups: [],
        players: [],
      });
    }

    const applies = await prisma.seasonParticipationApply.findMany({
      where: {
        seasonId: currentSeason.id,
        status: "APPLIED",
        applyDate: {
          gte: getKstStartDateFromLookback(),
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            nickname: true,
            tag: true,
            peakTier: true,
            currentTier: true,
          },
        },
      },
      orderBy: [
        {
          applyDate: "asc",
        },
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    const byDate = new Map<string, typeof applies>();

    applies.forEach((apply) => {
      const dateKey = getKstDateKey(apply.applyDate);
      const list = byDate.get(dateKey) ?? [];
      list.push(apply);
      byDate.set(dateKey, list);
    });

    const groups: ApplyGroup[] = [];

    [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .forEach(([dateKey, dateApplies]) => {
        for (let start = 0; start < dateApplies.length; start += GROUP_SIZE) {
          const chunk = dateApplies.slice(start, start + GROUP_SIZE);
          const order = Math.floor(start / GROUP_SIZE) + 1;

          groups.push({
            key: `${dateKey}-${order}`,
            label: `${getKstDisplayDate(dateKey)} ${getOrdinal(order)}`,
            applyDate: dateKey,
            order,
            count: chunk.length,
            players: chunk.map((apply) => ({
              playerId: apply.player.id,
              name: apply.player.name,
              nickname: apply.player.nickname,
              tag: apply.player.tag,
              peakTier: apply.player.peakTier,
              currentTier: apply.player.currentTier,
              mainPosition: apply.mainPosition,
              subPositions: apply.subPositions,
              appliedAt: apply.createdAt.toISOString(),
            })),
          });
        }
      });

    return NextResponse.json({
      season: currentSeason,
      groups,
      players: groups[0]?.players ?? [],
    });
  } catch (error: unknown) {
    console.error("[TEAM_BALANCE_SEASON_APPLIES_GET_ERROR]", error);

    return NextResponse.json(
      { message: "참가 신청자 목록 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
