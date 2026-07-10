import { requireSiteFeature } from "@/lib/site/feature-guard";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { requireApprovedUserOrAdmin, getAccessErrorResponseMessage } from "@/lib/auth/access";
import { recalculateManualTeamBalanceLayout, type ManualLayoutAssignmentInput } from "@/lib/team-balance/recalculate-layout";
import { logServerError } from "@/lib/server/safe-log";

type Body = {
  assignments?: ManualLayoutAssignmentInput[];
};

export async function POST(request: NextRequest) {
  const premiumLock = await requireSiteFeature("balanceAi");
  if (premiumLock) return premiumLock;

  try {
    await requireApprovedUserOrAdmin();
    const body = (await request.json()) as Body;

    const result = await recalculateManualTeamBalanceLayout(prisma, body.assignments ?? []);
    return NextResponse.json(result);
  } catch (error) {
    logServerError("[TEAM_BALANCE_RECALCULATE_LAYOUT_ERROR]", error);

    if (error instanceof Error && error.message) {
      const isValidation = error.message.includes("수동 재계산") || error.message.includes("팀") || error.message.includes("플레이어");
      if (isValidation) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
    }

    const response = getAccessErrorResponseMessage(error, "팀 밸런스 수동 배치 재계산 중 오류가 발생했습니다.");
    return NextResponse.json({ message: response.message }, { status: response.status });
  }
}
