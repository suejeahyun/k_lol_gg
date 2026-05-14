export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin } from "@/lib/auth/requireAdmin";
import { cleanupOldRateLimitLogs } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const rejected = await rejectIfNotAdmin();
  if (rejected) return rejected;

  const body = await req.json().catch(() => ({}));
  const days = Number(body.days ?? 7);
  const safeDays = Number.isFinite(days) && days >= 1 && days <= 90 ? Math.floor(days) : 7;

  const result = await cleanupOldRateLimitLogs(safeDays);

  return NextResponse.json({
    message: `${safeDays}일 이전 RateLimitLog 정리가 완료되었습니다.`,
    deletedCount: result.count,
  });
}
