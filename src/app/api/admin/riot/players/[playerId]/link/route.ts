import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getRiotRequestMeta, linkPlayerRiotAccount } from "@/lib/riot/account-link";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ playerId: string }> },
) {
  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const admin = await requireAdminRequest();
    if (!admin) {
      return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
    }

    const { playerId } = await context.params;
    const parsedPlayerId = Number(playerId);

    if (!Number.isInteger(parsedPlayerId) || parsedPlayerId <= 0) {
      return NextResponse.json({ message: "유효하지 않은 플레이어 ID입니다." }, { status: 400 });
    }

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "ADMIN_RIOT_PLAYER_LINK",
      limit: 20,
      windowSeconds: 10 * 60,
      key: String(admin.user.id ?? admin.user.userId),
    });
    if (rateLimitRejected) return rateLimitRejected;

    const body = await req.json().catch(() => ({}));
    const result = await linkPlayerRiotAccount({
      playerId: parsedPlayerId,
      body,
      actorType: "ADMIN",
      actorUserAccountId: admin.user.id,
      requestMeta: getRiotRequestMeta(req),
    });

    return NextResponse.json(
      { message: result.message, data: result.ok ? result.data : undefined },
      { status: result.status },
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "RIOT_FEATURE_DISABLED") {
      return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
    }

    logServerError("[ADMIN_RIOT_PLAYER_LINK_ERROR]", error);
    return NextResponse.json({ message: "관리자 Riot 계정 연결 중 오류가 발생했습니다." }, { status: 500 });
  }
}
