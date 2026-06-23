export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{
    seasonId: string;
  }>;
};

export async function PATCH(_req: NextRequest, { params }: RouteContext) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

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
        isActive: true,
      },
    });

    if (!targetSeason) {
      return NextResponse.json(
        { message: "Season not found" },
        { status: 404 }
      );
    }

    if (targetSeason.isActive) {
      return NextResponse.json({
        success: true,
        seasonId: id,
        message: "Already active season",
      });
    }

    await prisma.$transaction([
      prisma.season.updateMany({
        where: {
          isActive: true,
        },
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
      prisma.adminLog.create({
        data: {
          action: "SEASON_ACTIVATE",
          message: `시즌 활성화: #${id}`,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      seasonId: id,
    });
  } catch (error) {
    logServerError("[SEASON_ACTIVATE_PATCH_ERROR]", error);

    return NextResponse.json(
      { message: "Failed to activate season" },
      { status: 500 }
    );
  }
}

