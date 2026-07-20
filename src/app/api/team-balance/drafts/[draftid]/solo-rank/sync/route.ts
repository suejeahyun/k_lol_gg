import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrAdmin } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma/client";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { getRiotFeatureDisabledPayload, isRiotFeatureEnabled } from "@/lib/riot/feature";
import { getAdminRiotSyncCooldownMinutes, syncPlayerSoloRankBestEffort } from "@/lib/riot/solo-sync";
import { logServerError } from "@/lib/server/safe-log";

type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };

const RECENT_SOLO_MATCH_COUNT = 10;
const MAX_DRAFT_PLAYERS = 10;

export async function POST(req: NextRequest, context: RouteContext) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  if (!isRiotFeatureEnabled()) {
    return NextResponse.json(getRiotFeatureDisabledPayload(), { status: 503 });
  }

  try {
    const access = await requireApprovedUserOrAdmin();

    const rateLimitRejected = await rejectIfRateLimited(req, {
      action: "DRAFT_SOLO_RANK_SYNC",
      limit: 4,
      windowSeconds: 600,
    });
    if (rateLimitRejected) return rateLimitRejected;

    const params = await context.params;
    const rawDraftId = params.draftId ?? params.draftid;
    const draftId = Array.isArray(rawDraftId) ? rawDraftId[0] : rawDraftId;
    const parsedDraftId = Number(draftId);

    if (!Number.isInteger(parsedDraftId) || parsedDraftId <= 0) {
      return NextResponse.json({ message: "유효하지 않은 밸런스 ID입니다." }, { status: 400 });
    }

    const draft = await prisma.teamBalanceDraft.findUnique({
      where: { id: parsedDraftId },
      select: {
        id: true,
        players: {
          orderBy: [{ team: "asc" }, { position: "asc" }],
          take: MAX_DRAFT_PLAYERS,
          select: {
            player: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!draft) {
      return NextResponse.json({ message: "저장 밸런스를 찾을 수 없습니다." }, { status: 404 });
    }

    const actorUserAccountId = access.type === "admin" ? access.admin.user.id : access.user.userAccountId;
    const results: Array<{
      playerId: number;
      name: string;
      status: string;
      message: string;
      savedMatchCount?: number;
      skippedMatchCount?: number;
    }> = [];

    for (const draftPlayer of draft.players) {
      const player = draftPlayer.player;
      const result = await syncPlayerSoloRankBestEffort(player.id, {
        actorUserAccountId,
        source: "DRAFT_SOLO_RANK_SYNC",
        jobType: "DRAFT_SINGLE_PLAYER",
        createJob: true,
        cooldownMinutes: getAdminRiotSyncCooldownMinutes(),
        matchCount: RECENT_SOLO_MATCH_COUNT,
        includeMatches: true,
      });

      results.push({
        playerId: player.id,
        name: player.name,
        status: result.status,
        message: result.message,
        savedMatchCount: result.savedMatchCount,
        skippedMatchCount: result.skippedMatchCount,
      });
    }

    const updated = results.filter((item) => item.status === "synced").length;
    const skipped = results.filter((item) => item.status === "skipped").length;
    const failed = results.filter((item) => item.status === "failed").length;

    return NextResponse.json({
      message: "저장 밸런스 참가자 솔랭 전적 갱신이 완료되었습니다.",
      processed: results.length,
      updated,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    logServerError("[DRAFT_SOLO_RANK_SYNC_POST_ERROR]", error);

    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      if (error.message === "NOT_APPROVED") return NextResponse.json({ message: "승인된 유저만 사용할 수 있습니다." }, { status: 403 });
      return NextResponse.json({ message: "저장 밸런스 솔랭 전적 갱신 중 오류가 발생했습니다." }, { status: 500 });
    }

    return NextResponse.json({ message: "저장 밸런스 솔랭 전적 갱신 중 알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
