import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

const LOG_PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  try {
    const pageParam = req.nextUrl.searchParams.get("page");
    const page = pageParam ? Math.max(Number(pageParam), 1) : 1;
    const skip = (page - 1) * LOG_PAGE_SIZE;

    const [
      currentSeason,
      playerCount,
      matchCount,
      latestMatch,
      logs,
      totalLogCount,
    ] = await Promise.all([
      prisma.season.findFirst({
        where: { isActive: true },
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      }),

      prisma.player.count(),

      prisma.matchSeries.count(),

      prisma.matchSeries.findFirst({
        orderBy: { matchDate: "desc" },
        select: {
          id: true,
          title: true,
          matchDate: true,
        },
      }),

      prisma.adminLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: LOG_PAGE_SIZE,
        select: {
          id: true,
          action: true,
          message: true,
          createdAt: true,
        },
      }),

      prisma.adminLog.count(),
    ]);

    return NextResponse.json({
      currentSeason,
      playerCount,
      matchCount,
      latestMatch: latestMatch
        ? {
            id: latestMatch.id,
            title: latestMatch.title,
            playedAt: latestMatch.matchDate.toISOString(),
          }
        : null,
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      })),
      logPagination: {
        page,
        pageSize: LOG_PAGE_SIZE,
        totalCount: totalLogCount,
        totalPages: Math.max(Math.ceil(totalLogCount / LOG_PAGE_SIZE), 1),
      },
    });
  } catch (error) {
    console.error("[ADMIN_DASHBOARD_GET_ERROR]", error);

    return NextResponse.json(
      { message: "관리자 대시보드 조회 실패" },
      { status: 500 }
    );
  }
}