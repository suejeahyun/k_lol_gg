import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { parseIntegerInRange, parsePositivePage } from "@/lib/http/pagination";

const USER_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export async function GET(req: NextRequest) {
  const admin = await requireAdminRequest();

  if (!admin) {
    return NextResponse.json(
      { message: "관리자 권한이 필요합니다." },
      { status: 401 },
    );
  }

  try {
    const safePage = parsePositivePage(req.nextUrl.searchParams.get("page"));
    const safePageSize = parseIntegerInRange(
      req.nextUrl.searchParams.get("pageSize"),
      20,
      1,
      100,
    );
    const q = String(req.nextUrl.searchParams.get("q") ?? "").trim();
    const statusParam = String(
      req.nextUrl.searchParams.get("status") ?? "",
    ).trim();


    const status = USER_STATUSES.includes(
      statusParam as (typeof USER_STATUSES)[number],
    )
      ? (statusParam as (typeof USER_STATUSES)[number])
      : undefined;

    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { userId: { contains: q, mode: "insensitive" as const } },
              {
                player: {
                  is: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      {
                        nickname: { contains: q, mode: "insensitive" as const },
                      },
                      { tag: { contains: q, mode: "insensitive" as const } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const totalCount = await prisma.userAccount.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
    const currentPage = Math.min(safePage, totalPages);
    const skip = (currentPage - 1) * safePageSize;

    const users = await prisma.userAccount.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: safePageSize,
      include: {
        player: true,
      },
    });

    return NextResponse.json({
      currentAdmin: {
        id: admin.user.id,
        userId: admin.user.userId,
        role: admin.user.role,
      },
      users: users.map((user) => ({
        id: user.id,
        userId: user.userId,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        adminTotpEnabled: admin.user.role === "SUPER_ADMIN" ? user.adminTotpEnabled : false,
        adminTotpEnabledAt: admin.user.role === "SUPER_ADMIN" ? user.adminTotpEnabledAt?.toISOString() ?? null : null,
        adminTotpSetupPending: admin.user.role === "SUPER_ADMIN" ? Boolean(user.adminTotpSecret && !user.adminTotpEnabled) : false,
        player: user.player
          ? {
              id: user.player.id,
              name: user.player.name,
              nickname: user.player.nickname,
              tag: user.player.tag,
              peakTier: user.player.peakTier,
              currentTier: user.player.currentTier,
            }
          : null,
        linkStatus: user.player ? "PLAYER_LINKED" : "NO_PLAYER",
      })),
      pagination: {
        page: currentPage,
        pageSize: safePageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error: unknown) {
    logServerError("[ADMIN_USERS_GET_ERROR]", error);

    return NextResponse.json(
      { message: "회원 목록 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
