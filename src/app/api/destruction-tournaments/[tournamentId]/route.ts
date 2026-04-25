import { NextRequest, NextResponse } from "next/server";
import { DestructionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

type RouteProps = {
  params: Promise<{
    tournamentId: string;
  }>;
};

function isValidStatus(status: string): status is DestructionStatus {
  return (
    status === "PLANNED" ||
    status === "RECRUITING" ||
    status === "TEAM_BUILDING" ||
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
    console.error("[DESTRUCTION_TOURNAMENT_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 조회 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteProps) {
  try {
    const { tournamentId } = await params;
    const id = Number(tournamentId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "멸망전 ID가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : undefined;

    const description =
      typeof body.description === "string" ? body.description.trim() : undefined;

    const status =
      typeof body.status === "string" ? String(body.status) : undefined;

    const startDate = body.startDate ? new Date(body.startDate) : undefined;
    const endDate = body.endDate ? new Date(body.endDate) : undefined;

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
        ...(galleryImageId !== undefined ? { galleryImageId } : {}),
      },
      include: {
        galleryImage: true,
        teams: true,
        participants: true,
        matches: true,
      },
    });

    await prisma.adminLog.create({
      data: {
        action: "DESTRUCTION_TOURNAMENT_UPDATE",
        message: `멸망전 수정: ${tournament.title}`,
      },
    });

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("[DESTRUCTION_TOURNAMENT_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 수정 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteProps) {
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
    console.error("[DESTRUCTION_TOURNAMENT_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 삭제 실패" },
      { status: 500 }
    );
  }
}