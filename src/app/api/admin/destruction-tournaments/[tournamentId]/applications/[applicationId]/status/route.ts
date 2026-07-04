import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ApplyPosition, ParticipationApplyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { applyDestructionRecruitmentAutoReserve } from "@/lib/destruction/recruitment-auto-reserve";

type RouteContext = {
  params: Promise<{
    tournamentId: string;
    applicationId: string;
  }>;
};

const ALLOWED_STATUSES: ParticipationApplyStatus[] = [
  "APPLIED",
  "CONFIRMED",
  "RESERVE",
  "REJECTED",
  "CANCELLED",
];

const ALLOWED_POSITIONS: ApplyPosition[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function isAllowedStatus(value: unknown): value is ParticipationApplyStatus {
  return typeof value === "string" && ALLOWED_STATUSES.includes(value as ParticipationApplyStatus);
}

function isAllowedPosition(value: unknown): value is ApplyPosition {
  return typeof value === "string" && ALLOWED_POSITIONS.includes(value as ApplyPosition);
}

function hasOwnValue(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId, applicationId } = await params;
    const tournamentNumberId = Number(tournamentId);
    const applicationNumberId = Number(applicationId);

    if (Number.isNaN(tournamentNumberId) || Number.isNaN(applicationNumberId)) {
      return NextResponse.json(
        { message: "잘못된 요청입니다." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const shouldUpdateStatus = hasOwnValue(body, "status");
    const shouldUpdatePosition = hasOwnValue(body, "mainPosition");
    const status = body.status;
    const mainPosition = body.mainPosition;

    if (!shouldUpdateStatus && !shouldUpdatePosition) {
      return NextResponse.json(
        { message: "변경할 상태 또는 라인을 선택해주세요." },
        { status: 400 },
      );
    }

    if (shouldUpdateStatus && !isAllowedStatus(status)) {
      return NextResponse.json(
        { message: "변경할 수 없는 신청 상태입니다." },
        { status: 400 },
      );
    }

    if (shouldUpdatePosition && !isAllowedPosition(mainPosition)) {
      return NextResponse.json(
        { message: "TOP/JGL/MID/ADC/SUP 중 하나의 라인으로만 변경할 수 있습니다." },
        { status: 400 },
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id: tournamentNumberId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        teams: {
          select: {
            id: true,
          },
        },
        matches: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (tournament.status !== "RECRUITING" || tournament.teams.length > 0 || tournament.matches.length > 0) {
      return NextResponse.json(
        { message: "모집 단계에서만 참가 신청 상태와 라인을 변경할 수 있습니다." },
        { status: 400 },
      );
    }

    const application = await prisma.destructionParticipationApply.findFirst({
      where: {
        id: applicationNumberId,
        tournamentId: tournamentNumberId,
      },
      include: {
        player: {
          select: {
            name: true,
            nickname: true,
            tag: true,
          },
        },
      },
    });

    if (!application) {
      return NextResponse.json(
        { message: "참가 신청을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const nextStatus = shouldUpdateStatus && isAllowedStatus(status) ? status : application.status;
    const nextMainPosition = shouldUpdatePosition && isAllowedPosition(mainPosition)
      ? mainPosition
      : application.mainPosition;
    const nextSubPositions = shouldUpdatePosition
      ? application.subPositions.filter((position) => position !== nextMainPosition)
      : application.subPositions;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.destructionParticipationApply.update({
        where: {
          id: applicationNumberId,
        },
        data: {
          status: nextStatus,
          mainPosition: nextMainPosition,
          subPositions: nextSubPositions,
        },
        include: {
          player: true,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "DESTRUCTION_APPLICATION_MANAGE",
          message: `멸망전 신청 관리: ${tournament.title}, ${application.player.name}(${application.player.nickname}#${application.player.tag}) 상태 ${application.status} → ${nextStatus}, 라인 ${application.mainPosition} → ${nextMainPosition}`,
        },
      });

      return next;
    });

    await applyDestructionRecruitmentAutoReserve(tournamentNumberId);

    return NextResponse.json({
      message: "참가 신청 정보가 변경되었습니다.",
      application: updated,
    });
  } catch (error: unknown) {
    logServerError("[ADMIN_DESTRUCTION_APPLICATION_MANAGE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "참가 신청 정보 변경 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
