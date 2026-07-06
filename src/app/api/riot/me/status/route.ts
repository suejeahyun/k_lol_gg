import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { getPlayerRiotAccountStatus } from "@/lib/riot/account-link";
import { getRiotFeatureStatus } from "@/lib/riot/feature";
import { getRiotRsoStatus } from "@/lib/riot/rso";

export async function GET() {
  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json({
        feature: getRiotFeatureStatus(),
        rso: getRiotRsoStatus(),
        player: null,
        account: null,
        soloRank: null,
        message: "연결된 플레이어가 없습니다.",
      });
    }

    const status = await getPlayerRiotAccountStatus(user.playerId);

    if (!status) {
      return NextResponse.json({
        feature: getRiotFeatureStatus(),
        rso: getRiotRsoStatus(),
        player: null,
        account: null,
        soloRank: null,
        message: "플레이어를 찾을 수 없습니다.",
      }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
      }
      if (error.message === "NOT_APPROVED") {
        return NextResponse.json({ message: "관리자 승인 후 이용 가능합니다." }, { status: 403 });
      }
    }

    logServerError("[RIOT_ME_STATUS_ERROR]", error);
    return NextResponse.json({ message: "Riot 연동 상태 조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
