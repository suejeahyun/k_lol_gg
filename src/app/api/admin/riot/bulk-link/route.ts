export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminRequest } from "@/lib/auth/requireAdmin";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { parseRiotBulkLinkBody, runRiotBulkAccountLink } from "@/lib/riot/bulk-link";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { logServerError } from "@/lib/server/safe-log";

export async function POST(req: NextRequest) {
  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const admin = await requireSuperAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "최고 관리자 권한이 필요합니다." }, { status: 403 });
    }

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "ADMIN_RIOT_BULK_LINK",
      limit: 5,
      windowSeconds: 60 * 60,
      key: String(admin.user.id ?? admin.user.userId),
    });
    if (rateLimitRejected) return rateLimitRejected;

    const body = await req.json().catch(() => ({}));
    const payload = parseRiotBulkLinkBody(body);
    const result = await runRiotBulkAccountLink({
      ...payload,
      actorUserAccountId: admin.user.id,
    });

    return NextResponse.json({ message: result.message, result });
  } catch (error) {
    logServerError("[ADMIN_RIOT_BULK_LINK_ERROR]", error);

    return NextResponse.json(
      {
        message: "Riot 계정 일괄 연결 중 오류가 발생했습니다.",
        error: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
