export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUserOrAdmin, getAccessErrorResponseMessage } from "@/lib/auth/access";
import { evaluateBalanceLayout, type BalanceEvaluatePlayer } from "@/lib/balance/ai-evaluation";
import { logServerError } from "@/lib/server/safe-log";

type EvaluateBody = {
  optionNo?: number | null;
  optionTitle?: string | null;
  assignments?: BalanceEvaluatePlayer[];
};

export async function POST(request: NextRequest) {
  try {
    await requireApprovedUserOrAdmin();
    const body = (await request.json()) as EvaluateBody;

    if (!Array.isArray(body.assignments) || body.assignments.length !== 10) {
      return NextResponse.json(
        { message: "평가할 팀 배치는 정확히 10명이어야 합니다." },
        { status: 400 },
      );
    }

    const result = evaluateBalanceLayout({
      optionNo: body.optionNo ?? null,
      optionTitle: body.optionTitle ?? null,
      assignments: body.assignments,
    });

    return NextResponse.json(result);
  } catch (error) {
    logServerError("[TEAM_BALANCE_EVALUATE_ERROR]", error);
    const response = getAccessErrorResponseMessage(error, "팀 밸런스 AI 재평가 중 오류가 발생했습니다.");
    return NextResponse.json({ message: response.message }, { status: response.status });
  }
}

