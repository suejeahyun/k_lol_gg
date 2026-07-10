import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getRiotRequestMeta, unlinkPlayerRiotAccount } from "@/lib/riot/account-link";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ playerId: string }> },
) {
  const premiumLock = await requireSiteFeature("riot");
  if (premiumLock) return premiumLock;

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

    const result = await unlinkPlayerRiotAccount({
      playerId: parsedPlayerId,
      actorType: "ADMIN",
      actorUserAccountId: admin.user.id,
      requestMeta: getRiotRequestMeta(req),
    });

    return NextResponse.json(
      { message: result.message, data: result.ok ? result.data : undefined },
      { status: result.status },
    );
  } catch (error) {
    logServerError("[ADMIN_RIOT_PLAYER_UNLINK_ERROR]", error);
    return NextResponse.json({ message: "관리자 Riot 계정 연동 해제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
