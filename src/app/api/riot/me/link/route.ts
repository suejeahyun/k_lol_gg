import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getRiotRequestMeta, linkPlayerRiotAccount } from "@/lib/riot/account-link";

export async function POST(req: NextRequest) {
  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json({ message: "연결된 플레이어가 없습니다." }, { status: 404 });
    }

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "RIOT_ME_LINK",
      limit: 5,
      windowSeconds: 10 * 60,
      key: String(user.userAccountId),
    });
    if (rateLimitRejected) return rateLimitRejected;

    const body = await req.json().catch(() => ({}));
    const result = await linkPlayerRiotAccount({
      playerId: user.playerId,
      body,
      actorType: "USER",
      actorUserAccountId: user.userAccountId,
      requestMeta: getRiotRequestMeta(req),
    });

    return NextResponse.json(
      { message: result.message, data: result.ok ? result.data : undefined },
      { status: result.status },
    );
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      }
      if (error.message === "NOT_APPROVED") {
        return NextResponse.json({ message: "관리자 승인 후 이용 가능합니다." }, { status: 403 });
      }
      if (error.message === "RIOT_FEATURE_DISABLED") {
        return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
      }
    }

    logServerError("[RIOT_ME_LINK_ERROR]", error);
    return NextResponse.json({ message: "Riot 계정 연결 중 오류가 발생했습니다." }, { status: 500 });
  }
}
