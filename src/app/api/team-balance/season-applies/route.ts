export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin, getAccessErrorResponseMessage } from "@/lib/auth/access";
import { logServerError } from "@/lib/server/safe-log";

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
  recruitNo: number;
};

type ApplyGroup = {
  key: string;
  label: string;
  applyDate: string;
  recruitNo: number;
  order: number;
  count: number;
  players: ApplyPlayer[];
};

const LOOKBACK_DAYS = 3;
const MAX_RECENT_APPLIES = 200;

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
    await requireApprovedUserOrAdmin();
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
          recruitNo: "asc",
        },
        {
          sourceSlotNo: "asc",
        },
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
      take: MAX_RECENT_APPLIES,
    });

    const byDateAndRecruitNo = new Map<string, typeof applies>();

    applies.forEach((apply) => {
      const dateKey = getKstDateKey(apply.applyDate);
      const recruitNo = apply.recruitNo || 1;
      const key = `${dateKey}-${recruitNo}`;
      const list = byDateAndRecruitNo.get(key) ?? [];
      list.push(apply);
      byDateAndRecruitNo.set(key, list);
    });

    const groups: ApplyGroup[] = [];

    [...byDateAndRecruitNo.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .forEach(([groupKey, groupApplies]) => {
        const firstApply = groupApplies[0];
        const dateKey = firstApply ? getKstDateKey(firstApply.applyDate) : groupKey.slice(0, 10);
        const recruitNo = firstApply?.recruitNo || 1;

        groups.push({
          key: `${dateKey}-${recruitNo}`,
          label: `${getKstDisplayDate(dateKey)} #${recruitNo} 내전`,
          applyDate: dateKey,
          recruitNo,
          order: recruitNo,
          count: groupApplies.length,
          players: groupApplies.map((apply) => ({
            playerId: apply.player.id,
            name: apply.player.name,
            nickname: apply.player.nickname,
            tag: apply.player.tag,
            peakTier: apply.player.peakTier,
            currentTier: apply.player.currentTier,
            mainPosition: apply.mainPosition,
            subPositions: apply.subPositions,
            appliedAt: apply.createdAt.toISOString(),
            recruitNo: apply.recruitNo || 1,
          })),
        });
      });

    return NextResponse.json({
      season: currentSeason,
      groups,
      players: groups[0]?.players ?? [],
    });
  } catch (error: unknown) {
    const response = getAccessErrorResponseMessage(
      error,
      "참가 신청자 목록 조회 중 오류가 발생했습니다.",
    );

    if (response.status !== 500) {
      return NextResponse.json(
        { message: response.message },
        { status: response.status },
      );
    }

    logServerError("[TEAM_BALANCE_SEASON_APPLIES_GET_ERROR]", error);

    return NextResponse.json(
      { message: response.message },
      { status: response.status }
    );
  }
}

