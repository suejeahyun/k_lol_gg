export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfNotAdmin, requireAdminRequest } from "@/lib/auth/requireAdmin";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getAdminRiotSyncCooldownMinutes, syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
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
    const rejected = await rejectIfNotAdmin();
    if (rejected) return rejected;

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "ADMIN_RIOT_SINGLE_SYNC",
      limit: 20,
      windowSeconds: 10 * 60,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const { playerId } = await context.params;
    const parsedPlayerId = parsePlayerId(playerId);

    if (!parsedPlayerId) {
      return NextResponse.json({ message: "유효하지 않은 플레이어 ID입니다." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { force?: unknown; matchCount?: unknown; rankOnly?: unknown };
    const admin = await requireAdminRequest();
    const matchCount = Number(body.matchCount);
    const normalizedMatchCount = Number.isFinite(matchCount) && matchCount > 0 ? Math.min(200, Math.floor(matchCount)) : undefined;

    const result = await syncPlayerSoloRankBestEffort(parsedPlayerId, {
      actorUserAccountId: admin?.user.id ?? null,
      source: "ADMIN_SINGLE_SOLO_SYNC",
      jobType: "ADMIN_SINGLE_PLAYER",
      createJob: true,
      cooldownMinutes: getAdminRiotSyncCooldownMinutes(),
      matchCount: normalizedMatchCount,
      includeMatches: body.rankOnly !== true,
      force: body.force === true,
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
    logServerError("[ADMIN_RIOT_PLAYER_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { message: "관리자 Riot 동기화 중 오류가 발생했습니다.", error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { message: "관리자 Riot 동기화 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
