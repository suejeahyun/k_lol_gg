export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { logServerError } from "@/lib/server/safe-log";

export async function PATCH(_req: NextRequest, context: { params: Promise<{ seasonId: string }> }) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { seasonId } = await context.params;
    const id = Number(seasonId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ message: "유효하지 않은 시즌 ID입니다." }, { status: 400 });
    }

    const season = await prisma.season.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
    if (!season) {
      return NextResponse.json({ message: "시즌을 찾을 수 없습니다." }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.season.update({ where: { id }, data: { isActive: false } });
      await tx.adminLog.create({
        data: {
          action: "SEASON_END",
          message: `시즌 종료 처리: ${season.name}`,
          targetType: "Season",
          targetId: id,
        },
      });
      return next;
    });

    return NextResponse.json({ message: "시즌이 종료되었습니다.", season: updated });
  } catch (error) {
    logServerError("[SEASON_END_PATCH_ERROR]", error);
    return NextResponse.json({ message: "시즌 종료 중 오류가 발생했습니다." }, { status: 500 });
  }
}

