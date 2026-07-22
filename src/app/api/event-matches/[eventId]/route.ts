export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { EventMatchMode, EventMatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";
import { readJsonObject } from "@/lib/http/json-body";

type RouteProps = {
  params: Promise<{
    eventId: string;
  }>;
};

function isValidMode(mode: string): mode is EventMatchMode {
  return mode === "POSITION" || mode === "ARAM";
}

function isValidStatus(status: string): status is EventMatchStatus {
  return (
    status === "PLANNED" ||
    status === "RECRUITING" ||
    status === "TEAM_BUILDING" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED" ||
    status === "CANCELLED"
  );
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: RouteProps) {
  try {
    const { eventId } = await params;
    const id = parseId(eventId);

    if (!id) {
      return NextResponse.json(
        { message: "이벤트 내전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      include: {
        galleryImage: true,
        teams: {
          include: {
            members: {
              include: {
                player: true,
              },
              orderBy: {
                id: "asc",
              },
            },
          },
          orderBy: [{ seed: "asc" }, { id: "asc" }],
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
          orderBy: [{ stage: "asc" }, { round: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(event);
  } catch (error) {
    logServerError("[EVENT_MATCH_GET_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 조회 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const id = parseId(eventId);

    if (!id) {
      return NextResponse.json(
        { message: "이벤트 내전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = await readJsonObject<Record<string, unknown>>(req);
    if (!body) {
      return NextResponse.json(
        { message: "요청 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const title =
      typeof body.title === "string" ? body.title.trim() : undefined;
    const description =
      typeof body.description === "string" ? body.description.trim() : undefined;
    const mode = typeof body.mode === "string" ? body.mode : undefined;
    const status = typeof body.status === "string" ? body.status : undefined;

    const eventDate = body.eventDate
      ? new Date(String(body.eventDate))
      : undefined;
    const recruitFrom =
      body.recruitFrom === null
        ? null
        : body.recruitFrom
          ? new Date(String(body.recruitFrom))
          : undefined;
    const recruitTo =
      body.recruitTo === null
        ? null
        : body.recruitTo
          ? new Date(String(body.recruitTo))
          : undefined;

    const winnerTeamId =
      body.winnerTeamId === null
        ? null
        : body.winnerTeamId !== undefined
          ? Number(body.winnerTeamId)
          : undefined;
    const mvpPlayerId =
      body.mvpPlayerId === null
        ? null
        : body.mvpPlayerId !== undefined
          ? Number(body.mvpPlayerId)
          : undefined;
    const galleryImageId =
      body.galleryImageId === null
        ? null
        : body.galleryImageId !== undefined
          ? Number(body.galleryImageId)
          : undefined;

    for (const [label, value] of [
      ["우승팀", winnerTeamId],
      ["MVP 선수", mvpPlayerId],
      ["갤러리 이미지", galleryImageId],
    ] as const) {
      if (value !== undefined && value !== null && !parseId(String(value))) {
        return NextResponse.json(
          { message: `${label} ID가 올바르지 않습니다.` },
          { status: 400 }
        );
      }
    }

    if (title !== undefined && !title) {
      return NextResponse.json(
        { message: "이벤트명을 입력해주세요." },
        { status: 400 }
      );
    }

    if (mode !== undefined && !isValidMode(mode)) {
      return NextResponse.json(
        { message: "이벤트 모드가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (status !== undefined && !isValidStatus(status)) {
      return NextResponse.json(
        { message: "진행 상태가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    for (const [label, value] of [
      ["진행일", eventDate],
      ["모집 시작일", recruitFrom],
      ["모집 종료일", recruitTo],
    ] as const) {
      if (value instanceof Date && Number.isNaN(value.getTime())) {
        return NextResponse.json(
          { message: `${label}이 올바르지 않습니다.` },
          { status: 400 }
        );
      }
    }

    const currentEvent = await prisma.eventMatch.findUnique({
      where: { id },
      select: {
        id: true,
        teams: { select: { id: true } },
        participants: { select: { playerId: true } },
      },
    });

    if (!currentEvent) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (
      winnerTeamId !== undefined &&
      winnerTeamId !== null &&
      !currentEvent.teams.some((team) => team.id === winnerTeamId)
    ) {
      return NextResponse.json(
        { message: "이 이벤트에 속한 팀만 우승팀으로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (
      mvpPlayerId !== undefined &&
      mvpPlayerId !== null &&
      !currentEvent.participants.some(
        (participant) => participant.playerId === mvpPlayerId
      )
    ) {
      return NextResponse.json(
        { message: "이 이벤트 참가자만 MVP로 지정할 수 있습니다." },
        { status: 400 }
      );
    }

    if (galleryImageId !== undefined && galleryImageId !== null) {
      const galleryImage = await prisma.galleryImage.findUnique({
        where: { id: galleryImageId },
        select: { id: true },
      });

      if (!galleryImage) {
        return NextResponse.json(
          { message: "갤러리 이미지를 찾을 수 없습니다." },
          { status: 400 }
        );
      }
    }

    const event = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventMatch.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(mode !== undefined ? { mode } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(eventDate !== undefined ? { eventDate } : {}),
          ...(recruitFrom !== undefined ? { recruitFrom } : {}),
          ...(recruitTo !== undefined ? { recruitTo } : {}),
          ...(winnerTeamId !== undefined ? { winnerTeamId } : {}),
          ...(mvpPlayerId !== undefined ? { mvpPlayerId } : {}),
          ...(galleryImageId !== undefined ? { galleryImageId } : {}),
        },
        include: {
          galleryImage: true,
          teams: true,
          participants: true,
          matches: true,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "EVENT_MATCH_UPDATE",
          message: `이벤트 내전 수정: ${updated.title}`,
        },
      });

      return updated;
    });

    return NextResponse.json(event);
  } catch (error) {
    logServerError("[EVENT_MATCH_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteProps) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { eventId } = await params;
    const id = parseId(eventId);

    if (!id) {
      return NextResponse.json(
        { message: "이벤트 내전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const event = await prisma.eventMatch.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { message: "이벤트 내전을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.eventTournamentMatch.deleteMany({ where: { eventId: id } }),
      prisma.eventParticipant.deleteMany({ where: { eventId: id } }),
      prisma.eventTeam.deleteMany({ where: { eventId: id } }),
      prisma.eventParticipationApply.deleteMany({ where: { eventId: id } }),
      prisma.eventMatch.delete({ where: { id } }),
      prisma.adminLog.create({
        data: {
          action: "EVENT_MATCH_DELETE",
          message: `이벤트 내전 삭제: ${event.title}`,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "이벤트 내전이 삭제되었습니다.",
    });
  } catch (error) {
    logServerError("[EVENT_MATCH_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "이벤트 내전 삭제 실패" },
      { status: 500 }
    );
  }
}

