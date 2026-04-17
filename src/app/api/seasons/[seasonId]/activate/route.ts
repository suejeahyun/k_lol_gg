import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RouteContext = {
  params: Promise<{
    seasonId: string;
  }>;
};

export async function PATCH(
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

    const targetSeason = await prisma.season.findUnique({
      where: { id },
      select: {
        id: true,
      },
    });

    if (!targetSeason) {
      return NextResponse.json(
        { message: "Season not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.season.updateMany({
        data: {
          isActive: false,
        },
      }),
      prisma.season.update({
        where: { id },
        data: {
          isActive: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      seasonId: id,
    });
  } catch (error) {
    console.error("[SEASON_ACTIVATE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to activate season" },
      { status: 500 }
    );
  }
}