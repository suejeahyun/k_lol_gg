export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getUserRiotSyncCooldownMinutes, syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
import { logServerError } from "@/lib/server/safe-log";

export async function POST(req: NextRequest) {
  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "RIOT_ME_SYNC",
      limit: 6,
      windowSeconds: 60 * 60,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json({ message: "연결된 플레이어 정보가 없습니다." }, { status: 404 });
    }

    const result = await syncPlayerSoloRankBestEffort(user.playerId, {
      actorUserAccountId: user.userAccountId,
      source: "USER_ME_SOLO_SYNC",
      jobType: "USER_SINGLE_PLAYER",
      createJob: true,
      cooldownMinutes: getUserRiotSyncCooldownMinutes(),
      includeMatches: true,
    });

    if (result.status === "failed") {
      return NextResponse.json({ message: result.message, result }, { status: 500 });
    }

    if (result.reason === "RIOT_ACCOUNT_NOT_LINKED") {
      return NextResponse.json({ message: result.message, result }, { status: 409 });
    }

    if (result.reason === "COOLDOWN") {
      return NextResponse.json({ message: result.message, remainSeconds: result.remainSeconds, result }, { status: 429 });
    }

    return NextResponse.json({ message: result.message, result });
  } catch (error) {
    logServerError("[RIOT_ME_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json({ message: "승인된 유저만 사용할 수 있습니다." }, { status: 403 });
      }

      return NextResponse.json(
        { message: "내 Riot 데이터 동기화 중 오류가 발생했습니다.", error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "내 Riot 데이터 동기화 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
