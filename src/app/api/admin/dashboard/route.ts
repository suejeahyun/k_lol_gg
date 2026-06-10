export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

const LOG_PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const pageParam = req.nextUrl.searchParams.get("page");
    const page = pageParam ? Math.max(Number(pageParam), 1) : 1;
    const skip = (page - 1) * LOG_PAGE_SIZE;

    const [logs, totalLogCount] = await Promise.all([
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
    console.error("[ADMIN_DASHBOARD_LOG_GET_ERROR]", error);
    return NextResponse.json({ message: "전체 로그 조회 실패" }, { status: 500 });
  }
}
