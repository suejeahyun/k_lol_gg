import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";

type CreateAdminLogBody = {
  action?: string;
  message?: string;
};

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "50");
    const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize =
      Number.isNaN(pageSize) || pageSize < 1 || pageSize > 200 ? 50 : pageSize;
    const where = q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" as const } },
            { message: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const totalCount = await prisma.adminLog.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const currentPage = Math.min(safePage, totalPages);
    const skip = (currentPage - 1) * safePageSize;

    const logs = await prisma.adminLog.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: safePageSize,
    });

    return NextResponse.json({
      logs: logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
      pagination: {
        page: currentPage,
        pageSize: safePageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[ADMIN_LOG_GET_ERROR]", error);

    return NextResponse.json(
      { message: "로그 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateAdminLogBody;

    const action = String(body.action ?? "ADMIN_ACTION").trim();
    const message = String(body.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { message: "로그 메시지는 필수입니다." },
        { status: 400 },
      );
    }

    await writeAdminLog({ action, message });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[ADMIN_LOG_CREATE_ERROR]", error);

    return NextResponse.json(
      { message: "로그 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
