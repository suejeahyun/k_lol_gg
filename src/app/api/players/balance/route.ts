import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrAdmin, getAccessErrorResponseMessage } from "@/lib/auth/access";
import { handlePlayersBalanceRequest } from "@/lib/team-balance/calculate";

export async function POST(request: NextRequest) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  try {
    await requireApprovedUserOrAdmin();
  } catch (error) {
    const response = getAccessErrorResponseMessage(
      error,
      "팀 밸런스 계산 권한 확인 중 오류가 발생했습니다.",
    );

    return NextResponse.json(
      { message: response.message },
      { status: response.status },
    );
  }

  return handlePlayersBalanceRequest(request);
}
