export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { DestructionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { applyDestructionRecruitmentAutoReserve, isBeforeDestructionAuction, parseDestructionLaneLimits } from "@/lib/destruction/recruitment-auto-reserve";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};



function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return undefined;
}

function hasLaneLimitPayload(body: Record<string, unknown>) {
  if (body.laneLimits && typeof body.laneLimits === "object") return true;
  return (
    body.topLaneLimit !== undefined ||
    body.jungleLaneLimit !== undefined ||
    body.midLaneLimit !== undefined ||
    body.adcLaneLimit !== undefined ||
    body.supportLaneLimit !== undefined ||
    body.TOP !== undefined ||
    body.JGL !== undefined ||
    body.MID !== undefined ||
    body.ADC !== undefined ||
    body.SUP !== undefined
  );
}

function isValidStatus(status: string): status is DestructionStatus {
  return (
    status === "PLANNED" ||
    status === "RECRUITING" ||
    status === "TEAM_BUILDING" ||
    status === "AUCTION" ||
    status === "PRELIMINARY" ||
    status === "TOURNAMENT" ||
    status === "COMPLETED" ||
    status === "CANCELLED"
  );
}

export async function GET(_req: NextRequest, { params }: RouteProps) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
      include: {
        galleryImage: true,
        teams: {
          include: {
            captain: true,
            members: {
              include: {
                player: true,
              },
            },
          },
          orderBy: {
            id: "asc",
          },
        },
        participants: {
          include: {
            player: true,
            team: true,
          },
          orderBy: {
            id: "asc",
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
          },
          orderBy: [{ stage: "asc" }, { round: "asc" }],
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(tournament);
  } catch (error) {
    logServerError("[DESTRUCTION_TOURNAMENT_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 조회 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    const title =
      typeof body.title === "string" ? body.title.trim() : undefined;

    const description =
      typeof body.description === "string" ? body.description.trim() : undefined;

    const status =
      typeof body.status === "string" ? String(body.status) : undefined;

    const startDate = parseOptionalDate(body.startDate);
    const endDate = parseOptionalDate(body.endDate);

    const winnerTeamId =
      body.winnerTeamId === null
        ? null
        : body.winnerTeamId
          ? Number(body.winnerTeamId)
          : undefined;

    const mvpPlayerId =
      body.mvpPlayerId === null
        ? null
        : body.mvpPlayerId
          ? Number(body.mvpPlayerId)
          : undefined;

    const galleryImageId =
      body.galleryImageId === null
        ? null
        : body.galleryImageId
          ? Number(body.galleryImageId)
          : undefined;

    if (title !== undefined && !title) {
      return NextResponse.json(
        { message: "멸망전명을 입력해주세요." },
        { status: 400 }
      );
    }

    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json(
        { message: "진행 상태가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (startDate !== undefined && Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { message: "시작일이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (endDate !== undefined && Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { message: "종료일이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const existingTournament = hasLaneLimitPayload(body)
      ? await prisma.destructionTournament.findUnique({
          where: { id },
          select: {
            id: true,
            status: true,
            topLaneLimit: true,
            jungleLaneLimit: true,
            midLaneLimit: true,
            adcLaneLimit: true,
            supportLaneLimit: true,
            _count: {
              select: {
                teams: true,
                matches: true,
              },
            },
          },
        })
      : null;

    if (hasLaneLimitPayload(body) && !existingTournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (existingTournament && (!isBeforeDestructionAuction(existingTournament.status) || existingTournament._count.teams > 0 || existingTournament._count.matches > 0)) {
      return NextResponse.json(
        { message: "라인별 최대 인원은 경매 시작 전까지만 수정할 수 있습니다." },
        { status: 400 }
      );
    }

    const laneLimitData = existingTournament ? parseDestructionLaneLimits(body, existingTournament) : null;

    const tournament = await prisma.destructionTournament.update({
      where: {
        id,
      },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        ...(winnerTeamId !== undefined ? { winnerTeamId } : {}),
        ...(mvpPlayerId !== undefined ? { mvpPlayerId } : {}),
        ...(galleryImageId === null ? { galleryImage: { disconnect: true } } : {}),
        ...(typeof galleryImageId === "number" ? { galleryImage: { connect: { id: galleryImageId } } } : {}),
        ...(laneLimitData ? laneLimitData : {}),
      },
      include: {
        galleryImage: true,
        teams: true,
        participants: true,
        matches: true,
      },
    });

    if (laneLimitData) {
      await applyDestructionRecruitmentAutoReserve(id);
    }

    await prisma.adminLog.create({
      data: {
        action: "DESTRUCTION_TOURNAMENT_UPDATE",
        message: `멸망전 수정: ${tournament.title}${laneLimitData ? " / 라인별 최대 인원 수정" : ""}`,
      },
    });

    return NextResponse.json(tournament);
  } catch (error) {
    logServerError("[DESTRUCTION_TOURNAMENT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const tournament = await prisma.destructionTournament.findUnique({
      where: {
        id,
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { message: "멸망전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.destructionMatch.deleteMany({
        where: {
          tournamentId: id,
        },
      }),

      prisma.destructionParticipant.deleteMany({
        where: {
          tournamentId: id,
        },
      }),

      prisma.destructionTeam.deleteMany({
        where: {
          tournamentId: id,
        },
      }),

      prisma.destructionTournament.delete({
        where: {
          id,
        },
      }),

      prisma.adminLog.create({
        data: {
          action: "DESTRUCTION_TOURNAMENT_DELETE",
          message: `멸망전 삭제: ${tournament.title}`,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("[DESTRUCTION_TOURNAMENT_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 삭제 실패" },
      { status: 500 }
    );
  }
}

