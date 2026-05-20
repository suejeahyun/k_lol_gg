export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";

export async function POST(req: NextRequest, context: { params: Promise<{ seasonId: string }> }) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  try {
    const { seasonId } = await context.params;
    const id = Number(seasonId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ message: "유효하지 않은 시즌 ID입니다." }, { status: 400 });
    }

    const source = await prisma.season.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!source) {
      return NextResponse.json({ message: "복제할 시즌을 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedName = String(body?.name ?? "").trim();
    const baseName = requestedName || `${source.name} 복제본`;
    let name = baseName;
    let suffix = 2;

    while (await prisma.season.findFirst({ where: { name }, select: { id: true } })) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }

    const created = await prisma.$transaction(async (tx) => {
      const next = await tx.season.create({ data: { name, isActive: false } });
      await tx.adminLog.create({
        data: {
          action: "SEASON_CLONE",
          message: `시즌 복제: ${source.name} → ${next.name}`,
          targetType: "Season",
          targetId: next.id,
        },
      });
      return next;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[SEASON_CLONE_POST_ERROR]", error);
    return NextResponse.json({ message: "시즌 복제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
