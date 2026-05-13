export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { writeAdminLog } from "@/lib/admin-log";
import { getKstDateKey, getKstStartOfDate } from "@/lib/date/kst";
import { findOrCreateAutoPlayer } from "@/lib/operation-ai/player-matcher";
import type { ApplyPositionValue, NormalizedTier } from "@/lib/operation-ai/participation-parser";

type ConfirmRow = {
  enabled?: boolean;
  name?: string;
  currentTier?: NormalizedTier | null;
  peakTier?: NormalizedTier | null;
  mainPosition?: ApplyPositionValue | null;
  subPositions?: ApplyPositionValue[];
  selectedPlayerId?: number | null;
};

type ConfirmBody = {
  requestId?: number | null;
  applyDate?: string | null;
  createMissingPlayers?: boolean;
  rows?: ConfirmRow[];
};

const applyPositions = new Set(["TOP", "JGL", "MID", "ADC", "SUP", "ALL"]);

function isApplyPosition(value: unknown): value is ApplyPositionValue {
  return typeof value === "string" && applyPositions.has(value);
}

function getApplyDate(value: string | null | undefined) {
  if (!value) return getKstStartOfDate(getKstDateKey());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return getKstStartOfDate(value);
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json()) as ConfirmBody;
    const rows = (body.rows ?? []).filter((row) => row.enabled !== false);
    const applyDate = getApplyDate(body.applyDate);

    if (!applyDate) {
      return NextResponse.json({ message: "참가 신청 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ message: "확정할 참가자가 없습니다." }, { status: 400 });
    }

    const season = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!season) {
      return NextResponse.json({ message: "현재 활성 시즌이 없습니다." }, { status: 404 });
    }

    const confirmed: Array<{ playerId: number; name: string; createdPlayer: boolean }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const row of rows) {
      const name = String(row.name || "").trim();
      if (!name) {
        skipped.push({ name: "-", reason: "이름 없음" });
        continue;
      }

      const mainPosition = isApplyPosition(row.mainPosition) ? row.mainPosition : null;
      const subPositions = (row.subPositions ?? []).filter(isApplyPosition);

      if (!mainPosition) {
        skipped.push({ name, reason: "주라인 없음" });
        continue;
      }

      let playerId = Number(row.selectedPlayerId || 0);
      let createdPlayer = false;

      if (!Number.isInteger(playerId) || playerId <= 0) {
        if (!body.createMissingPlayers) {
          skipped.push({ name, reason: "DB 플레이어 매칭 필요" });
          continue;
        }

        playerId = await findOrCreateAutoPlayer({
          name,
          currentTier: row.currentTier ?? null,
          peakTier: row.peakTier ?? null,
        });
        createdPlayer = true;
      }

      const existing = await prisma.seasonParticipationApply.findFirst({
        where: {
          seasonId: season.id,
          playerId,
          applyDate,
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.seasonParticipationApply.update({
          where: { id: existing.id },
          data: {
            status: "APPLIED",
            mainPosition,
            subPositions,
          },
        });
      } else {
        await prisma.seasonParticipationApply.create({
          data: {
            seasonId: season.id,
            playerId,
            applyDate,
            status: "APPLIED",
            mainPosition,
            subPositions,
          },
        });
      }

      confirmed.push({ playerId, name, createdPlayer });
    }

    if (body.requestId && Number.isInteger(body.requestId)) {
      await prisma.operationAiRequest.update({
        where: { id: body.requestId },
        data: {
          status: skipped.length > 0 ? "PENDING" : "CONFIRMED",
          resultJson: {
            season,
            applyDate: applyDate.toISOString(),
            confirmed,
            skipped,
          } as Prisma.InputJsonValue,
        },
      }).catch(() => null);
    }

    await writeAdminLog({
      action: "OPERATION_AI_PARTICIPATION_CONFIRM",
      message: `운영 AI 참가 신청 확정: ${confirmed.length}명 등록, ${skipped.length}명 보류`,
      actorId: admin.user.id,
      actorType: admin.mode,
      actorUserId: admin.user.userId,
      targetType: "SeasonParticipationApply",
      afterJson: {
        season,
        applyDate: applyDate.toISOString(),
        confirmed,
        skipped,
      } as Prisma.InputJsonValue,
    });

    return NextResponse.json({
      season,
      applyDate: applyDate.toISOString(),
      confirmedCount: confirmed.length,
      skippedCount: skipped.length,
      confirmed,
      skipped,
    });
  } catch (error: unknown) {
    console.error("[OPERATION_AI_PARTICIPATION_CONFIRM_ERROR]", error);

    return NextResponse.json(
      { message: "참가 신청 확정 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
