export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { getScrimRecruitDateKey } from "@/lib/kakao/destruction-scrim-recruit";
import { prisma } from "@/lib/prisma/client";
import {
  isCronConfigured,
  isCronRequestAuthorized,
} from "@/lib/security/cron-auth";
import { logServerError } from "@/lib/server/safe-log";

const ACTIVE_SCRIM_STATUSES = ["RECRUITING", "MATCHED", "CONFIRMED"] as const;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Cron 인증이 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Cron 인증 정보가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const operationDate = getScrimRecruitDateKey();

  try {
    const closedScrims = await prisma.destructionScrimRecruit.updateMany({
      where: {
        recruitDate: { not: operationDate },
        status: { in: [...ACTIVE_SCRIM_STATUSES] },
      },
      data: { status: "COMPLETED" },
    });

    await writeAdminLog({
      action: "KAKAO_DAILY_CLOSE",
      message: "오전 6시 카카오 내전·스크림 운영일 전환을 완료했습니다.",
      actorType: "SYSTEM",
      afterJson: {
        operationDate,
        completedScrims: closedScrims.count,
      },
    });

    return NextResponse.json({
      ok: true,
      operationDate,
      completedScrims: closedScrims.count,
    });
  } catch (error) {
    logServerError("[KAKAO_DAILY_CLOSE_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "카카오 일일 자동 종료에 실패했습니다." },
      { status: 500 },
    );
  }
}
