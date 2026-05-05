import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { createCsvResponse } from "@/lib/csv";

type CreateAdminLogBody = {
  action?: string;
  message?: string;
};

const ACTION_GROUP_PREFIX: Record<string, string[]> = {
  ADMIN: ["ADMIN_"],
  USER: ["USER_", "MY_PLAYER_"],
  PLAYER: ["PLAYER_"],
  CHAMPION: ["CHAMPION_"],
  SEASON: ["SEASON_", "STATS_"],
  MATCH: ["MATCH_"],
  NOTICE: ["NOTICE_", "EVENT_NOTICE_"],
  GALLERY: ["GALLERY_"],
  PARTICIPATION: ["SEASON_PARTICIPATION_", "EVENT_PARTICIPATION_", "DESTRUCTION_PARTICIPATION_", "EVENT_PARTICIPANT_", "DESTRUCTION_PARTICIPANT_"],
  BALANCE: ["TEAM_BALANCE_", "EVENT_TEAMS_"],
  RIOT: ["RIOT_"],
};

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function buildWhere(req: NextRequest): Prisma.AdminLogWhereInput {
  const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();
  const group = String(req.nextUrl.searchParams.get("group") ?? "").trim();
  const action = String(req.nextUrl.searchParams.get("action") ?? "").trim();
  const from = parseDate(req.nextUrl.searchParams.get("from"));
  const to = parseDate(req.nextUrl.searchParams.get("to"), true);
  const prefixes = ACTION_GROUP_PREFIX[group] ?? [];

  const and: Prisma.AdminLogWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" as const } },
        { message: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }

  if (action) {
    and.push({ action: { contains: action, mode: "insensitive" as const } });
  }

  if (prefixes.length > 0) {
    and.push({
      OR: prefixes.map((prefix) => ({
        action: { startsWith: prefix, mode: "insensitive" as const },
      })),
    });
  }

  if (from || to) {
    and.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function GET(req: NextRequest) {
  try {
    const page = Number(req.nextUrl.searchParams.get("page") ?? "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") ?? "50");
    const download = req.nextUrl.searchParams.get("download") === "csv";

    const safePage = Number.isNaN(page) || page < 1 ? 1 : page;
    const safePageSize =
      Number.isNaN(pageSize) || pageSize < 1 || pageSize > 200 ? 50 : pageSize;
    const where = buildWhere(req);

    if (download) {
      const logs = await prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      return createCsvResponse(
        `admin-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        ["id", "action", "message", "createdAt"],
        logs.map((log) => [
          log.id,
          log.action,
          log.message,
          log.createdAt.toISOString(),
        ]),
      );
    }

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
