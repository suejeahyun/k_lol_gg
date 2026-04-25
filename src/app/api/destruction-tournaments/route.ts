import { NextRequest, NextResponse } from "next/server";
import { DestructionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";

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

export async function GET() {
  try {
    const tournaments = await prisma.destructionTournament.findMany({
      orderBy: {
        createdAt: "desc",
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
        },
        participants: {
          include: {
            player: true,
            team: true,
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
          },
        },
      },
    });

    return NextResponse.json(tournaments);
  } catch (error) {
    console.error("[DESTRUCTION_TOURNAMENTS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 목록 조회 실패" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title = String(body.title ?? "").trim();
    const description =
      typeof body.description === "string" ? body.description.trim() : null;

    const status = String(body.status ?? "PLANNED");

    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;

    const galleryImageId = body.galleryImageId
      ? Number(body.galleryImageId)
      : null;

    if (!title) {
      return NextResponse.json(
        { message: "멸망전명을 입력해주세요." },
        { status: 400 }
      );
    }

    if (!isValidStatus(status)) {
      return NextResponse.json(
        { message: "진행 상태가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (startDate && Number.isNaN(startDate.getTime())) {
      return NextResponse.json(
        { message: "시작일이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (endDate && Number.isNaN(endDate.getTime())) {
      return NextResponse.json(
        { message: "종료일이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    if (galleryImageId) {
      const galleryImage = await prisma.galleryImage.findUnique({
        where: {
          id: galleryImageId,
        },
      });

      if (!galleryImage) {
        return NextResponse.json(
          { message: "갤러리 이미지를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
    }

    const tournament = await prisma.destructionTournament.create({
      data: {
        title,
        description,
        status,
        startDate,
        endDate,
        galleryImageId,
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
        action: "DESTRUCTION_TOURNAMENT_CREATE",
        message: `멸망전 생성: ${tournament.title}`,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error("[DESTRUCTION_TOURNAMENTS_POST_ERROR]", error);

    return NextResponse.json(
      { message: "멸망전 생성 실패" },
      { status: 500 }
    );
  }
}