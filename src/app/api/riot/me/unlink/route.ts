import { logServerError } from "@/lib/server/safe-log";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/session";
import { getRiotRequestMeta, unlinkPlayerRiotAccount } from "@/lib/riot/account-link";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApprovedUser();

    if (!user.playerId) {
      return NextResponse.json({ message: "연결된 플레이어가 없습니다." }, { status: 404 });
    }

    const result = await unlinkPlayerRiotAccount({
      playerId: user.playerId,
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
    }

    logServerError("[RIOT_ME_UNLINK_ERROR]", error);
    return NextResponse.json({ message: "Riot 계정 연동 해제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
