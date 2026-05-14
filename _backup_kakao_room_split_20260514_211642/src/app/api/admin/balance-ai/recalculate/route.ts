export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { rebuildInternalMmr } from "@/lib/balance/internal-mmr";

export async function POST() {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const analyzedMatchCount = await prisma.$transaction(async (tx) => {
    return rebuildInternalMmr(tx);
  }, { timeout: 30000 });

  return NextResponse.json({
    message: "AI MMR 전체 재계산이 완료되었습니다.",
    analyzedMatchCount,
  });
}
