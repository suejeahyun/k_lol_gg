import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const [currentSeason, playerCount, matchCount, latestMatch, logs] =
      await Promise.all([
        prisma.season.findFirst({
          where: {
            isActive: true,
          },
          orderBy: {
            id: "desc",
          },
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        }),

        prisma.player.count(),

        prisma.matchSeries.count(),

        prisma.matchSeries.findFirst({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
        }),

        prisma.adminLog.findMany({
          orderBy: {
            createdAt: "desc",
          },
        }),
      ]);

    return NextResponse.json({
      currentSeason,
      playerCount,
      matchCount,
      latestMatch: latestMatch
        ? {
            id: latestMatch.id,
            title: latestMatch.title,
            createdAt: latestMatch.createdAt.toISOString(),
          }
        : null,
      logs: logs.map((log) => ({
        id: log.id,
        type: log.action,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[ADMIN_DASHBOARD_GET_ERROR]", error);

    return NextResponse.json(
      {
        message: "관리자 대시보드 데이터를 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}