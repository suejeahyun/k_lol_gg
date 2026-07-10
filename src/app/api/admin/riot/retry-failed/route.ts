export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { parseRiotBulkSyncBody, runRiotBulkSoloSync } from "@/lib/riot/bulk-sync";
import { logServerError } from "@/lib/server/safe-log";

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("riot");
  if (premiumLock) return premiumLock;

  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "ADMIN_RIOT_RETRY_FAILED",
      limit: 6,
      windowSeconds: 60 * 60,
      key: String(admin.user.id ?? admin.user.userId),
    });
    if (rateLimitRejected) return rateLimitRejected;

    const body = await req.json().catch(() => ({}));
    const payload = parseRiotBulkSyncBody(body);

    const result = await runRiotBulkSoloSync({
      ...payload,
      mode: "FAILED",
      force: payload.force !== false,
      actorUserAccountId: admin.user.id,
    });

    return NextResponse.json({ message: result.message, result });
  } catch (error) {
    logServerError("[ADMIN_RIOT_RETRY_FAILED_ERROR]", error);

    return NextResponse.json(
      {
        message: "Riot 실패 계정 재시도 중 오류가 발생했습니다.",
        error: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
