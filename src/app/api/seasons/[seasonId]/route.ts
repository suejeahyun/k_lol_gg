import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    seasonId: string;
  }>;
};

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { seasonId } = await params;
    const id = Number(seasonId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid seasonId" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { message: "시즌 이름을 입력해주세요." },
        { status: 400 }
      );
    }

    const season = await prisma.season.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "Season not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.season.findFirst({
      where: {
        name,
        NOT: {
          id,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "이미 같은 이름의 시즌이 있습니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextSeason = await tx.season.update({
        where: { id },
        data: {
          name,
        },
      });

      await tx.adminLog.create({
        data: {
          action: "SEASON_UPDATE",
          message: `시즌 수정: ${season.name} → ${nextSeason.name}`,
        },
      });

      return nextSeason;
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[SEASON_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to update season" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { seasonId } = await params;
    const id = Number(seasonId);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { message: "Invalid seasonId" },
        { status: 400 }
      );
    }

    const season = await prisma.season.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!season) {
      return NextResponse.json(
        { message: "Season not found" },
        { status: 404 }
      );
    }

    const hasMatches = await prisma.matchSeries.findFirst({
      where: {
        seasonId: id,
      },
      select: {
        id: true,
      },
    });

    if (hasMatches) {
      return NextResponse.json(
        { message: "해당 시즌에 연결된 내전이 있어 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.season.delete({
        where: { id },
      });

      if (season.isActive) {
        const latestSeason = await tx.season.findFirst({
          orderBy: {
            id: "desc",
          },
        });

        if (latestSeason) {
          await tx.season.update({
            where: { id: latestSeason.id },
            data: {
              isActive: true,
            },
          });
        }
      }

      await tx.adminLog.create({
        data: {
          action: "SEASON_DELETE",
          message: `시즌 삭제: ${season.name}`,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SEASON_DELETE_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to delete season" },
      { status: 500 }
    );
  }
}
