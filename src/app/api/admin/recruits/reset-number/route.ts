import { requireSiteFeature } from "@/lib/site/feature-guard";
import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotSuperAdmin } from "@/lib/auth/requireAdmin";
import { getRequestAuditFields, writeAdminLog } from "@/lib/admin-log";
import { buildRecruitResetReply, resetRecruitNumbers } from "@/lib/kakao/recruit-reset";

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("recruit");
  if (premiumLock) return premiumLock;

  const rejected = await rejectIfNotSuperAdmin();
  if (rejected) return rejected;

  try {
    const audit = getRequestAuditFields(req);
    const result = await resetRecruitNumbers({
      roomName: "admin",
      sender: "admin",
      title: "관리자 모집번호 초기화",
      summary: "관리자 페이지에서 모집번호 회차를 수동 초기화했습니다. 진행 중 구인글은 유지합니다.",
    });

    await writeAdminLog({
      action: "ADMIN_PARTY_RECRUIT_NUMBER_RESET",
      message: `관리자 모집번호 초기화: ${result.recruitDate}, 회차 ${result.resetSeq}`,
      targetType: "RecruitPartyLog",
      targetId: result.resetLogId,
      afterJson: result,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return NextResponse.json({
      ok: true,
      message: buildRecruitResetReply(result),
      result,
    });
  } catch (error) {
    logServerError("[ADMIN_RECRUITS_RESET_NUMBER_ERROR]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "모집번호 초기화 실패",
      },
      { status: 500 },
    );
  }
}
