import { logServerError } from "@/lib/server/safe-log";
import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { getPlayerRiotAccountStatus } from "@/lib/riot/account-link";

export async function GET(
  _req: Request,
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

    const status = await getPlayerRiotAccountStatus(parsedPlayerId);

    if (!status) {
      return NextResponse.json({ message: "플레이어를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (error) {
    logServerError("[ADMIN_RIOT_PLAYER_STATUS_ERROR]", error);
    return NextResponse.json({ message: "관리자 Riot 상태 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
