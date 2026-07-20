export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSiteFeature } from "@/lib/site/feature-guard";
import { rejectIfNotAdmin, requireAdminRequest } from "@/lib/auth/requireAdmin";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getAdminFullRiotSyncCooldownMinutes, syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

function parsePlayerId(raw: string) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const premiumLock = await requireSiteFeature("riot");
  if (premiumLock) return premiumLock;

  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const rejected = await rejectIfNotAdmin();
    if (rejected) return rejected;

    const admin = await requireAdminRequest();

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "RIOT_FULL_SYNC",
      limit: 2,
      windowSeconds: 60 * 60,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const { playerId } = await context.params;
    const parsedPlayerId = parsePlayerId(playerId);

    if (!parsedPlayerId) {
      return NextResponse.json({ message: "유효하지 않은 플레이어 ID입니다." }, { status: 400 });
    }

    const result = await syncPlayerSoloRankBestEffort(parsedPlayerId, {
      actorUserAccountId: admin?.user.id ?? null,
      source: "ADMIN_FULL_SOLO_SYNC",
      jobType: "ADMIN_FULL_PLAYER",
      createJob: true,
      cooldownMinutes: getAdminFullRiotSyncCooldownMinutes(),
      matchCount: 200,
      includeMatches: true,
      force: false,
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
    logServerError("[RIOT_PLAYER_SOLO_SYNC_FULL_POST_ERROR]", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { message: "솔랭 전체 동기화 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "솔랭 전체 동기화 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
