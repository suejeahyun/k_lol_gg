export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { requireApprovedUser } from "@/lib/auth/session";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getAdminRiotSyncCooldownMinutes, getUserRiotSyncCooldownMinutes, syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

function parsePlayerId(raw: string) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(req: NextRequest, context: RouteContext) {
  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "RIOT_RECENT_SYNC",
      limit: 12,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const { playerId } = await context.params;
    const parsedPlayerId = parsePlayerId(playerId);

    if (!parsedPlayerId) {
      return NextResponse.json({ message: "유효하지 않은 플레이어 ID입니다." }, { status: 400 });
    }

    const user = await requireApprovedUser();
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

    if (!isAdmin && user.playerId !== parsedPlayerId) {
      return NextResponse.json(
        { message: "본인 또는 관리자만 솔랭 전적을 갱신할 수 있습니다." },
        { status: 403 },
      );
    }

    const result = await syncPlayerSoloRankBestEffort(parsedPlayerId, {
      actorUserAccountId: user.userAccountId,
      source: isAdmin ? "ADMIN_SINGLE_SOLO_SYNC" : "USER_SINGLE_SOLO_SYNC",
      jobType: isAdmin ? "ADMIN_SINGLE_PLAYER" : "USER_SINGLE_PLAYER",
      createJob: true,
      cooldownMinutes: isAdmin ? getAdminRiotSyncCooldownMinutes() : getUserRiotSyncCooldownMinutes(),
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

    await writeAdminLog({
      action: "RIOT_SOLO_SYNC",
      message: `솔랭 전적 갱신: 플레이어 #${parsedPlayerId}, 저장 ${result.savedMatchCount ?? 0}개`,
    });

    return NextResponse.json({
      message: result.message,
      result,
    });
  } catch (error) {
    logServerError("[RIOT_PLAYER_SOLO_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      }

      if (error.message === "NOT_APPROVED") {
        return NextResponse.json({ message: "승인된 유저만 사용할 수 있습니다." }, { status: 403 });
      }

      return NextResponse.json(
        { message: "솔랭 전적 갱신 중 오류가 발생했습니다.", error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "솔랭 전적 갱신 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
