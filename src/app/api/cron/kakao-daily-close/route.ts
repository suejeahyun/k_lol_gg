export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { repairSafeKakaoRecruitData } from "@/lib/kakao/recruit-health";
import {
  isCronConfigured,
  isCronRequestAuthorized,
} from "@/lib/security/cron-auth";
import { logServerError } from "@/lib/server/safe-log";

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

  try {
    const repaired = await repairSafeKakaoRecruitData();

    await writeAdminLog({
      action: "KAKAO_DAILY_CLOSE",
      message: "오전 6시 카카오 운영일 전환과 안전 데이터 정리를 완료했습니다.",
      actorType: "SYSTEM",
      afterJson: repaired,
    });

    return NextResponse.json({
      ok: true,
      ...repaired,
    });
  } catch (error) {
    logServerError("[KAKAO_DAILY_CLOSE_ERROR]", error);
    return NextResponse.json(
      { ok: false, message: "카카오 일일 자동 종료에 실패했습니다." },
      { status: 500 },
    );
  }
}
